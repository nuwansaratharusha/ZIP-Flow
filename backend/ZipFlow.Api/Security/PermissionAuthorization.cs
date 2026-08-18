using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using Microsoft.EntityFrameworkCore;
using ZipFlow.Api.Data;

namespace ZipFlow.Api.Security;

public sealed record PermissionRequirement(string PermissionCode) : IAuthorizationRequirement;

public sealed class PermissionAuthorizationHandler(AppDbContext db)
    : AuthorizationHandler<PermissionRequirement>
{
    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        PermissionRequirement requirement)
    {
        var userIdRaw = context.User.FindFirst("sub")?.Value;
        var tenantIdRaw = context.User.FindFirst("tenant_id")?.Value;

        if (!Guid.TryParse(userIdRaw, out var userId) || !Guid.TryParse(tenantIdRaw, out var tenantId))
            return;

        var allowed = await db.UserRoles
            .Where(ur => ur.UserId == userId && ur.Role.TenantId == tenantId && ur.Role.IsActive)
            .SelectMany(ur => ur.Role.RolePermissions)
            .AnyAsync(rp => rp.Permission.Code == requirement.PermissionCode);

        if (allowed)
            context.Succeed(requirement);
    }
}

public sealed class PermissionPolicyProvider(IOptions<AuthorizationOptions> options)
    : DefaultAuthorizationPolicyProvider(options)
{
    public const string Prefix = "permission:";

    public override Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
    {
        if (!policyName.StartsWith(Prefix, StringComparison.OrdinalIgnoreCase))
            return base.GetPolicyAsync(policyName);

        var permission = policyName[Prefix.Length..];
        var policy = new AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser()
            .AddRequirements(new PermissionRequirement(permission))
            .Build();

        return Task.FromResult<AuthorizationPolicy?>(policy);
    }
}
