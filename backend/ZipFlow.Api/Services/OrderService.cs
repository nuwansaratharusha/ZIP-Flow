using Microsoft.EntityFrameworkCore;
using ZipFlow.Api.Data;
using ZipFlow.Api.Domain;
using ZipFlow.Api.Security;

namespace ZipFlow.Api.Services;

public sealed record OrderLineRequest(Guid MenuItemId, int Quantity, string? Notes = null);
public sealed record OrderLineDto(string Name, int Quantity, decimal Price, decimal LineTotal, string? Notes);
public sealed record OrderDto(
    Guid Id,
    int OrderNumber,
    string ServiceMode,
    string Status,
    string PaymentState,
    string? DestinationLabel,
    string? PaymentMethod,
    decimal Subtotal,
    decimal ServiceCharge,
    decimal Tax,
    decimal Total,
    string CurrencyCode,
    string CurrencySymbol,
    decimal AmountTendered,
    decimal ChangeDue,
    DateTimeOffset CreatedAt,
    IReadOnlyList<OrderLineDto> Lines);

public enum CreateOrderResult
{
    Created,
    EmptyOrder,
    ItemNotFound,
    UnsupportedCurrency,
    InsufficientTender
}

public enum CompleteOrderResult
{
    Completed,
    NotFound,
    NotAwaitingPayment,
    InsufficientTender
}

public enum SetStatusResult
{
    Updated,
    NotFound
}

public interface IOrderService
{
    Task<(CreateOrderResult Result, OrderDto? Order)> CreateOrderAsync(
        Guid tenantId, Guid? locationId, Guid? clientOrderId, string serviceMode, string? destinationLabel,
        string paymentMethod, string? currencyCode, decimal? amountTendered, IReadOnlyList<OrderLineRequest> lines, CancellationToken ct);

    Task<(CompleteOrderResult Result, OrderDto? Order)> CompleteExistingOrderAsync(
        Guid tenantId, Guid orderId, string paymentMethod, decimal? amountTendered, CancellationToken ct);

    Task<(SetStatusResult Result, OrderDto? Order)> SetStatusAsync(
        Guid tenantId, Guid orderId, string status, CancellationToken ct);

    Task<OrderDto?> GetOrderAsync(Guid tenantId, Guid orderId, CancellationToken ct);

    Task<IReadOnlyList<OrderDto>> GetOrdersAsync(Guid tenantId, string? search, string? status, CancellationToken ct);
}

public sealed class OrderService(AppDbContext db, IAuditLogService audit, ICurrentRequestContext current) : IOrderService
{
    public async Task<(CreateOrderResult Result, OrderDto? Order)> CreateOrderAsync(
        Guid tenantId, Guid? locationId, Guid? clientOrderId, string serviceMode, string? destinationLabel,
        string paymentMethod, string? currencyCode, decimal? amountTendered, IReadOnlyList<OrderLineRequest> lines, CancellationToken ct)
    {
        if (lines.Count == 0)
            return (CreateOrderResult.EmptyOrder, null);

        // Idempotency: if the client supplied its own order Id (e.g. to survive a
        // dropped-connection retry), and an order with that Id already exists for this
        // tenant, treat this call as already processed instead of creating a duplicate.
        if (clientOrderId is Guid existingId)
        {
            var existingOrder = await db.Orders
                .AsNoTracking()
                .Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.Id == existingId && x.TenantId == tenantId, ct);
            if (existingOrder is not null)
                return (CreateOrderResult.Created, ToDto(existingOrder));
        }

        var itemIds = lines.Select(x => x.MenuItemId).Distinct().ToArray();
        var menuItems = await db.MenuItems
            .AsNoTracking()
            .Where(x => x.TenantId == tenantId && itemIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);

        if (menuItems.Count != itemIds.Length)
            return (CreateOrderResult.ItemNotFound, null);

        var tenant = await db.Tenants.AsNoTracking().SingleAsync(x => x.Id == tenantId, ct);

        string currCode = tenant.CurrencyCode;
        string currSymbol = tenant.CurrencySymbol;
        decimal rate = 1m;

        if (!string.IsNullOrWhiteSpace(currencyCode) && !string.Equals(currencyCode, tenant.CurrencyCode, StringComparison.OrdinalIgnoreCase))
        {
            var currencyRate = await db.CurrencyRates.AsNoTracking().SingleOrDefaultAsync(
                x => x.TenantId == tenantId && x.Code == currencyCode.Trim().ToUpperInvariant() && !x.IsArchived, ct);
            if (currencyRate is null)
                return (CreateOrderResult.UnsupportedCurrency, null);

            currCode = currencyRate.Code;
            currSymbol = currencyRate.Symbol;
            rate = currencyRate.Rate;
        }

