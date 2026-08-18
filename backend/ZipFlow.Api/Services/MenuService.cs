using Microsoft.EntityFrameworkCore;
using ZipFlow.Api.Data;
using ZipFlow.Api.Domain;

namespace ZipFlow.Api.Services;

public sealed record CategoryDto(Guid Id, string Name, int SortOrder, string? Station);
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
    Task<CategoryDto> CreateCategoryAsync(Guid tenantId, string name, int sortOrder, string? station, CancellationToken ct);
    Task<IReadOnlyList<MenuItemDto>> GetItemsAsync(Guid tenantId, CancellationToken ct);
    Task<(CreateMenuItemResult Result, MenuItemDto? Item)> CreateItemAsync(Guid tenantId, Guid categoryId, string name, string sku, decimal price, CancellationToken ct);
    Task<MenuItemDto?> UpdateItemAsync(Guid tenantId, Guid itemId, string name, decimal price, Guid categoryId, CancellationToken ct);
    Task<MenuItemDto?> SetAvailabilityAsync(Guid tenantId, Guid itemId, bool isAvailable, CancellationToken ct);
    Task<bool> ArchiveItemAsync(Guid tenantId, Guid itemId, CancellationToken ct);
    Task<CatalogDto> GetCatalogAsync(Guid tenantId, CancellationToken ct);
}

public sealed class MenuService(AppDbContext db) : IMenuService
{
    public async Task<IReadOnlyList<CategoryDto>> GetCategoriesAsync(Guid tenantId, CancellationToken ct)
    {
        return await db.Categories
            .AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.IsActive)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
            .Select(x => new CategoryDto(x.Id, x.Name, x.SortOrder, x.Station))
            .ToListAsync(ct);
    }

    public async Task<CategoryDto> CreateCategoryAsync(Guid tenantId, string name, int sortOrder, string? station, CancellationToken ct)
    {
        var category = new Category
        {
            TenantId = tenantId,
            Name = name.Trim(),
            SortOrder = sortOrder,
            Station = string.IsNullOrWhiteSpace(station) ? null : station.Trim()
        };
        db.Categories.Add(category);
        await db.SaveChangesAsync(ct);
        return new CategoryDto(category.Id, category.Name, category.SortOrder, category.Station);
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
}
