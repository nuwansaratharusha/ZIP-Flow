using System.Security.Claims;

namespace ZipFlow.Api.Security;

public interface ICurrentRequestContext
{
    Guid UserId { get; }
    Guid TenantId { get; }
    Guid? DefaultLocationId { get; }
}

public sealed class CurrentRequestContext(IHttpContextAccessor accessor) : ICurrentRequestContext
{
    private ClaimsPrincipal User => accessor.HttpContext?.User
        ?? throw new InvalidOperationException("No active HTTP context.");

    public Guid UserId => ReadGuid(ClaimTypes.NameIdentifier, "sub");
    public Guid TenantId => ReadGuid("tenant_id");
    public Guid? DefaultLocationId => TryReadGuid("default_location_id");

    private Guid ReadGuid(params string[] claimTypes)
        => TryReadGuid(claimTypes) ?? throw new InvalidOperationException($"Missing required claim: {string.Join(" or ", claimTypes)}");

    private Guid? TryReadGuid(params string[] claimTypes)
    {
        foreach (var type in claimTypes)
        {
            var raw = User.FindFirstValue(type);
            if (Guid.TryParse(raw, out var value))
                return value;
        }

        return null;
    }
}