        var order = new Order
        {
            TenantId = tenantId,
            LocationId = locationId,
            ServiceMode = serviceMode,
            Status = "Sent",
            PaymentState = "Paid",
            PaymentMethod = paymentMethod,
            CurrencyCode = currCode,
            CurrencySymbol = currSymbol,
            ExchangeRate = rate,
            BaseCurrencyCode = tenant.CurrencyCode
        };

        if (clientOrderId is Guid newId)
            order.Id = newId;

        decimal subtotal = 0;
        foreach (var line in lines)
        {
            var item = menuItems[line.MenuItemId];
            var price = Math.Round(item.Price * rate, 2, MidpointRounding.AwayFromZero);
            var lineTotal = price * line.Quantity;
            subtotal += lineTotal;
            order.Lines.Add(new OrderLine
            {
                MenuItemId = item.Id,
                Name = item.Name,
                Price = price,
                Quantity = line.Quantity,
                LineTotal = lineTotal,
                Notes = string.IsNullOrWhiteSpace(line.Notes) ? null : line.Notes.Trim()
            });
        }

        order.Subtotal = subtotal;
        order.ServiceCharge = Math.Round(subtotal * tenant.ServiceChargeRate, 2, MidpointRounding.AwayFromZero);
        order.Tax = Math.Round((subtotal + order.ServiceCharge) * tenant.VatRate, 2, MidpointRounding.AwayFromZero);
        order.Total = order.Subtotal + order.ServiceCharge + order.Tax;

        // Subtotal/Total above are in the transaction currency (post-FX). Also store the
        // pre-conversion amounts in the tenant's base currency so cross-currency reports
        // (sum of Total across orders) always aggregate a consistent unit.
        order.BaseCurrencySubtotal = Math.Round(order.Subtotal / rate, 2, MidpointRounding.AwayFromZero);
        order.BaseCurrencyTotal = Math.Round(order.Total / rate, 2, MidpointRounding.AwayFromZero);

        var tendered = amountTendered ?? order.Total;
        if (tendered < order.Total)
            return (CreateOrderResult.InsufficientTender, null);

        order.AmountTendered = tendered;
        order.ChangeDue = tendered - order.Total;

        db.Orders.Add(order);
        var stockAdjustments = await ConsumeIngredientsAsync(order, ct);

        order.OrderNumber = await NextOrderNumberAsync(tenantId, ct);

        // Eat-in keeps whatever marker number the cashier typed; takeaway/delivery get no
        // cashier-entered destination, so the order number itself doubles as the collection
        // number handed to the customer.
        order.DestinationLabel = string.Equals(serviceMode, "Dine in", StringComparison.OrdinalIgnoreCase)
            ? (string.IsNullOrWhiteSpace(destinationLabel) ? null : destinationLabel.Trim())
            : order.OrderNumber.ToString();

