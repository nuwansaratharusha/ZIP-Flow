using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ZipFlow.Api.Data;
using ZipFlow.Api.Domain;

namespace ZipFlow.Api.Auth;

public sealed record LoginRequest(string Email, string Password);
public sealed record LoginResponse(
    string AccessToken,
    DateTimeOffset ExpiresAt,
    UserSummary User,
    TenantSummary Tenant,
    LocationSummary? DefaultLocation,
    IReadOnlyCollection<string> Roles);

public sealed record UserSummary(Guid Id, string Email, string DisplayName);
public sealed record TenantSummary(Guid Id, string Code, string Name, string CurrencyCode);
public sealed record LocationSummary(Guid Id, string Code, string Name, string TimeZoneId);

public interface IAuthService
{
    Task<LoginResponse?> LoginAsync(LoginRequest request, CancellationToken ct);
}

public sealed class AuthService(
    AppDbContext db,
    IJwtTokenService tokens,
    IPasswordHasher<AppUser> passwordHasher,
    IConfiguration configuration) : IAuthService
{
    public async Task<LoginResponse?> LoginAsync(LoginRequest request, CancellationToken ct)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();

        var user = await db.Users
            .Include(x => x.Tenant)
            .Include(x => x.DefaultLocation)
            .Include(x => x.UserRoles)
                .ThenInclude(x => x.Role)
            .SingleOrDefaultAsync(x => x.Email == normalizedEmail && x.IsActive && x.Tenant.IsActive, ct);

        if (user is null)
            return null;

        var verification = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verification == PasswordVerificationResult.Failed)
            return null;

        var roles = user.UserRoles
            .Select(x => x.Role)
            .Where(x => x.IsActive)
            .DistinctBy(x => x.Id)
            .ToArray();

        var token = tokens.CreateAccessToken(user, roles);
        var tokenMinutes = configuration.GetValue<int>("Jwt:AccessTokenMinutes", 60);

        return new LoginResponse(
            token,
            DateTimeOffset.UtcNow.AddMinutes(tokenMinutes),
            new UserSummary(user.Id, user.Email, user.DisplayName),
            new TenantSummary(user.Tenant.Id, user.Tenant.Code, user.Tenant.Name, user.Tenant.CurrencyCode),
            user.DefaultLocation is null
                ? null
                : new LocationSummary(user.DefaultLocation.Id, user.DefaultLocation.Code, user.DefaultLocation.Name, user.DefaultLocation.TimeZoneId),
            roles.Select(x => x.Code).ToArray());
    }
}
