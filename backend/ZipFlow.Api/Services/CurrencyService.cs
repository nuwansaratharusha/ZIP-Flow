using Microsoft.EntityFrameworkCore;
using ZipFlow.Api.Data;
using ZipFlow.Api.Domain;

namespace ZipFlow.Api.Services;

public sealed record CurrencyDto(Guid? Id, string Code, string Symbol, decimal Rate, bool IsBase);
public sealed record CurrencySettingsDto(string BaseCode, string BaseSymbol, IReadOnlyList<CurrencyDto> Supported);

public interface ICurrencyService
{
    Task<CurrencySettingsDto?> GetCurrenciesAsync(Guid tenantId, CancellationToken ct);

    Task<(bool Success, string? Error, CurrencySettingsDto? Result)> AddCurrencyAsync(
        Guid tenantId, string code, string symbol, decimal rate, CancellationToken ct);

    Task<(bool Success, string? Error, CurrencySettingsDto? Result)> UpdateCurrencyAsync(
        Guid tenantId, Guid id, string symbol, decimal rate, CancellationToken ct);

    Task<CurrencySettingsDto?> RemoveCurrencyAsync(Guid tenantId, Guid id, CancellationToken ct);

    Task<(bool Success, string? Error, CurrencySettingsDto? Result)> UpdateBaseCurrencyAsync(
        Guid tenantId, string code, string symbol, CancellationToken ct);
}

public sealed class CurrencyService(AppDbContext db) : ICurrencyService
{
    public async Task<CurrencySettingsDto?> GetCurrenciesAsync(Guid tenantId, CancellationToken ct)
    {
        var tenant = await db.Tenants.AsNoTracking().SingleOrDefaultAsync(x => x.Id == tenantId, ct);
        if (tenant is null) return null;

        var supported = await db.CurrencyRates
            .AsNoTracking()
            .Where(x => x.TenantId == tenantId && !x.IsArchived)
            .OrderBy(x => x.Code)
            .Select(x => new CurrencyDto(x.Id, x.Code, x.Symbol, x.Rate, false))
            .ToListAsync(ct);

        return new CurrencySettingsDto(tenant.CurrencyCode, tenant.CurrencySymbol, supported);
    }

    public async Task<(bool Success, string? Error, CurrencySettingsDto? Result)> AddCurrencyAsync(
        Guid tenantId, string code, string symbol, decimal rate, CancellationToken ct)
    {
        var normalizedCode = code.Trim().ToUpperInvariant();
        if (normalizedCode.Length == 0 || symbol.Trim().Length == 0)
            return (false, "A currency code and symbol are required.", null);
        if (rate <= 0)
            return (false, "The exchange rate must be greater than zero.", null);

        var tenant = await db.Tenants.SingleOrDefaultAsync(x => x.Id == tenantId, ct);
        if (tenant is null) return (false, "Tenant not found.", null);

        if (string.Equals(tenant.CurrencyCode, normalizedCode, StringComparison.OrdinalIgnoreCase))
            return (false, $"{normalizedCode} is already the base currency.", null);

        var exists = await db.CurrencyRates.AnyAsync(
            x => x.TenantId == tenantId && x.Code == normalizedCode && !x.IsArchived, ct);
        if (exists)
            return (false, $"{normalizedCode} is already a supported currency.", null);

        db.CurrencyRates.Add(new CurrencyRate
        {
            TenantId = tenantId,
            Code = normalizedCode,
            Symbol = symbol.Trim(),
            Rate = rate
        });
        await db.SaveChangesAsync(ct);

        return (true, null, await GetCurrenciesAsync(tenantId, ct));
    }

    public async Task<(bool Success, string? Error, CurrencySettingsDto? Result)> UpdateCurrencyAsync(
        Guid tenantId, Guid id, string symbol, decimal rate, CancellationToken ct)
    {
        if (symbol.Trim().Length == 0)
            return (false, "A currency symbol is required.", null);
        if (rate <= 0)
            return (false, "The exchange rate must be greater than zero.", null);

        var currencyRate = await db.CurrencyRates.SingleOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (currencyRate is null) return (false, "Currency not found.", null);

        currencyRate.Symbol = symbol.Trim();
        currencyRate.Rate = rate;
        currencyRate.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return (true, null, await GetCurrenciesAsync(tenantId, ct));
    }

    public async Task<CurrencySettingsDto?> RemoveCurrencyAsync(Guid tenantId, Guid id, CancellationToken ct)
    {
        var currencyRate = await db.CurrencyRates.SingleOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (currencyRate is null) return null;

        currencyRate.IsArchived = true;
        currencyRate.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return await GetCurrenciesAsync(tenantId, ct);
    }

    public async Task<(bool Success, string? Error, CurrencySettingsDto? Result)> UpdateBaseCurrencyAsync(
        Guid tenantId, string code, string symbol, CancellationToken ct)
    {
        var normalizedCode = code.Trim().ToUpperInvariant();
        if (normalizedCode.Length == 0 || symbol.Trim().Length == 0)
            return (false, "A currency code and symbol are required.", null);

        var tenant = await db.Tenants.SingleOrDefaultAsync(x => x.Id == tenantId, ct);
        if (tenant is null) return (false, "Tenant not found.", null);

        var clashesWithSupported = await db.CurrencyRates.AnyAsync(
            x => x.TenantId == tenantId && x.Code == normalizedCode && !x.IsArchived, ct);
        if (clashesWithSupported)
            return (false, $"{normalizedCode} is already a supported currency. Remove it first.", null);

        tenant.CurrencyCode = normalizedCode;
        tenant.CurrencySymbol = symbol.Trim();
        tenant.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return (true, null, await GetCurrenciesAsync(tenantId, ct));
    }
}
