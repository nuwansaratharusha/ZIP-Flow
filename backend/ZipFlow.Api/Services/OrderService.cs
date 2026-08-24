using Microsoft.EntityFrameworkCore;
using Npgsql;
using ZipFlow.Api.Data;
using ZipFlow.Api.Domain;

namespace ZipFlow.Api.Services;

public sealed record OrderLineRequest(Guid MenuItemId, int Quantity, string? Notes = null);
public sealed record OrderLineDto(string Name, int Quantity, decimal Price, decimal LineTotal, string? Notes);
public sealed record OrderDto(
    Guid Id,
    int OrderNumber,
    string ServiceMode,
    string Status,
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
    Task<(CreateOrderResult Result, OrderDto? Order)> CreateSentOrderAsync(
        Guid tenantId, Guid? locationId, string serviceMode, string? currencyCode, IReadOnlyList<OrderLineRequest> lines, CancellationToken ct);

    Task<(CreateOrderResult Result, OrderDto? Order)> CreateCompletedOrderAsync(
        Guid tenantId, Guid? locationId, string serviceMode, string paymentMethod, string? currencyCode, decimal? amountTendered, IReadOnlyList<OrderLineRequest> lines, CancellationToken ct);

    Task<(CompleteOrderResult Result, OrderDto? Order)> CompleteExistingOrderAsync(
        Guid tenantId, Guid orderId, string paymentMethod, decimal? amountTendered, CancellationToken ct);

    Task<(SetStatusResult Result, OrderDto? Order)> SetStatusAsync(
        Guid tenantId, Guid orderId, string status, CancellationToken ct);

    Task<OrderDto?> GetOrderAsync(Guid tenantId, Guid orderId, CancellationToken ct);

    Task<IReadOnlyList<OrderDto>> GetOrdersAsync(Guid tenantId, string? search, string? status, CancellationToken ct);
}

public sealed class OrderService(AppDbContext db) : IOrderService
{
    public async Task<(CreateOrderResult Result, OrderDto? Order)> CreateSentOrderAsync(
        Guid tenantId, Guid? locationId, string serviceMode, string? currencyCode, IReadOnlyList<OrderLineRequest> lines, CancellationToken ct)
        => await CreateOrderAsync(tenantId, locationId, serviceMode, "Sent", null, currencyCode, null, lines, ct);

    public async Task<(CreateOrderResult Result, OrderDto? Order)> CreateCompletedOrderAsync(
        Guid tenantId, Guid? locationId, string serviceMode, string paymentMethod, string? currencyCode, decimal? amountTendered, IReadOnlyList<OrderLineRequest> lines, CancellationToken ct)
        => await CreateOrderAsync(tenantId, locationId, serviceMode, "Completed", paymentMethod, currencyCode, amountTendered, lines, ct);

    private async Task<(CreateOrderResult Result, OrderDto? Order)> CreateOrderAsync(
        Guid tenantId, Guid? locationId, string serviceMode, string status, string? paymentMethod, string? currencyCode,
        decimal? amountTendered, IReadOnlyList<OrderLineRequest> lines, CancellationToken ct)
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
            Status = status,
            PaymentMethod = paymentMethod,
            CurrencyCode = currCode,
            CurrencySymbol = currSymbol,
            ExchangeRate = rate
        };

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

        if (status == "Completed")
        {
            var tendered = amountTendered ?? order.Total;
            if (tendered < order.Total)
                return (CreateOrderResult.InsufficientTender, null);

            order.AmountTendered = tendered;
            order.ChangeDue = tendered - order.Total;
        }

        db.Orders.Add(order);
        await ConsumeIngredientsAsync(order, ct);

        // OrderNumber is MAX(OrderNumber)+1 per tenant. Two terminals can read the same max
        // and collide on the unique (TenantId, OrderNumber) index when they save concurrently.
        // Retry with a fresh read on that specific collision rather than failing the sale.
        const int maxAttempts = 5;
        for (var attempt = 1; ; attempt++)
        {
            order.OrderNumber = (await db.Orders
                .Where(x => x.TenantId == tenantId)
                .Select(x => (int?)x.OrderNumber)
                .MaxAsync(ct) ?? 0) + 1;

            try
            {
                await db.SaveChangesAsync(ct);
                break;
            }
            catch (DbUpdateException ex) when (attempt < maxAttempts && IsOrderNumberCollision(ex))
            {
                // Another terminal claimed this OrderNumber first; loop and re-read the max.
            }
        }

        return (CreateOrderResult.Created, ToDto(order));
    }

    private static bool IsOrderNumberCollision(DbUpdateException ex) =>
        ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } pg
        && (pg.ConstraintName?.Contains("OrderNumber", StringComparison.OrdinalIgnoreCase) ?? false);

    /// <summary>
    /// Never blocks the sale and never rejects on a negative result — a negative theoretical
    /// balance here is meaningful shrinkage/variance data, not an error. Manual counts
    /// (InventoryService.AdjustStockAsync) keep the strict "no negative result" guard;
    /// automatic sale-driven consumption is intentionally permissive.
    /// </summary>
    private async Task ConsumeIngredientsAsync(Order order, CancellationToken ct)
    {
        var menuItemIds = order.Lines.Select(l => l.MenuItemId).Distinct().ToArray();
        var recipes = await db.Recipes
            .Include(r => r.Lines)
            .Where(r => menuItemIds.Contains(r.MenuItemId))
            .ToDictionaryAsync(r => r.MenuItemId, ct);

        if (recipes.Count == 0)
            return;

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

                db.StockAdjustments.Add(new StockAdjustment
                {
                    StockItemId = stockItem.Id,
                    Delta = -stockUnitsConsumed,
                    QuantityBefore = before,
                    QuantityAfter = after,
                    Reason = $"Order #{order.OrderNumber} — {line.Name}",
                    OrderId = order.Id,
                    Kind = "Consumption"
                });

                stockItem.Quantity = after;
                stockItem.UpdatedAt = DateTimeOffset.UtcNow;
            }
        }
    }

    /// <summary>
    /// Idempotent via the ledger itself: skips if a Reversal-kind row already references this
    /// order, so repeated Cancelled transitions never double-restore stock.
    /// </summary>
    private async Task ReverseConsumptionAsync(Order order, CancellationToken ct)
    {
        var alreadyReversed = await db.StockAdjustments
            .AnyAsync(x => x.OrderId == order.Id && x.Kind == "Reversal", ct);
        if (alreadyReversed)
            return;

        var consumptions = await db.StockAdjustments
            .Where(x => x.OrderId == order.Id && x.Kind == "Consumption")
            .ToListAsync(ct);
        if (consumptions.Count == 0)
            return;

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

            db.StockAdjustments.Add(new StockAdjustment
            {
                StockItemId = stockItem.Id,
                Delta = restore,
                QuantityBefore = before,
                QuantityAfter = after,
                Reason = $"Order #{order.OrderNumber} cancelled — reversal",
                OrderId = order.Id,
                Kind = "Reversal"
            });

            stockItem.Quantity = after;
            stockItem.UpdatedAt = DateTimeOffset.UtcNow;
        }
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

        if (status == "Cancelled" && !wasAlreadyCancelled)
            await ReverseConsumptionAsync(order, ct);

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
