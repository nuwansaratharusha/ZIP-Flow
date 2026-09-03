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
