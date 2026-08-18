using Microsoft.EntityFrameworkCore;
using ZipFlow.Api.Data;
using ZipFlow.Api.Domain;

namespace ZipFlow.Api.Services;

public sealed record TableDto(Guid Id, string Name, string Section, int Capacity, string Status, bool IsArchived);

public enum SaveTableResult
{
    Saved,
    DuplicateName,
    NotFound
}

public enum SetTableStatusResult
{
    Updated,
    NotFound,
    InvalidStatus
}

public interface ITableService
{
    Task<IReadOnlyList<TableDto>> GetTablesAsync(Guid tenantId, CancellationToken ct);

    Task<(SaveTableResult Result, TableDto? Table)> CreateTableAsync(
        Guid tenantId, string name, string section, int capacity, CancellationToken ct);

    Task<(SaveTableResult Result, TableDto? Table)> UpdateTableAsync(
        Guid tenantId, Guid tableId, string name, string section, int capacity, CancellationToken ct);

    Task<(SetTableStatusResult Result, TableDto? Table)> SetStatusAsync(
        Guid tenantId, Guid tableId, string status, CancellationToken ct);

    Task<bool> ArchiveTableAsync(Guid tenantId, Guid tableId, CancellationToken ct);
}

public sealed class TableService(AppDbContext db) : ITableService
{
    private static readonly HashSet<string> ValidStatuses = new(StringComparer.OrdinalIgnoreCase) { "available", "occupied", "reserved" };

    public async Task<IReadOnlyList<TableDto>> GetTablesAsync(Guid tenantId, CancellationToken ct)
    {
        return await db.RestaurantTables
            .AsNoTracking()
            .Where(x => x.TenantId == tenantId && !x.IsArchived)
            .OrderBy(x => x.Section).ThenBy(x => x.Name)
            .Select(x => ToDto(x))
            .ToListAsync(ct);
    }

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

    public async Task<(SetTableStatusResult Result, TableDto? Table)> SetStatusAsync(
        Guid tenantId, Guid tableId, string status, CancellationToken ct)
    {
        if (!ValidStatuses.Contains(status))
            return (SetTableStatusResult.InvalidStatus, null);

        var table = await db.RestaurantTables.SingleOrDefaultAsync(x => x.Id == tableId && x.TenantId == tenantId, ct);
        if (table is null)
            return (SetTableStatusResult.NotFound, null);

        table.Status = status.ToLowerInvariant();
        table.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return (SetTableStatusResult.Updated, ToDto(table));
    }

    public async Task<bool> ArchiveTableAsync(Guid tenantId, Guid tableId, CancellationToken ct)
    {
        var table = await db.RestaurantTables.SingleOrDefaultAsync(x => x.Id == tableId && x.TenantId == tenantId, ct);
        if (table is null)
            return false;

        table.IsArchived = true;
        table.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return true;
    }

    private static TableDto ToDto(RestaurantTable table) =>
        new(table.Id, table.Name, table.Section, table.Capacity, table.Status, table.IsArchived);
}
