using ZipFlow.Api.Common;
using ZipFlow.Api.Security;
using ZipFlow.Api.Services;

namespace ZipFlow.Api.Endpoints;

public sealed record CreateStockItemRequest(string Name, string Sku, string Unit, decimal ParLevel, decimal ReorderLevel, decimal Cost, decimal InitialQuantity);
public sealed record UpdateStockItemRequest(string Name, string Sku, string Unit, decimal ParLevel, decimal ReorderLevel, decimal Cost);
public sealed record AdjustStockRequest(decimal Delta, string Reason);

public static class InventoryEndpoints
{
    public static IEndpointRouteBuilder MapInventoryEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/inventory").WithTags("Inventory");

        group.MapGet("/items", async (ICurrentRequestContext current, IInventoryService inventory, CancellationToken ct) =>
            Results.Ok(ApiResponse<IReadOnlyList<StockItemDto>>.Ok(await inventory.GetItemsAsync(current.TenantId, ct))))
            .RequireAuthorization("permission:inventory.items.view");

        group.MapPost("/items", async (CreateStockItemRequest request, ICurrentRequestContext current, IInventoryService inventory, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Sku) || string.IsNullOrWhiteSpace(request.Unit))
                return Results.BadRequest(ApiResponse<object>.Fail("Name, SKU and unit are required."));
            if (request.ParLevel < 0 || request.ReorderLevel < 0 || request.Cost < 0 || request.InitialQuantity < 0)
                return Results.BadRequest(ApiResponse<object>.Fail("Values cannot be negative."));

            var (result, item) = await inventory.CreateItemAsync(
                current.TenantId, request.Name, request.Sku, request.Unit, request.ParLevel, request.ReorderLevel, request.Cost, request.InitialQuantity, ct);

            return result switch
            {
                SaveStockItemResult.Saved => Results.Ok(ApiResponse<StockItemDto>.Ok(item!)),
                SaveStockItemResult.DuplicateSku => Results.Conflict(ApiResponse<object>.Fail("A stock item with this SKU already exists.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to create stock item."))
            };
        })
        .RequireAuthorization("permission:inventory.items.manage");

        group.MapPut("/items/{id:guid}", async (Guid id, UpdateStockItemRequest request, ICurrentRequestContext current, IInventoryService inventory, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Sku) || string.IsNullOrWhiteSpace(request.Unit))
                return Results.BadRequest(ApiResponse<object>.Fail("Name, SKU and unit are required."));
            if (request.ParLevel < 0 || request.ReorderLevel < 0 || request.Cost < 0)
                return Results.BadRequest(ApiResponse<object>.Fail("Values cannot be negative."));

            var (result, item) = await inventory.UpdateItemAsync(
                current.TenantId, id, request.Name, request.Sku, request.Unit, request.ParLevel, request.ReorderLevel, request.Cost, ct);

            return result switch
            {
                SaveStockItemResult.Saved => Results.Ok(ApiResponse<StockItemDto>.Ok(item!)),
                SaveStockItemResult.DuplicateSku => Results.Conflict(ApiResponse<object>.Fail("A stock item with this SKU already exists.")),
                SaveStockItemResult.NotFound => Results.NotFound(ApiResponse<object>.Fail("Stock item not found.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to update stock item."))
            };
        })
        .RequireAuthorization("permission:inventory.items.manage");

        group.MapPost("/items/{id:guid}/archive", async (Guid id, ICurrentRequestContext current, IInventoryService inventory, CancellationToken ct) =>
        {
            var archived = await inventory.ArchiveItemAsync(current.TenantId, id, ct);
            return archived
                ? Results.Ok(ApiResponse<object>.Ok(new { archived = true }))
                : Results.NotFound(ApiResponse<object>.Fail("Stock item not found."));
        })
        .RequireAuthorization("permission:inventory.items.manage");

        group.MapPost("/items/{id:guid}/adjust", async (Guid id, AdjustStockRequest request, ICurrentRequestContext current, IInventoryService inventory, CancellationToken ct) =>
        {
            var (result, item) = await inventory.AdjustStockAsync(current.TenantId, id, request.Delta, request.Reason, ct);
            return result switch
            {
                AdjustStockResult.Adjusted => Results.Ok(ApiResponse<StockItemDto>.Ok(item!)),
                AdjustStockResult.NotFound => Results.NotFound(ApiResponse<object>.Fail("Stock item not found.")),
                AdjustStockResult.MissingReason => Results.BadRequest(ApiResponse<object>.Fail("A reason is required to adjust stock.")),
                AdjustStockResult.NegativeResult => Results.Conflict(ApiResponse<object>.Fail("This adjustment would result in negative stock.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to adjust stock."))
            };
        })
        .RequireAuthorization("permission:inventory.stock.adjust");

        group.MapGet("/items/{id:guid}/adjustments", async (Guid id, ICurrentRequestContext current, IInventoryService inventory, CancellationToken ct) =>
            Results.Ok(ApiResponse<IReadOnlyList<StockAdjustmentDto>>.Ok(await inventory.GetAdjustmentsAsync(current.TenantId, id, ct))))
            .RequireAuthorization("permission:inventory.items.view");

        return app;
    }
}
