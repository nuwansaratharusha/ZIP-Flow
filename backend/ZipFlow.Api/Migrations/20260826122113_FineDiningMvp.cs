using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZipFlow.Api.Migrations
{
    /// <inheritdoc />
    public partial class FineDiningMvp : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CurrencyRate",
                schema: "organization");

            migrationBuilder.DropTable(
                name: "RecipeIngredient",
                schema: "menu");

            migrationBuilder.DropTable(
                name: "StockAdjustment",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "Recipe",
                schema: "menu");

            migrationBuilder.DropTable(
                name: "StockItem",
                schema: "inventory");

            // StockItem and StockAdjustment were the only tables in the inventory schema,
            // so the schema itself goes with them. Down() recreates it via EnsureSchema.
            migrationBuilder.Sql("DROP SCHEMA IF EXISTS inventory;");

            migrationBuilder.DropColumn(
                name: "ReceiptShowCollectionCode",
                schema: "organization",
                table: "Tenant");

            migrationBuilder.DropColumn(
                name: "AmountTendered",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "BaseCurrencyCode",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "BaseCurrencySubtotal",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "BaseCurrencyTotal",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "ChangeDue",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "ExchangeRate",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "PaymentMethod",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "ServiceMode",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "Station",
                schema: "menu",
                table: "Category");

            migrationBuilder.AddColumn<Guid>(
                name: "RoundId",
                schema: "pos",
                table: "OrderLine",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ClosedAt",
                schema: "pos",
                table: "Order",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CustomerName",
                schema: "pos",
                table: "Order",
                type: "character varying(120)",
                maxLength: 120,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CustomerPhone",
                schema: "pos",
                table: "Order",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "GuestCount",
                schema: "pos",
                table: "Order",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "OpenedByUserId",
                schema: "pos",
                table: "Order",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TableId",
                schema: "pos",
                table: "Order",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.CreateTable(
                name: "OrderRound",
                schema: "pos",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    RoundNumber = table.Column<int>(type: "integer", nullable: false),
                    SentAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderRound", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrderRound_Order_OrderId",
                        column: x => x.OrderId,
                        principalSchema: "pos",
                        principalTable: "Order",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OrderLine_RoundId",
                schema: "pos",
                table: "OrderLine",
                column: "RoundId");

            migrationBuilder.CreateIndex(
                name: "IX_Order_OpenedByUserId",
                schema: "pos",
                table: "Order",
                column: "OpenedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Order_TableId",
                schema: "pos",
                table: "Order",
                column: "TableId",
                unique: true,
                filter: "\"Status\" = 'Open'");

            migrationBuilder.CreateIndex(
                name: "IX_OrderRound_OrderId_RoundNumber",
                schema: "pos",
                table: "OrderRound",
                columns: new[] { "OrderId", "RoundNumber" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Order_RestaurantTable_TableId",
                schema: "pos",
                table: "Order",
                column: "TableId",
                principalSchema: "pos",
                principalTable: "RestaurantTable",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Order_User_OpenedByUserId",
                schema: "pos",
                table: "Order",
                column: "OpenedByUserId",
                principalSchema: "iam",
                principalTable: "User",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_OrderLine_OrderRound_RoundId",
                schema: "pos",
                table: "OrderLine",
                column: "RoundId",
                principalSchema: "pos",
                principalTable: "OrderRound",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Order_RestaurantTable_TableId",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropForeignKey(
                name: "FK_Order_User_OpenedByUserId",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropForeignKey(
                name: "FK_OrderLine_OrderRound_RoundId",
                schema: "pos",
                table: "OrderLine");

            migrationBuilder.DropTable(
                name: "OrderRound",
                schema: "pos");

            migrationBuilder.DropIndex(
                name: "IX_OrderLine_RoundId",
                schema: "pos",
                table: "OrderLine");

            migrationBuilder.DropIndex(
                name: "IX_Order_OpenedByUserId",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropIndex(
                name: "IX_Order_TableId",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "RoundId",
                schema: "pos",
                table: "OrderLine");

            migrationBuilder.DropColumn(
                name: "ClosedAt",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "CustomerName",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "CustomerPhone",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "GuestCount",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "OpenedByUserId",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "TableId",
                schema: "pos",
                table: "Order");

            migrationBuilder.EnsureSchema(
                name: "inventory");

            migrationBuilder.AddColumn<bool>(
                name: "ReceiptShowCollectionCode",
                schema: "organization",
                table: "Tenant",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "AmountTendered",
                schema: "pos",
                table: "Order",
                type: "numeric(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "BaseCurrencyCode",
                schema: "pos",
                table: "Order",
                type: "character varying(12)",
                maxLength: 12,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<decimal>(
                name: "BaseCurrencySubtotal",
                schema: "pos",
                table: "Order",
                type: "numeric(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "BaseCurrencyTotal",
                schema: "pos",
                table: "Order",
                type: "numeric(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "ChangeDue",
                schema: "pos",
                table: "Order",
                type: "numeric(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "ExchangeRate",
                schema: "pos",
                table: "Order",
                type: "numeric(18,6)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "PaymentMethod",
                schema: "pos",
                table: "Order",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ServiceMode",
                schema: "pos",
                table: "Order",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Station",
                schema: "menu",
                table: "Category",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CurrencyRate",
                schema: "organization",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    IsArchived = table.Column<bool>(type: "boolean", nullable: false),
                    Rate = table.Column<decimal>(type: "numeric(18,6)", nullable: false),
                    Symbol = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CurrencyRate", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CurrencyRate_Tenant_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "organization",
                        principalTable: "Tenant",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Recipe",
                schema: "menu",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MenuItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Yield = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Recipe", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Recipe_MenuItem_MenuItemId",
                        column: x => x.MenuItemId,
                        principalSchema: "menu",
                        principalTable: "MenuItem",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StockItem",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversionFactor = table.Column<decimal>(type: "numeric(18,6)", nullable: false),
                    Cost = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    IsArchived = table.Column<bool>(type: "boolean", nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    ParLevel = table.Column<decimal>(type: "numeric(18,3)", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", nullable: false),
                    RecipeUnit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ReorderLevel = table.Column<decimal>(type: "numeric(18,3)", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    Sku = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Unit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockItem", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StockItem_Tenant_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "organization",
                        principalTable: "Tenant",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "RecipeIngredient",
                schema: "menu",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipeId = table.Column<Guid>(type: "uuid", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", nullable: false),
                    Unit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RecipeIngredient", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RecipeIngredient_Recipe_RecipeId",
                        column: x => x.RecipeId,
                        principalSchema: "menu",
                        principalTable: "Recipe",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_RecipeIngredient_StockItem_StockItemId",
                        column: x => x.StockItemId,
                        principalSchema: "inventory",
                        principalTable: "StockItem",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StockAdjustment",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Delta = table.Column<decimal>(type: "numeric(18,3)", nullable: false),
                    Kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: true),
                    QuantityAfter = table.Column<decimal>(type: "numeric(18,3)", nullable: false),
                    QuantityBefore = table.Column<decimal>(type: "numeric(18,3)", nullable: false),
                    Reason = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockAdjustment", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StockAdjustment_StockItem_StockItemId",
                        column: x => x.StockItemId,
                        principalSchema: "inventory",
                        principalTable: "StockItem",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CurrencyRate_TenantId_Code",
                schema: "organization",
                table: "CurrencyRate",
                columns: new[] { "TenantId", "Code" },
                unique: true,
                filter: "\"IsArchived\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_Recipe_MenuItemId",
                schema: "menu",
                table: "Recipe",
                column: "MenuItemId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RecipeIngredient_RecipeId",
                schema: "menu",
                table: "RecipeIngredient",
                column: "RecipeId");

            migrationBuilder.CreateIndex(
                name: "IX_RecipeIngredient_StockItemId",
                schema: "menu",
                table: "RecipeIngredient",
                column: "StockItemId");

            migrationBuilder.CreateIndex(
                name: "IX_StockAdjustment_OrderId_Kind",
                schema: "inventory",
                table: "StockAdjustment",
                columns: new[] { "OrderId", "Kind" });

            migrationBuilder.CreateIndex(
                name: "IX_StockAdjustment_StockItemId",
                schema: "inventory",
                table: "StockAdjustment",
                column: "StockItemId");

            migrationBuilder.CreateIndex(
                name: "IX_StockItem_TenantId_Sku",
                schema: "inventory",
                table: "StockItem",
                columns: new[] { "TenantId", "Sku" },
                unique: true);
        }
    }
}
