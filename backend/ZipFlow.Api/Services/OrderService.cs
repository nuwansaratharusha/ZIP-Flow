using Microsoft.EntityFrameworkCore;
using Npgsql;
using ZipFlow.Api.Data;
using ZipFlow.Api.Domain;
using ZipFlow.Api.Security;

namespace ZipFlow.Api.Services;

public sealed record OrderLineRequest(Guid MenuItemId, int Quantity, string? Notes = null);
public sealed record OrderLineDto(string Name, int Quantity, decimal Price, decimal LineTotal, string? Notes);
public sealed record OrderRoundDto(Guid Id, int RoundNumber, DateTimeOffset SentAt, decimal RoundTotal, IReadOnlyList<OrderLineDto> Lines);
public sealed record OrderDto(
    Guid Id,
    int OrderNumber,
    Guid TableId,
    string TableName,
    string CustomerName,
    string? CustomerPhone,
    int? GuestCount,
    string Status,
    decimal Subtotal,
    decimal ServiceCharge,
    decimal Tax,
    decimal Total,
    string CurrencyCode,
    string CurrencySymbol,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ClosedAt,
    IReadOnlyList<OrderRoundDto> Rounds);

public enum OpenOrderResult
{
    Opened,
    InvalidCustomerName,
    TableNotFound,
    TableArchived,
    TableOccupied
}

public enum SendRoundResult
{
    Sent,
    OrderNotFound,
    OrderNotOpen,
    EmptyLines,
    InvalidQuantity,
    MenuItemNotFound
}

public enum CloseOrderResult
{
    Closed,
    NotFound,
    NotOpen
}

public enum CancelOrderResult
{
    Cancelled,
    NotFound,
    NotOpen
}

public interface IOrderService
{
    Task<(OpenOrderResult Result, OrderDto? Order)> OpenOrderAsync(
        Guid tenantId, Guid? id, Guid tableId, string customerName, string? customerPhone, CancellationToken ct);

    Task<(SendRoundResult Result, OrderDto? Order)> SendRoundAsync(
        Guid tenantId, Guid orderId, Guid? id, IReadOnlyList<OrderLineRequest> lines, CancellationToken ct);

    Task<(CloseOrderResult Result, OrderDto? Order)> CloseOrderAsync(Guid tenantId, Guid orderId, CancellationToken ct);

    Task<(CancelOrderResult Result, OrderDto? Order)> CancelOrderAsync(Guid tenantId, Guid orderId, CancellationToken ct);

    Task<OrderDto?> GetOrderAsync(Guid tenantId, Guid orderId, CancellationToken ct);

    Task<IReadOnlyList<OrderDto>> GetOrdersAsync(Guid tenantId, string? search, string? status, CancellationToken ct);
}

