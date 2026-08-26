using Microsoft.EntityFrameworkCore;
using ZipFlow.Api.Data;
using ZipFlow.Api.Domain;
using ZipFlow.Api.Security;

namespace ZipFlow.Api.Services;

public sealed record StockItemDto(
    Guid Id, string Name, string Sku, string Unit, decimal Quantity,
    decimal ParLevel, decimal ReorderLevel, decimal Cost, bool IsArchived,
    string RecipeUnit, decimal ConversionFactor);

public sealed record StockAdjustmentDto(
    Guid Id, decimal Delta, decimal QuantityBefore, decimal QuantityAfter, string Reason,
    DateTimeOffset CreatedAt, string Kind, Guid? OrderId);

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
        Guid tenantId, string name, string sku, string unit, decimal parLevel, decimal reorderLevel, decimal cost,
        decimal initialQuantity, string recipeUnit, decimal conversionFactor, CancellationToken ct);

    Task<(SaveStockItemResult Result, StockItemDto? Item)> UpdateItemAsync(
        Guid tenantId, Guid itemId, string name, string sku, string unit, decimal parLevel, decimal reorderLevel, decimal cost,
        string recipeUnit, decimal conversionFactor, CancellationToken ct);

    Task<bool> ArchiveItemAsync(Guid tenantId, Guid itemId, CancellationToken ct);

    Task<(AdjustStockResult Result, StockItemDto? Item)> AdjustStockAsync(
        Guid tenantId, Guid itemId, decimal delta, string reason, CancellationToken ct);

    Task<IReadOnlyList<StockAdjustmentDto>> GetAdjustmentsAsync(Guid tenantId, Guid itemId, CancellationToken ct);
}

public sealed class InventoryService(AppDbContext db, IAuditLogService audit, ICurrentRequestContext current) : IInventoryService
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
        Guid tenantId, string name, string sku, string unit, decimal parLevel, decimal reorderLevel, decimal cost,
        decimal initialQuantity, string recipeUnit, decimal conversionFactor, CancellationToken ct)
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
            Quantity = initialQuantity,
            RecipeUnit = string.IsNullOrWhiteSpace(recipeUnit) ? unit.Trim() : recipeUnit.Trim(),
            ConversionFactor = conversionFactor > 0 ? conversionFactor : 1
        };

        db.StockItems.Add(item);
        await db.SaveChangesAsync(ct);

        return (SaveStockItemResult.Saved, ToDto(item));
    }

    public async Task<(SaveStockItemResult Result, StockItemDto? Item)> UpdateItemAsync(
        Guid tenantId, Guid itemId, string name, string sku, string unit, decimal parLevel, decimal reorderLevel, decimal cost,
        string recipeUnit, decimal conversionFactor, CancellationToken ct)
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
        item.RecipeUnit = string.IsNullOrWhiteSpace(recipeUnit) ? unit.Trim() : recipeUnit.Trim();
        item.ConversionFactor = conversionFactor > 0 ? conversionFactor : 1;
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

        var adjustment = new StockAdjustment
        {
            StockItemId = item.Id,
            Delta = delta,
            QuantityBefore = before,
            QuantityAfter = after,
            Reason = reason.Trim(),
            Kind = "Manual"
        };
        db.StockAdjustments.Add(adjustment);

        item.Quantity = after;
        item.UpdatedAt = DateTimeOffset.UtcNow;
        await SaveChangesWithStockRetryAsync(item, adjustment, ct);

        await audit.LogAsync(
            tenantId, current.UserId, null, "StockItem", item.Id.ToString(), "StockAdjusted",
            summary: $"{item.Name} adjusted by {delta} ({reason.Trim()})",
            metadata: new { item.Sku, delta, before, after, reason = reason.Trim() }, ct: ct);

        return (AdjustStockResult.Adjusted, ToDto(item));
    }

    /// <summary>
    /// StockItem.Quantity is guarded by a Postgres xmin concurrency token (see AppDbContext),
    /// so a stale read-modify-write throws DbUpdateConcurrencyException on SaveChanges instead
    /// of silently clobbering a concurrent update (issue #3). On conflict, re-anchor to the
    /// fresh database quantity/xmin, re-apply the same delta, shift the ledger row recorded in
    /// this call by the same amount, then retry. Mirrors OrderService's stock-save retry.
    /// </summary>
    private async Task SaveChangesWithStockRetryAsync(StockItem item, StockAdjustment adjustment, CancellationToken ct)
    {
        const int maxAttempts = 5;

        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await db.SaveChangesAsync(ct);
                return;
            }
            catch (DbUpdateConcurrencyException) when (attempt < maxAttempts)
            {
                var entry = db.Entry(item);
                var databaseValues = await entry.GetDatabaseValuesAsync(ct)
                    ?? throw new InvalidOperationException(
                        $"Stock item {item.Id} was deleted concurrently while updating its quantity.");

                var proposedQuantity = entry.CurrentValues.GetValue<decimal>(nameof(StockItem.Quantity));
                var originalQuantity = entry.OriginalValues.GetValue<decimal>(nameof(StockItem.Quantity));
                var delta = proposedQuantity - originalQuantity;

                var freshQuantity = databaseValues.GetValue<decimal>(nameof(StockItem.Quantity));
                var shift = freshQuantity - originalQuantity;

                entry.CurrentValues[nameof(StockItem.Quantity)] = freshQuantity + delta;
                entry.OriginalValues.SetValues(databaseValues);

                adjustment.QuantityBefore += shift;
                adjustment.QuantityAfter += shift;
            }
        }
    }

    public async Task<IReadOnlyList<StockAdjustmentDto>> GetAdjustmentsAsync(Guid tenantId, Guid itemId, CancellationToken ct)
    {
        return await db.StockAdjustments
            .AsNoTracking()
            .Where(x => x.StockItemId == itemId && x.StockItem.TenantId == tenantId)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new StockAdjustmentDto(x.Id, x.Delta, x.QuantityBefore, x.QuantityAfter, x.Reason, x.CreatedAt, x.Kind, x.OrderId))
            .ToListAsync(ct);
    }

    private static StockItemDto ToDto(StockItem item) => new(
        item.Id, item.Name, item.Sku, item.Unit, item.Quantity,
        item.ParLevel, item.ReorderLevel, item.Cost, item.IsArchived,
        item.RecipeUnit, item.ConversionFactor);
}
