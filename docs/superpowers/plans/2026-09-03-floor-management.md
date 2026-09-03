# Floor Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner create, rename, and archive floors, and assign each restaurant table to one — replacing today's implicit single-floor setup with a managed list.

**Architecture:** A new `Floor` entity (tenant-scoped, mirrors `RestaurantTable`'s shape) plus a required `FloorId` FK on `RestaurantTable`. Backend gets a `FloorService`/`FloorEndpoints` pair that copies `TableService`/`TableEndpoints`'s CRUD-plus-archive pattern, and `TableService`/`TableEndpoints` gain floor validation and a `FloorName` on the table DTO. Frontend gets a `features/floors/` module (types + api, mirroring `features/tables/`) and `TablesPage.tsx` gains a floor filter, a floor tag on table cards, a Floors management card, and a Floor `<select>` on the add/edit table forms.

**Tech Stack:** ASP.NET Core 8 minimal APIs, EF Core 8 + Npgsql (Postgres 16), React 18 + TypeScript + Vite.

**Spec:** `docs/superpowers/specs/2026-09-03-floor-management-design.md`

## Global Constraints

- No test runner or linter is configured in this repo (confirmed: no backend test project — `backend/` has only `ZipFlow.Api.csproj` — and no `npm test`/`npm run lint` script). Do not add one as part of this feature. Verification per task is `dotnet build` / `npx tsc -b` (the frontend's type-check step, from `frontend/`) plus the manual check described in the task.
- Follow existing conventions: backend feature-folder-by-concern (`Endpoints/*.cs`, `Services/*.cs`, one `Domain/Entities.cs`), frontend feature-folder (`features/<name>/`), `ApiResponse<T>.Ok(...)`/`.Fail(...)` envelope on every endpoint response.
- Reuse the existing `pos.tables.manage` / `pos.tables.view` permissions for floor endpoints — do not add new permission codes. Floor management is the same "layout" concern as table management.
- `Section` is untouched by this feature — no code in this plan changes the fixed `TABLE_SECTIONS` list or its behavior.
- Local dev auto-migrates on API startup (`Program.cs:122`, `await db.Database.MigrateAsync()`) — a migration that can't run cleanly against the seeded demo tenant's existing data will break `dotnet run` for every task after it lands. The migration in Task 2 must be hand-verified, not just scaffolded and trusted.

---

### Task 1: `Floor` entity + EF configuration

**Files:**
- Modify: `backend/ZipFlow.Api/Domain/Entities.cs` (add `Floor` class, add `FloorId`/`Floor` to `RestaurantTable`)
- Modify: `backend/ZipFlow.Api/Data/AppDbContext.cs` (add `Floors` DbSet, add `Floor` fluent config, extend `RestaurantTable` fluent config)

**Interfaces:**
- Produces: `Floor { Guid Id, Guid TenantId, Tenant Tenant, string Name, bool IsArchived, DateTimeOffset CreatedAt, DateTimeOffset? UpdatedAt }` (via `EntityBase`), `RestaurantTable.FloorId` (`Guid`), `RestaurantTable.Floor` (`Floor`), `AppDbContext.Floors` (`DbSet<Floor>`) — consumed by Task 2 onward.

- [ ] **Step 1: Add the `Floor` entity**

In `backend/ZipFlow.Api/Domain/Entities.cs`, add after the closing brace of `public sealed class RestaurantTable : EntityBase { ... }` (currently ends at line 215):

```csharp

public sealed class Floor : EntityBase
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public bool IsArchived { get; set; }
}
```

- [ ] **Step 2: Add `FloorId`/`Floor` to `RestaurantTable`**

In the same file, inside `public sealed class RestaurantTable : EntityBase { ... }`, add after `public bool IsArchived { get; set; }`:

```csharp
    public Guid FloorId { get; set; }
    public Floor Floor { get; set; } = null!;
```

- [ ] **Step 3: Register the `Floors` DbSet**

In `backend/ZipFlow.Api/Data/AppDbContext.cs`, add after `public DbSet<RestaurantTable> RestaurantTables => Set<RestaurantTable>();` (line 22):

```csharp
    public DbSet<Floor> Floors => Set<Floor>();
```

- [ ] **Step 4: Add `Floor` fluent config and extend `RestaurantTable` config**

In the same file, replace the existing `RestaurantTable` block:

```csharp
        modelBuilder.Entity<RestaurantTable>(b =>
        {
            b.ToTable("RestaurantTable", "pos");
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).HasMaxLength(80).IsRequired();
            b.Property(x => x.Section).HasMaxLength(40).IsRequired();
            b.Property(x => x.Status).HasMaxLength(20).IsRequired();
            b.HasIndex(x => new { x.TenantId, x.Name }).IsUnique().HasFilter("\"IsArchived\" = false");
            b.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
```

with:

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
            b.ToTable("RestaurantTable", "pos");
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).HasMaxLength(80).IsRequired();
            b.Property(x => x.Section).HasMaxLength(40).IsRequired();
            b.Property(x => x.Status).HasMaxLength(20).IsRequired();
            b.HasIndex(x => new { x.TenantId, x.Name }).IsUnique().HasFilter("\"IsArchived\" = false");
            b.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Floor).WithMany().HasForeignKey(x => x.FloorId).OnDelete(DeleteBehavior.Restrict);
        });
```

- [ ] **Step 5: Build**

Run: `dotnet build` from `backend/ZipFlow.Api`
Expected: builds with no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/ZipFlow.Api/Domain/Entities.cs backend/ZipFlow.Api/Data/AppDbContext.cs
git commit -m "feat: add Floor entity and RestaurantTable.FloorId"
```

---

### Task 2: EF Core migration (phased backfill)

**Files:**
- Create: `backend/ZipFlow.Api/Migrations/<timestamp>_AddFloor.cs` + `.Designer.cs` (generated, then hand-edited)
- Modify: `backend/ZipFlow.Api/Migrations/AppDbContextModelSnapshot.cs` (generated)

**Interfaces:**
- Consumes: `Floor`, `RestaurantTable.FloorId` (Task 1).
- Produces: `pos."Floor"` table with one `"Main Floor"` row per existing `organization."Tenant"` row; `pos."RestaurantTable"."FloorId"` backfilled to that row and constrained NOT NULL + FK. Consumed by every later task that reads/writes floors or tables.

A required FK added to an already-populated table can't go straight to `NOT NULL` — Postgres has no value to put in existing rows. This migration adds the column nullable, populates it, then constrains it, in one `Up()`.

- [ ] **Step 1: Scaffold the migration**

Run from `backend/ZipFlow.Api`:

```bash
dotnet ef migrations add AddFloor
```

Expected: creates `Migrations/<timestamp>_AddFloor.cs` and `.Designer.cs`, and updates `AppDbContextModelSnapshot.cs`. The scaffolded `Up()`/`Down()` bodies will be naive (a straight `AddColumn` with `nullable: false` and no default) — that's expected and gets replaced in the next step. Do not run `dotnet ef database update` yet.

- [ ] **Step 2: Replace the `Up()`/`Down()` bodies**

Open the newly created `<timestamp>_AddFloor.cs`. Replace the entire `Up` and `Down` method bodies with:

