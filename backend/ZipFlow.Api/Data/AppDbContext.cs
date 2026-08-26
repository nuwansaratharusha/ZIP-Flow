using Microsoft.EntityFrameworkCore;
using ZipFlow.Api.Domain;

namespace ZipFlow.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<Location> Locations => Set<Location>();
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<MenuItem> MenuItems => Set<MenuItem>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderLine> OrderLines => Set<OrderLine>();
    public DbSet<StockItem> StockItems => Set<StockItem>();
    public DbSet<StockAdjustment> StockAdjustments => Set<StockAdjustment>();
    public DbSet<Recipe> Recipes => Set<Recipe>();
    public DbSet<RecipeIngredient> RecipeIngredients => Set<RecipeIngredient>();
    public DbSet<RestaurantTable> RestaurantTables => Set<RestaurantTable>();
    public DbSet<CurrencyRate> CurrencyRates => Set<CurrencyRate>();
    public DbSet<OrderNumberCounter> OrderNumberCounters => Set<OrderNumberCounter>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Tenant>(b =>
        {
            b.ToTable("Tenant", "organization");
            b.HasKey(x => x.Id);
            b.Property(x => x.Code).HasMaxLength(40).IsRequired();
            b.Property(x => x.Name).HasMaxLength(160).IsRequired();
            b.Property(x => x.CurrencyCode).HasMaxLength(3).IsRequired();
            b.Property(x => x.CurrencySymbol).HasMaxLength(8).IsRequired();
            b.Property(x => x.ReceiptBusinessName).HasMaxLength(160);
            b.Property(x => x.ReceiptFooterMessage).HasMaxLength(200).IsRequired();
            b.Property(x => x.ReceiptTaxId).HasMaxLength(60);
            b.Property(x => x.VatRate).HasColumnType("decimal(9,6)");
            b.Property(x => x.ServiceChargeRate).HasColumnType("decimal(9,6)");
            b.HasIndex(x => x.Code).IsUnique();
        });

        modelBuilder.Entity<CurrencyRate>(b =>
        {
            b.ToTable("CurrencyRate", "organization");
            b.HasKey(x => x.Id);
            b.Property(x => x.Code).HasMaxLength(12).IsRequired();
            b.Property(x => x.Symbol).HasMaxLength(8).IsRequired();
            b.Property(x => x.Rate).HasColumnType("decimal(18,6)");
            b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique().HasFilter("\"IsArchived\" = false");
            b.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Location>(b =>
        {
            b.ToTable("Location", "organization");
            b.HasKey(x => x.Id);
            b.Property(x => x.Code).HasMaxLength(40).IsRequired();
            b.Property(x => x.Name).HasMaxLength(160).IsRequired();
            b.Property(x => x.TimeZoneId).HasMaxLength(80).IsRequired();
            b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            b.HasOne(x => x.Tenant).WithMany(x => x.Locations).HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AppUser>(b =>
        {
            b.ToTable("User", "iam");
            b.HasKey(x => x.Id);
            b.Property(x => x.Email).HasMaxLength(320).IsRequired();
            b.Property(x => x.DisplayName).HasMaxLength(160).IsRequired();
            b.Property(x => x.PasswordHash).HasMaxLength(1000).IsRequired();
            b.HasIndex(x => new { x.TenantId, x.Email }).IsUnique();
            b.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.DefaultLocation).WithMany().HasForeignKey(x => x.DefaultLocationId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Role>(b =>
        {
            b.ToTable("Role", "iam");
            b.HasKey(x => x.Id);
            b.Property(x => x.Code).HasMaxLength(80).IsRequired();
            b.Property(x => x.Name).HasMaxLength(160).IsRequired();
            b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            b.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Permission>(b =>
        {
            b.ToTable("Permission", "iam");
            b.HasKey(x => x.Id);
            b.Property(x => x.Code).HasMaxLength(160).IsRequired();
            b.Property(x => x.Module).HasMaxLength(80).IsRequired();
            b.Property(x => x.DisplayName).HasMaxLength(160).IsRequired();
            b.HasIndex(x => x.Code).IsUnique();
        });

        modelBuilder.Entity<UserRole>(b =>
        {
            b.ToTable("UserRole", "iam");
            b.HasKey(x => new { x.UserId, x.RoleId });
            b.HasOne(x => x.User).WithMany(x => x.UserRoles).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(x => x.Role).WithMany(x => x.UserRoles).HasForeignKey(x => x.RoleId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<RolePermission>(b =>
        {
            b.ToTable("RolePermission", "iam");
            b.HasKey(x => new { x.RoleId, x.PermissionId });
            b.HasOne(x => x.Role).WithMany(x => x.RolePermissions).HasForeignKey(x => x.RoleId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(x => x.Permission).WithMany(x => x.RolePermissions).HasForeignKey(x => x.PermissionId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AuditLog>(b =>
        {
            b.ToTable("AuditLog", "audit");
            b.HasKey(x => x.Id);
            b.Property(x => x.EntityType).HasMaxLength(100).IsRequired();
            b.Property(x => x.EntityId).HasMaxLength(100).IsRequired();
            b.Property(x => x.Action).HasMaxLength(100).IsRequired();
            b.Property(x => x.Summary).HasMaxLength(500);
            b.HasIndex(x => new { x.TenantId, x.CreatedAt });
            b.HasIndex(x => new { x.EntityType, x.EntityId });
        });

        modelBuilder.Entity<Category>(b =>
        {
            b.ToTable("Category", "menu");
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).HasMaxLength(160).IsRequired();
            b.Property(x => x.Station).HasMaxLength(40);
            b.HasIndex(x => new { x.TenantId, x.Name }).IsUnique();
            b.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MenuItem>(b =>
        {
            b.ToTable("MenuItem", "menu");
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).HasMaxLength(160).IsRequired();
            b.Property(x => x.Sku).HasMaxLength(64).IsRequired();
            b.Property(x => x.Price).HasColumnType("decimal(18,2)");
            b.HasIndex(x => new { x.TenantId, x.Sku }).IsUnique();
            b.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Category).WithMany(x => x.Items).HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Order>(b =>
        {
            b.ToTable("Order", "pos");
            b.HasKey(x => x.Id);
            b.Property(x => x.ServiceMode).HasMaxLength(20).IsRequired();
            b.Property(x => x.Status).HasMaxLength(20).IsRequired();
            b.Property(x => x.PaymentMethod).HasMaxLength(20);
            b.Property(x => x.Subtotal).HasColumnType("decimal(18,2)");
            b.Property(x => x.ServiceCharge).HasColumnType("decimal(18,2)");
            b.Property(x => x.Tax).HasColumnType("decimal(18,2)");
            b.Property(x => x.Total).HasColumnType("decimal(18,2)");
            b.Property(x => x.CurrencyCode).HasMaxLength(12).IsRequired();
            b.Property(x => x.CurrencySymbol).HasMaxLength(8).IsRequired();
            b.Property(x => x.ExchangeRate).HasColumnType("decimal(18,6)");
            b.Property(x => x.BaseCurrencyCode).HasMaxLength(12).IsRequired();
            b.Property(x => x.BaseCurrencySubtotal).HasColumnType("decimal(18,2)");
            b.Property(x => x.BaseCurrencyTotal).HasColumnType("decimal(18,2)");
            b.Property(x => x.AmountTendered).HasColumnType("decimal(18,2)");
            b.Property(x => x.ChangeDue).HasColumnType("decimal(18,2)");
            b.HasIndex(x => new { x.TenantId, x.CreatedAt });
            b.HasIndex(x => new { x.TenantId, x.OrderNumber }).IsUnique();
            b.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Location).WithMany().HasForeignKey(x => x.LocationId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<OrderNumberCounter>(b =>
        {
            b.ToTable("OrderNumberCounter", "pos");
            b.HasKey(x => x.TenantId);
            b.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<OrderLine>(b =>
        {
            b.ToTable("OrderLine", "pos");
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).HasMaxLength(160).IsRequired();
            b.Property(x => x.Price).HasColumnType("decimal(18,2)");
            b.Property(x => x.LineTotal).HasColumnType("decimal(18,2)");
            b.Property(x => x.Notes).HasMaxLength(300);
            b.HasOne(x => x.Order).WithMany(x => x.Lines).HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(x => x.MenuItem).WithMany().HasForeignKey(x => x.MenuItemId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<RestaurantTable>(b =>
        {
            b.ToTable("RestaurantTable", "pos");
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).HasMaxLength(80).IsRequired();
            b.Property(x => x.Section).HasMaxLength(40).IsRequired();
            b.Property(x => x.Status).HasMaxLength(20).IsRequired();
            b.HasIndex(x => new { x.TenantId, x.Name }).IsUnique().HasFilter("\"IsArchived\" = false");
            b.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<StockItem>(b =>
        {
            b.ToTable("StockItem", "inventory");
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).HasMaxLength(160).IsRequired();
            b.Property(x => x.Sku).HasMaxLength(64).IsRequired();
            b.Property(x => x.Unit).HasMaxLength(20).IsRequired();
            b.Property(x => x.Quantity).HasColumnType("decimal(18,3)");
            b.Property(x => x.ParLevel).HasColumnType("decimal(18,3)");
            b.Property(x => x.ReorderLevel).HasColumnType("decimal(18,3)");
            b.Property(x => x.Cost).HasColumnType("decimal(18,2)");
            b.Property(x => x.RecipeUnit).HasMaxLength(20);
            b.Property(x => x.ConversionFactor).HasColumnType("decimal(18,6)");
            b.HasIndex(x => new { x.TenantId, x.Sku }).IsUnique();
            b.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<StockAdjustment>(b =>
        {
            b.ToTable("StockAdjustment", "inventory");
            b.HasKey(x => x.Id);
            b.Property(x => x.Delta).HasColumnType("decimal(18,3)");
            b.Property(x => x.QuantityBefore).HasColumnType("decimal(18,3)");
            b.Property(x => x.QuantityAfter).HasColumnType("decimal(18,3)");
            b.Property(x => x.Reason).HasMaxLength(300).IsRequired();
            b.Property(x => x.Kind).HasMaxLength(20).IsRequired();
            b.HasIndex(x => new { x.OrderId, x.Kind });
            b.HasOne(x => x.StockItem).WithMany(x => x.Adjustments).HasForeignKey(x => x.StockItemId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Recipe>(b =>
        {
            b.ToTable("Recipe", "menu");
            b.HasKey(x => x.Id);
            b.HasIndex(x => x.MenuItemId).IsUnique();
            b.HasOne(x => x.MenuItem).WithMany().HasForeignKey(x => x.MenuItemId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<RecipeIngredient>(b =>
        {
            b.ToTable("RecipeIngredient", "menu");
            b.HasKey(x => x.Id);
            b.Property(x => x.Quantity).HasColumnType("decimal(18,3)");
            b.Property(x => x.Unit).HasMaxLength(20).IsRequired();
            b.HasOne(x => x.Recipe).WithMany(x => x.Lines).HasForeignKey(x => x.RecipeId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(x => x.StockItem).WithMany().HasForeignKey(x => x.StockItemId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
