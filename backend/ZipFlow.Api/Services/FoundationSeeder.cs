using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ZipFlow.Api.Data;
using ZipFlow.Api.Domain;

namespace ZipFlow.Api.Services;

public sealed class FoundationSeeder(
    AppDbContext db,
    IWebHostEnvironment environment,
    IConfiguration configuration,
    IPasswordHasher<AppUser> passwordHasher,
    ILogger<FoundationSeeder> logger)
{
    private static readonly (string Code, string Module, string Name)[] FoundationPermissions =
    [
        ("dashboard.view", "Dashboard", "View dashboard"),
        ("organization.locations.view", "Organization", "View locations"),
        ("organization.locations.manage", "Organization", "Manage locations"),
        ("iam.users.view", "IAM", "View users"),
        ("iam.users.manage", "IAM", "Manage users"),
        ("iam.roles.manage", "IAM", "Manage roles and permissions"),
        ("audit.logs.view", "Audit", "View audit logs"),
        ("menu.categories.view", "Menu", "View menu categories"),
        ("menu.categories.manage", "Menu", "Manage menu categories"),
        ("menu.items.view", "Menu", "View menu items"),
        ("menu.items.manage", "Menu", "Manage menu items"),
        ("pos.orders.view", "POS", "View orders"),
        ("pos.orders.create", "POS", "Create and complete orders"),
        ("pos.orders.manage", "POS", "Change order status"),
        ("pos.tables.view", "POS", "View tables"),
        ("pos.tables.manage", "POS", "Manage tables"),
        ("settings.receipt.view", "Settings", "View receipt settings"),
        ("settings.receipt.manage", "Settings", "Manage receipt settings"),
        ("settings.tax.view", "Settings", "View VAT and service charge settings"),
        ("settings.tax.manage", "Settings", "Manage VAT and service charge settings")
    ];

    public async Task RunAsync(CancellationToken ct = default)
    {
        if (!environment.IsDevelopment() || !configuration.GetValue<bool>("BootstrapAdmin:Enabled"))
            return;

        var tenantCode = configuration["BootstrapAdmin:TenantCode"] ?? "DEMO";
        var tenant = await db.Tenants.SingleOrDefaultAsync(x => x.Code == tenantCode, ct);
        if (tenant is null)
        {
            tenant = new Tenant
            {
                Code = tenantCode,
                Name = configuration["BootstrapAdmin:TenantName"] ?? "Demo Restaurant Group",
                CurrencyCode = configuration["BootstrapAdmin:CurrencyCode"] ?? "GBP",
                CurrencySymbol = configuration["BootstrapAdmin:CurrencySymbol"] ?? "£",
                PrinterIpAddress = "192.168.1.117",
                PrinterPort = 9100,
                ReceiptBusinessName = configuration["BootstrapAdmin:TenantName"] ?? "ZIP Flow Demo Restaurant"
            };
            db.Tenants.Add(tenant);
        }
        else
        {
            if (string.IsNullOrWhiteSpace(tenant.PrinterIpAddress))
            {
                tenant.PrinterIpAddress = "192.168.1.117";
                tenant.PrinterPort = 9100;
            }
            if (string.IsNullOrWhiteSpace(tenant.ReceiptBusinessName))
            {
                tenant.ReceiptBusinessName = tenant.Name;
            }
        }

        var locationCode = configuration["BootstrapAdmin:LocationCode"] ?? "MAIN";
        var location = await db.Locations.SingleOrDefaultAsync(
            x => x.TenantId == tenant.Id && x.Code == locationCode, ct);
        if (location is null)
        {
            location = new Location
            {
                Tenant = tenant,
                Code = locationCode,
                Name = configuration["BootstrapAdmin:LocationName"] ?? "Main Location",
                TimeZoneId = configuration["BootstrapAdmin:TimeZoneId"] ?? "UTC"
            };
            db.Locations.Add(location);
        }

        foreach (var item in FoundationPermissions)
        {
            if (!await db.Permissions.AnyAsync(x => x.Code == item.Code, ct))
            {
                db.Permissions.Add(new Permission
                {
                    Code = item.Code,
                    Module = item.Module,
                    DisplayName = item.Name
                });
            }
        }

        await db.SaveChangesAsync(ct);

        var adminRole = await db.Roles
            .Include(x => x.RolePermissions)
            .SingleOrDefaultAsync(x => x.TenantId == tenant.Id && x.Code == "ADMIN", ct);

        if (adminRole is null)
        {
            adminRole = new Role
            {
                TenantId = tenant.Id,
                Code = "ADMIN",
                Name = "Administrator",
                IsSystemRole = true
            };
            db.Roles.Add(adminRole);
            await db.SaveChangesAsync(ct);
        }

        var allPermissions = await db.Permissions.ToListAsync(ct);
        var grantedIds = await db.RolePermissions
            .Where(x => x.RoleId == adminRole.Id)
            .Select(x => x.PermissionId)
            .ToListAsync(ct);

        foreach (var permission in allPermissions.Where(x => !grantedIds.Contains(x.Id)))
            db.RolePermissions.Add(new RolePermission { RoleId = adminRole.Id, PermissionId = permission.Id });

        var email = (configuration["BootstrapAdmin:Email"] ?? "admin@zipflow.local").Trim().ToLowerInvariant();
        var admin = await db.Users.SingleOrDefaultAsync(x => x.TenantId == tenant.Id && x.Email == email, ct);
        if (admin is null)
        {
            admin = new AppUser
            {
                TenantId = tenant.Id,
                DefaultLocationId = location.Id,
                Email = email,
                DisplayName = configuration["BootstrapAdmin:DisplayName"] ?? "System Administrator"
            };
            admin.PasswordHash = passwordHasher.HashPassword(
                admin,
                configuration["BootstrapAdmin:Password"] ?? "ChangeMe123!");
            db.Users.Add(admin);
            await db.SaveChangesAsync(ct);
        }

        if (!await db.UserRoles.AnyAsync(x => x.UserId == admin.Id && x.RoleId == adminRole.Id, ct))
            db.UserRoles.Add(new UserRole { UserId = admin.Id, RoleId = adminRole.Id });

        var waiterRole = await db.Roles
            .Include(x => x.RolePermissions)
            .SingleOrDefaultAsync(x => x.TenantId == tenant.Id && x.Code == "WAITER", ct);

        if (waiterRole is null)
        {
            waiterRole = new Role
            {
                TenantId = tenant.Id,
                Code = "WAITER",
                Name = "Waiter",
                IsSystemRole = true
            };
            db.Roles.Add(waiterRole);
            await db.SaveChangesAsync(ct);
        }

        var waiterPermissionCodes = new[]
        {
            "pos.orders.view", "pos.orders.create", "pos.orders.manage", "pos.tables.view", "menu.items.view"
        };
        var waiterPermissions = await db.Permissions.Where(x => waiterPermissionCodes.Contains(x.Code)).ToListAsync(ct);
        var waiterGrantedIds = await db.RolePermissions
            .Where(x => x.RoleId == waiterRole.Id)
            .Select(x => x.PermissionId)
            .ToListAsync(ct);

        foreach (var permission in waiterPermissions.Where(x => !waiterGrantedIds.Contains(x.Id)))
            db.RolePermissions.Add(new RolePermission { RoleId = waiterRole.Id, PermissionId = permission.Id });

        var waiterEmail = (configuration["BootstrapAdmin:WaiterEmail"] ?? "waiter@zipflow.local").Trim().ToLowerInvariant();
        var waiterUser = await db.Users.SingleOrDefaultAsync(x => x.TenantId == tenant.Id && x.Email == waiterEmail, ct);
        if (waiterUser is null)
        {
            waiterUser = new AppUser
            {
                TenantId = tenant.Id,
                DefaultLocationId = location.Id,
                Email = waiterEmail,
                DisplayName = configuration["BootstrapAdmin:WaiterDisplayName"] ?? "Demo Waiter"
            };
            waiterUser.PasswordHash = passwordHasher.HashPassword(
                waiterUser,
                configuration["BootstrapAdmin:WaiterPassword"] ?? "ChangeMe123!");
            db.Users.Add(waiterUser);
            await db.SaveChangesAsync(ct);
        }

        if (!await db.UserRoles.AnyAsync(x => x.UserId == waiterUser.Id && x.RoleId == waiterRole.Id, ct))
            db.UserRoles.Add(new UserRole { UserId = waiterUser.Id, RoleId = waiterRole.Id });

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Development foundation bootstrap is ready for tenant {TenantCode}.", tenant.Code);
    }
}