```csharp
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Floor",
                schema: "pos",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    IsArchived = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Floor", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Floor_Tenant_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "organization",
                        principalTable: "Tenant",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Floor_TenantId_Name",
                schema: "pos",
                table: "Floor",
                columns: new[] { "TenantId", "Name" },
                unique: true,
                filter: "\"IsArchived\" = false");

            migrationBuilder.AddColumn<Guid>(
                name: "FloorId",
                schema: "pos",
                table: "RestaurantTable",
                type: "uuid",
                nullable: true);

            // Postgres 13+ ships gen_random_uuid() built in — no extension needed.
            migrationBuilder.Sql(@"
                INSERT INTO pos.""Floor"" (""Id"", ""TenantId"", ""Name"", ""IsArchived"", ""CreatedAt"", ""UpdatedAt"")
                SELECT gen_random_uuid(), t.""Id"", 'Main Floor', false, now(), now()
                FROM organization.""Tenant"" t;
            ");

            migrationBuilder.Sql(@"
                UPDATE pos.""RestaurantTable"" rt
                SET ""FloorId"" = f.""Id""
                FROM pos.""Floor"" f
                WHERE f.""TenantId"" = rt.""TenantId"" AND f.""Name"" = 'Main Floor';
            ");

            migrationBuilder.AlterColumn<Guid>(
                name: "FloorId",
                schema: "pos",
                table: "RestaurantTable",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid?),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_RestaurantTable_FloorId",
                schema: "pos",
                table: "RestaurantTable",
                column: "FloorId");

            migrationBuilder.AddForeignKey(
                name: "FK_RestaurantTable_Floor_FloorId",
                schema: "pos",
                table: "RestaurantTable",
                column: "FloorId",
                principalSchema: "pos",
                principalTable: "Floor",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_RestaurantTable_Floor_FloorId",
                schema: "pos",
                table: "RestaurantTable");

            migrationBuilder.DropIndex(
                name: "IX_RestaurantTable_FloorId",
                schema: "pos",
                table: "RestaurantTable");

            migrationBuilder.DropColumn(
                name: "FloorId",
                schema: "pos",
                table: "RestaurantTable");

            migrationBuilder.DropTable(
                name: "Floor",
                schema: "pos");
        }
```

Leave `.Designer.cs` and `AppDbContextModelSnapshot.cs` exactly as scaffolded — they describe the end-state model (which Task 1 already defines correctly), not how `Up()` gets there, so they don't need hand-editing.

- [ ] **Step 3: Build**

Run: `dotnet build` from `backend/ZipFlow.Api`
Expected: builds with no errors.

- [ ] **Step 4: Apply and verify against a real database**

If a local Postgres isn't already running, start one per `docs/RUNNING.md` (e.g. `docker compose up -d postgres` from the repo root). Then run from `backend/ZipFlow.Api`:

```bash
dotnet ef database update
```

Expected: succeeds with no errors. Then verify the backfill:

```bash
psql "$CONNECTION_STRING" -c 'SELECT count(*) FROM pos."Floor";'
psql "$CONNECTION_STRING" -c 'SELECT count(*) FROM pos."RestaurantTable" WHERE "FloorId" IS NULL;'
```

