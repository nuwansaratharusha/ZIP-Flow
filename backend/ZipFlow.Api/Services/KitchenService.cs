using Microsoft.EntityFrameworkCore;
using ZipFlow.Api.Data;

namespace ZipFlow.Api.Services;

public sealed record KitchenTicketLineDto(string Name, int Quantity, string? Notes, string? Station);
public sealed record KitchenTicketDto(
    Guid Id, int OrderNumber, string ServiceMode, string Status, DateTimeOffset CreatedAt,
    IReadOnlyList<KitchenTicketLineDto> Lines);

public interface IKitchenService
{
    Task<IReadOnlyList<KitchenTicketDto>> GetTicketsAsync(Guid tenantId, CancellationToken ct);
}

public sealed class KitchenService(AppDbContext db) : IKitchenService
{
    private static readonly string[] ActiveStatuses = ["Sent", "Preparing", "Ready"];

    public async Task<IReadOnlyList<KitchenTicketDto>> GetTicketsAsync(Guid tenantId, CancellationToken ct)
    {
        var orders = await db.Orders
            .AsNoTracking()
            .Include(x => x.Lines).ThenInclude(l => l.MenuItem).ThenInclude(m => m.Category)
            .Where(x => x.TenantId == tenantId && ActiveStatuses.Contains(x.Status))
            .OrderBy(x => x.CreatedAt)
            .ToListAsync(ct);

        return orders.Select(o => new KitchenTicketDto(
            o.Id,
            o.OrderNumber,
            o.ServiceMode,
            o.Status,
            o.CreatedAt,
            o.Lines.Select(l => new KitchenTicketLineDto(l.Name, l.Quantity, l.Notes, l.MenuItem.Category.Station)).ToArray()
        )).ToArray();
    }
}
