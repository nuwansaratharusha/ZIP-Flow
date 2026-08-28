using ZipFlow.Api.Common;
using ZipFlow.Api.Security;
using ZipFlow.Api.Services;

namespace ZipFlow.Api.Endpoints;

public sealed record CreateCategoryRequest(string Name, int SortOrder);
public sealed record CreateMenuItemRequest(Guid CategoryId, string Name, string Sku, decimal Price);
public sealed record UpdateMenuItemRequest(string Name, decimal Price, Guid CategoryId);
public sealed record SetAvailabilityRequest(bool IsAvailable);

public static class MenuEndpoints
{
    public static IEndpointRouteBuilder MapMenuEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/menu").WithTags("Menu");

        group.MapGet("/categories", async (ICurrentRequestContext current, IMenuService menu, CancellationToken ct) =>
            Results.Ok(ApiResponse<IReadOnlyList<CategoryDto>>.Ok(await menu.GetCategoriesAsync(current.TenantId, ct))))
            .RequireAuthorization("permission:menu.categories.view");

        group.MapPost("/categories", async (CreateCategoryRequest request, ICurrentRequestContext current, IMenuService menu, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest(ApiResponse<object>.Fail("Category name is required."));

            var category = await menu.CreateCategoryAsync(current.TenantId, request.Name, request.SortOrder, ct);
            return Results.Ok(ApiResponse<CategoryDto>.Ok(category));
        })
        .RequireAuthorization("permission:menu.categories.manage");

        group.MapDelete("/categories/{id:guid}", async (Guid id, ICurrentRequestContext current, IMenuService menu, CancellationToken ct) =>
        {
            var (success, error) = await menu.DeleteCategoryAsync(current.TenantId, id, ct);
            return success
                ? Results.Ok(ApiResponse<object>.Ok(new { deleted = true }))
                : Results.BadRequest(ApiResponse<object>.Fail(error ?? "Unable to delete category."));
        })
        .RequireAuthorization("permission:menu.categories.manage");

        group.MapGet("/items", async (ICurrentRequestContext current, IMenuService menu, CancellationToken ct) =>
            Results.Ok(ApiResponse<IReadOnlyList<MenuItemDto>>.Ok(await menu.GetItemsAsync(current.TenantId, ct))))
            .RequireAuthorization("permission:menu.items.view");

        group.MapPost("/items", async (CreateMenuItemRequest request, ICurrentRequestContext current, IMenuService menu, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Sku))
                return Results.BadRequest(ApiResponse<object>.Fail("Name and SKU are required."));
            if (request.Price < 0)
                return Results.BadRequest(ApiResponse<object>.Fail("Price cannot be negative."));

            var (result, item) = await menu.CreateItemAsync(current.TenantId, request.CategoryId, request.Name, request.Sku, request.Price, ct);
            return result switch
            {
                CreateMenuItemResult.Created => Results.Ok(ApiResponse<MenuItemDto>.Ok(item!)),
                CreateMenuItemResult.DuplicateSku => Results.Conflict(ApiResponse<object>.Fail("A menu item with this SKU already exists.")),
                CreateMenuItemResult.CategoryNotFound => Results.BadRequest(ApiResponse<object>.Fail("Category not found.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to create menu item."))
            };
        })
        .RequireAuthorization("permission:menu.items.manage");

        group.MapPut("/items/{id:guid}", async (Guid id, UpdateMenuItemRequest request, ICurrentRequestContext current, IMenuService menu, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest(ApiResponse<object>.Fail("Name is required."));
            if (request.Price < 0)
                return Results.BadRequest(ApiResponse<object>.Fail("Price cannot be negative."));

            var item = await menu.UpdateItemAsync(current.TenantId, id, request.Name, request.Price, request.CategoryId, ct);
            return item is null
                ? Results.NotFound(ApiResponse<object>.Fail("Menu item not found."))
                : Results.Ok(ApiResponse<MenuItemDto>.Ok(item));
        })
        .RequireAuthorization("permission:menu.items.manage");

        group.MapPatch("/items/{id:guid}/availability", async (Guid id, SetAvailabilityRequest request, ICurrentRequestContext current, IMenuService menu, CancellationToken ct) =>
        {
            var item = await menu.SetAvailabilityAsync(current.TenantId, id, request.IsAvailable, ct);
            return item is null
                ? Results.NotFound(ApiResponse<object>.Fail("Menu item not found."))
                : Results.Ok(ApiResponse<MenuItemDto>.Ok(item));
        })
        .RequireAuthorization("permission:menu.items.manage");

        group.MapPost("/items/{id:guid}/archive", async (Guid id, ICurrentRequestContext current, IMenuService menu, CancellationToken ct) =>
        {
            var archived = await menu.ArchiveItemAsync(current.TenantId, id, ct);
            return archived
                ? Results.Ok(ApiResponse<object>.Ok(new { archived = true }))
                : Results.NotFound(ApiResponse<object>.Fail("Menu item not found."));
        })
        .RequireAuthorization("permission:menu.items.manage");

        group.MapGet("/catalog", async (ICurrentRequestContext current, IMenuService menu, CancellationToken ct) =>
            Results.Ok(ApiResponse<CatalogDto>.Ok(await menu.GetCatalogAsync(current.TenantId, ct))))
            .RequireAuthorization("permission:menu.items.view");

        return app;
    }
}