Expected: at least one `Floor` row per existing tenant, and zero `RestaurantTable` rows with a NULL `FloorId`. (Use the connection string from `backend/ZipFlow.Api/appsettings.Development.json` or `docs/RUNNING.md` if `$CONNECTION_STRING` isn't set in your shell.)

- [ ] **Step 5: Commit**

```bash
git add backend/ZipFlow.Api/Migrations/
git commit -m "feat: add Floor table and backfill RestaurantTable.FloorId"
```

---

### Task 3: Seed a default floor for new tenants

**Files:**
- Modify: `backend/ZipFlow.Api/Services/FoundationSeeder.cs`

**Interfaces:**
- Consumes: `AppDbContext.Floors`, `Floor` (Task 1).
- Produces: nothing new consumed elsewhere — this only affects seeded/dev data, matching the existing `Location` seed block.

The migration (Task 2) only creates `"Main Floor"` rows for tenants that already exist in `pos.Tenant` *at migration time*. `FoundationSeeder` creates the demo tenant *after* migrations run (`Program.cs:119-126`), and doesn't seed any `RestaurantTable` rows today — but without a floor, an admin can't create their first table through the UI either. Seed one, the same way `Location` is seeded.

- [ ] **Step 1: Add the floor seed block**

In `backend/ZipFlow.Api/Services/FoundationSeeder.cs`, add after the `Location` block (after line 86, `db.Locations.Add(location);` and its closing `}`):

```csharp

        var floor = await db.Floors.SingleOrDefaultAsync(
            x => x.TenantId == tenant.Id && x.Name == "Main Floor" && !x.IsArchived, ct);
        if (floor is null)
        {
            floor = new Floor
            {
                TenantId = tenant.Id,
                Name = "Main Floor"
            };
            db.Floors.Add(floor);
        }
```

- [ ] **Step 2: Build**

Run: `dotnet build` from `backend/ZipFlow.Api`
Expected: builds with no errors.

- [ ] **Step 3: Manual check**

Run the API (`dotnet run` from `backend/ZipFlow.Api`, with `BootstrapAdmin:Enabled` on as it is in dev config) against an empty database, or drop and recreate the demo tenant's floor row and rerun. Confirm exactly one non-archived `"Main Floor"` row exists for the demo tenant afterward, and rerunning the seeder doesn't create a duplicate.

- [ ] **Step 4: Commit**

```bash
git add backend/ZipFlow.Api/Services/FoundationSeeder.cs
git commit -m "feat: seed a default floor for new tenants"
```

---

### Task 4: `FloorService`

**Files:**
- Create: `backend/ZipFlow.Api/Services/FloorService.cs`

**Interfaces:**
- Consumes: `AppDbContext.Floors`, `AppDbContext.RestaurantTables`, `Floor` (Task 1).
- Produces: `FloorDto(Guid Id, string Name)`, `SaveFloorResult { Saved, DuplicateName, NotFound }`, `ArchiveFloorResult { Archived, NotFound, InUse }`, `IFloorService` with `GetFloorsAsync`, `CreateFloorAsync`, `UpdateFloorAsync`, `ArchiveFloorAsync` — consumed by Task 5 (`FloorEndpoints`) and Task 6 (`TableService`'s floor validation).

- [ ] **Step 1: Write `FloorService.cs`**

Create `backend/ZipFlow.Api/Services/FloorService.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using ZipFlow.Api.Data;
using ZipFlow.Api.Domain;

namespace ZipFlow.Api.Services;

public sealed record FloorDto(Guid Id, string Name);

public enum SaveFloorResult
{
    Saved,
    DuplicateName,
    NotFound
}

public enum ArchiveFloorResult
{
    Archived,
    NotFound,
    InUse
}

public interface IFloorService
{
    Task<IReadOnlyList<FloorDto>> GetFloorsAsync(Guid tenantId, CancellationToken ct);

    Task<(SaveFloorResult Result, FloorDto? Floor)> CreateFloorAsync(
        Guid tenantId, string name, CancellationToken ct);

    Task<(SaveFloorResult Result, FloorDto? Floor)> UpdateFloorAsync(
        Guid tenantId, Guid floorId, string name, CancellationToken ct);

    Task<ArchiveFloorResult> ArchiveFloorAsync(Guid tenantId, Guid floorId, CancellationToken ct);
}

public sealed class FloorService(AppDbContext db) : IFloorService
{
    public async Task<IReadOnlyList<FloorDto>> GetFloorsAsync(Guid tenantId, CancellationToken ct)
    {
        return await db.Floors
            .AsNoTracking()
            .Where(x => x.TenantId == tenantId && !x.IsArchived)
            .OrderBy(x => x.Name)
            .Select(x => new FloorDto(x.Id, x.Name))
            .ToListAsync(ct);
    }

    public async Task<(SaveFloorResult Result, FloorDto? Floor)> CreateFloorAsync(
        Guid tenantId, string name, CancellationToken ct)
    {
        var normalizedName = name.Trim();
        var duplicate = await db.Floors.AnyAsync(
            x => x.TenantId == tenantId && !x.IsArchived && x.Name.ToLower() == normalizedName.ToLower(), ct);
        if (duplicate)
            return (SaveFloorResult.DuplicateName, null);

        var floor = new Floor
        {
            TenantId = tenantId,
            Name = normalizedName
        };

        db.Floors.Add(floor);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Two concurrent creates with the same name can both pass the check above —
            // the unique index is the real guard, this just turns its violation into the
            // same result the pre-check produces instead of a 500.
            return (SaveFloorResult.DuplicateName, null);
        }

        return (SaveFloorResult.Saved, ToDto(floor));
    }

    public async Task<(SaveFloorResult Result, FloorDto? Floor)> UpdateFloorAsync(
        Guid tenantId, Guid floorId, string name, CancellationToken ct)
    {
        var floor = await db.Floors.SingleOrDefaultAsync(x => x.Id == floorId && x.TenantId == tenantId, ct);
        if (floor is null)
            return (SaveFloorResult.NotFound, null);

        var normalizedName = name.Trim();
        if (!normalizedName.Equals(floor.Name, StringComparison.OrdinalIgnoreCase))
        {
            var duplicate = await db.Floors.AnyAsync(
                x => x.TenantId == tenantId && !x.IsArchived && x.Id != floorId && x.Name.ToLower() == normalizedName.ToLower(), ct);
            if (duplicate)
                return (SaveFloorResult.DuplicateName, null);
        }

        floor.Name = normalizedName;
        floor.UpdatedAt = DateTimeOffset.UtcNow;
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return (SaveFloorResult.DuplicateName, null);
        }

        return (SaveFloorResult.Saved, ToDto(floor));
    }

    public async Task<ArchiveFloorResult> ArchiveFloorAsync(Guid tenantId, Guid floorId, CancellationToken ct)
    {
        var floor = await db.Floors.SingleOrDefaultAsync(x => x.Id == floorId && x.TenantId == tenantId, ct);
        if (floor is null)
            return ArchiveFloorResult.NotFound;

        var inUse = await db.RestaurantTables.AnyAsync(
            x => x.FloorId == floorId && x.TenantId == tenantId && !x.IsArchived, ct);
        if (inUse)
            return ArchiveFloorResult.InUse;

        floor.IsArchived = true;
        floor.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return ArchiveFloorResult.Archived;
    }

    private static FloorDto ToDto(Floor floor) => new(floor.Id, floor.Name);
}
```

- [ ] **Step 2: Register in DI**

In `backend/ZipFlow.Api/Program.cs`, add after `builder.Services.AddScoped<ITableService, TableService>();` (line 30):

```csharp
builder.Services.AddScoped<IFloorService, FloorService>();
```

- [ ] **Step 3: Build**

Run: `dotnet build` from `backend/ZipFlow.Api`
Expected: builds with no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/ZipFlow.Api/Services/FloorService.cs backend/ZipFlow.Api/Program.cs
git commit -m "feat: add FloorService"
```

---

### Task 5: `FloorEndpoints`

**Files:**
- Create: `backend/ZipFlow.Api/Endpoints/FloorEndpoints.cs`
- Modify: `backend/ZipFlow.Api/Program.cs` (register route mapping)

**Interfaces:**
- Consumes: `IFloorService`, `FloorDto`, `SaveFloorResult`, `ArchiveFloorResult` (Task 4).
- Produces: `GET /api/floors`, `POST /api/floors`, `PUT /api/floors/{id:guid}`, `POST /api/floors/{id:guid}/archive` — consumed by Task 7 (frontend `features/floors/api.ts`).

- [ ] **Step 1: Write `FloorEndpoints.cs`**

Create `backend/ZipFlow.Api/Endpoints/FloorEndpoints.cs`:

```csharp
using ZipFlow.Api.Common;
using ZipFlow.Api.Security;
using ZipFlow.Api.Services;

namespace ZipFlow.Api.Endpoints;

public sealed record CreateFloorRequest(string Name);
public sealed record UpdateFloorRequest(string Name);

public static class FloorEndpoints
{
    public static IEndpointRouteBuilder MapFloorEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/floors").WithTags("Floors");

        group.MapGet("/", async (ICurrentRequestContext current, IFloorService floors, CancellationToken ct) =>
            Results.Ok(ApiResponse<IReadOnlyList<FloorDto>>.Ok(await floors.GetFloorsAsync(current.TenantId, ct))))
            .RequireAuthorization("permission:pos.tables.view");

        group.MapPost("/", async (CreateFloorRequest request, ICurrentRequestContext current, IFloorService floors, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest(ApiResponse<object>.Fail("Name is required."));

            var (result, floor) = await floors.CreateFloorAsync(current.TenantId, request.Name, ct);
            return result switch
            {
                SaveFloorResult.Saved => Results.Ok(ApiResponse<FloorDto>.Ok(floor!)),
                SaveFloorResult.DuplicateName => Results.Conflict(ApiResponse<object>.Fail("A floor with this name already exists.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to create floor."))
            };
        })
        .RequireAuthorization("permission:pos.tables.manage");

        group.MapPut("/{id:guid}", async (Guid id, UpdateFloorRequest request, ICurrentRequestContext current, IFloorService floors, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest(ApiResponse<object>.Fail("Name is required."));

            var (result, floor) = await floors.UpdateFloorAsync(current.TenantId, id, request.Name, ct);
            return result switch
            {
                SaveFloorResult.Saved => Results.Ok(ApiResponse<FloorDto>.Ok(floor!)),
                SaveFloorResult.DuplicateName => Results.Conflict(ApiResponse<object>.Fail("A floor with this name already exists.")),
                SaveFloorResult.NotFound => Results.NotFound(ApiResponse<object>.Fail("Floor not found.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to update floor."))
            };
        })
        .RequireAuthorization("permission:pos.tables.manage");

        group.MapPost("/{id:guid}/archive", async (Guid id, ICurrentRequestContext current, IFloorService floors, CancellationToken ct) =>
        {
            var result = await floors.ArchiveFloorAsync(current.TenantId, id, ct);
            return result switch
            {
                ArchiveFloorResult.Archived => Results.Ok(ApiResponse<object>.Ok(new { archived = true })),
                ArchiveFloorResult.NotFound => Results.NotFound(ApiResponse<object>.Fail("Floor not found.")),
                ArchiveFloorResult.InUse => Results.Conflict(ApiResponse<object>.Fail("Move tables off this floor first.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to archive floor."))
            };
        })
        .RequireAuthorization("permission:pos.tables.manage");

        return app;
    }
}
```

- [ ] **Step 2: Register the route mapping**

In `backend/ZipFlow.Api/Program.cs`, add after `app.MapTableEndpoints();` (line 114):

```csharp
app.MapFloorEndpoints();
```

- [ ] **Step 3: Build**

Run: `dotnet build` from `backend/ZipFlow.Api`
Expected: builds with no errors.

- [ ] **Step 4: Manual check**

Run the API (`dotnet run` from `backend/ZipFlow.Api`) and, with a valid access token (log in as the seeded admin per `docs/RUNNING.md`), exercise the new endpoints:

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:5080/api/floors
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Rooftop"}' http://localhost:5080/api/floors
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Rooftop"}' http://localhost:5080/api/floors
```

Expected: the first `GET` includes `"Main Floor"`; the first `POST` returns 200 with the new `"Rooftop"` floor; the second (duplicate) `POST` returns 409.

- [ ] **Step 5: Commit**

```bash
git add backend/ZipFlow.Api/Endpoints/FloorEndpoints.cs backend/ZipFlow.Api/Program.cs
git commit -m "feat: add floor management endpoints"
```

---

### Task 6: `TableService`/`TableEndpoints` floor support

**Files:**
- Modify: `backend/ZipFlow.Api/Services/TableService.cs`
- Modify: `backend/ZipFlow.Api/Endpoints/TableEndpoints.cs`

**Interfaces:**
- Consumes: `Floor`, `AppDbContext.Floors` (Task 1).
- Produces: `TableDto` gains `Guid FloorId, string FloorName`; `CreateTableAsync`/`UpdateTableAsync` gain a `Guid floorId` parameter and a new `SaveTableResult.InvalidFloor` member — consumed by Task 8/9 (frontend table forms and card display).

- [ ] **Step 1: Extend `TableDto` and `SaveTableResult`**

In `backend/ZipFlow.Api/Services/TableService.cs`, replace:

```csharp
public sealed record TableDto(Guid Id, string Name, string Section, int Capacity, string Status, bool IsArchived, Guid? OpenOrderId, string? OpenOrderCustomerName);
```

with:

```csharp
public sealed record TableDto(Guid Id, string Name, string Section, int Capacity, string Status, bool IsArchived, Guid FloorId, string FloorName, Guid? OpenOrderId, string? OpenOrderCustomerName);
```

Replace:

```csharp
public enum SaveTableResult
{
    Saved,
    DuplicateName,
    NotFound
}
```

with:

```csharp
public enum SaveTableResult
{
    Saved,
    DuplicateName,
    NotFound,
    InvalidFloor
}
```

- [ ] **Step 2: Extend the interface signatures**

Replace:

```csharp
    Task<(SaveTableResult Result, TableDto? Table)> CreateTableAsync(
        Guid tenantId, string name, string section, int capacity, CancellationToken ct);

    Task<(SaveTableResult Result, TableDto? Table)> UpdateTableAsync(
        Guid tenantId, Guid tableId, string name, string section, int capacity, CancellationToken ct);
```

with:

```csharp
    Task<(SaveTableResult Result, TableDto? Table)> CreateTableAsync(
        Guid tenantId, string name, string section, int capacity, Guid floorId, CancellationToken ct);

    Task<(SaveTableResult Result, TableDto? Table)> UpdateTableAsync(
        Guid tenantId, Guid tableId, string name, string section, int capacity, Guid floorId, CancellationToken ct);
```

- [ ] **Step 3: Update `GetTablesAsync` to project the floor**

Replace the `GetTablesAsync` method body:

```csharp
    public async Task<IReadOnlyList<TableDto>> GetTablesAsync(Guid tenantId, CancellationToken ct)
    {
        // Single projection per table is safe: a partial unique index on pos.Order(TableId)
        // WHERE Status = 'Open' guarantees at most one open order per table.
        return await db.RestaurantTables
            .AsNoTracking()
            .Where(x => x.TenantId == tenantId && !x.IsArchived)
            .OrderBy(x => x.Section).ThenBy(x => x.Name)
            .Select(x => new TableDto(
                x.Id,
                x.Name,
                x.Section,
                x.Capacity,
                x.Status,
                x.IsArchived,
                db.Orders.Where(o => o.TableId == x.Id && o.TenantId == tenantId && o.Status == "Open").Select(o => (Guid?)o.Id).FirstOrDefault(),
                db.Orders.Where(o => o.TableId == x.Id && o.TenantId == tenantId && o.Status == "Open").Select(o => o.CustomerName).FirstOrDefault()))
            .ToListAsync(ct);
    }
```

with:

```csharp
    public async Task<IReadOnlyList<TableDto>> GetTablesAsync(Guid tenantId, CancellationToken ct)
    {
        // Single projection per table is safe: a partial unique index on pos.Order(TableId)
        // WHERE Status = 'Open' guarantees at most one open order per table.
        return await db.RestaurantTables
            .AsNoTracking()
            .Where(x => x.TenantId == tenantId && !x.IsArchived)
            .OrderBy(x => x.Section).ThenBy(x => x.Name)
            .Select(x => new TableDto(
                x.Id,
                x.Name,
                x.Section,
                x.Capacity,
                x.Status,
                x.IsArchived,
                x.FloorId,
                x.Floor.Name,
                db.Orders.Where(o => o.TableId == x.Id && o.TenantId == tenantId && o.Status == "Open").Select(o => (Guid?)o.Id).FirstOrDefault(),
                db.Orders.Where(o => o.TableId == x.Id && o.TenantId == tenantId && o.Status == "Open").Select(o => o.CustomerName).FirstOrDefault()))
            .ToListAsync(ct);
    }
```

- [ ] **Step 4: Validate the floor in `CreateTableAsync`**

Replace:

```csharp
    public async Task<(SaveTableResult Result, TableDto? Table)> CreateTableAsync(
        Guid tenantId, string name, string section, int capacity, CancellationToken ct)
    {
        var normalizedName = name.Trim();
        var duplicate = await db.RestaurantTables.AnyAsync(
            x => x.TenantId == tenantId && x.Name.ToLower() == normalizedName.ToLower(), ct);
        if (duplicate)
            return (SaveTableResult.DuplicateName, null);

        var table = new RestaurantTable
        {
            TenantId = tenantId,
            Name = normalizedName,
            Section = section.Trim(),
            Capacity = capacity,
            Status = "available"
        };

        db.RestaurantTables.Add(table);
        await db.SaveChangesAsync(ct);

        return (SaveTableResult.Saved, ToDto(table));
    }
```

with:

```csharp
    public async Task<(SaveTableResult Result, TableDto? Table)> CreateTableAsync(
        Guid tenantId, string name, string section, int capacity, Guid floorId, CancellationToken ct)
    {
        var floorValid = await db.Floors.AnyAsync(x => x.Id == floorId && x.TenantId == tenantId && !x.IsArchived, ct);
        if (!floorValid)
            return (SaveTableResult.InvalidFloor, null);

        var normalizedName = name.Trim();
        var duplicate = await db.RestaurantTables.AnyAsync(
            x => x.TenantId == tenantId && x.Name.ToLower() == normalizedName.ToLower(), ct);
        if (duplicate)
            return (SaveTableResult.DuplicateName, null);

        var table = new RestaurantTable
        {
            TenantId = tenantId,
            Name = normalizedName,
            Section = section.Trim(),
            Capacity = capacity,
            Status = "available",
            FloorId = floorId
        };

        db.RestaurantTables.Add(table);
        await db.SaveChangesAsync(ct);

        return (SaveTableResult.Saved, await ToDtoAsync(table, ct));
    }
```

- [ ] **Step 5: Validate the floor in `UpdateTableAsync`**

Replace:

```csharp
    public async Task<(SaveTableResult Result, TableDto? Table)> UpdateTableAsync(
        Guid tenantId, Guid tableId, string name, string section, int capacity, CancellationToken ct)
    {
        var table = await db.RestaurantTables.SingleOrDefaultAsync(x => x.Id == tableId && x.TenantId == tenantId, ct);
        if (table is null)
            return (SaveTableResult.NotFound, null);

        var normalizedName = name.Trim();
        if (!normalizedName.Equals(table.Name, StringComparison.OrdinalIgnoreCase))
        {
            var duplicate = await db.RestaurantTables.AnyAsync(
                x => x.TenantId == tenantId && x.Id != tableId && x.Name.ToLower() == normalizedName.ToLower(), ct);
            if (duplicate)
                return (SaveTableResult.DuplicateName, null);
        }

        table.Name = normalizedName;
        table.Section = section.Trim();
        table.Capacity = capacity;
        table.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return (SaveTableResult.Saved, ToDto(table));
    }
```

with:

```csharp
    public async Task<(SaveTableResult Result, TableDto? Table)> UpdateTableAsync(
        Guid tenantId, Guid tableId, string name, string section, int capacity, Guid floorId, CancellationToken ct)
    {
        var table = await db.RestaurantTables.SingleOrDefaultAsync(x => x.Id == tableId && x.TenantId == tenantId, ct);
        if (table is null)
            return (SaveTableResult.NotFound, null);

        var floorValid = await db.Floors.AnyAsync(x => x.Id == floorId && x.TenantId == tenantId && !x.IsArchived, ct);
        if (!floorValid)
            return (SaveTableResult.InvalidFloor, null);

        var normalizedName = name.Trim();
        if (!normalizedName.Equals(table.Name, StringComparison.OrdinalIgnoreCase))
        {
            var duplicate = await db.RestaurantTables.AnyAsync(
                x => x.TenantId == tenantId && x.Id != tableId && x.Name.ToLower() == normalizedName.ToLower(), ct);
            if (duplicate)
                return (SaveTableResult.DuplicateName, null);
        }

        table.Name = normalizedName;
        table.Section = section.Trim();
        table.Capacity = capacity;
        table.FloorId = floorId;
        table.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return (SaveTableResult.Saved, await ToDtoAsync(table, ct));
    }
```

- [ ] **Step 6: Replace `ToDto` with an async version that loads the floor name**

`ToDto` currently builds a `TableDto` from an in-memory `RestaurantTable` without touching `Floor`, so it doesn't have `FloorName` available (that navigation isn't loaded on `Create`/`Update`'s tracked entity). Replace:

```csharp
    private static TableDto ToDto(RestaurantTable table) =>
        new(table.Id, table.Name, table.Section, table.Capacity, table.Status, table.IsArchived, null, null);
```

with:

```csharp
    private async Task<TableDto> ToDtoAsync(RestaurantTable table, CancellationToken ct)
    {
        var floorName = await db.Floors.Where(x => x.Id == table.FloorId).Select(x => x.Name).SingleAsync(ct);
        return new TableDto(
            table.Id, table.Name, table.Section, table.Capacity, table.Status, table.IsArchived,
            table.FloorId, floorName, null, null);
    }
```

- [ ] **Step 7: Update `TableEndpoints.cs` requests and result handling**

In `backend/ZipFlow.Api/Endpoints/TableEndpoints.cs`, replace:

```csharp
public sealed record CreateTableRequest(string Name, string Section, int Capacity);
public sealed record UpdateTableRequest(string Name, string Section, int Capacity);
```

with:

```csharp
public sealed record CreateTableRequest(string Name, string Section, int Capacity, Guid FloorId);
public sealed record UpdateTableRequest(string Name, string Section, int Capacity, Guid FloorId);
```

In the `POST /` handler, replace:

```csharp
            var (result, table) = await tables.CreateTableAsync(current.TenantId, request.Name, request.Section, request.Capacity, ct);
            return result switch
            {
                SaveTableResult.Saved => Results.Ok(ApiResponse<TableDto>.Ok(table!)),
                SaveTableResult.DuplicateName => Results.Conflict(ApiResponse<object>.Fail("A table with this name already exists.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to create table."))
            };
```

with:

```csharp
            var (result, table) = await tables.CreateTableAsync(current.TenantId, request.Name, request.Section, request.Capacity, request.FloorId, ct);
            return result switch
            {
                SaveTableResult.Saved => Results.Ok(ApiResponse<TableDto>.Ok(table!)),
                SaveTableResult.DuplicateName => Results.Conflict(ApiResponse<object>.Fail("A table with this name already exists.")),
                SaveTableResult.InvalidFloor => Results.BadRequest(ApiResponse<object>.Fail("Invalid floor.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to create table."))
            };
```

In the `PUT /{id:guid}` handler, replace:

```csharp
            var (result, table) = await tables.UpdateTableAsync(current.TenantId, id, request.Name, request.Section, request.Capacity, ct);
            return result switch
            {
                SaveTableResult.Saved => Results.Ok(ApiResponse<TableDto>.Ok(table!)),
                SaveTableResult.DuplicateName => Results.Conflict(ApiResponse<object>.Fail("A table with this name already exists.")),
                SaveTableResult.NotFound => Results.NotFound(ApiResponse<object>.Fail("Table not found.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to update table."))
            };
```

with:

```csharp
            var (result, table) = await tables.UpdateTableAsync(current.TenantId, id, request.Name, request.Section, request.Capacity, request.FloorId, ct);
            return result switch
            {
                SaveTableResult.Saved => Results.Ok(ApiResponse<TableDto>.Ok(table!)),
                SaveTableResult.DuplicateName => Results.Conflict(ApiResponse<object>.Fail("A table with this name already exists.")),
                SaveTableResult.NotFound => Results.NotFound(ApiResponse<object>.Fail("Table not found.")),
                SaveTableResult.InvalidFloor => Results.BadRequest(ApiResponse<object>.Fail("Invalid floor.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to update table."))
            };
```

- [ ] **Step 8: Build**

Run: `dotnet build` from `backend/ZipFlow.Api`
Expected: builds with no errors.

- [ ] **Step 9: Manual check**

With the API running and a valid token, confirm the floor round-trips:

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:5080/api/tables
```

Expected: each table in the response now has `floorId` and `floorName` fields, `floorName` matching an existing floor (`"Main Floor"` for pre-existing tables). Then try creating a table with a bogus `floorId` (a random GUID) — expect 400 "Invalid floor."

- [ ] **Step 10: Commit**

```bash
git add backend/ZipFlow.Api/Services/TableService.cs backend/ZipFlow.Api/Endpoints/TableEndpoints.cs
git commit -m "feat: add floor validation and FloorName to tables API"
```

---

### Task 7: Frontend `features/floors/` module + `RestaurantTable` type

**Files:**
- Create: `frontend/src/features/floors/types.ts`
- Create: `frontend/src/features/floors/api.ts`
- Modify: `frontend/src/features/tables/types.ts`

**Interfaces:**
- Produces: `Floor = { id: string; name: string }`, `getFloors()`, `createFloor(name)`, `updateFloor(id, name)`, `archiveFloor(id)` (all `Promise`-returning, mirroring `features/tables/api.ts`) — consumed by Task 8/9. `RestaurantTable` gains `floorId: string; floorName: string`.
- Consumes: `apiRequest`, `ApiEnvelope<T>` from `frontend/src/lib/api.ts` (existing).

- [ ] **Step 1: Write `features/floors/types.ts`**

Create `frontend/src/features/floors/types.ts`:

```typescript
export type Floor = {
  id: string
  name: string
}
```

- [ ] **Step 2: Write `features/floors/api.ts`**

Create `frontend/src/features/floors/api.ts`:

```typescript
import { apiRequest, type ApiEnvelope } from '../../lib/api'
import type { Floor } from './types'

export function getFloors() {
  return apiRequest<ApiEnvelope<Floor[]>>('/api/floors').then((res) => res.data)
}

export function createFloor(name: string) {
  return apiRequest<ApiEnvelope<Floor>>('/api/floors', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }).then((res) => res.data)
}

