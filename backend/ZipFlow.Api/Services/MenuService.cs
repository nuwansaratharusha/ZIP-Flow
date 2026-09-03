using Microsoft.EntityFrameworkCore;
using ZipFlow.Api.Data;
using ZipFlow.Api.Domain;

namespace ZipFlow.Api.Services;

public sealed record CategoryDto(Guid Id, string Name, int SortOrder);
public sealed record MenuItemDto(Guid Id, Guid CategoryId, string Name, string Sku, decimal Price, bool IsAvailable, bool IsArchived);
public sealed record CatalogDto(IReadOnlyList<CategoryDto> Categories, IReadOnlyList<MenuItemDto> Items);

public enum CreateMenuItemResult
{
    Created,
    DuplicateSku,
    CategoryNotFound
}

public interface IMenuService
{
    Task<IReadOnlyList<CategoryDto>> GetCategoriesAsync(Guid tenantId, CancellationToken ct);
    Task<CategoryDto> CreateCategoryAsync(Guid tenantId, string name, int sortOrder, CancellationToken ct);
    Task<(bool Success, string? ErrorMessage)> DeleteCategoryAsync(Guid tenantId, Guid categoryId, CancellationToken ct);
    Task<IReadOnlyList<MenuItemDto>> GetItemsAsync(Guid tenantId, CancellationToken ct);
    Task<(CreateMenuItemResult Result, MenuItemDto? Item)> CreateItemAsync(Guid tenantId, Guid categoryId, string name, string sku, decimal price, CancellationToken ct);
    Task<MenuItemDto?> UpdateItemAsync(Guid tenantId, Guid itemId, string name, decimal price, Guid categoryId, CancellationToken ct);
    Task<MenuItemDto?> SetAvailabilityAsync(Guid tenantId, Guid itemId, bool isAvailable, CancellationToken ct);
    Task<bool> ArchiveItemAsync(Guid tenantId, Guid itemId, CancellationToken ct);
    Task<CatalogDto> GetCatalogAsync(Guid tenantId, CancellationToken ct);

    // --- OCR menu import helpers ---
    Task<string> GenerateUniqueSkuAsync(Guid tenantId, string name, IReadOnlySet<string> reserved, CancellationToken ct);
    Task<CategoryDto> FindOrCreateCategoryAsync(Guid tenantId, string name, int sortOrder, CancellationToken ct);
    Task<bool> ItemExistsByNameAsync(Guid tenantId, string name, CancellationToken ct);
}

