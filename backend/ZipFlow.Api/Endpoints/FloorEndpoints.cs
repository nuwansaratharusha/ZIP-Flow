using ZipFlow.Api.Common;
using ZipFlow.Api.Security;
using ZipFlow.Api.Services;

namespace ZipFlow.Api.Endpoints;

public sealed record CreateFloorRequest(string Name);
public sealed record UpdateFloorRequest(string Name);

public static class FloorEndpoints
{
    public static IEndpointRouteBuilder MapFloorEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/floors").WithTags("Floors");

        group.MapGet("/", async (ICurrentRequestContext current, IFloorService floors, CancellationToken ct) =>
            Results.Ok(ApiResponse<IReadOnlyList<FloorDto>>.Ok(await floors.GetFloorsAsync(current.TenantId, ct))))
            .RequireAuthorization("permission:pos.tables.view");

        group.MapPost("/", async (CreateFloorRequest request, ICurrentRequestContext current, IFloorService floors, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest(ApiResponse<object>.Fail("Name is required."));

            var (result, floor) = await floors.CreateFloorAsync(current.TenantId, request.Name, ct);
            return result switch
            {
                SaveFloorResult.Saved => Results.Ok(ApiResponse<FloorDto>.Ok(floor!)),
                SaveFloorResult.DuplicateName => Results.Conflict(ApiResponse<object>.Fail("A floor with this name already exists.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to create floor."))
            };
        })
        .RequireAuthorization("permission:pos.tables.manage");

        group.MapPut("/{id:guid}", async (Guid id, UpdateFloorRequest request, ICurrentRequestContext current, IFloorService floors, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest(ApiResponse<object>.Fail("Name is required."));

            var (result, floor) = await floors.UpdateFloorAsync(current.TenantId, id, request.Name, ct);
            return result switch
            {
                SaveFloorResult.Saved => Results.Ok(ApiResponse<FloorDto>.Ok(floor!)),
                SaveFloorResult.DuplicateName => Results.Conflict(ApiResponse<object>.Fail("A floor with this name already exists.")),
                SaveFloorResult.NotFound => Results.NotFound(ApiResponse<object>.Fail("Floor not found.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to update floor."))
            };
        })
        .RequireAuthorization("permission:pos.tables.manage");

        group.MapPost("/{id:guid}/archive", async (Guid id, ICurrentRequestContext current, IFloorService floors, CancellationToken ct) =>
        {
            var result = await floors.ArchiveFloorAsync(current.TenantId, id, ct);
            return result switch
            {
                ArchiveFloorResult.Archived => Results.Ok(ApiResponse<object>.Ok(new { archived = true })),
                ArchiveFloorResult.NotFound => Results.NotFound(ApiResponse<object>.Fail("Floor not found.")),
                ArchiveFloorResult.InUse => Results.Conflict(ApiResponse<object>.Fail("Move tables off this floor first.")),
                _ => Results.BadRequest(ApiResponse<object>.Fail("Unable to archive floor."))
            };
        })
        .RequireAuthorization("permission:pos.tables.manage");

        return app;
    }
}
