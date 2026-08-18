using ZipFlow.Api.Common;
using ZipFlow.Api.Security;
using ZipFlow.Api.Services;

namespace ZipFlow.Api.Endpoints;

public sealed record UpdateReceiptSettingsRequest(string? BusinessName, string FooterMessage, bool ShowTaxId, string? TaxId, bool ShowCollectionCode);
public sealed record AddCurrencyRequest(string Code, string Symbol, decimal Rate);
public sealed record UpdateCurrencyRequest(string Symbol, decimal Rate);
public sealed record UpdateBaseCurrencyRequest(string Code, string Symbol);
public sealed record UpdateTaxSettingsRequest(decimal VatRatePercent, decimal ServiceChargeRatePercent);

public static class SettingsEndpoints
{
    public static IEndpointRouteBuilder MapSettingsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/settings").WithTags("Settings");

        group.MapGet("/receipt", async (ICurrentRequestContext current, ISettingsService settings, CancellationToken ct) =>
        {
            var dto = await settings.GetReceiptSettingsAsync(current.TenantId, ct);
            return dto is null
                ? Results.NotFound(ApiResponse<object>.Fail("Tenant not found."))
                : Results.Ok(ApiResponse<ReceiptSettingsDto>.Ok(dto));
        })
        .RequireAuthorization("permission:settings.receipt.view");

        group.MapPut("/receipt", async (UpdateReceiptSettingsRequest request, ICurrentRequestContext current, ISettingsService settings, CancellationToken ct) =>
        {
            if (request.ShowTaxId && string.IsNullOrWhiteSpace(request.TaxId))
                return Results.BadRequest(ApiResponse<object>.Fail("A tax ID is required when 'show tax ID' is enabled."));

            var dto = await settings.UpdateReceiptSettingsAsync(
                current.TenantId, request.BusinessName, request.FooterMessage, request.ShowTaxId, request.TaxId, request.ShowCollectionCode, ct);

            return dto is null
                ? Results.NotFound(ApiResponse<object>.Fail("Tenant not found."))
                : Results.Ok(ApiResponse<ReceiptSettingsDto>.Ok(dto));
        })
        .RequireAuthorization("permission:settings.receipt.manage");

        group.MapGet("/currencies", async (ICurrentRequestContext current, ICurrencyService currencies, CancellationToken ct) =>
        {
            var dto = await currencies.GetCurrenciesAsync(current.TenantId, ct);
            return dto is null
                ? Results.NotFound(ApiResponse<object>.Fail("Tenant not found."))
                : Results.Ok(ApiResponse<CurrencySettingsDto>.Ok(dto));
        })
        .RequireAuthorization("permission:pos.orders.create");

        group.MapPost("/currencies", async (AddCurrencyRequest request, ICurrentRequestContext current, ICurrencyService currencies, CancellationToken ct) =>
        {
            var (success, error, dto) = await currencies.AddCurrencyAsync(current.TenantId, request.Code, request.Symbol, request.Rate, ct);
            return success
                ? Results.Ok(ApiResponse<CurrencySettingsDto>.Ok(dto!))
                : Results.BadRequest(ApiResponse<object>.Fail(error!));
        })
        .RequireAuthorization("permission:settings.currency.manage");

        group.MapPut("/currencies/{id:guid}", async (Guid id, UpdateCurrencyRequest request, ICurrentRequestContext current, ICurrencyService currencies, CancellationToken ct) =>
        {
            var (success, error, dto) = await currencies.UpdateCurrencyAsync(current.TenantId, id, request.Symbol, request.Rate, ct);
            return success
                ? Results.Ok(ApiResponse<CurrencySettingsDto>.Ok(dto!))
                : Results.BadRequest(ApiResponse<object>.Fail(error!));
        })
        .RequireAuthorization("permission:settings.currency.manage");

        group.MapDelete("/currencies/{id:guid}", async (Guid id, ICurrentRequestContext current, ICurrencyService currencies, CancellationToken ct) =>
        {
            var dto = await currencies.RemoveCurrencyAsync(current.TenantId, id, ct);
            return dto is null
                ? Results.NotFound(ApiResponse<object>.Fail("Currency not found."))
                : Results.Ok(ApiResponse<CurrencySettingsDto>.Ok(dto));
        })
        .RequireAuthorization("permission:settings.currency.manage");

        group.MapPut("/currency/base", async (UpdateBaseCurrencyRequest request, ICurrentRequestContext current, ICurrencyService currencies, CancellationToken ct) =>
        {
            var (success, error, dto) = await currencies.UpdateBaseCurrencyAsync(current.TenantId, request.Code, request.Symbol, ct);
            return success
                ? Results.Ok(ApiResponse<CurrencySettingsDto>.Ok(dto!))
                : Results.BadRequest(ApiResponse<object>.Fail(error!));
        })
        .RequireAuthorization("permission:settings.currency.manage");

        group.MapGet("/tax", async (ICurrentRequestContext current, ISettingsService settings, CancellationToken ct) =>
        {
            var dto = await settings.GetTaxSettingsAsync(current.TenantId, ct);
            return dto is null
                ? Results.NotFound(ApiResponse<object>.Fail("Tenant not found."))
                : Results.Ok(ApiResponse<TaxSettingsDto>.Ok(dto));
        })
        .RequireAuthorization("permission:pos.orders.create");

        group.MapPut("/tax", async (UpdateTaxSettingsRequest request, ICurrentRequestContext current, ISettingsService settings, CancellationToken ct) =>
        {
            var (success, error, dto) = await settings.UpdateTaxSettingsAsync(current.TenantId, request.VatRatePercent, request.ServiceChargeRatePercent, ct);
            return success
                ? Results.Ok(ApiResponse<TaxSettingsDto>.Ok(dto!))
                : Results.BadRequest(ApiResponse<object>.Fail(error!));
        })
        .RequireAuthorization("permission:settings.tax.manage");

        return app;
    }
}
