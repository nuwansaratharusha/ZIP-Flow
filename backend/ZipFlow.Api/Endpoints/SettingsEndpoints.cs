using ZipFlow.Api.Common;
using ZipFlow.Api.Security;
using ZipFlow.Api.Services;

namespace ZipFlow.Api.Endpoints;

public sealed record UpdateReceiptSettingsRequest(string? BusinessName, string FooterMessage, bool ShowTaxId, string? TaxId);
public sealed record UpdateTaxSettingsRequest(decimal VatRatePercent, decimal ServiceChargeRatePercent);
public sealed record UpdatePrinterSettingsRequest(string? IpAddress, int Port);

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
                current.TenantId, request.BusinessName, request.FooterMessage, request.ShowTaxId, request.TaxId, ct);

            return dto is null
                ? Results.NotFound(ApiResponse<object>.Fail("Tenant not found."))
                : Results.Ok(ApiResponse<ReceiptSettingsDto>.Ok(dto));
        })
        .RequireAuthorization("permission:settings.receipt.manage");

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

        group.MapGet("/printer", async (ICurrentRequestContext current, ISettingsService settings, CancellationToken ct) =>
        {
            var dto = await settings.GetPrinterSettingsAsync(current.TenantId, ct);
            return dto is null
                ? Results.NotFound(ApiResponse<object>.Fail("Tenant not found."))
                : Results.Ok(ApiResponse<PrinterSettingsDto>.Ok(dto));
        })
        .RequireAuthorization("permission:settings.receipt.view");

        group.MapPut("/printer", async (UpdatePrinterSettingsRequest request, ICurrentRequestContext current, ISettingsService settings, CancellationToken ct) =>
        {
            var (success, error, dto) = await settings.UpdatePrinterSettingsAsync(current.TenantId, request.IpAddress, request.Port, ct);
            return success
                ? Results.Ok(ApiResponse<PrinterSettingsDto>.Ok(dto!))
                : Results.BadRequest(ApiResponse<object>.Fail(error!));
        })
        .RequireAuthorization("permission:settings.receipt.manage");

        return app;
    }
}
