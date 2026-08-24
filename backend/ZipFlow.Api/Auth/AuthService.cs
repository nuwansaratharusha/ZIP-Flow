using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ZipFlow.Api.Data;
using ZipFlow.Api.Domain;

namespace ZipFlow.Api.Auth;

public sealed record LoginRequest(string Email, string Password);
public sealed record RefreshRequest(string RefreshToken);
public sealed record LoginResponse(
    string AccessToken,
    DateTimeOffset ExpiresAt,
    string RefreshToken,
    DateTimeOffset RefreshTokenExpiresAt,
    UserSummary User,
    TenantSummary Tenant,
    LocationSummary? DefaultLocation,
    IReadOnlyCollection<string> Roles);

public sealed record UserSummary(Guid Id, string Email, string DisplayName);
public sealed record TenantSummary(Guid Id, string Code, string Name, string CurrencyCode, string CurrencySymbol);
public sealed record LocationSummary(Guid Id, string Code, string Name, string TimeZoneId);

public interface IAuthService
{
    Task<LoginResponse?> LoginAsync(LoginRequest request, CancellationToken ct);
    Task<LoginResponse?> RefreshAsync(RefreshRequest request, CancellationToken ct);
    Task RevokeAsync(string refreshToken, CancellationToken ct);
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

        return await IssueTokensAsync(user, ct);
    }

    public async Task<LoginResponse?> RefreshAsync(RefreshRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
            return null;

        var tokenHash = tokens.HashRefreshToken(request.RefreshToken);

        var existing = await db.RefreshTokens
            .SingleOrDefaultAsync(x => x.TokenHash == tokenHash, ct);

        if (existing is null || !existing.IsActive)
            return null;

        var user = await db.Users
            .Include(x => x.Tenant)
            .Include(x => x.DefaultLocation)
            .Include(x => x.UserRoles)
                .ThenInclude(x => x.Role)
            .SingleOrDefaultAsync(x => x.Id == existing.UserId && x.IsActive && x.Tenant.IsActive, ct);

        if (user is null)
            return null;

        // Rotate: revoke the presented refresh token so it cannot be reused.
        existing.RevokedAt = DateTimeOffset.UtcNow;

        var response = await IssueTokensAsync(user, ct);

        var newHash = tokens.HashRefreshToken(response.RefreshToken);
        existing.ReplacedByTokenHash = newHash;
        await db.SaveChangesAsync(ct);

        return response;
    }

    public async Task RevokeAsync(string refreshToken, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
            return;

        var tokenHash = tokens.HashRefreshToken(refreshToken);
        var existing = await db.RefreshTokens.SingleOrDefaultAsync(x => x.TokenHash == tokenHash, ct);
        if (existing is null || existing.IsRevoked)
            return;

        existing.RevokedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    private async Task<LoginResponse> IssueTokensAsync(AppUser user, CancellationToken ct)
    {
        var roles = user.UserRoles
            .Select(x => x.Role)
            .Where(x => x.IsActive)
            .DistinctBy(x => x.Id)
            .ToArray();

        var accessToken = tokens.CreateAccessToken(user, roles);
        var accessTokenMinutes = configuration.GetValue<int>("Jwt:AccessTokenMinutes", 15);

        var refreshToken = tokens.GenerateRefreshToken();
        var refreshTokenDays = configuration.GetValue<int>("Jwt:RefreshTokenDays", 30);
        var refreshTokenExpiresAt = DateTimeOffset.UtcNow.AddDays(refreshTokenDays);

        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = tokens.HashRefreshToken(refreshToken),
            ExpiresAt = refreshTokenExpiresAt
        });
        await db.SaveChangesAsync(ct);

        return new LoginResponse(
            accessToken,
            DateTimeOffset.UtcNow.AddMinutes(accessTokenMinutes),
            refreshToken,
            refreshTokenExpiresAt,
            new UserSummary(user.Id, user.Email, user.DisplayName),
            new TenantSummary(user.Tenant.Id, user.Tenant.Code, user.Tenant.Name, user.Tenant.CurrencyCode, user.Tenant.CurrencySymbol),
            user.DefaultLocation is null
                ? null
                : new LocationSummary(user.DefaultLocation.Id, user.DefaultLocation.Code, user.DefaultLocation.Name, user.DefaultLocation.TimeZoneId),
            roles.Select(x => x.Code).ToArray());
    }
}
