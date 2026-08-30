using Microsoft.EntityFrameworkCore;
using ZipFlow.Api.Data;

namespace ZipFlow.Api.Services;

public sealed record ReceiptSettingsDto(
    string BusinessName, string FooterMessage, bool ShowTaxId, string? TaxId);

public sealed record TaxSettingsDto(decimal VatRatePercent, decimal ServiceChargeRatePercent);

public sealed record PrinterSettingsDto(string? IpAddress, int Port);

public interface ISettingsService
{
    Task<ReceiptSettingsDto?> GetReceiptSettingsAsync(Guid tenantId, CancellationToken ct);

    Task<ReceiptSettingsDto?> UpdateReceiptSettingsAsync(
        Guid tenantId, string? businessName, string footerMessage, bool showTaxId, string? taxId, CancellationToken ct);

    Task<TaxSettingsDto?> GetTaxSettingsAsync(Guid tenantId, CancellationToken ct);

    Task<(bool Success, string? Error, TaxSettingsDto? Result)> UpdateTaxSettingsAsync(
        Guid tenantId, decimal vatRatePercent, decimal serviceChargeRatePercent, CancellationToken ct);

    Task<PrinterSettingsDto?> GetPrinterSettingsAsync(Guid tenantId, CancellationToken ct);

    Task<(bool Success, string? Error, PrinterSettingsDto? Result)> UpdatePrinterSettingsAsync(
        Guid tenantId, string? ipAddress, int port, CancellationToken ct);

    Task<(bool Success, string? Message)> TestPrinterAsync(
        Guid tenantId, string? ipAddress, int? port, CancellationToken ct);
}

public sealed class SettingsService(AppDbContext db, IEscPosPrintService printer) : ISettingsService
{
    public async Task<ReceiptSettingsDto?> GetReceiptSettingsAsync(Guid tenantId, CancellationToken ct)
    {
        var tenant = await db.Tenants.AsNoTracking().SingleOrDefaultAsync(x => x.Id == tenantId, ct);
        return tenant is null ? null : ToDto(tenant.Name, tenant.ReceiptBusinessName, tenant.ReceiptFooterMessage, tenant.ReceiptShowTaxId, tenant.ReceiptTaxId);
    }

    public async Task<ReceiptSettingsDto?> UpdateReceiptSettingsAsync(
        Guid tenantId, string? businessName, string footerMessage, bool showTaxId, string? taxId, CancellationToken ct)
    {
        var tenant = await db.Tenants.SingleOrDefaultAsync(x => x.Id == tenantId, ct);
        if (tenant is null)
            return null;

        tenant.ReceiptBusinessName = string.IsNullOrWhiteSpace(businessName) ? null : businessName.Trim();
        tenant.ReceiptFooterMessage = string.IsNullOrWhiteSpace(footerMessage) ? "Thank you for your visit!" : footerMessage.Trim();
        tenant.ReceiptShowTaxId = showTaxId;
        tenant.ReceiptTaxId = string.IsNullOrWhiteSpace(taxId) ? null : taxId.Trim();
        tenant.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return ToDto(tenant.Name, tenant.ReceiptBusinessName, tenant.ReceiptFooterMessage, tenant.ReceiptShowTaxId, tenant.ReceiptTaxId);
    }

    private static ReceiptSettingsDto ToDto(string tenantName, string? businessName, string footerMessage, bool showTaxId, string? taxId) =>
        new(string.IsNullOrWhiteSpace(businessName) ? tenantName : businessName, footerMessage, showTaxId, taxId);

    public async Task<TaxSettingsDto?> GetTaxSettingsAsync(Guid tenantId, CancellationToken ct)
    {
        var tenant = await db.Tenants.AsNoTracking().SingleOrDefaultAsync(x => x.Id == tenantId, ct);
        return tenant is null ? null : new TaxSettingsDto(tenant.VatRate * 100, tenant.ServiceChargeRate * 100);
    }

    public async Task<(bool Success, string? Error, TaxSettingsDto? Result)> UpdateTaxSettingsAsync(
        Guid tenantId, decimal vatRatePercent, decimal serviceChargeRatePercent, CancellationToken ct)
    {
        if (vatRatePercent < 0 || vatRatePercent > 100)
            return (false, "VAT rate must be between 0 and 100.", null);
        if (serviceChargeRatePercent < 0 || serviceChargeRatePercent > 100)
            return (false, "Service charge rate must be between 0 and 100.", null);

        var tenant = await db.Tenants.SingleOrDefaultAsync(x => x.Id == tenantId, ct);
        if (tenant is null)
            return (false, "Tenant not found.", null);

        tenant.VatRate = vatRatePercent / 100;
        tenant.ServiceChargeRate = serviceChargeRatePercent / 100;
        tenant.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return (true, null, new TaxSettingsDto(tenant.VatRate * 100, tenant.ServiceChargeRate * 100));
    }

    public async Task<PrinterSettingsDto?> GetPrinterSettingsAsync(Guid tenantId, CancellationToken ct)
    {
        var tenant = await db.Tenants.AsNoTracking().SingleOrDefaultAsync(x => x.Id == tenantId, ct);
        return tenant is null ? null : new PrinterSettingsDto(tenant.PrinterIpAddress, tenant.PrinterPort);
    }

    public async Task<(bool Success, string? Error, PrinterSettingsDto? Result)> UpdatePrinterSettingsAsync(
        Guid tenantId, string? ipAddress, int port, CancellationToken ct)
    {
        if (port < 1 || port > 65535)
            return (false, "Port must be between 1 and 65535.", null);

        var trimmedIpAddress = string.IsNullOrWhiteSpace(ipAddress) ? null : ipAddress.Trim();
        if (trimmedIpAddress is not null && !System.Net.IPAddress.TryParse(trimmedIpAddress, out _))
            return (false, "Enter a valid IP address.", null);

        var tenant = await db.Tenants.SingleOrDefaultAsync(x => x.Id == tenantId, ct);
        if (tenant is null)
            return (false, "Tenant not found.", null);

        tenant.PrinterIpAddress = trimmedIpAddress;
        tenant.PrinterPort = port;
        tenant.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return (true, null, new PrinterSettingsDto(tenant.PrinterIpAddress, tenant.PrinterPort));
    }

    public async Task<(bool Success, string? Message)> TestPrinterAsync(
        Guid tenantId, string? ipAddress, int? port, CancellationToken ct)
    {
        var tenant = await db.Tenants.AsNoTracking().SingleOrDefaultAsync(x => x.Id == tenantId, ct);
        if (tenant is null)
            return (false, "Tenant not found.");

        var targetIp = string.IsNullOrWhiteSpace(ipAddress) ? tenant.PrinterIpAddress : ipAddress.Trim();
        var targetPort = port ?? tenant.PrinterPort;

        if (string.IsNullOrWhiteSpace(targetIp))
            return (false, "No printer IP address configured. Please set an IP address first.");

        var businessName = !string.IsNullOrWhiteSpace(tenant.ReceiptBusinessName) ? tenant.ReceiptBusinessName : tenant.Name;

        try
        {
            await printer.TestPrintAsync(targetIp, targetPort, businessName, ct);
            return (true, $"Test print sent successfully to printer at {targetIp}:{targetPort}.");
        }
        catch (PrinterUnavailableException ex)
        {
            return (false, ex.Message);
        }
    }
}
