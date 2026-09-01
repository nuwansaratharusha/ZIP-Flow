using ZipFlow.Api.Common;
using ZipFlow.Api.Security;
using ZipFlow.Api.Services;

namespace ZipFlow.Api.Endpoints;

public sealed record OpenOrderRequest(Guid? Id, Guid TableId, string CustomerName, string? CustomerPhone);
public sealed record SendRoundRequest(Guid? Id, IReadOnlyList<OrderLineRequest> Lines);

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

        group.MapPost("/", async (OpenOrderRequest request, ICurrentRequestContext current, IOrderService orders, CancellationToken ct) =>
        {
            var (result, order) = await orders.OpenOrderAsync(
                current.TenantId, request.Id, request.TableId, request.CustomerName, request.CustomerPhone, ct);
            return result switch
            {
                OpenOrderResult.Opened => Results.Ok(ApiResponse<OrderDto>.Ok(order!)),
                OpenOrderResult.InvalidCustomerName => Results.BadRequest(ApiResponse<object>.Fail("Customer name is required.")),
                OpenOrderResult.TableNotFound => Results.NotFound(ApiResponse<object>.Fail("Table not found.")),
                OpenOrderResult.TableArchived => Results.BadRequest(ApiResponse<object>.Fail("Table is archived.")),
                OpenOrderResult.TableOccupied => Results.Conflict(ApiResponse<object>.Fail("Table already occupied.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to open order."))
            };
        })
        .RequireAuthorization("permission:pos.orders.create");

        group.MapPost("/{id:guid}/rounds", async (Guid id, SendRoundRequest request, ICurrentRequestContext current, IOrderService orders, CancellationToken ct) =>
        {
            var (result, order) = await orders.SendRoundAsync(current.TenantId, id, request.Id, request.Lines ?? [], ct);
            return result switch
            {
                SendRoundResult.Sent => Results.Ok(ApiResponse<OrderDto>.Ok(order!)),
                SendRoundResult.OrderNotFound => Results.NotFound(ApiResponse<object>.Fail("Order not found.")),
                SendRoundResult.OrderNotOpen => Results.BadRequest(ApiResponse<object>.Fail("Order is not open.")),
                SendRoundResult.EmptyLines => Results.BadRequest(ApiResponse<object>.Fail("Round must have at least one line.")),
                SendRoundResult.InvalidQuantity => Results.BadRequest(ApiResponse<object>.Fail("Quantity must be at least 1.")),
                SendRoundResult.MenuItemNotFound => Results.BadRequest(ApiResponse<object>.Fail("One or more menu items are unavailable.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to send round."))
            };
        })
        .RequireAuthorization("permission:pos.orders.create");

        group.MapPost("/{id:guid}/close", async (Guid id, ICurrentRequestContext current, IOrderService orders, CancellationToken ct) =>
        {
            var (result, order) = await orders.CloseOrderAsync(current.TenantId, id, ct);
            return result switch
            {
                CloseOrderResult.Closed => Results.Ok(ApiResponse<OrderDto>.Ok(order!)),
                CloseOrderResult.NotFound => Results.NotFound(ApiResponse<object>.Fail("Order not found.")),
                CloseOrderResult.NotOpen => Results.BadRequest(ApiResponse<object>.Fail("Order is not open.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to close order."))
            };
        })
        .RequireAuthorization("permission:pos.orders.manage");

        group.MapPost("/{id:guid}/cancel", async (Guid id, ICurrentRequestContext current, IOrderService orders, CancellationToken ct) =>
        {
            var (result, order) = await orders.CancelOrderAsync(current.TenantId, id, ct);
            return result switch
            {
                CancelOrderResult.Cancelled => Results.Ok(ApiResponse<OrderDto>.Ok(order!)),
                CancelOrderResult.NotFound => Results.NotFound(ApiResponse<object>.Fail("Order not found.")),
                CancelOrderResult.NotOpen => Results.BadRequest(ApiResponse<object>.Fail("Order is not open.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to cancel order."))
            };
        })
        .RequireAuthorization("permission:pos.orders.manage");

        // Round + bill printing are queued for the Epson via Server Direct Print:
        // the cloud can't reach a LAN printer, so the printer polls us and collects
        // these jobs. See PrintEndpoints / ServerDirectPrint.
        group.MapPost("/{id:guid}/rounds/{roundNumber:int}/print", async (
            Guid id, int roundNumber, ICurrentRequestContext current,
            IOrderService orders, ISettingsService settings, IServerDirectPrintQueue printQueue, CancellationToken ct) =>
        {
            var order = await orders.GetOrderAsync(current.TenantId, id, ct);
            if (order is null)
                return Results.NotFound(ApiResponse<object>.Fail("Order not found."));

            var round = order.Rounds.FirstOrDefault(r => r.RoundNumber == roundNumber);
            if (round is null)
                return Results.NotFound(ApiResponse<object>.Fail("Round not found."));

            var receipt = await settings.GetReceiptSettingsAsync(current.TenantId, ct);
            var xml = EposPrintXmlBuilder.BuildRound(receipt!.BusinessName, order, round);
            printQueue.Enqueue(new PrintJob(
                Guid.NewGuid().ToString("N"), xml,
                $"round {roundNumber} order #{order.OrderNumber}", DateTimeOffset.UtcNow));

            return Results.Ok(ApiResponse<object>.Ok(new { queued = true }));
        })
        .RequireAuthorization("permission:pos.orders.create");

        group.MapPost("/{id:guid}/bill/print", async (
            Guid id, ICurrentRequestContext current,
            IOrderService orders, ISettingsService settings, IServerDirectPrintQueue printQueue, CancellationToken ct) =>
        {
            var order = await orders.GetOrderAsync(current.TenantId, id, ct);
            if (order is null)
                return Results.NotFound(ApiResponse<object>.Fail("Order not found."));

            var receipt = await settings.GetReceiptSettingsAsync(current.TenantId, ct);
            var xml = EposPrintXmlBuilder.BuildBill(receipt!.BusinessName, receipt.FooterMessage, order);
            printQueue.Enqueue(new PrintJob(
                Guid.NewGuid().ToString("N"), xml,
                $"bill order #{order.OrderNumber}", DateTimeOffset.UtcNow));

            return Results.Ok(ApiResponse<object>.Ok(new { queued = true }));
        })
        .RequireAuthorization("permission:pos.orders.manage");

        return app;
    }
}
