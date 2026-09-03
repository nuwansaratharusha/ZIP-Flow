using ZipFlow.Api.Common;
using ZipFlow.Api.Security;
using ZipFlow.Api.Services;

namespace ZipFlow.Api.Endpoints;

public sealed record CreateTableRequest(string Name, string Section, int Capacity, Guid FloorId);
public sealed record UpdateTableRequest(string Name, string Section, int Capacity, Guid FloorId);
public sealed record SetTableStatusRequest(string Status);

public static class TableEndpoints
{
    public static IEndpointRouteBuilder MapTableEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/tables").WithTags("Tables");

        group.MapGet("/", async (ICurrentRequestContext current, ITableService tables, CancellationToken ct) =>
            Results.Ok(ApiResponse<IReadOnlyList<TableDto>>.Ok(await tables.GetTablesAsync(current.TenantId, ct))))
            .RequireAuthorization("permission:pos.tables.view");

        group.MapPost("/", async (CreateTableRequest request, ICurrentRequestContext current, ITableService tables, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Section))
                return Results.BadRequest(ApiResponse<object>.Fail("Name and section are required."));
            if (request.Capacity < 1)
                return Results.BadRequest(ApiResponse<object>.Fail("Capacity must be at least 1."));

            var (result, table) = await tables.CreateTableAsync(current.TenantId, request.Name, request.Section, request.Capacity, request.FloorId, ct);
            return result switch
            {
                SaveTableResult.Saved => Results.Ok(ApiResponse<TableDto>.Ok(table!)),
                SaveTableResult.DuplicateName => Results.Conflict(ApiResponse<object>.Fail("A table with this name already exists.")),
                SaveTableResult.InvalidFloor => Results.BadRequest(ApiResponse<object>.Fail("Invalid floor.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to create table."))
            };
        })
        .RequireAuthorization("permission:pos.tables.manage");

        group.MapPut("/{id:guid}", async (Guid id, UpdateTableRequest request, ICurrentRequestContext current, ITableService tables, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Section))
                return Results.BadRequest(ApiResponse<object>.Fail("Name and section are required."));
            if (request.Capacity < 1)
                return Results.BadRequest(ApiResponse<object>.Fail("Capacity must be at least 1."));

            var (result, table) = await tables.UpdateTableAsync(current.TenantId, id, request.Name, request.Section, request.Capacity, request.FloorId, ct);
            return result switch
            {
                SaveTableResult.Saved => Results.Ok(ApiResponse<TableDto>.Ok(table!)),
                SaveTableResult.DuplicateName => Results.Conflict(ApiResponse<object>.Fail("A table with this name already exists.")),
                SaveTableResult.NotFound => Results.NotFound(ApiResponse<object>.Fail("Table not found.")),
                SaveTableResult.InvalidFloor => Results.BadRequest(ApiResponse<object>.Fail("Invalid floor.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to update table."))
            };
        })
        .RequireAuthorization("permission:pos.tables.manage");

        group.MapPatch("/{id:guid}/status", async (Guid id, SetTableStatusRequest request, ICurrentRequestContext current, ITableService tables, CancellationToken ct) =>
        {
            var (result, table) = await tables.SetStatusAsync(current.TenantId, id, request.Status, ct);
            return result switch
            {
                SetTableStatusResult.Updated => Results.Ok(ApiResponse<TableDto>.Ok(table!)),
                SetTableStatusResult.NotFound => Results.NotFound(ApiResponse<object>.Fail("Table not found.")),
                SetTableStatusResult.InvalidStatus => Results.BadRequest(ApiResponse<object>.Fail("Invalid status.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to update table status."))
            };
        })
        .RequireAuthorization("permission:pos.tables.manage");

        group.MapPost("/{id:guid}/archive", async (Guid id, ICurrentRequestContext current, ITableService tables, CancellationToken ct) =>
        {
            var archived = await tables.ArchiveTableAsync(current.TenantId, id, ct);
            return archived
                ? Results.Ok(ApiResponse<object>.Ok(new { archived = true }))
                : Results.NotFound(ApiResponse<object>.Fail("Table not found."));
        })
        .RequireAuthorization("permission:pos.tables.manage");

        return app;
    }
}