public sealed class OrderService(AppDbContext db, IAuditLogService audit, ICurrentRequestContext current) : IOrderService
{
    public async Task<(OpenOrderResult Result, OrderDto? Order)> OpenOrderAsync(
        Guid tenantId, Guid? id, Guid tableId, string customerName, string? customerPhone, CancellationToken ct)
    {
        // Idempotency: a retried "open table" call carries the same client-supplied id.
        if (id is Guid existingId)
        {
            var existing = await LoadOrderAsync(tenantId, existingId, ct);
            if (existing is not null)
                return (OpenOrderResult.Opened, ToDto(existing));
        }

        var name = customerName.Trim();
        if (name.Length == 0)
            return (OpenOrderResult.InvalidCustomerName, null);
        var phone = string.IsNullOrWhiteSpace(customerPhone) ? null : customerPhone.Trim();

        var table = await db.RestaurantTables.SingleOrDefaultAsync(x => x.Id == tableId && x.TenantId == tenantId, ct);
        if (table is null)
            return (OpenOrderResult.TableNotFound, null);
        if (table.IsArchived)
            return (OpenOrderResult.TableArchived, null);
        // Friendly pre-check only — the partial unique index below is the real guarantee under a race.
        if (table.Status.Equals("occupied", StringComparison.OrdinalIgnoreCase))
            return (OpenOrderResult.TableOccupied, null);

        var tenant = await db.Tenants.AsNoTracking().SingleAsync(x => x.Id == tenantId, ct);

        var order = new Order
        {
            TenantId = tenantId,
            LocationId = current.DefaultLocationId,
            TableId = tableId,
            CustomerName = name,
            CustomerPhone = phone,
            OpenedByUserId = current.UserId,
            Status = "Open",
            Subtotal = 0,
            ServiceCharge = 0,
            Tax = 0,
            Total = 0,
            CurrencyCode = tenant.CurrencyCode,
            CurrencySymbol = tenant.CurrencySymbol
        };
        if (id is Guid newId)
            order.Id = newId;

        order.OrderNumber = await NextOrderNumberAsync(tenantId, ct);

        table.Status = "occupied";
        table.UpdatedAt = DateTimeOffset.UtcNow;

        db.Orders.Add(order);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex, "IX_Order_TableId"))
        {
            // Two waiters opened the same table at the same instant; Postgres let one insert
            // through and rejected this one. Report a clean conflict, not a generic 500.
            return (OpenOrderResult.TableOccupied, null);
        }

        await audit.LogAsync(
            tenantId, current.UserId, order.LocationId, "Order", order.Id.ToString(), "OrderOpened",
            summary: $"Order #{order.OrderNumber} opened for {order.CustomerName} on table {table.Name}",
            metadata: new { order.OrderNumber, TableId = tableId, order.CustomerName }, ct: ct);

        var loaded = await LoadOrderAsync(tenantId, order.Id, ct);
        return (OpenOrderResult.Opened, ToDto(loaded!));
    }

    public async Task<(SendRoundResult Result, OrderDto? Order)> SendRoundAsync(
        Guid tenantId, Guid orderId, Guid? id, IReadOnlyList<OrderLineRequest> lines, CancellationToken ct)
    {
        var order = await db.Orders
            .Include(x => x.Table)
            .Include(x => x.Rounds).ThenInclude(x => x.Lines)
            .SingleOrDefaultAsync(x => x.Id == orderId && x.TenantId == tenantId, ct);
        if (order is null)
            return (SendRoundResult.OrderNotFound, null);
        if (order.Status != "Open")
            return (SendRoundResult.OrderNotOpen, null);

        // Idempotent replay: this round id is already on the order, so an earlier attempt
        // did get through. Report success — re-inserting would be caught by PK_OrderRound
        // below, but only after EF's change tracker had already rejected the duplicate.
        if (id is Guid replayedId && order.Rounds.Any(x => x.Id == replayedId))
            return (SendRoundResult.Sent, ToDto(order));

        if (lines.Count == 0)
            return (SendRoundResult.EmptyLines, null);
        if (lines.Any(x => x.Quantity < 1))
            return (SendRoundResult.InvalidQuantity, null);

        var itemIds = lines.Select(x => x.MenuItemId).Distinct().ToArray();
        var menuItems = await db.MenuItems
            .AsNoTracking()
            .Where(x => x.TenantId == tenantId && itemIds.Contains(x.Id) && x.IsAvailable && !x.IsArchived)
            .ToDictionaryAsync(x => x.Id, ct);
        if (menuItems.Count != itemIds.Length)
            return (SendRoundResult.MenuItemNotFound, null);

        var tenant = await db.Tenants.AsNoTracking().SingleAsync(x => x.Id == tenantId, ct);

        var nextRoundNumber = order.Rounds.Count == 0 ? 1 : order.Rounds.Max(x => x.RoundNumber) + 1;
        var round = new OrderRound
        {
            Id = id ?? Guid.NewGuid(),
            OrderId = order.Id,
            RoundNumber = nextRoundNumber,
            SentAt = DateTimeOffset.UtcNow
        };

        foreach (var line in lines)
        {
            // Snapshot name/price at send time — never a live join. History must survive
            // a later menu edit unchanged.
            var item = menuItems[line.MenuItemId];
            var lineTotal = Math.Round(item.Price * line.Quantity, 2, MidpointRounding.AwayFromZero);
            round.Lines.Add(new OrderLine
            {
                OrderId = order.Id,
                MenuItemId = item.Id,
                Name = item.Name,
                Price = item.Price,
                Quantity = line.Quantity,
                LineTotal = lineTotal,
                Notes = string.IsNullOrWhiteSpace(line.Notes) ? null : line.Notes.Trim()
            });
        }

        order.Rounds.Add(round);
        db.OrderRounds.Add(round);

        RecomputeTotals(order, tenant);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex, "PK_OrderRound"))
        {
            // A retried "send round" carries the same client-supplied round id, so the
            // retry's INSERT fails on the primary key — the round already went through.
            // Return the order's current state as a success, not an error.
            var reloaded = await LoadOrderAsync(tenantId, orderId, ct);
            return (SendRoundResult.Sent, ToDto(reloaded!));
        }

        await audit.LogAsync(
            tenantId, current.UserId, order.LocationId, "Order", order.Id.ToString(), "OrderRoundSent",
            summary: $"Round {round.RoundNumber} sent for order #{order.OrderNumber} ({round.Lines.Count} line(s))",
            metadata: new { order.OrderNumber, round.RoundNumber, LineCount = round.Lines.Count }, ct: ct);

        var loaded = await LoadOrderAsync(tenantId, orderId, ct);
        return (SendRoundResult.Sent, ToDto(loaded!));
    }

    public async Task<(CloseOrderResult Result, OrderDto? Order)> CloseOrderAsync(Guid tenantId, Guid orderId, CancellationToken ct)
    {
        var order = await db.Orders
            .Include(x => x.Table)
            .Include(x => x.Rounds).ThenInclude(x => x.Lines)
            .SingleOrDefaultAsync(x => x.Id == orderId && x.TenantId == tenantId, ct);
        if (order is null)
            return (CloseOrderResult.NotFound, null);
        if (order.Status != "Open")
            return (CloseOrderResult.NotOpen, null);

        var tenant = await db.Tenants.AsNoTracking().SingleAsync(x => x.Id == tenantId, ct);

        RecomputeTotals(order, tenant);
        order.Status = "Closed";
        order.ClosedAt = DateTimeOffset.UtcNow;
        order.UpdatedAt = DateTimeOffset.UtcNow;

        order.Table.Status = "available";
        order.Table.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        await audit.LogAsync(
            tenantId, current.UserId, order.LocationId, "Order", order.Id.ToString(), "OrderClosed",
            summary: $"Order #{order.OrderNumber} closed, total {order.CurrencySymbol}{order.Total}",
            metadata: new { order.OrderNumber, order.Total }, ct: ct);

        var loaded = await LoadOrderAsync(tenantId, orderId, ct);
        return (CloseOrderResult.Closed, ToDto(loaded!));
    }

    public async Task<(CancelOrderResult Result, OrderDto? Order)> CancelOrderAsync(Guid tenantId, Guid orderId, CancellationToken ct)
    {
        var order = await db.Orders
            .Include(x => x.Table)
            .SingleOrDefaultAsync(x => x.Id == orderId && x.TenantId == tenantId, ct);
        if (order is null)
            return (CancelOrderResult.NotFound, null);
        if (order.Status != "Open")
            return (CancelOrderResult.NotOpen, null);

        order.Status = "Cancelled";
        order.UpdatedAt = DateTimeOffset.UtcNow;

        order.Table.Status = "available";
        order.Table.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        await audit.LogAsync(
            tenantId, current.UserId, order.LocationId, "Order", order.Id.ToString(), "OrderCancelled",
            summary: $"Order #{order.OrderNumber} cancelled for table {order.Table.Name}",
            metadata: new { order.OrderNumber }, ct: ct);

        var loaded = await LoadOrderAsync(tenantId, orderId, ct);
        return (CancelOrderResult.Cancelled, ToDto(loaded!));
    }

    public async Task<OrderDto?> GetOrderAsync(Guid tenantId, Guid orderId, CancellationToken ct)
    {
        var order = await LoadOrderAsync(tenantId, orderId, ct);
        return order is null ? null : ToDto(order);
    }

    public async Task<IReadOnlyList<OrderDto>> GetOrdersAsync(Guid tenantId, string? search, string? status, CancellationToken ct)
    {
        var query = db.Orders
            .AsNoTracking()
            .Include(x => x.Table)
            .Include(x => x.Rounds).ThenInclude(x => x.Lines)
            .Where(x => x.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(status) && !status.Equals("All", StringComparison.OrdinalIgnoreCase))
            query = query.Where(x => x.Status == status);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(x =>
                x.OrderNumber.ToString().Contains(term) ||
                x.CustomerName.ToLower().Contains(term) ||
                x.Table.Name.ToLower().Contains(term) ||
                x.Lines.Any(l => l.Name.ToLower().Contains(term)));
        }

        var orders = await query
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync(ct);

        return orders.Select(ToDto).ToArray();
    }

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

    private Task<Order?> LoadOrderAsync(Guid tenantId, Guid orderId, CancellationToken ct) =>
        db.Orders
            .AsNoTracking()
            .Include(x => x.Table)
            .Include(x => x.Rounds).ThenInclude(x => x.Lines)
            .SingleOrDefaultAsync(x => x.Id == orderId && x.TenantId == tenantId, ct);

    /// <summary>
    /// Subtotal is the sum of every line on the order — every round, not just the one just
    /// sent. VAT is charged on subtotal plus service charge, matching the arithmetic this
    /// codebase already used before the reshape.
    /// </summary>
    private static void RecomputeTotals(Order order, Tenant tenant)
    {
        var subtotal = order.Rounds.SelectMany(r => r.Lines).Sum(l => l.LineTotal);
        order.Subtotal = subtotal;
        order.ServiceCharge = Math.Round(subtotal * tenant.ServiceChargeRate, 2, MidpointRounding.AwayFromZero);
        order.Tax = Math.Round((subtotal + order.ServiceCharge) * tenant.VatRate, 2, MidpointRounding.AwayFromZero);
        order.Total = order.Subtotal + order.ServiceCharge + order.Tax;
    }

    private static bool IsUniqueViolation(DbUpdateException ex, string constraintName) =>
        ex.InnerException is PostgresException { SqlState: "23505" } pg && pg.ConstraintName == constraintName;

    private static OrderDto ToDto(Order order) => new(
        order.Id,
        order.OrderNumber,
        order.TableId,
        order.Table.Name,
        order.CustomerName,
        order.CustomerPhone,
        order.GuestCount,
        order.Status,
        order.Subtotal,
        order.ServiceCharge,
        order.Tax,
        order.Total,
        order.CurrencyCode,
        order.CurrencySymbol,
        order.CreatedAt,
        order.ClosedAt,
        order.Rounds
            .OrderBy(r => r.RoundNumber)
            .Select(r => new OrderRoundDto(
                r.Id,
                r.RoundNumber,
                r.SentAt,
                r.Lines.Sum(l => l.LineTotal),
                // Lines print in the order the waiter added them, so a reprinted slip and
                // the original read the same way; the database returns no order of its own.
                r.Lines
                    .OrderBy(l => l.CreatedAt).ThenBy(l => l.Id)
                    .Select(l => new OrderLineDto(l.Name, l.Quantity, l.Price, l.LineTotal, l.Notes)).ToArray()))
            .ToArray());
}
