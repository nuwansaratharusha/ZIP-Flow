using ZipFlow.Api.Common;
using ZipFlow.Api.Security;
using ZipFlow.Api.Services;

namespace ZipFlow.Api.Endpoints;

public sealed record SendToKitchenRequest(string ServiceMode, IReadOnlyList<OrderLineRequest> Lines);
public sealed record CompletePaymentRequest(string ServiceMode, string PaymentMethod, IReadOnlyList<OrderLineRequest> Lines);
public sealed record CompleteOrderRequest(string PaymentMethod);
public sealed record SetOrderStatusRequest(string Status);

public static class OrderEndpoints
{
    private static readonly HashSet<string> ValidServiceModes = new(StringComparer.OrdinalIgnoreCase) { "Dine in", "Takeaway", "Delivery" };
    private static readonly HashSet<string> ValidPaymentMethods = new(StringComparer.OrdinalIgnoreCase) { "Cash", "Card" };
    private static readonly HashSet<string> ValidStatuses = new(StringComparer.OrdinalIgnoreCase)
        { "Open", "Sent", "Preparing", "Ready", "Completed", "Cancelled" };

    public static IEndpointRouteBuilder MapOrderEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/orders").WithTags("Orders");

        group.MapPost("/send-to-kitchen", async (SendToKitchenRequest request, ICurrentRequestContext current, IOrderService orders, CancellationToken ct) =>
        {
            if (!ValidServiceModes.Contains(request.ServiceMode))
                return Results.BadRequest(ApiResponse<object>.Fail("Invalid service mode."));
            if (request.Lines is null || request.Lines.Count == 0 || request.Lines.Any(x => x.Quantity < 1))
                return Results.BadRequest(ApiResponse<object>.Fail("Order must contain at least one line with quantity 1 or more."));

            var (result, order) = await orders.CreateSentOrderAsync(current.TenantId, current.DefaultLocationId, request.ServiceMode, request.Lines, ct);
            return result switch
            {
                CreateOrderResult.Created => Results.Ok(ApiResponse<OrderDto>.Ok(order!)),
                CreateOrderResult.ItemNotFound => Results.BadRequest(ApiResponse<object>.Fail("One or more menu items could not be found.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to send order to kitchen."))
            };
        })
        .RequireAuthorization("permission:pos.orders.create");

        group.MapPost("/complete-payment", async (CompletePaymentRequest request, ICurrentRequestContext current, IOrderService orders, CancellationToken ct) =>
        {
            if (!ValidServiceModes.Contains(request.ServiceMode))
                return Results.BadRequest(ApiResponse<object>.Fail("Invalid service mode."));
            if (!ValidPaymentMethods.Contains(request.PaymentMethod))
                return Results.BadRequest(ApiResponse<object>.Fail("Invalid payment method."));
            if (request.Lines is null || request.Lines.Count == 0 || request.Lines.Any(x => x.Quantity < 1))
                return Results.BadRequest(ApiResponse<object>.Fail("Order must contain at least one line with quantity 1 or more."));

            var (result, order) = await orders.CreateCompletedOrderAsync(current.TenantId, current.DefaultLocationId, request.ServiceMode, request.PaymentMethod, request.Lines, ct);
            return result switch
            {
                CreateOrderResult.Created => Results.Ok(ApiResponse<OrderDto>.Ok(order!)),
                CreateOrderResult.ItemNotFound => Results.BadRequest(ApiResponse<object>.Fail("One or more menu items could not be found.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to complete payment."))
            };
        })
        .RequireAuthorization("permission:pos.orders.create");

        group.MapPost("/{id:guid}/complete", async (Guid id, CompleteOrderRequest request, ICurrentRequestContext current, IOrderService orders, CancellationToken ct) =>
        {
            if (!ValidPaymentMethods.Contains(request.PaymentMethod))
                return Results.BadRequest(ApiResponse<object>.Fail("Invalid payment method."));

            var (result, order) = await orders.CompleteExistingOrderAsync(current.TenantId, id, request.PaymentMethod, ct);
            return result switch
            {
                CompleteOrderResult.Completed => Results.Ok(ApiResponse<OrderDto>.Ok(order!)),
                CompleteOrderResult.NotFound => Results.NotFound(ApiResponse<object>.Fail("Order not found.")),
                CompleteOrderResult.NotAwaitingPayment => Results.Conflict(ApiResponse<object>.Fail("Order is not awaiting payment.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to complete order."))
            };
        })
        .RequireAuthorization("permission:pos.orders.create");

        group.MapPatch("/{id:guid}/status", async (Guid id, SetOrderStatusRequest request, ICurrentRequestContext current, IOrderService orders, CancellationToken ct) =>
        {
            if (!ValidStatuses.Contains(request.Status))
                return Results.BadRequest(ApiResponse<object>.Fail("Invalid status."));

            var (result, order) = await orders.SetStatusAsync(current.TenantId, id, request.Status, ct);
            return result switch
            {
                SetStatusResult.Updated => Results.Ok(ApiResponse<OrderDto>.Ok(order!)),
                SetStatusResult.NotFound => Results.NotFound(ApiResponse<object>.Fail("Order not found.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to update order status."))
            };
        })
        .RequireAuthorization("permission:pos.orders.manage");

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
