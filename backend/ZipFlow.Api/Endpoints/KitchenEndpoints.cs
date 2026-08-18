using ZipFlow.Api.Common;
using ZipFlow.Api.Security;
using ZipFlow.Api.Services;

namespace ZipFlow.Api.Endpoints;

public static class KitchenEndpoints
{
    public static IEndpointRouteBuilder MapKitchenEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/kitchen/tickets", async (ICurrentRequestContext current, IKitchenService kitchen, CancellationToken ct) =>
            Results.Ok(ApiResponse<IReadOnlyList<KitchenTicketDto>>.Ok(await kitchen.GetTicketsAsync(current.TenantId, ct))))
            .RequireAuthorization("permission:kitchen.tickets.view")
            .WithTags("Kitchen");

        return app;
    }
}
