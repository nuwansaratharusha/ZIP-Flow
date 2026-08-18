using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZipFlow.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddKitchenRecipesAndConsumption : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "ConversionFactor",
                schema: "inventory",
                table: "StockItem",
                type: "decimal(18,6)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "RecipeUnit",
                schema: "inventory",
                table: "StockItem",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                schema: "inventory",
                table: "StockAdjustment",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "OrderId",
                schema: "inventory",
                table: "StockAdjustment",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Notes",
                schema: "pos",
                table: "OrderLine",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Station",
                schema: "menu",
                table: "Category",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Recipe",
                schema: "menu",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MenuItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Yield = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
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
                name: "RecipeIngredient",
                schema: "menu",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RecipeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StockItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,3)", nullable: false),
                    Unit = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
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

            migrationBuilder.CreateIndex(
                name: "IX_StockAdjustment_OrderId_Kind",
                schema: "inventory",
                table: "StockAdjustment",
                columns: new[] { "OrderId", "Kind" });

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
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RecipeIngredient",
                schema: "menu");

            migrationBuilder.DropTable(
                name: "Recipe",
                schema: "menu");

            migrationBuilder.DropIndex(
                name: "IX_StockAdjustment_OrderId_Kind",
                schema: "inventory",
                table: "StockAdjustment");

            migrationBuilder.DropColumn(
                name: "ConversionFactor",
                schema: "inventory",
                table: "StockItem");

            migrationBuilder.DropColumn(
                name: "RecipeUnit",
                schema: "inventory",
                table: "StockItem");

            migrationBuilder.DropColumn(
                name: "Kind",
                schema: "inventory",
                table: "StockAdjustment");

            migrationBuilder.DropColumn(
                name: "OrderId",
                schema: "inventory",
                table: "StockAdjustment");

            migrationBuilder.DropColumn(
                name: "Notes",
                schema: "pos",
                table: "OrderLine");

            migrationBuilder.DropColumn(
                name: "Station",
                schema: "menu",
                table: "Category");
        }
    }
}
