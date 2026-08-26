using Microsoft.EntityFrameworkCore;
using ZipFlow.Api.Data;
using ZipFlow.Api.Domain;
using ZipFlow.Api.Security;

namespace ZipFlow.Api.Services;

public sealed record OrderLineDto(string Name, int Quantity, decimal Price, decimal LineTotal, string? Notes);
public sealed record OrderDto(
    Guid Id,
    int OrderNumber,
    string Status,
    decimal Subtotal,
    decimal ServiceCharge,
    decimal Tax,
    decimal Total,
    string CurrencyCode,
    string CurrencySymbol,
    DateTimeOffset CreatedAt,
    IReadOnlyList<OrderLineDto> Lines);

public interface IOrderService
{
    Task<OrderDto?> GetOrderAsync(Guid tenantId, Guid orderId, CancellationToken ct);

    Task<IReadOnlyList<OrderDto>> GetOrdersAsync(Guid tenantId, string? search, string? status, CancellationToken ct);
}

public sealed class OrderService(AppDbContext db, IAuditLogService audit, ICurrentRequestContext current) : IOrderService
{
    /// <summary>
    /// Atomically claims the next order number for a tenant via a single upsert statement,
    /// instead of reading MAX(OrderNumber) and hoping no other terminal grabs the same value
    /// first. Postgres serializes the row-level update itself, so two terminals calling this
    /// at the same instant are guaranteed distinct results — no collision is possible, so no
    /// retry-on-conflict is needed.
    /// </summary>
    private async Task<int> NextOrderNumberAsync(Guid tenantId, CancellationToken ct)
    {
        var next = await db.Database.SqlQueryRaw<int>(
            """
            INSERT INTO pos."OrderNumberCounter" ("TenantId", "NextValue")
            VALUES ({0}, 2)
            ON CONFLICT ("TenantId") DO UPDATE
                SET "NextValue" = pos."OrderNumberCounter"."NextValue" + 1
            RETURNING "NextValue" - 1
            """, tenantId).ToListAsync(ct);

        return next[0];
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
        order.Status,
        order.Subtotal,
        order.ServiceCharge,
        order.Tax,
        order.Total,
        order.CurrencyCode,
        order.CurrencySymbol,
        order.CreatedAt,
        order.Lines.Select(x => new OrderLineDto(x.Name, x.Quantity, x.Price, x.LineTotal, x.Notes)).ToArray());
}
