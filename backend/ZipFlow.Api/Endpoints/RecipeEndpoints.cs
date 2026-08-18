using ZipFlow.Api.Common;
using ZipFlow.Api.Security;
using ZipFlow.Api.Services;

namespace ZipFlow.Api.Endpoints;

public sealed record UpsertRecipeRequest(int Yield, IReadOnlyList<RecipeIngredientInput> Lines);

public static class RecipeEndpoints
{
    public static IEndpointRouteBuilder MapRecipeEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/menu/items/{itemId:guid}/recipe").WithTags("Recipes");

        group.MapGet("/", async (Guid itemId, ICurrentRequestContext current, IRecipeService recipes, CancellationToken ct) =>
        {
            var (itemFound, recipe) = await recipes.GetRecipeAsync(current.TenantId, itemId, ct);
            if (!itemFound)
                return Results.NotFound(ApiResponse<object>.Fail("Menu item not found."));

            return Results.Ok(ApiResponse<RecipeDto?>.Ok(recipe));
        })
        .RequireAuthorization("permission:menu.recipes.view");

        group.MapPut("/", async (Guid itemId, UpsertRecipeRequest request, ICurrentRequestContext current, IRecipeService recipes, CancellationToken ct) =>
        {
            if (request.Lines is null || request.Lines.Any(l => l.Quantity <= 0 || string.IsNullOrWhiteSpace(l.Unit)))
                return Results.BadRequest(ApiResponse<object>.Fail("Each ingredient line needs a positive quantity and a unit."));

            var (result, recipe) = await recipes.UpsertRecipeAsync(current.TenantId, itemId, request.Yield, request.Lines, ct);
            return result switch
            {
                SaveRecipeResult.Saved => Results.Ok(ApiResponse<RecipeDto>.Ok(recipe!)),
                SaveRecipeResult.ItemNotFound => Results.NotFound(ApiResponse<object>.Fail("Menu item not found.")),
                SaveRecipeResult.IngredientNotFound => Results.BadRequest(ApiResponse<object>.Fail("One or more ingredients could not be found.")),
                SaveRecipeResult.InvalidYield => Results.BadRequest(ApiResponse<object>.Fail("Yield must be at least 1.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to save recipe."))
            };
        })
        .RequireAuthorization("permission:menu.recipes.manage");

        return app;
    }
}
