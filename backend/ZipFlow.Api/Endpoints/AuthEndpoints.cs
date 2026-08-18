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

        return app;
    }
}
