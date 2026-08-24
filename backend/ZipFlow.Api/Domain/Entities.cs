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
    public bool ReceiptShowCollectionCode { get; set; } = true;
    public decimal VatRate { get; set; } = 0.10m;
    public decimal ServiceChargeRate { get; set; }
    public ICollection<Location> Locations { get; set; } = new List<Location>();
}

public sealed class CurrencyRate : EntityBase
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string Code { get; set; } = string.Empty;
    public string Symbol { get; set; } = string.Empty;
    public decimal Rate { get; set; } = 1m;
    public bool IsArchived { get; set; }
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
    public string? Station { get; set; }
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
    public string ServiceMode { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? PaymentMethod { get; set; }
    public decimal Subtotal { get; set; }
    public decimal ServiceCharge { get; set; }
    public decimal Tax { get; set; }
    public decimal Total { get; set; }
    public string CurrencyCode { get; set; } = string.Empty;
    public string CurrencySymbol { get; set; } = string.Empty;
    public decimal ExchangeRate { get; set; } = 1m;
    public string BaseCurrencyCode { get; set; } = string.Empty;
    public decimal BaseCurrencySubtotal { get; set; }
    public decimal BaseCurrencyTotal { get; set; }
    public decimal AmountTendered { get; set; }
    public decimal ChangeDue { get; set; }
    public ICollection<OrderLine> Lines { get; set; } = new List<OrderLine>();
}

public sealed class OrderLine : EntityBase
{
    public Guid OrderId { get; set; }
    public Order Order { get; set; } = null!;
    public Guid MenuItemId { get; set; }
    public MenuItem MenuItem { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public int Quantity { get; set; }
    public decimal LineTotal { get; set; }
    public string? Notes { get; set; }
}

public sealed class StockItem : EntityBase
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public string Sku { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public decimal ParLevel { get; set; }
    public decimal ReorderLevel { get; set; }
    public decimal Cost { get; set; }
    public bool IsArchived { get; set; }
    public string RecipeUnit { get; set; } = string.Empty;
    public decimal ConversionFactor { get; set; } = 1;
    public ICollection<StockAdjustment> Adjustments { get; set; } = new List<StockAdjustment>();
}

public sealed class StockAdjustment : EntityBase
{
    public Guid StockItemId { get; set; }
    public StockItem StockItem { get; set; } = null!;
    public decimal Delta { get; set; }
    public decimal QuantityBefore { get; set; }
    public decimal QuantityAfter { get; set; }
    public string Reason { get; set; } = string.Empty;
    public Guid? OrderId { get; set; }
    public string Kind { get; set; } = "Manual";
}

public sealed class Recipe : EntityBase
{
    public Guid MenuItemId { get; set; }
    public MenuItem MenuItem { get; set; } = null!;
    public int Yield { get; set; } = 1;
    public ICollection<RecipeIngredient> Lines { get; set; } = new List<RecipeIngredient>();
}

public sealed class RecipeIngredient : EntityBase
{
    public Guid RecipeId { get; set; }
    public Recipe Recipe { get; set; } = null!;
    public Guid StockItemId { get; set; }
    public StockItem StockItem { get; set; } = null!;
    public decimal Quantity { get; set; }
    public string Unit { get; set; } = string.Empty;
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