export function updateFloor(id: string, name: string) {
  return apiRequest<ApiEnvelope<Floor>>(`/api/floors/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  }).then((res) => res.data)
}

export function archiveFloor(id: string) {
  return apiRequest<ApiEnvelope<{ archived: boolean }>>(`/api/floors/${id}/archive`, {
    method: 'POST',
  }).then((res) => res.data)
}
```

- [ ] **Step 3: Extend `RestaurantTable`**

In `frontend/src/features/tables/types.ts`, replace:

```typescript
export type RestaurantTable = {
  id: string
  name: string
  section: string
  capacity: number
  status: TableStatus
  isArchived: boolean
  openOrderId: string | null
  openOrderCustomerName: string | null
}
```

with:

```typescript
export type RestaurantTable = {
  id: string
  name: string
  section: string
  capacity: number
  status: TableStatus
  isArchived: boolean
  floorId: string
  floorName: string
  openOrderId: string | null
  openOrderCustomerName: string | null
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -b` from `frontend`
Expected: no errors (existing callers of `RestaurantTable` only read fields that still exist — `floorId`/`floorName` are additive).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/floors/ frontend/src/features/tables/types.ts
git commit -m "feat: add floors API module and floor fields to RestaurantTable"
```

---

### Task 8: `TablesPage` — fetch, filter, and display floors

**Files:**
- Modify: `frontend/src/features/tables/TablesPage.tsx`
- Modify: `frontend/src/features/tables/api.ts` (`createTable`/`updateTable` gain a `floorId` param)

**Interfaces:**
- Consumes: `getFloors` (Task 7), `Floor` (Task 7), updated `RestaurantTable` (Task 7).
- Produces: nothing consumed by later tasks — Task 9 edits the same file but a different region (the Manage Layout panel and the add/edit forms), so this task's `floorId` param on `createTable`/`updateTable` is what Task 9 will pass a real value into (currently unused until Task 9 wires the `<select>`).

- [ ] **Step 1: Add `floorId` to `createTable`/`updateTable`**

In `frontend/src/features/tables/api.ts`, replace:

```typescript
export function createTable(name: string, section: string, capacity: number) {
  return apiRequest<ApiEnvelope<RestaurantTable>>('/api/tables', {
    method: 'POST',
    body: JSON.stringify({ name, section, capacity }),
  }).then((res) => res.data)
}

export function updateTable(id: string, name: string, section: string, capacity: number) {
  return apiRequest<ApiEnvelope<RestaurantTable>>(`/api/tables/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, section, capacity }),
  }).then((res) => res.data)
}
```

with:

```typescript
export function createTable(name: string, section: string, capacity: number, floorId: string) {
  return apiRequest<ApiEnvelope<RestaurantTable>>('/api/tables', {
    method: 'POST',
    body: JSON.stringify({ name, section, capacity, floorId }),
  }).then((res) => res.data)
}

export function updateTable(id: string, name: string, section: string, capacity: number, floorId: string) {
  return apiRequest<ApiEnvelope<RestaurantTable>>(`/api/tables/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, section, capacity, floorId }),
  }).then((res) => res.data)
}
```

(The two call sites in `TablesPage.tsx` are fixed up in Task 9, where the form gains the `<select>` that supplies `floorId`. This task alone will leave `TablesPage.tsx` failing to type-check on the `createTable`/`updateTable` calls — that's fine, it's fixed by the end of Task 9, and the two tasks are reviewed together in that sense. If you want Task 8 to type-check standalone, temporarily pass `floor` (the existing state variable holding the current `section`... no such variable exists) — simplest is to do Task 8 and Task 9 back-to-back without a build gate in between; Task 8's Step 4 below builds only `api.ts`'s own correctness via the exported function signatures, not the whole page.)

- [ ] **Step 2: Fetch floors and add filter state**

In `frontend/src/features/tables/TablesPage.tsx`, add the import (with the other feature imports near the top):

```typescript
import { getFloors } from '../floors/api'
import type { Floor } from '../floors/types'
```

Replace:

```typescript
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [manageOpen, setManageOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
```

with:

```typescript
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [floors, setFloors] = useState<Floor[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [manageOpen, setManageOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<string>('all')
  const [activeFloor, setActiveFloor] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
```

Replace:

```typescript
  const refetch = () => getTables().then(setTables)

  useEffect(() => {
    refetch()
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load tables.'))
      .finally(() => setLoading(false))
  }, [])
```

with:

```typescript
  const refetch = () => getTables().then(setTables)
  const refetchFloors = () => getFloors().then(setFloors)

  useEffect(() => {
    Promise.all([refetch(), refetchFloors()])
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load tables.'))
      .finally(() => setLoading(false))
  }, [])
```

- [ ] **Step 3: Add the floor filter to `filteredTables`**

Replace:

```typescript
  const filteredTables = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return activeTables.filter((t) => {
      if (activeSection !== 'all' && t.section !== activeSection) return false
      if (query) {
        const matchesName = t.name.toLowerCase().includes(query)
        const matchesCustomer = t.openOrderCustomerName?.toLowerCase().includes(query)
        const matchesSection = t.section.toLowerCase().includes(query)
        return matchesName || matchesCustomer || matchesSection
      }
      return true
    })
  }, [activeTables, activeSection, searchQuery])
```

with:

```typescript
  const filteredTables = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return activeTables.filter((t) => {
      if (activeSection !== 'all' && t.section !== activeSection) return false
      if (activeFloor !== 'all' && t.floorId !== activeFloor) return false
      if (query) {
        const matchesName = t.name.toLowerCase().includes(query)
        const matchesCustomer = t.openOrderCustomerName?.toLowerCase().includes(query)
        const matchesSection = t.section.toLowerCase().includes(query)
        return matchesName || matchesCustomer || matchesSection
      }
      return true
    })
  }, [activeTables, activeSection, activeFloor, searchQuery])
