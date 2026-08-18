using Microsoft.EntityFrameworkCore;
using ZipFlow.Api.Common;
using ZipFlow.Api.Data;
using ZipFlow.Api.Security;

namespace ZipFlow.Api.Endpoints;

public static class FoundationEndpoints
{
    public static IEndpointRouteBuilder MapFoundationEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/system/version", () => Results.Ok(ApiResponse<object>.Ok(new
        {
            service = "ZipFlow.Api",
            version = "0.1.0-foundation",
            utc = DateTimeOffset.UtcNow
        }))).AllowAnonymous().WithTags("System");

        app.MapGet("/api/me", async (ICurrentRequestContext current, AppDbContext db, CancellationToken ct) =>
        {
            var user = await db.Users
                .AsNoTracking()
                .Where(x => x.Id == current.UserId && x.TenantId == current.TenantId)
                .Select(x => new
                {
                    user = new { x.Id, x.Email, x.DisplayName },
                    tenant = new { x.Tenant.Id, x.Tenant.Code, x.Tenant.Name, x.Tenant.CurrencyCode, x.Tenant.CurrencySymbol },
                    defaultLocation = x.DefaultLocation == null
                        ? null
                        : new { x.DefaultLocation.Id, x.DefaultLocation.Code, x.DefaultLocation.Name, x.DefaultLocation.TimeZoneId },
                    roles = x.UserRoles.Where(ur => ur.Role.IsActive).Select(ur => ur.Role.Code).ToArray()
                })
                .SingleAsync(ct);

            return Results.Ok(ApiResponse<object>.Ok(user));
        }).RequireAuthorization().WithTags("Identity");

        app.MapGet("/api/organization/locations", async (ICurrentRequestContext current, AppDbContext db, CancellationToken ct) =>
        {
            var locations = await db.Locations
                .AsNoTracking()
                .Where(x => x.TenantId == current.TenantId && x.IsActive)
                .OrderBy(x => x.Name)
                .Select(x => new { x.Id, x.Code, x.Name, x.TimeZoneId })
                .ToListAsync(ct);

            return Results.Ok(ApiResponse<object>.Ok(locations));
        })
        .RequireAuthorization("permission:organization.locations.view")
        .WithTags("Organization");

        return app;
    }
}