public sealed class MenuService(AppDbContext db) : IMenuService
{
    public async Task<IReadOnlyList<CategoryDto>> GetCategoriesAsync(Guid tenantId, CancellationToken ct)
    {
        return await db.Categories
            .AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.IsActive)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
            .Select(x => new CategoryDto(x.Id, x.Name, x.SortOrder))
            .ToListAsync(ct);
    }

    public async Task<CategoryDto> CreateCategoryAsync(Guid tenantId, string name, int sortOrder, CancellationToken ct)
    {
        var category = new Category
        {
            TenantId = tenantId,
            Name = name.Trim(),
            SortOrder = sortOrder
        };
        db.Categories.Add(category);
        await db.SaveChangesAsync(ct);
        return new CategoryDto(category.Id, category.Name, category.SortOrder);
    }

    public async Task<(bool Success, string? ErrorMessage)> DeleteCategoryAsync(Guid tenantId, Guid categoryId, CancellationToken ct)
    {
        var category = await db.Categories
            .SingleOrDefaultAsync(x => x.Id == categoryId && x.TenantId == tenantId && x.IsActive, ct);

        if (category is null)
            return (false, "Category not found.");

        var hasActiveItems = await db.MenuItems.AnyAsync(
            x => x.CategoryId == categoryId && x.TenantId == tenantId && !x.IsArchived, ct);

        if (hasActiveItems)
            return (false, "Cannot delete category with active dishes. Please reassign or archive its dishes first.");

        category.IsActive = false;
        category.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return (true, null);
    }

    public async Task<IReadOnlyList<MenuItemDto>> GetItemsAsync(Guid tenantId, CancellationToken ct)
    {
        return await db.MenuItems
            .AsNoTracking()
            .Where(x => x.TenantId == tenantId && !x.IsArchived)
            .OrderBy(x => x.Category.SortOrder).ThenBy(x => x.Name)
            .Select(x => new MenuItemDto(x.Id, x.CategoryId, x.Name, x.Sku, x.Price, x.IsAvailable, x.IsArchived))
            .ToListAsync(ct);
    }

    public async Task<(CreateMenuItemResult Result, MenuItemDto? Item)> CreateItemAsync(
        Guid tenantId, Guid categoryId, string name, string sku, decimal price, CancellationToken ct)
    {
        var categoryExists = await db.Categories.AnyAsync(x => x.Id == categoryId && x.TenantId == tenantId, ct);
        if (!categoryExists)
            return (CreateMenuItemResult.CategoryNotFound, null);

        var normalizedSku = sku.Trim();
        var duplicate = await db.MenuItems.AnyAsync(
            x => x.TenantId == tenantId && x.Sku.ToLower() == normalizedSku.ToLower(), ct);
        if (duplicate)
            return (CreateMenuItemResult.DuplicateSku, null);

        var item = new MenuItem
        {
            TenantId = tenantId,
            CategoryId = categoryId,
            Name = name.Trim(),
            Sku = normalizedSku,
            Price = price
        };
        db.MenuItems.Add(item);
        await db.SaveChangesAsync(ct);

        return (CreateMenuItemResult.Created, new MenuItemDto(item.Id, item.CategoryId, item.Name, item.Sku, item.Price, item.IsAvailable, item.IsArchived));
    }

    public async Task<MenuItemDto?> UpdateItemAsync(Guid tenantId, Guid itemId, string name, decimal price, Guid categoryId, CancellationToken ct)
    {
        var item = await db.MenuItems.SingleOrDefaultAsync(x => x.Id == itemId && x.TenantId == tenantId, ct);
        if (item is null)
            return null;

        item.Name = name.Trim();
        item.Price = price;
        item.CategoryId = categoryId;
        item.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return new MenuItemDto(item.Id, item.CategoryId, item.Name, item.Sku, item.Price, item.IsAvailable, item.IsArchived);
    }

    public async Task<MenuItemDto?> SetAvailabilityAsync(Guid tenantId, Guid itemId, bool isAvailable, CancellationToken ct)
    {
        var item = await db.MenuItems.SingleOrDefaultAsync(x => x.Id == itemId && x.TenantId == tenantId, ct);
        if (item is null)
            return null;

        item.IsAvailable = isAvailable;
        item.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return new MenuItemDto(item.Id, item.CategoryId, item.Name, item.Sku, item.Price, item.IsAvailable, item.IsArchived);
    }

    public async Task<bool> ArchiveItemAsync(Guid tenantId, Guid itemId, CancellationToken ct)
    {
        var item = await db.MenuItems.SingleOrDefaultAsync(x => x.Id == itemId && x.TenantId == tenantId, ct);
        if (item is null)
            return false;

        item.IsArchived = true;
        item.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<CatalogDto> GetCatalogAsync(Guid tenantId, CancellationToken ct)
    {
        var categories = await GetCategoriesAsync(tenantId, ct);

        var items = await db.MenuItems
            .AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.IsAvailable && !x.IsArchived)
            .OrderBy(x => x.Category.SortOrder).ThenBy(x => x.Name)
            .Select(x => new MenuItemDto(x.Id, x.CategoryId, x.Name, x.Sku, x.Price, x.IsAvailable, x.IsArchived))
            .ToListAsync(ct);

        return new CatalogDto(categories, items);
    }

    // --- OCR menu import helpers ---

    /// <summary>Build a clean, human-readable SKU (e.g. "CHI-001") that's unique for the
    /// tenant and not already taken within this import batch (<paramref name="reserved"/>).</summary>
    public async Task<string> GenerateUniqueSkuAsync(Guid tenantId, string name, IReadOnlySet<string> reserved, CancellationToken ct)
    {
        var letters = new string(name.ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());
        var prefix = letters.Length >= 3 ? letters[..3] : letters.PadRight(3, 'X');
        if (string.IsNullOrWhiteSpace(prefix)) prefix = "ITM";

        for (var n = 1; n < 1000; n++)
        {
            var candidate = $"{prefix}-{n:D3}";
            if (reserved.Contains(candidate)) continue;
            var taken = await db.MenuItems.AnyAsync(x => x.TenantId == tenantId && x.Sku.ToLower() == candidate.ToLower(), ct);
            if (!taken) return candidate;
        }
        return $"{prefix}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
    }

    public async Task<CategoryDto> FindOrCreateCategoryAsync(Guid tenantId, string name, int sortOrder, CancellationToken ct)
    {
        var trimmed = name.Trim();
        // Match INCLUDING soft-deleted rows: the unique index on (TenantId, Name)
        // covers inactive categories too, so reuse (and reactivate) an existing name
        // rather than trying to insert a duplicate.
        var existing = await db.Categories.FirstOrDefaultAsync(
            x => x.TenantId == tenantId && x.Name.ToLower() == trimmed.ToLower(), ct);
        if (existing is not null)
        {
            if (!existing.IsActive)
            {
                existing.IsActive = true;
                existing.UpdatedAt = DateTimeOffset.UtcNow;
                await db.SaveChangesAsync(ct);
            }
            return new CategoryDto(existing.Id, existing.Name, existing.SortOrder);
        }

        return await CreateCategoryAsync(tenantId, trimmed, sortOrder, ct);
    }

    public async Task<bool> ItemExistsByNameAsync(Guid tenantId, string name, CancellationToken ct)
    {
        var trimmed = name.Trim().ToLower();
        return await db.MenuItems.AnyAsync(
            x => x.TenantId == tenantId && !x.IsArchived && x.Name.ToLower() == trimmed, ct);
    }
}