```

- [ ] **Step 4: Add a floor filter pill row**

Replace the opening of the toolbar:

```typescript
          <div className="tables-toolbar">
            <div className="section-filter-pills">
              <button
                type="button"
                className={`filter-pill ${activeSection === 'all' ? 'active' : ''}`}
                onClick={() => setActiveSection('all')}
              >
                All Sections <span className="pill-count">{activeTables.length}</span>
              </button>
```

with:

```typescript
          <div className="tables-toolbar">
            <div className="section-filter-pills">
              <button
                type="button"
                className={`filter-pill ${activeFloor === 'all' ? 'active' : ''}`}
                onClick={() => setActiveFloor('all')}
              >
                All Floors <span className="pill-count">{activeTables.length}</span>
              </button>
              {floors.map((floor) => {
                const count = activeTables.filter((t) => t.floorId === floor.id).length
                return (
                  <button
                    key={floor.id}
                    type="button"
                    className={`filter-pill ${activeFloor === floor.id ? 'active' : ''}`}
                    onClick={() => setActiveFloor(floor.id)}
                  >
                    {floor.name} <span className="pill-count">{count}</span>
                  </button>
                )
              })}
              <button
                type="button"
                className={`filter-pill ${activeSection === 'all' ? 'active' : ''}`}
                onClick={() => setActiveSection('all')}
              >
                All Sections <span className="pill-count">{activeTables.length}</span>
              </button>
