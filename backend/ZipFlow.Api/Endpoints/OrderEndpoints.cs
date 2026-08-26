using ZipFlow.Api.Common;
using ZipFlow.Api.Security;
using ZipFlow.Api.Services;

namespace ZipFlow.Api.Endpoints;

public static class OrderEndpoints
{
    public static IEndpointRouteBuilder MapOrderEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/orders").WithTags("Orders");

        group.MapGet("/{id:guid}", async (Guid id, ICurrentRequestContext current, IOrderService orders, CancellationToken ct) =>
        {
            var order = await orders.GetOrderAsync(current.TenantId, id, ct);
            return order is null
                ? Results.NotFound(ApiResponse<object>.Fail("Order not found."))
                : Results.Ok(ApiResponse<OrderDto>.Ok(order));
        })
        .RequireAuthorization("permission:pos.orders.view");

        group.MapGet("/", async (string? search, string? status, ICurrentRequestContext current, IOrderService orders, CancellationToken ct) =>
            Results.Ok(ApiResponse<IReadOnlyList<OrderDto>>.Ok(await orders.GetOrdersAsync(current.TenantId, search, status, ct))))
            .RequireAuthorization("permission:pos.orders.view");

        return app;
    }
}
