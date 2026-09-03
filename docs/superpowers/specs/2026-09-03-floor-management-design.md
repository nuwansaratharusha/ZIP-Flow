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
    public bool IsArchived { get; set; }
}
```

No `SortOrder` — floors list alphabetically by `Name`, same as
`TableService.GetTablesAsync` orders by `Section` then `Name` today.
(Dropped from the original draft: nothing in this spec ever wrote a
non-default value to it.)

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

Also register the new `DbSet` (`AppDbContext.cs:22`, alongside
`RestaurantTables`):

```csharp
public DbSet<Floor> Floors => Set<Floor>();
```

### Migration

One EF Core migration, in this order (a required FK on an already
populated table must be added nullable, backfilled, then constrained
— adding it NOT NULL up front fails against existing rows):

1. `CreateTable` for `pos.Floor` (schema above).
2. `AddColumn<Guid>` for `RestaurantTable.FloorId`, **nullable**, no FK
   yet.
3. Data migration (raw SQL in the migration's `Up`, since it needs to
   run per tenant): for every row in `pos.Tenant`, insert one `Floor`
   row named `"Main Floor"`:
   ```sql
   INSERT INTO pos."Floor" ("Id", "TenantId", "Name", "IsArchived", "CreatedAt", "UpdatedAt")
   SELECT gen_random_uuid(), t."Id", 'Main Floor', false, now(), now()
   FROM pos."Tenant" t;
   ```
   (`EntityBase` requires `CreatedAt`/`UpdatedAt` — confirm exact
   column names against `Entities.cs` before writing the migration.)
   Seeding is by `pos.Tenant`, not by distinct `TenantId` values
   already present in `RestaurantTable` — a tenant with zero tables
   today must still get a floor, or table creation is blocked from
   day one for that tenant. `FoundationSeeder.cs` (which seeds new
   tenants) also needs a "Main Floor" insert so newly created tenants
   aren't missed.
4. Backfill: `UPDATE pos."RestaurantTable" t SET "FloorId" = f."Id" FROM pos."Floor" f WHERE f."TenantId" = t."TenantId" AND f."Name" = 'Main Floor'`.
5. `AlterColumn` to make `FloorId` NOT NULL, then `AddForeignKey` to
   `pos.Floor`.

### DI and routing

- `Program.cs:30` (next to `AddScoped<ITableService, TableService>()`):
  add `builder.Services.AddScoped<IFloorService, FloorService>();`
- `Program.cs:114` (next to `app.MapTableEndpoints()`): add
  `app.MapFloorEndpoints();`

## Backend

### `IFloorService` / `FloorService`

Mirrors `ITableService`/`TableService`
(`backend/ZipFlow.Api/Services/TableService.cs`), with one deliberate
difference called out below (duplicate-name scope):

```csharp
public sealed record FloorDto(Guid Id, string Name);

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

`FloorDto` drops `IsArchived`: `GetFloorsAsync` only ever returns
non-archived floors (see below), so the field would always be `false`
on the wire. There is no "view archived floors" list in this spec —
archive is one-way, matching the existing table-archive UX (archived
tables also aren't listed anywhere in the UI today).

- `CreateFloorAsync` / `UpdateFloorAsync`: duplicate-name check scoped
  to **non-archived** floors only (case-insensitive), matching the DB
  unique index's `WHERE "IsArchived" = false` filter. Note this is
  *not* identical to `TableService.CreateTableAsync`'s check
  (`TableService.cs:67-68`), which does not exclude archived rows —
  that is an existing inconsistency in `TableService`, not something
  to replicate here.
- Both also catch `DbUpdateException` from the `SaveChangesAsync`
  call and translate a unique-violation into `DuplicateName` rather
  than letting it surface as a 500 — the check-then-insert is not
  atomic, so two concurrent creates with the same name can both pass
  the pre-check.
- `ArchiveFloorAsync`: returns `InUse` (no write) if any non-archived
  `RestaurantTable` still references the floor. Caller maps `InUse`
  to HTTP 409. No unarchive endpoint — out of scope.
- `GetFloorsAsync`: `Where(x => !x.IsArchived).OrderBy(x => x.Name)`.

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

- `types.ts`: `Floor = { id: string; name: string }`
- `api.ts`: `getFloors`, `createFloor`, `updateFloor`, `archiveFloor`
  — same shape as `frontend/src/features/tables/api.ts`.

### `TablesPage.tsx` changes

- Fetch floors alongside tables on mount.
- New `activeFloor` filter state, same pattern as `activeSection`: a
  pill row above (or beside) the existing section pills, "All
  Floors" + one pill per floor with a count.
- `RestaurantTable` type (`frontend/src/features/tables/types.ts`)
  gains `floorId: string; floorName: string`; table cards show the
  floor name (e.g. next to the section tag).
- "Manage Layout" panel: new "Floors" card, placed above the existing
  table list, same visual pattern as the table list (add-form + rows
  with inline rename + archive button). Archive button shows the
  server's 409 message ("Move tables off this floor first.") via the
  existing `toast.error` pattern used elsewhere on this page.
- Add Table form and the inline Edit Table row both get a Floor
  `<select>` next to the existing Section `<select>`, populated from
  the fetched floor list.

### `DashboardPage.tsx`

Also consumes the tables API
(`frontend/src/features/dashboard/DashboardPage.tsx`). Since
`RestaurantTable` gains required `floorId`/`floorName` fields, check
this file compiles against the updated type — it is not expected to
need behavior changes, just type-checked.

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

There is no test project in this repo today (`backend/` contains only
`ZipFlow.Api.csproj`, no test `.csproj` or `.sln` reference to one).
Adding one is out of scope for this feature — automated backend tests
are not part of this plan. Verification is manual, against a local
run of the API and frontend:

- Add a floor, rename it, confirm duplicate-name create/rename is
  rejected with 409.
- Assign a table to a floor via the Add Table form; confirm it shows
  up filtered correctly on the floor-plan view.
- Attempt to archive a floor with a table still on it — confirm 409
  and the table is unaffected.
- Archive an empty floor — confirm it disappears from the floor list
  and filter pills.
- Run the migration against a database that already has tenants and
  tables (e.g. local dev data) and confirm every existing table ends
  up on a `"Main Floor"` with no NULL `FloorId` left behind.

## Out of Scope

- `Section` is untouched — stays a fixed frontend list, no CRUD.
- No nesting (floors do not contain sections); a table has one Floor
  and one Section, independently.
- No drag-and-drop visual floor-plan editor — this is list/form-based
  management, matching the existing Tables page style.
- No floor reordering/custom sort — floors list alphabetically.
- No "view archived floors" / unarchive — archiving a floor is
  one-way, matching the existing table-archive behavior.
- No new automated backend test project — manual verification only
  (see Testing).