```

- [ ] **Step 5: Show the floor name on each table card**

Replace:

```typescript
                      <div className="table-card-top">
                        <div className="table-name-group">
                          <strong className="table-card-title">{table.name}</strong>
                          <span className="table-section-tag">{table.section}</span>
                        </div>
```

with:

```typescript
                      <div className="table-card-top">
                        <div className="table-name-group">
                          <strong className="table-card-title">{table.name}</strong>
                          <span className="table-section-tag">{table.floorName} · {table.section}</span>
                        </div>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc -b` from `frontend`
Expected: this will still report errors on the `createTable(...)`/`updateTable(...)` call sites (Step 1's signature change) — that's expected and resolved by Task 9. Confirm there are no *other* errors (e.g. in the code touched by Steps 2-5 above).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/tables/TablesPage.tsx frontend/src/features/tables/api.ts
git commit -m "feat: fetch and filter tables by floor"
```

---

### Task 9: `TablesPage` — Floors management card + table form floor select

**Files:**
- Modify: `frontend/src/features/tables/TablesPage.tsx`

**Interfaces:**
- Consumes: `createFloor`, `updateFloor`, `archiveFloor` (Task 7); `createTable`/`updateTable` with `floorId` param (Task 8).

- [ ] **Step 1: Add imports and floor-management state**

