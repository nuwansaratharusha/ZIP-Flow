using System.Text.Json;
using ZipFlow.Api.Data;
using ZipFlow.Api.Domain;

namespace ZipFlow.Api.Services;

/// <summary>
/// Small helper any service can call to record a row in the AuditLog table.
/// Persists immediately (its own SaveChangesAsync) so a log write survives even if the
/// caller's own SaveChangesAsync already ran, and never throws — a failed audit write
/// must never take down the business operation it is describing.
/// </summary>
public interface IAuditLogService
{
    Task LogAsync(
        Guid tenantId,
        Guid? userId,
        Guid? locationId,
        string entityType,
        string entityId,
        string action,
        string? summary = null,
        object? metadata = null,
        CancellationToken ct = default);
}

public sealed class AuditLogService(AppDbContext db, ILogger<AuditLogService> logger) : IAuditLogService
{
    public async Task LogAsync(
        Guid tenantId,
        Guid? userId,
        Guid? locationId,
        string entityType,
        string entityId,
        string action,
        string? summary = null,
        object? metadata = null,
        CancellationToken ct = default)
    {
        try
        {
            db.AuditLogs.Add(new AuditLog
            {
                TenantId = tenantId,
                UserId = userId,
                LocationId = locationId,
                EntityType = entityType,
                EntityId = entityId,
                Action = action,
                Summary = summary,
                MetadataJson = metadata is null ? null : JsonSerializer.Serialize(metadata)
            });

            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            // Audit logging is best-effort: never let a logging failure break the caller's flow.
            logger.LogError(ex, "Failed to write audit log entry for {EntityType} {EntityId} action {Action}", entityType, entityId, action);
        }
    }
}
