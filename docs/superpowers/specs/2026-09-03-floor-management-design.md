# Floor Management — Design Spec

Date: 2026-09-03

## Problem

Restaurant tables today have only a `Section` field, drawn from a
fixed, hardcoded 4-value list (`Main Dining`, `Patio`, `Bar & Lounge`,
`Private Booths`) in the frontend
(`frontend/src/features/tables/types.ts`). There is no concept of a
"floor" anywhere in the codebase — every restaurant is implicitly
single-floor, and that list cannot be changed by an owner.

Goal: let an owner define, rename, and archive floors, and assign each
table to one. `Section` is unaffected — it stays exactly as it is
today, as an independent field.

## Data Model

New entity, same shape/conventions as `RestaurantTable`
(`backend/ZipFlow.Api/Domain/Entities.cs`):

```csharp
public sealed class Floor : EntityBase
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public bool IsArchived { get; set; }
}
```

`RestaurantTable` gains a required FK:

```csharp
public Guid FloorId { get; set; }
public Floor Floor { get; set; } = null!;
```

EF configuration (`AppDbContext.OnModelCreating`), mirroring the
existing `RestaurantTable` block:

```csharp
modelBuilder.Entity<Floor>(b =>
{
    b.ToTable("Floor", "pos");
    b.HasKey(x => x.Id);
    b.Property(x => x.Name).HasMaxLength(60).IsRequired();
    b.HasIndex(x => new { x.TenantId, x.Name }).IsUnique().HasFilter("\"IsArchived\" = false");
    b.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
});

modelBuilder.Entity<RestaurantTable>(b =>
{
    // existing config unchanged, plus:
    b.HasOne(x => x.Floor).WithMany().HasForeignKey(x => x.FloorId).OnDelete(DeleteBehavior.Restrict);
});
```

### Migration

One EF Core migration:
1. Create `pos.Floor` table.
2. Data migration: for each existing `TenantId` present in
   `RestaurantTable`, insert one `Floor` row named `"Main Floor"`
   (`SortOrder = 0`).
3. Backfill `RestaurantTable.FloorId` to that tenant's new `Floor.Id`.
4. Add the `FloorId` column as NOT NULL + FK (after backfill, so the
   NOT NULL constraint doesn't fail on existing rows).

This is the same backfill-then-constrain pattern needed any time a
required FK is added to a populated table — no new pattern for this
codebase.

## Backend

### `IFloorService` / `FloorService`

Mirrors `ITableService`/`TableService`
(`backend/ZipFlow.Api/Services/TableService.cs`) exactly:

```csharp
public sealed record FloorDto(Guid Id, string Name, int SortOrder, bool IsArchived);

public enum SaveFloorResult { Saved, DuplicateName, NotFound }
public enum ArchiveFloorResult { Archived, NotFound, InUse }

public interface IFloorService
{
    Task<IReadOnlyList<FloorDto>> GetFloorsAsync(Guid tenantId, CancellationToken ct);
    Task<(SaveFloorResult Result, FloorDto? Floor)> CreateFloorAsync(Guid tenantId, string name, CancellationToken ct);
    Task<(SaveFloorResult Result, FloorDto? Floor)> UpdateFloorAsync(Guid tenantId, Guid floorId, string name, CancellationToken ct);
    Task<ArchiveFloorResult> ArchiveFloorAsync(Guid tenantId, Guid floorId, CancellationToken ct);
}
```

- `CreateFloorAsync` / `UpdateFloorAsync`: same duplicate-name check
  pattern as `TableService` (case-insensitive, scoped to
  non-archived floors within the tenant).
- `ArchiveFloorAsync`: returns `InUse` (no-op, no write) if any
  non-archived `RestaurantTable` still references the floor. Caller
  maps `InUse` to HTTP 409.
- `GetFloorsAsync`: ordered by `SortOrder` then `Name`, excludes
  archived floors (matches `TableService.GetTablesAsync`'s
  `!x.IsArchived` filter).

### `FloorEndpoints`

New file `backend/ZipFlow.Api/Endpoints/FloorEndpoints.cs`, same
structure as `TableEndpoints.cs`:

- `GET /api/floors` — `permission:pos.tables.view`
- `POST /api/floors` — `permission:pos.tables.manage`
- `PUT /api/floors/{id:guid}` — `permission:pos.tables.manage`
- `POST /api/floors/{id:guid}/archive` — `permission:pos.tables.manage`

No new permission — floors are managed under the same
`pos.tables.manage` permission tables already use, since floor
management is part of the same "layout" concern.

### Changes to existing table endpoints/service

- `CreateTableRequest`, `UpdateTableRequest`: add `Guid FloorId`.
- `TableDto`: add `Guid FloorId, string FloorName`.
- `TableService.CreateTableAsync` / `UpdateTableAsync`: validate the
  given `FloorId` belongs to the tenant and is not archived; return a
  new `SaveTableResult.InvalidFloor` (→ 400) if not.
- `GetTablesAsync` projection: join `Floor` for `FloorName`.

## Frontend

### `frontend/src/features/floors/`

- `types.ts`: `Floor = { id: string; name: string; sortOrder: number }`
- `api.ts`: `getFloors`, `createFloor`, `updateFloor`, `archiveFloor`
  — same shape as `frontend/src/features/tables/api.ts`.

### `TablesPage.tsx` changes

- Fetch floors alongside tables on mount.
- New `activeFloor` filter state, same pattern as `activeSection`: a
  pill row above (or beside) the existing section pills, "All
  Floors" + one pill per floor with a count.
- `RestaurantTable` type gains `floorId: string; floorName: string`;
  table cards show the floor name (e.g. next to the section tag).
- "Manage Layout" panel: new "Floors" card, placed above the existing
  table list, same visual pattern as the table list (add-form + rows
  with inline rename + archive button). Archive button shows the
  server's 409 message ("Move tables off this floor first.") via the
  existing `toast.error` pattern used elsewhere on this page.
- Add Table form and the inline Edit Table row both get a Floor
  `<select>` next to the existing Section `<select>`, populated from
  the fetched floor list.

## Error Handling

| Case | Response |
|---|---|
| Duplicate floor name (create/rename) | 409, "A floor with this name already exists." |
| Archive floor still referenced by a non-archived table | 409, "Move tables off this floor first." |
| Create/update table with unknown or archived `FloorId` | 400, "Invalid floor." |
| Floor not found (update/archive) | 404 |

All mirror the existing `TableEndpoints` error-handling conventions
(`ApiResponse<object>.Fail(...)`, `Results.Conflict` /
`Results.NotFound` / `Results.BadRequest`).

## Testing

- Backend: unit tests for `FloorService` — create, duplicate name,
  rename, archive success, archive blocked while in use.
- Backend: integration test asserting the migration backfill creates
  exactly one `"Main Floor"` per existing tenant and assigns all
  existing tables to it.
- Backend: `TableService` tests for the new `InvalidFloor` path.
- Frontend: manual pass — add a floor, assign a table to it, filter
  the floor-plan view by floor, attempt to archive a floor with an
  occupied table on it (expect blocked), archive an empty floor
  (expect success).

## Out of Scope

- `Section` is untouched — stays a fixed frontend list, no CRUD.
- No nesting (floors do not contain sections); a table has one Floor
  and one Section, independently.
- No drag-and-drop visual floor-plan editor — this is list/form-based
  management, matching the existing Tables page style.