Add to the imports (alongside the Task 8 floor imports):

```typescript
import { archiveFloor, createFloor, updateFloor } from '../floors/api'
```

Replace:

```typescript
  // Owner setup state (behind the Manage toggle)
  const [name, setName] = useState('')
  const [section, setSection] = useState<string>(TABLE_SECTIONS[0])
  const [capacity, setCapacity] = useState('4')
  const [addError, setAddError] = useState('')
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft>({ name: '', section: TABLE_SECTIONS[0], capacity: '4' })
  const [editError, setEditError] = useState('')
```

with:

```typescript
  // Owner setup state (behind the Manage toggle)
  const [name, setName] = useState('')
  const [section, setSection] = useState<string>(TABLE_SECTIONS[0])
  const [capacity, setCapacity] = useState('4')
  const [floorId, setFloorId] = useState<string>('')
  const [addError, setAddError] = useState('')
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft>({ name: '', section: TABLE_SECTIONS[0], capacity: '4', floorId: '' })
  const [editError, setEditError] = useState('')

  // Floor management state
  const [newFloorName, setNewFloorName] = useState('')
  const [floorAddError, setFloorAddError] = useState('')
  const [floorSaving, setFloorSaving] = useState(false)
  const [editingFloorId, setEditingFloorId] = useState<string | null>(null)
  const [editFloorName, setEditFloorName] = useState('')
  const [floorEditError, setFloorEditError] = useState('')
```

Replace the `EditDraft` type at the top of the file:

```typescript
type EditDraft = { name: string; section: string; capacity: string }
```

with:

```typescript
type EditDraft = { name: string; section: string; capacity: string; floorId: string }
```

- [ ] **Step 2: Default `floorId` once floors load**

Replace:

```typescript
  useEffect(() => {
    Promise.all([refetch(), refetchFloors()])
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load tables.'))
      .finally(() => setLoading(false))
  }, [])
```

with:

```typescript
  useEffect(() => {
    Promise.all([refetch(), refetchFloors()])
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load tables.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!floorId && floors.length > 0) setFloorId(floors[0].id)
  }, [floors, floorId])
```

- [ ] **Step 3: Pass `floorId` through add/edit table submit handlers**

Replace:

```typescript
  const submitAdd = async (event: FormEvent) => {
    event.preventDefault()
    setAddError('')

    const cap = Number(capacity)
    if (!name.trim()) return setAddError('Table name is required.')
    if (!Number.isFinite(cap) || cap < 1) return setAddError('Capacity must be at least 1.')

    setSaving(true)
    try {
      const created = await createTable(name.trim(), section, cap)
      setTables((prev) => [...prev, created])
      setName('')
      setCapacity('4')
      toast.success(`Table "${created.name}" created successfully.`)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add table.')
    } finally {
      setSaving(false)
    }
  }
```

with:

```typescript
  const submitAdd = async (event: FormEvent) => {
    event.preventDefault()
    setAddError('')

    const cap = Number(capacity)
    if (!name.trim()) return setAddError('Table name is required.')
    if (!Number.isFinite(cap) || cap < 1) return setAddError('Capacity must be at least 1.')
    if (!floorId) return setAddError('Floor is required.')

    setSaving(true)
    try {
      const created = await createTable(name.trim(), section, cap, floorId)
      setTables((prev) => [...prev, created])
      setName('')
      setCapacity('4')
      toast.success(`Table "${created.name}" created successfully.`)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add table.')
    } finally {
      setSaving(false)
    }
  }
```

Replace:

```typescript
  const startEdit = (table: RestaurantTable) => {
    setEditingId(table.id)
    setEditError('')
    setEditDraft({ name: table.name, section: table.section, capacity: String(table.capacity) })
  }

  const saveEdit = async (table: RestaurantTable) => {
    setEditError('')
    const cap = Number(editDraft.capacity)
    if (!editDraft.name.trim()) return setEditError('Table name is required.')
    if (!Number.isFinite(cap) || cap < 1) return setEditError('Capacity must be at least 1.')

    try {
      const updated = await updateTable(table.id, editDraft.name.trim(), editDraft.section, cap)
      setTables((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      setEditingId(null)
      toast.success(`Table "${updated.name}" updated.`)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update table.')
    }
  }
```

with:

```typescript
  const startEdit = (table: RestaurantTable) => {
    setEditingId(table.id)
    setEditError('')
    setEditDraft({ name: table.name, section: table.section, capacity: String(table.capacity), floorId: table.floorId })
  }

  const saveEdit = async (table: RestaurantTable) => {
    setEditError('')
    const cap = Number(editDraft.capacity)
    if (!editDraft.name.trim()) return setEditError('Table name is required.')
    if (!Number.isFinite(cap) || cap < 1) return setEditError('Capacity must be at least 1.')

    try {
      const updated = await updateTable(table.id, editDraft.name.trim(), editDraft.section, cap, editDraft.floorId)
      setTables((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      setEditingId(null)
      toast.success(`Table "${updated.name}" updated.`)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update table.')
    }
  }
```

- [ ] **Step 4: Add floor CRUD handlers**

Add after `archive` (the table archive handler):

