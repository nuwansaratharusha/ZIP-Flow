namespace ZipFlow.Api.Domain;

public abstract class EntityBase
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class Tenant : EntityBase
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string CurrencyCode { get; set; } = "GBP";
    public string CurrencySymbol { get; set; } = "£";
    public bool IsActive { get; set; } = true;
    public string? ReceiptBusinessName { get; set; }
    public string ReceiptFooterMessage { get; set; } = "Thank you for your visit!";
    public bool ReceiptShowTaxId { get; set; }
    public string? ReceiptTaxId { get; set; }
    public decimal VatRate { get; set; } = 0.10m;
    public decimal ServiceChargeRate { get; set; }
    public string? PrinterIpAddress { get; set; }
    public int PrinterPort { get; set; } = 9100;
    public ICollection<Location> Locations { get; set; } = new List<Location>();
}

public sealed class Location : EntityBase
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string TimeZoneId { get; set; } = "UTC";
    public bool IsActive { get; set; } = true;
}

public sealed class AppUser : EntityBase
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid? DefaultLocationId { get; set; }
    public Location? DefaultLocation { get; set; }
    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>();
}

public sealed class RefreshToken : EntityBase
{
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public string TokenHash { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public string? ReplacedByTokenHash { get; set; }
    public bool IsRevoked => RevokedAt.HasValue;
    public bool IsExpired => DateTimeOffset.UtcNow >= ExpiresAt;
    public bool IsActive => !IsRevoked && !IsExpired;
}

public sealed class Role : EntityBase
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsSystemRole { get; set; }
    public bool IsActive { get; set; } = true;
    public ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>();
    public ICollection<RolePermission> RolePermissions { get; set; } = new List<RolePermission>();
}

public sealed class Permission : EntityBase
{
    public string Code { get; set; } = string.Empty;
    public string Module { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public ICollection<RolePermission> RolePermissions { get; set; } = new List<RolePermission>();
}

public sealed class UserRole
{
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public Guid RoleId { get; set; }
    public Role Role { get; set; } = null!;
    public DateTimeOffset AssignedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class RolePermission
{
    public Guid RoleId { get; set; }
    public Role Role { get; set; } = null!;
    public Guid PermissionId { get; set; }
    public Permission Permission { get; set; } = null!;
    public DateTimeOffset GrantedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class AuditLog : EntityBase
{
    public Guid TenantId { get; set; }
    public Guid? LocationId { get; set; }
    public Guid? UserId { get; set; }
    public string EntityType { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string? Summary { get; set; }
    public string? MetadataJson { get; set; }
}

public sealed class Category : EntityBase
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public ICollection<MenuItem> Items { get; set; } = new List<MenuItem>();
}

public sealed class MenuItem : EntityBase
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid CategoryId { get; set; }
    public Category Category { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public string Sku { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public bool IsAvailable { get; set; } = true;
    public bool IsArchived { get; set; }
}

public sealed class Order : EntityBase
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid? LocationId { get; set; }
    public Location? Location { get; set; }
    public int OrderNumber { get; set; }
    public Guid TableId { get; set; }
    public RestaurantTable Table { get; set; } = null!;
    public string CustomerName { get; set; } = string.Empty;
    public string? CustomerPhone { get; set; }
    public Guid? OpenedByUserId { get; set; }
    public AppUser? OpenedByUser { get; set; }
    public int? GuestCount { get; set; }
    public string Status { get; set; } = string.Empty;
    public decimal Subtotal { get; set; }
    public decimal ServiceCharge { get; set; }
    public decimal Tax { get; set; }
    public decimal Total { get; set; }
    public string CurrencyCode { get; set; } = string.Empty;
    public string CurrencySymbol { get; set; } = string.Empty;
    public DateTimeOffset? ClosedAt { get; set; }
    public ICollection<OrderLine> Lines { get; set; } = new List<OrderLine>();
    public ICollection<OrderRound> Rounds { get; set; } = new List<OrderRound>();
}

/// <summary>
/// Id is client-supplied, never server-generated — this is the double-send guard. A
/// retried "send round" call carries the same client-generated Id, so the retry's INSERT
/// fails on the primary key and the round is recorded exactly once.
/// </summary>
public sealed class OrderRound
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public Order Order { get; set; } = null!;
    public int RoundNumber { get; set; }
    public DateTimeOffset SentAt { get; set; }
    public ICollection<OrderLine> Lines { get; set; } = new List<OrderLine>();
}

/// <summary>
/// One row per tenant. OrderNumber values are drawn from here via a single atomic
/// UPDATE ... RETURNING statement (see OrderService.NextOrderNumberAsync), so no two
/// terminals can ever be handed the same number — the database serializes the increment
/// itself instead of the app coordinating retries after a collision.
/// </summary>
public sealed class OrderNumberCounter
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public int NextValue { get; set; } = 1;
}

public sealed class OrderLine : EntityBase
{
    public Guid OrderId { get; set; }
    public Order Order { get; set; } = null!;
    public Guid RoundId { get; set; }
    public OrderRound Round { get; set; } = null!;
    public Guid MenuItemId { get; set; }
    public MenuItem MenuItem { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public int Quantity { get; set; }
    public decimal LineTotal { get; set; }
    public string? Notes { get; set; }
}

public sealed class RestaurantTable : EntityBase
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public string Section { get; set; } = string.Empty;
    public int Capacity { get; set; }
    public string Status { get; set; } = "available";
    public bool IsArchived { get; set; }
}
