using ZipFlow.Api.Common;
using ZipFlow.Api.Security;
using ZipFlow.Api.Services;

namespace ZipFlow.Api.Endpoints;

public sealed record OcrDraftItem(string Name, decimal Price, string Category, string Sku, bool CategoryExists, bool Duplicate);
public sealed record OcrPreviewResponse(IReadOnlyList<OcrDraftItem> Items);
public sealed record OcrCommitItem(string Name, decimal Price, string Category, string? Sku);
public sealed record OcrCommitRequest(List<OcrCommitItem> Items);
public sealed record OcrCommitResponse(int Created, int Skipped);

public static class MenuOcrEndpoints
{
    public static IEndpointRouteBuilder MapMenuOcrEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/menu/ocr").WithTags("Menu OCR");

        // Step 1 — PREVIEW: read the photo with Gemini and return a draft. Nothing saved.
        group.MapPost("/preview", async (
            IFormFile? file, ICurrentRequestContext current, IMenuOcrService ocr, IMenuService menu, CancellationToken ct) =>
        {
            if (!ocr.IsConfigured)
                return Results.Json(
                    ApiResponse<object>.Fail("Menu photo import isn't switched on yet (Gemini API key not set)."),
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            if (file is null || file.Length == 0)
                return Results.BadRequest(ApiResponse<object>.Fail("No image uploaded."));
            if (!(file.ContentType?.StartsWith("image/") ?? false))
                return Results.BadRequest(ApiResponse<object>.Fail("Please upload an image file."));
            if (file.Length > 10 * 1024 * 1024)
                return Results.BadRequest(ApiResponse<object>.Fail("Image is too large (max 10 MB)."));

            byte[] bytes;
            using (var ms = new MemoryStream())
            {
                await file.CopyToAsync(ms, ct);
                bytes = ms.ToArray();
            }

            IReadOnlyList<OcrMenuItem> extracted;
            try
            {
                extracted = await ocr.ExtractAsync(bytes, file.ContentType!, ct);
            }
            catch (Exception ex)
            {
                return Results.Json(ApiResponse<object>.Fail(ex.Message), statusCode: StatusCodes.Status502BadGateway);
            }

            var categories = await menu.GetCategoriesAsync(current.TenantId, ct);
            var catNames = categories.Select(c => c.Name.ToLowerInvariant()).ToHashSet();
            var reserved = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            var drafts = new List<OcrDraftItem>();
            foreach (var item in extracted)
            {
                var sku = await menu.GenerateUniqueSkuAsync(current.TenantId, item.Name, reserved, ct);
                reserved.Add(sku);
                var categoryExists = catNames.Contains(item.Category.ToLowerInvariant());
                var duplicate = await menu.ItemExistsByNameAsync(current.TenantId, item.Name, ct);
                drafts.Add(new OcrDraftItem(item.Name, item.Price, item.Category, sku, categoryExists, duplicate));
            }

            return Results.Ok(ApiResponse<OcrPreviewResponse>.Ok(new OcrPreviewResponse(drafts)));
        })
        .DisableAntiforgery()
        .RequireAuthorization("permission:menu.items.manage");

        // Step 2 — COMMIT: the user confirmed (and possibly edited) the draft; create it.
        group.MapPost("/commit", async (
            OcrCommitRequest request, ICurrentRequestContext current, IMenuService menu, CancellationToken ct) =>
        {
            if (request.Items is null || request.Items.Count == 0)
                return Results.BadRequest(ApiResponse<object>.Fail("No items to add."));

            var existingCats = (await menu.GetCategoriesAsync(current.TenantId, ct)).ToList();
            var nextSort = existingCats.Count;
            var reserved = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var created = 0;
            var skipped = 0;

            foreach (var raw in request.Items)
            {
                if (string.IsNullOrWhiteSpace(raw.Name) || raw.Price < 0) { skipped++; continue; }
                if (await menu.ItemExistsByNameAsync(current.TenantId, raw.Name, ct)) { skipped++; continue; }

                var categoryName = string.IsNullOrWhiteSpace(raw.Category) ? "Uncategorised" : raw.Category;
                var category = await menu.FindOrCreateCategoryAsync(current.TenantId, categoryName, nextSort, ct);
                if (existingCats.All(c => c.Id != category.Id)) { existingCats.Add(category); nextSort++; }

                var sku = string.IsNullOrWhiteSpace(raw.Sku)
                    ? await menu.GenerateUniqueSkuAsync(current.TenantId, raw.Name, reserved, ct)
                    : raw.Sku!.Trim();
                reserved.Add(sku);

                var (result, _) = await menu.CreateItemAsync(current.TenantId, category.Id, raw.Name, sku, raw.Price, ct);
                if (result == CreateMenuItemResult.DuplicateSku)
                {
                    var freshSku = await menu.GenerateUniqueSkuAsync(current.TenantId, raw.Name, reserved, ct);
                    reserved.Add(freshSku);
                    (result, _) = await menu.CreateItemAsync(current.TenantId, category.Id, raw.Name, freshSku, raw.Price, ct);
                }

                if (result == CreateMenuItemResult.Created) created++; else skipped++;
            }

            return Results.Ok(ApiResponse<OcrCommitResponse>.Ok(new OcrCommitResponse(created, skipped)));
        })
        .RequireAuthorization("permission:menu.items.manage");

        return app;
    }
}
