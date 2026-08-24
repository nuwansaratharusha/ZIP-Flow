using ZipFlow.Api.Auth;
using ZipFlow.Api.Common;

namespace ZipFlow.Api.Endpoints;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Authentication");

        group.MapPost("/login", async (LoginRequest request, IAuthService auth, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
                return Results.BadRequest(ApiResponse<object>.Fail("Email and password are required."));

            var result = await auth.LoginAsync(request, ct);
            return result is null
                ? Results.Unauthorized()
                : Results.Ok(ApiResponse<LoginResponse>.Ok(result));
        });

        group.MapPost("/refresh", async (RefreshRequest request, IAuthService auth, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.RefreshToken))
                return Results.BadRequest(ApiResponse<object>.Fail("Refresh token is required."));

            var result = await auth.RefreshAsync(request, ct);
            return result is null
                ? Results.Unauthorized()
                : Results.Ok(ApiResponse<LoginResponse>.Ok(result));
        });

        group.MapPost("/logout", async (RefreshRequest request, IAuthService auth, CancellationToken ct) =>
        {
            await auth.RevokeAsync(request.RefreshToken, ct);
            return Results.NoContent();
        });

        return app;
    }
}
