using Microsoft.EntityFrameworkCore;
using ZipFlow.Api.Data;
using ZipFlow.Api.Domain;

namespace ZipFlow.Api.Services;

public sealed record OrderLineRequest(Guid MenuItemId, int Quantity);
public sealed record OrderLineDto(string Name, int Quantity, decimal Price, decimal LineTotal);
public sealed record OrderDto(
    Guid Id,
    int OrderNumber,
    string ServiceMode,
    string Status,
    string? PaymentMethod,
    decimal Subtotal,
    decimal Tax,
    decimal Total,
    DateTimeOffset CreatedAt,
    IReadOnlyList<OrderLineDto> Lines);

public enum CreateOrderResult
{
    Created,
    EmptyOrder,
    ItemNotFound
}

public enum CompleteOrderResult
{
    Completed,
    NotFound,
    NotAwaitingPayment
}

public enum SetStatusResult
{
    Updated,
    NotFound
}

public interface IOrderService
{
    Task<(CreateOrderResult Result, OrderDto? Order)> CreateSentOrderAsync(
        Guid tenantId, Guid? locationId, string serviceMode, IReadOnlyList<OrderLineRequest> lines, CancellationToken ct);

    Task<(CreateOrderResult Result, OrderDto? Order)> CreateCompletedOrderAsync(
        Guid tenantId, Guid? locationId, string serviceMode, string paymentMethod, IReadOnlyList<OrderLineRequest> lines, CancellationToken ct);

    Task<(CompleteOrderResult Result, OrderDto? Order)> CompleteExistingOrderAsync(
        Guid tenantId, Guid orderId, string paymentMethod, CancellationToken ct);

    Task<(SetStatusResult Result, OrderDto? Order)> SetStatusAsync(
        Guid tenantId, Guid orderId, string status, CancellationToken ct);

    Task<OrderDto?> GetOrderAsync(Guid tenantId, Guid orderId, CancellationToken ct);

    Task<IReadOnlyList<OrderDto>> GetOrdersAsync(Guid tenantId, string? search, string? status, CancellationToken ct);
}

public sealed class OrderService(AppDbContext db) : IOrderService
{
    public async Task<(CreateOrderResult Result, OrderDto? Order)> CreateSentOrderAsync(
        Guid tenantId, Guid? locationId, string serviceMode, IReadOnlyList<OrderLineRequest> lines, CancellationToken ct)
        => await CreateOrderAsync(tenantId, locationId, serviceMode, "Sent", null, lines, ct);

    public async Task<(CreateOrderResult Result, OrderDto? Order)> CreateCompletedOrderAsync(
        Guid tenantId, Guid? locationId, string serviceMode, string paymentMethod, IReadOnlyList<OrderLineRequest> lines, CancellationToken ct)
        => await CreateOrderAsync(tenantId, locationId, serviceMode, "Completed", paymentMethod, lines, ct);

    private async Task<(CreateOrderResult Result, OrderDto? Order)> CreateOrderAsync(
        Guid tenantId, Guid? locationId, string serviceMode, string status, string? paymentMethod,
        IReadOnlyList<OrderLineRequest> lines, CancellationToken ct)
    {
        if (lines.Count == 0)
            return (CreateOrderResult.EmptyOrder, null);

        var itemIds = lines.Select(x => x.MenuItemId).Distinct().ToArray();
        var menuItems = await db.MenuItems
            .AsNoTracking()
            .Where(x => x.TenantId == tenantId && itemIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);

        if (menuItems.Count != itemIds.Length)
            return (CreateOrderResult.ItemNotFound, null);

        var nextOrderNumber = (await db.Orders
            .Where(x => x.TenantId == tenantId)
            .Select(x => (int?)x.OrderNumber)
            .MaxAsync(ct) ?? 0) + 1;

        var order = new Order
        {
            TenantId = tenantId,
            LocationId = locationId,
            OrderNumber = nextOrderNumber,
            ServiceMode = serviceMode,
            Status = status,
            PaymentMethod = paymentMethod
        };

        decimal subtotal = 0;
        foreach (var line in lines)
        {
            var item = menuItems[line.MenuItemId];
            var lineTotal = item.Price * line.Quantity;
            subtotal += lineTotal;
            order.Lines.Add(new OrderLine
            {
                MenuItemId = item.Id,
                Name = item.Name,
                Price = item.Price,
                Quantity = line.Quantity,
                LineTotal = lineTotal
            });
        }

        order.Subtotal = subtotal;
        order.Tax = Math.Round(subtotal * 0.1m, 2, MidpointRounding.AwayFromZero);
        order.Total = order.Subtotal + order.Tax;

        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        return (CreateOrderResult.Created, ToDto(order));
    }

    public async Task<(CompleteOrderResult Result, OrderDto? Order)> CompleteExistingOrderAsync(
        Guid tenantId, Guid orderId, string paymentMethod, CancellationToken ct)
    {
        var order = await db.Orders
            .Include(x => x.Lines)
            .SingleOrDefaultAsync(x => x.Id == orderId && x.TenantId == tenantId, ct);

        if (order is null)
            return (CompleteOrderResult.NotFound, null);

        if (order.Status != "Sent")
            return (CompleteOrderResult.NotAwaitingPayment, null);

        order.Status = "Completed";
        order.PaymentMethod = paymentMethod;
        order.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return (CompleteOrderResult.Completed, ToDto(order));
    }

    public async Task<(SetStatusResult Result, OrderDto? Order)> SetStatusAsync(
        Guid tenantId, Guid orderId, string status, CancellationToken ct)
    {
        var order = await db.Orders
            .Include(x => x.Lines)
            .SingleOrDefaultAsync(x => x.Id == orderId && x.TenantId == tenantId, ct);

        if (order is null)
            return (SetStatusResult.NotFound, null);

        order.Status = status;
        order.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return (SetStatusResult.Updated, ToDto(order));
    }

    public async Task<OrderDto?> GetOrderAsync(Guid tenantId, Guid orderId, CancellationToken ct)
    {
        var order = await db.Orders
            .AsNoTracking()
            .Include(x => x.Lines)
            .SingleOrDefaultAsync(x => x.Id == orderId && x.TenantId == tenantId, ct);

        return order is null ? null : ToDto(order);
    }

    public async Task<IReadOnlyList<OrderDto>> GetOrdersAsync(Guid tenantId, string? search, string? status, CancellationToken ct)
    {
        var query = db.Orders
            .AsNoTracking()
            .Include(x => x.Lines)
            .Where(x => x.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(status) && !status.Equals("All", StringComparison.OrdinalIgnoreCase))
            query = query.Where(x => x.Status == status);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(x =>
                x.OrderNumber.ToString().Contains(term) ||
                x.Lines.Any(l => l.Name.ToLower().Contains(term)));
        }

        var orders = await query
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync(ct);

        return orders.Select(ToDto).ToArray();
    }

    private static OrderDto ToDto(Order order) => new(
        order.Id,
        order.OrderNumber,
        order.ServiceMode,
        order.Status,
        order.PaymentMethod,
        order.Subtotal,
        order.Tax,
        order.Total,
        order.CreatedAt,
        order.Lines.Select(x => new OrderLineDto(x.Name, x.Quantity, x.Price, x.LineTotal)).ToArray());
}
