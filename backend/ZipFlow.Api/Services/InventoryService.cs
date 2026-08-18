using Microsoft.EntityFrameworkCore;
using ZipFlow.Api.Data;
using ZipFlow.Api.Domain;

namespace ZipFlow.Api.Services;

public sealed record StockItemDto(
    Guid Id, string Name, string Sku, string Unit, decimal Quantity,
    decimal ParLevel, decimal ReorderLevel, decimal Cost, bool IsArchived);

public sealed record StockAdjustmentDto(
    Guid Id, decimal Delta, decimal QuantityBefore, decimal QuantityAfter, string Reason, DateTimeOffset CreatedAt);

public enum SaveStockItemResult
{
    Saved,
    DuplicateSku,
    NotFound
}

public enum AdjustStockResult
{
    Adjusted,
    NotFound,
    MissingReason,
    NegativeResult
}

public interface IInventoryService
{
    Task<IReadOnlyList<StockItemDto>> GetItemsAsync(Guid tenantId, CancellationToken ct);

    Task<(SaveStockItemResult Result, StockItemDto? Item)> CreateItemAsync(
        Guid tenantId, string name, string sku, string unit, decimal parLevel, decimal reorderLevel, decimal cost, decimal initialQuantity, CancellationToken ct);

    Task<(SaveStockItemResult Result, StockItemDto? Item)> UpdateItemAsync(
        Guid tenantId, Guid itemId, string name, string sku, string unit, decimal parLevel, decimal reorderLevel, decimal cost, CancellationToken ct);

    Task<bool> ArchiveItemAsync(Guid tenantId, Guid itemId, CancellationToken ct);

    Task<(AdjustStockResult Result, StockItemDto? Item)> AdjustStockAsync(
        Guid tenantId, Guid itemId, decimal delta, string reason, CancellationToken ct);

    Task<IReadOnlyList<StockAdjustmentDto>> GetAdjustmentsAsync(Guid tenantId, Guid itemId, CancellationToken ct);
}

public sealed class InventoryService(AppDbContext db) : IInventoryService
{
    public async Task<IReadOnlyList<StockItemDto>> GetItemsAsync(Guid tenantId, CancellationToken ct)
    {
        return await db.StockItems
            .AsNoTracking()
            .Where(x => x.TenantId == tenantId && !x.IsArchived)
            .OrderBy(x => x.Name)
            .Select(x => ToDto(x))
            .ToListAsync(ct);
    }

    public async Task<(SaveStockItemResult Result, StockItemDto? Item)> CreateItemAsync(
        Guid tenantId, string name, string sku, string unit, decimal parLevel, decimal reorderLevel, decimal cost, decimal initialQuantity, CancellationToken ct)
    {
        var normalizedSku = sku.Trim();
        var duplicate = await db.StockItems.AnyAsync(x => x.TenantId == tenantId && x.Sku.ToLower() == normalizedSku.ToLower(), ct);
        if (duplicate)
            return (SaveStockItemResult.DuplicateSku, null);

        var item = new StockItem
        {
            TenantId = tenantId,
            Name = name.Trim(),
            Sku = normalizedSku,
            Unit = unit.Trim(),
            ParLevel = parLevel,
            ReorderLevel = reorderLevel,
            Cost = cost,
            Quantity = initialQuantity
        };

        db.StockItems.Add(item);
        await db.SaveChangesAsync(ct);

        return (SaveStockItemResult.Saved, ToDto(item));
    }

    public async Task<(SaveStockItemResult Result, StockItemDto? Item)> UpdateItemAsync(
        Guid tenantId, Guid itemId, string name, string sku, string unit, decimal parLevel, decimal reorderLevel, decimal cost, CancellationToken ct)
    {
        var item = await db.StockItems.SingleOrDefaultAsync(x => x.Id == itemId && x.TenantId == tenantId, ct);
        if (item is null)
            return (SaveStockItemResult.NotFound, null);

        var normalizedSku = sku.Trim();
        if (!normalizedSku.Equals(item.Sku, StringComparison.OrdinalIgnoreCase))
        {
            var duplicate = await db.StockItems.AnyAsync(
                x => x.TenantId == tenantId && x.Id != itemId && x.Sku.ToLower() == normalizedSku.ToLower(), ct);
            if (duplicate)
                return (SaveStockItemResult.DuplicateSku, null);
        }

        item.Name = name.Trim();
        item.Sku = normalizedSku;
        item.Unit = unit.Trim();
        item.ParLevel = parLevel;
        item.ReorderLevel = reorderLevel;
        item.Cost = cost;
        item.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return (SaveStockItemResult.Saved, ToDto(item));
    }

    public async Task<bool> ArchiveItemAsync(Guid tenantId, Guid itemId, CancellationToken ct)
    {
        var item = await db.StockItems.SingleOrDefaultAsync(x => x.Id == itemId && x.TenantId == tenantId, ct);
        if (item is null)
            return false;

        item.IsArchived = true;
        item.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<(AdjustStockResult Result, StockItemDto? Item)> AdjustStockAsync(
        Guid tenantId, Guid itemId, decimal delta, string reason, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(reason))
            return (AdjustStockResult.MissingReason, null);

        var item = await db.StockItems.SingleOrDefaultAsync(x => x.Id == itemId && x.TenantId == tenantId, ct);
        if (item is null)
            return (AdjustStockResult.NotFound, null);

        var before = item.Quantity;
        var after = before + delta;
        if (after < 0)
            return (AdjustStockResult.NegativeResult, null);

        db.StockAdjustments.Add(new StockAdjustment
        {
            StockItemId = item.Id,
            Delta = delta,
            QuantityBefore = before,
            QuantityAfter = after,
            Reason = reason.Trim()
        });

        item.Quantity = after;
        item.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return (AdjustStockResult.Adjusted, ToDto(item));
    }

    public async Task<IReadOnlyList<StockAdjustmentDto>> GetAdjustmentsAsync(Guid tenantId, Guid itemId, CancellationToken ct)
    {
        return await db.StockAdjustments
            .AsNoTracking()
            .Where(x => x.StockItemId == itemId && x.StockItem.TenantId == tenantId)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new StockAdjustmentDto(x.Id, x.Delta, x.QuantityBefore, x.QuantityAfter, x.Reason, x.CreatedAt))
            .ToListAsync(ct);
    }

    private static StockItemDto ToDto(StockItem item) => new(
        item.Id, item.Name, item.Sku, item.Unit, item.Quantity,
        item.ParLevel, item.ReorderLevel, item.Cost, item.IsArchived);
}