```typescript

  const submitAddFloor = async (event: FormEvent) => {
    event.preventDefault()
    setFloorAddError('')
    if (!newFloorName.trim()) return setFloorAddError('Floor name is required.')

    setFloorSaving(true)
    try {
      const created = await createFloor(newFloorName.trim())
      setFloors((prev) => [...prev, created])
      setNewFloorName('')
      toast.success(`Floor "${created.name}" created successfully.`)
    } catch (err) {
      setFloorAddError(err instanceof Error ? err.message : 'Failed to add floor.')
    } finally {
      setFloorSaving(false)
    }
  }

  const startEditFloor = (floor: Floor) => {
    setEditingFloorId(floor.id)
    setFloorEditError('')
    setEditFloorName(floor.name)
  }

  const saveEditFloor = async (floor: Floor) => {
    setFloorEditError('')
    if (!editFloorName.trim()) return setFloorEditError('Floor name is required.')

    try {
      const updated = await updateFloor(floor.id, editFloorName.trim())
      setFloors((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
      setEditingFloorId(null)
      toast.success(`Floor "${updated.name}" updated.`)
    } catch (err) {
      setFloorEditError(err instanceof Error ? err.message : 'Failed to update floor.')
    }
  }

  const removeFloor = async (floor: Floor) => {
    if (!window.confirm(`Archive floor "${floor.name}"?`)) return
    try {
      await archiveFloor(floor.id)
      setFloors((prev) => prev.filter((f) => f.id !== floor.id))
      toast.info(`Floor "${floor.name}" archived.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive floor.')
    }
  }
```

- [ ] **Step 5: Add the Floors card to the Manage Layout panel**

Replace:

```typescript
      {/* Owner Setup / Manage Mode */}
      {manageOpen && (
        <section className="section-card manage-tables-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Restaurant Floor</p>
              <h2>Manage Tables &amp; Layout</h2>
            </div>
            <span className="quiet-pill">{tables.length} Total Tables</span>
          </div>

          {/* Add Table Form Card */}
```

with:

```typescript
      {/* Owner Setup / Manage Mode */}
      {manageOpen && (
        <section className="section-card manage-tables-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Restaurant Floor</p>
              <h2>Manage Tables &amp; Layout</h2>
            </div>
            <span className="quiet-pill">{tables.length} Total Tables</span>
          </div>

          {/* Floors Card */}
          <form className="manage-add-table-card" onSubmit={submitAddFloor}>
            <div className="form-card-header">
              <Icon name="plus" size={18} />
              <strong>Add New Floor</strong>
            </div>
            <div className="tables-add-fields">
              <div className="input-with-label">
                <label>Floor Name</label>
                <input
                  placeholder="e.g. Ground Floor, Rooftop"
                  value={newFloorName}
                  onChange={(e) => setNewFloorName(e.target.value)}
                  required
                />
              </div>
              <button className="primary-button add-table-submit-btn" type="submit" disabled={floorSaving}>
                {floorSaving ? 'Adding…' : 'Add Floor'}
              </button>
            </div>
            {floorAddError && (
              <div className="alert error">
                <Icon name="alertTriangle" size={14} /> {floorAddError}
              </div>
            )}
          </form>

          {floors.length > 0 && (
            <div className="menu-table tables-table">
              <div className="menu-row menu-row-head tables-row">
                <span>Floor Name</span>
                <span className="actions-header">Actions</span>
              </div>
              {floors.map((floor) => (
                <div className="menu-row tables-row" key={floor.id}>
                  {editingFloorId === floor.id ? (
                    <>
                      <input
                        className="inventory-edit-input"
                        value={editFloorName}
                        onChange={(e) => setEditFloorName(e.target.value)}
                        autoFocus
                      />
                      <span className="inventory-row-actions">
                        <button className="menu-price-edit save-btn" onClick={() => saveEditFloor(floor)}>
                          <Icon name="check" size={14} /> Save
                        </button>
                        <button className="menu-archive cancel-btn" onClick={() => setEditingFloorId(null)}>
                          Cancel
                        </button>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="menu-item-name">
                        <strong>{floor.name}</strong>
                      </span>
                      <span className="inventory-row-actions">
                        <button className="menu-price-edit" onClick={() => startEditFloor(floor)} title="Edit Floor">
                          <Icon name="edit" size={14} /> Edit
                        </button>
                        <button className="menu-archive" onClick={() => removeFloor(floor)} title="Archive Floor">
                          <Icon name="trash" size={14} /> Archive
                        </button>
                      </span>
                    </>
                  )}
                </div>
              ))}
              {editingFloorId && floorEditError && (
                <div className="alert error inventory-edit-error">
                  <Icon name="alertTriangle" size={14} /> {floorEditError}
                </div>
              )}
            </div>
          )}

          {/* Add Table Form Card */}
```

- [ ] **Step 6: Add the Floor select to the Add Table form**

Replace:

```typescript
              <div className="input-with-label">
                <label>Section</label>
                <select value={section} onChange={(e) => setSection(e.target.value)}>
                  {TABLE_SECTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-with-label">
                <label>Max Seats</label>
```

with:

```typescript
              <div className="input-with-label">
                <label>Floor</label>
                <select value={floorId} onChange={(e) => setFloorId(e.target.value)}>
                  {floors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-with-label">
                <label>Section</label>
                <select value={section} onChange={(e) => setSection(e.target.value)}>
                  {TABLE_SECTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-with-label">
                <label>Max Seats</label>
```

- [ ] **Step 7: Add the Floor select to the inline Edit Table row**

Replace:

```typescript
                      <select
                        className="inventory-edit-input"
                        value={editDraft.section}
                        onChange={(e) => setEditDraft({ ...editDraft, section: e.target.value })}
                      >
                        {TABLE_SECTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
```

with:

```typescript
                      <select
                        className="inventory-edit-input"
                        value={editDraft.floorId}
                        onChange={(e) => setEditDraft({ ...editDraft, floorId: e.target.value })}
                      >
                        {floors.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className="inventory-edit-input"
                        value={editDraft.section}
                        onChange={(e) => setEditDraft({ ...editDraft, section: e.target.value })}
                      >
                        {TABLE_SECTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
```

- [ ] **Step 8: Type-check**

Run: `npx tsc -b` from `frontend`
Expected: no errors — this closes out the `createTable`/`updateTable` type errors left open at the end of Task 8.

- [ ] **Step 9: Manual check**

Run the frontend (`npm run dev` from `frontend`) and backend together (see `docs/RUNNING.md`), log in as the seeded admin, go to Tables → Manage Layout:
- Add a floor ("Rooftop"), confirm it appears in the Floors list and the Floor `<select>` on the Add Table form.
- Add a table on the new floor; confirm it appears filtered under the "Rooftop" pill on the main floor-plan view and shows "Rooftop" on its card.
- Try archiving "Rooftop" while that table is still on it — confirm a toast error and the floor stays listed.
- Archive an empty floor — confirm it disappears from the list and the filter pills.
- Edit an existing table and change its floor — confirm the card moves to the new floor's filter.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/features/tables/TablesPage.tsx
git commit -m "feat: add floor management UI to Tables page"
```

---

## Self-Review Notes

- **Spec coverage:** every spec section maps to a task — Data Model/Migration → Tasks 1-2, seeding → Task 3, `IFloorService`/`FloorEndpoints` → Tasks 4-5, table-side changes → Task 6, frontend `features/floors/` → Task 7, `TablesPage` filter/display → Task 8, Manage Layout card + forms → Task 9. `DashboardPage.tsx` (spec's "Out of Scope"-adjacent note) needs no task — it only reads `tables.length`/`t.status`, which are untouched; Task 7's `tsc -b` run would catch a break if one existed.
- **Placeholder scan:** no TBDs; every step carries literal code or an exact command.
- **Type consistency:** `FloorDto(Guid Id, string Name)` (Task 4) matches the frontend `Floor = { id: string; name: string }` (Task 7) field-for-field through the JSON envelope. `createTable`/`updateTable`'s `floorId` parameter (Task 8) is threaded through unchanged to Task 9's call sites. `SaveTableResult.InvalidFloor` (Task 6) is handled in both `TableEndpoints.cs` switch expressions.
