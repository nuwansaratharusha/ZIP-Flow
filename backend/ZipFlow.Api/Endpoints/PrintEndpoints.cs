using ZipFlow.Api.Common;
using ZipFlow.Api.Security;
using ZipFlow.Api.Services;

namespace ZipFlow.Api.Endpoints;

public static class PrintEndpoints
{
    public static IEndpointRouteBuilder MapPrintEndpoints(this IEndpointRouteBuilder app, string sdpToken)
    {
        // --- Epson Server Direct Print poll endpoint (printer -> cloud). Anonymous:
        // the printer cannot send a JWT, so we gate it with a secret token in the URL. ---
        app.MapPost("/sdp/{token}", async (
            string token, HttpRequest req, IServerDirectPrintQueue queue,
            ILoggerFactory loggerFactory, CancellationToken ct) =>
        {
            var log = loggerFactory.CreateLogger("ServerDirectPrint");

            if (!string.IsNullOrEmpty(sdpToken) && !string.Equals(token, sdpToken, StringComparison.Ordinal))
            {
                log.LogWarning("Rejected SDP poll with bad token.");
                return Results.Unauthorized();
            }

            queue.RecordPoll();

            using var reader = new StreamReader(req.Body);
            var body = await reader.ReadToEndAsync(ct);

            // A print result report from the printer contains PrintResponseInfo.
            if (body.Contains("PrintResponseInfo", StringComparison.OrdinalIgnoreCase)
                || body.Contains("ResponseFile", StringComparison.OrdinalIgnoreCase))
            {
                var success = body.Contains("success=\"true\"", StringComparison.OrdinalIgnoreCase);
                queue.Log($"printer reported result success={success}");
                return Results.Content(string.Empty, "text/xml; charset=utf-8");
            }

            // Otherwise it's a poll: hand over the next queued job, if any.
            if (queue.TryDequeue(out var job) && job is not null)
            {
                queue.Log($"delivered {job.Id} ({job.Description})");
                return Results.Content(job.Xml, "text/xml; charset=utf-8");
            }

            // Nothing to print: empty 200 body.
            return Results.Content(string.Empty, "text/xml; charset=utf-8");
        }).AllowAnonymous();

        // --- Enqueue a test receipt (authorized) so staff can verify the printer. ---
        app.MapPost("/api/print/test", async (
            ICurrentRequestContext current, ISettingsService settings, IServerDirectPrintQueue queue, CancellationToken ct) =>
        {
            var receipt = await settings.GetReceiptSettingsAsync(current.TenantId, ct);
            var xml = EposPrintXmlBuilder.BuildTest(receipt?.BusinessName ?? "ZIP Flow");
            queue.Enqueue(new PrintJob(Guid.NewGuid().ToString("N"), xml, "test print", DateTimeOffset.UtcNow));
            return Results.Ok(ApiResponse<object>.Ok(new { queued = true, pending = queue.Status().Pending }));
        }).RequireAuthorization("permission:pos.orders.manage");

        // --- Queue status (authorized) for debugging the printer connection. ---
        app.MapGet("/api/print/status", (IServerDirectPrintQueue queue) =>
            Results.Ok(ApiResponse<PrintQueueStatus>.Ok(queue.Status())))
            .RequireAuthorization("permission:pos.orders.manage");

        return app;
    }
}
