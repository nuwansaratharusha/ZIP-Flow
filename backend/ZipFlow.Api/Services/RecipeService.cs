using Microsoft.EntityFrameworkCore;
using ZipFlow.Api.Data;
using ZipFlow.Api.Domain;

namespace ZipFlow.Api.Services;

public sealed record RecipeIngredientInput(Guid StockItemId, decimal Quantity, string Unit);
public sealed record RecipeIngredientDto(Guid StockItemId, string StockItemName, decimal Quantity, string Unit, decimal LineCost);
public sealed record RecipeDto(
    Guid MenuItemId, int Yield, IReadOnlyList<RecipeIngredientDto> Lines,
    decimal TotalCost, decimal CostPerServing, decimal? FoodCostPercentage);

public enum SaveRecipeResult
{
    Saved,
    ItemNotFound,
    IngredientNotFound,
    InvalidYield
}

public interface IRecipeService
{
    Task<(bool ItemFound, RecipeDto? Recipe)> GetRecipeAsync(Guid tenantId, Guid menuItemId, CancellationToken ct);

    Task<(SaveRecipeResult Result, RecipeDto? Recipe)> UpsertRecipeAsync(
        Guid tenantId, Guid menuItemId, int yield, IReadOnlyList<RecipeIngredientInput> lines, CancellationToken ct);
}

public sealed class RecipeService(AppDbContext db) : IRecipeService
{
    public async Task<(bool ItemFound, RecipeDto? Recipe)> GetRecipeAsync(Guid tenantId, Guid menuItemId, CancellationToken ct)
    {
        var item = await db.MenuItems.AsNoTracking().SingleOrDefaultAsync(x => x.Id == menuItemId && x.TenantId == tenantId, ct);
        if (item is null)
            return (false, null);

        var recipe = await db.Recipes
            .AsNoTracking()
            .Include(r => r.Lines).ThenInclude(l => l.StockItem)
            .SingleOrDefaultAsync(r => r.MenuItemId == menuItemId, ct);

        return (true, recipe is null ? null : ToDto(recipe, item.Price));
    }

    public async Task<(SaveRecipeResult Result, RecipeDto? Recipe)> UpsertRecipeAsync(
        Guid tenantId, Guid menuItemId, int yield, IReadOnlyList<RecipeIngredientInput> lines, CancellationToken ct)
    {
        if (yield < 1)
            return (SaveRecipeResult.InvalidYield, null);

        var item = await db.MenuItems.SingleOrDefaultAsync(x => x.Id == menuItemId && x.TenantId == tenantId, ct);
        if (item is null)
            return (SaveRecipeResult.ItemNotFound, null);

        var stockItemIds = lines.Select(x => x.StockItemId).Distinct().ToArray();
        var validCount = await db.StockItems.CountAsync(x => x.TenantId == tenantId && stockItemIds.Contains(x.Id), ct);
        if (validCount != stockItemIds.Length)
            return (SaveRecipeResult.IngredientNotFound, null);

        var recipe = await db.Recipes
            .Include(r => r.Lines)
            .SingleOrDefaultAsync(r => r.MenuItemId == menuItemId, ct);

        if (recipe is null)
        {
            recipe = new Recipe { MenuItemId = menuItemId, Yield = yield };
            db.Recipes.Add(recipe);
        }
        else
        {
            recipe.Yield = yield;
            recipe.UpdatedAt = DateTimeOffset.UtcNow;
            db.RecipeIngredients.RemoveRange(recipe.Lines);
            recipe.Lines.Clear();
        }

        foreach (var line in lines)
        {
            recipe.Lines.Add(new RecipeIngredient
            {
                StockItemId = line.StockItemId,
                Quantity = line.Quantity,
                Unit = line.Unit.Trim()
            });
        }

        await db.SaveChangesAsync(ct);

        var saved = await db.Recipes
            .AsNoTracking()
            .Include(r => r.Lines).ThenInclude(l => l.StockItem)
            .SingleAsync(r => r.MenuItemId == menuItemId, ct);

        return (SaveRecipeResult.Saved, ToDto(saved, item.Price));
    }

    private static RecipeDto ToDto(Recipe recipe, decimal menuItemPrice)
    {
        var lineDtos = recipe.Lines.Select(line =>
        {
            var factor = line.StockItem.ConversionFactor > 0 ? line.StockItem.ConversionFactor : 1;
            var stockUnitsPerServing = line.Quantity / factor;
            var lineCost = stockUnitsPerServing * line.StockItem.Cost;
            return new RecipeIngredientDto(line.StockItemId, line.StockItem.Name, line.Quantity, line.Unit, lineCost);
        }).ToArray();

        var totalCost = lineDtos.Sum(x => x.LineCost);
        var costPerServing = recipe.Yield > 0 ? totalCost / recipe.Yield : totalCost;
        decimal? foodCostPercentage = menuItemPrice > 0 ? Math.Round(costPerServing / menuItemPrice * 100, 2) : null;

        return new RecipeDto(recipe.MenuItemId, recipe.Yield, lineDtos, totalCost, costPerServing, foodCostPercentage);
    }
}