        try
        {
            await SaveChangesWithStockRetryAsync(stockAdjustments, ct);
        }
        catch (DbUpdateException) when (clientOrderId is not null)
        {
            // Two retries of the same client-generated order Id raced each other; the other
            // one won. Return its result instead of failing or double-consuming stock.
            var winner = await db.Orders
                .AsNoTracking()
                .Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.Id == clientOrderId && x.TenantId == tenantId, ct);
            if (winner is not null)
                return (CreateOrderResult.Created, ToDto(winner));
            throw;
        }

        await audit.LogAsync(
            tenantId, current.UserId, locationId, "Order", order.Id.ToString(), "OrderCreated",
            summary: $"Order #{order.OrderNumber} created and paid ({paymentMethod}, {serviceMode})",
            metadata: new { order.OrderNumber, paymentMethod, serviceMode, order.Total }, ct: ct);

        return (CreateOrderResult.Created, ToDto(order));
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

    /// <summary>
    /// Never blocks the sale and never rejects on a negative result — a negative theoretical
    /// balance here is meaningful shrinkage/variance data, not an error. Manual counts
    /// (InventoryService.AdjustStockAsync) keep the strict "no negative result" guard;
    /// automatic sale-driven consumption is intentionally permissive.
    /// </summary>
    private async Task<Dictionary<Guid, List<StockAdjustment>>> ConsumeIngredientsAsync(Order order, CancellationToken ct)
    {
        var adjustmentsByStockItem = new Dictionary<Guid, List<StockAdjustment>>();

        var menuItemIds = order.Lines.Select(l => l.MenuItemId).Distinct().ToArray();
        var recipes = await db.Recipes
            .Include(r => r.Lines)
            .Where(r => menuItemIds.Contains(r.MenuItemId))
            .ToDictionaryAsync(r => r.MenuItemId, ct);

        if (recipes.Count == 0)
            return adjustmentsByStockItem;

        var stockItemIds = recipes.Values.SelectMany(r => r.Lines).Select(l => l.StockItemId).Distinct().ToArray();
        var stockItems = await db.StockItems
            .Where(x => stockItemIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);

        foreach (var line in order.Lines)
        {
            if (!recipes.TryGetValue(line.MenuItemId, out var recipe))
                continue;

            foreach (var ingredient in recipe.Lines)
            {
                if (!stockItems.TryGetValue(ingredient.StockItemId, out var stockItem))
                    continue;

                var recipeUnitsNeeded = ingredient.Quantity / recipe.Yield * line.Quantity;
                var stockUnitsConsumed = stockItem.ConversionFactor > 0
                    ? recipeUnitsNeeded / stockItem.ConversionFactor
                    : recipeUnitsNeeded;

                var before = stockItem.Quantity;
                var after = before - stockUnitsConsumed;

                var adjustment = new StockAdjustment
                {
                    StockItemId = stockItem.Id,
                    Delta = -stockUnitsConsumed,
                    QuantityBefore = before,
                    QuantityAfter = after,
                    Reason = $"Order #{order.OrderNumber} — {line.Name}",
                    OrderId = order.Id,
                    Kind = "Consumption"
                };
                db.StockAdjustments.Add(adjustment);

                if (!adjustmentsByStockItem.TryGetValue(stockItem.Id, out var list))
                    adjustmentsByStockItem[stockItem.Id] = list = new List<StockAdjustment>();
                list.Add(adjustment);

                stockItem.Quantity = after;
                stockItem.UpdatedAt = DateTimeOffset.UtcNow;
            }
        }

        return adjustmentsByStockItem;
    }

    /// <summary>
    /// StockItem.Quantity is guarded by a Postgres xmin concurrency token (see AppDbContext),
    /// so a stale read-modify-write throws DbUpdateConcurrencyException on SaveChanges instead
    /// of silently clobbering a concurrent order's decrement (issue #3). On conflict we don't
    /// discard our change: we re-anchor each conflicting StockItem to the fresh database
    /// quantity/xmin and re-apply the same delta (and shift the ledger rows recorded in this
    /// call by the same amount so QuantityBefore/After stay accurate), then retry.
    /// </summary>
    private async Task SaveChangesWithStockRetryAsync(
        Dictionary<Guid, List<StockAdjustment>> adjustmentsByStockItem, CancellationToken ct)
    {
        const int maxAttempts = 5;

        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await db.SaveChangesAsync(ct);
                return;
            }
            catch (DbUpdateConcurrencyException) when (attempt < maxAttempts)
            {
                foreach (var entry in db.ChangeTracker.Entries<StockItem>())
                {
                    if (entry.State != EntityState.Modified)
                        continue;

                    var databaseValues = await entry.GetDatabaseValuesAsync(ct);
                    if (databaseValues is null)
                        throw new InvalidOperationException(
                            $"Stock item {entry.Entity.Id} was deleted concurrently while updating its quantity.");

                    var proposedQuantity = entry.CurrentValues.GetValue<decimal>(nameof(StockItem.Quantity));
                    var originalQuantity = entry.OriginalValues.GetValue<decimal>(nameof(StockItem.Quantity));
                    var delta = proposedQuantity - originalQuantity;

                    var freshQuantity = databaseValues.GetValue<decimal>(nameof(StockItem.Quantity));
                    var shift = freshQuantity - originalQuantity;

                    entry.CurrentValues[nameof(StockItem.Quantity)] = freshQuantity + delta;
                    entry.OriginalValues.SetValues(databaseValues);

                    if (adjustmentsByStockItem.TryGetValue(entry.Entity.Id, out var adjustments))
                    {
                        foreach (var adjustment in adjustments)
                        {
                            adjustment.QuantityBefore += shift;
                            adjustment.QuantityAfter += shift;
                        }
                    }
                }
            }
        }
    }

    /// <summary>
    /// Idempotent via the ledger itself: skips if a Reversal-kind row already references this
    /// order, so repeated Cancelled transitions never double-restore stock.
    /// </summary>
    private async Task<Dictionary<Guid, List<StockAdjustment>>> ReverseConsumptionAsync(Order order, CancellationToken ct)
    {
        var adjustmentsByStockItem = new Dictionary<Guid, List<StockAdjustment>>();

        var alreadyReversed = await db.StockAdjustments
            .AnyAsync(x => x.OrderId == order.Id && x.Kind == "Reversal", ct);
        if (alreadyReversed)
            return adjustmentsByStockItem;

        var consumptions = await db.StockAdjustments
            .Where(x => x.OrderId == order.Id && x.Kind == "Consumption")
            .ToListAsync(ct);
        if (consumptions.Count == 0)
            return adjustmentsByStockItem;

        var stockItemIds = consumptions.Select(x => x.StockItemId).Distinct().ToArray();
        var stockItems = await db.StockItems
            .Where(x => stockItemIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);

        foreach (var consumption in consumptions)
        {
            if (!stockItems.TryGetValue(consumption.StockItemId, out var stockItem))
                continue;

            var before = stockItem.Quantity;
            var restore = -consumption.Delta;
            var after = before + restore;

            var adjustment = new StockAdjustment
            {
                StockItemId = stockItem.Id,
                Delta = restore,
                QuantityBefore = before,
                QuantityAfter = after,
                Reason = $"Order #{order.OrderNumber} cancelled — reversal",
                OrderId = order.Id,
                Kind = "Reversal"
            };
            db.StockAdjustments.Add(adjustment);

            if (!adjustmentsByStockItem.TryGetValue(stockItem.Id, out var list))
                adjustmentsByStockItem[stockItem.Id] = list = new List<StockAdjustment>();
            list.Add(adjustment);

            stockItem.Quantity = after;
            stockItem.UpdatedAt = DateTimeOffset.UtcNow;
        }

        return adjustmentsByStockItem;
    }

    public async Task<(CompleteOrderResult Result, OrderDto? Order)> CompleteExistingOrderAsync(
        Guid tenantId, Guid orderId, string paymentMethod, decimal? amountTendered, CancellationToken ct)
    {
        var order = await db.Orders
            .Include(x => x.Lines)
            .SingleOrDefaultAsync(x => x.Id == orderId && x.TenantId == tenantId, ct);

        if (order is null)
            return (CompleteOrderResult.NotFound, null);

        if (order.Status != "Sent")
            return (CompleteOrderResult.NotAwaitingPayment, null);

        var tendered = amountTendered ?? order.Total;
        if (tendered < order.Total)
            return (CompleteOrderResult.InsufficientTender, null);

        order.Status = "Completed";
        order.PaymentMethod = paymentMethod;
        order.AmountTendered = tendered;
        order.ChangeDue = tendered - order.Total;
        order.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        await audit.LogAsync(
            tenantId, current.UserId, order.LocationId, "Order", order.Id.ToString(), "OrderCompleted",
            summary: $"Order #{order.OrderNumber} payment completed via {paymentMethod}",
            metadata: new { order.OrderNumber, paymentMethod, order.Total }, ct: ct);

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

        var wasAlreadyCancelled = order.Status == "Cancelled";
        order.Status = status;
        order.UpdatedAt = DateTimeOffset.UtcNow;

        var stockAdjustments = status == "Cancelled" && !wasAlreadyCancelled
            ? await ReverseConsumptionAsync(order, ct)
            : new Dictionary<Guid, List<StockAdjustment>>();

        await SaveChangesWithStockRetryAsync(stockAdjustments, ct);

        if (status == "Cancelled" && !wasAlreadyCancelled)
        {
            await audit.LogAsync(
                tenantId, current.UserId, order.LocationId, "Order", order.Id.ToString(), "OrderVoided",
                summary: $"Order #{order.OrderNumber} voided/cancelled",
                metadata: new { order.OrderNumber, order.Total }, ct: ct);
        }
        else
        {
            await audit.LogAsync(
                tenantId, current.UserId, order.LocationId, "Order", order.Id.ToString(), "OrderStatusChanged",
                summary: $"Order #{order.OrderNumber} status set to {status}",
                metadata: new { order.OrderNumber, status }, ct: ct);
        }

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
        order.PaymentState,
        order.DestinationLabel,
        order.PaymentMethod,
        order.Subtotal,
        order.ServiceCharge,
        order.Tax,
        order.Total,
        order.CurrencyCode,
        order.CurrencySymbol,
        order.AmountTendered,
        order.ChangeDue,
        order.CreatedAt,
        order.Lines.Select(x => new OrderLineDto(x.Name, x.Quantity, x.Price, x.LineTotal, x.Notes)).ToArray());
}
