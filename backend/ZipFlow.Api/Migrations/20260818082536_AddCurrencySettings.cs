using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZipFlow.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCurrencySettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CurrencySymbol",
                schema: "organization",
                table: "Tenant",
                type: "nvarchar(8)",
                maxLength: 8,
                nullable: false,
                defaultValue: "£");

            migrationBuilder.AddColumn<string>(
                name: "CurrencyCode",
                schema: "pos",
                table: "Order",
                type: "nvarchar(12)",
                maxLength: 12,
                nullable: false,
                defaultValue: "GBP");

            migrationBuilder.AddColumn<string>(
                name: "CurrencySymbol",
                schema: "pos",
                table: "Order",
                type: "nvarchar(8)",
                maxLength: 8,
                nullable: false,
                defaultValue: "£");

            migrationBuilder.AddColumn<decimal>(
                name: "ExchangeRate",
                schema: "pos",
                table: "Order",
                type: "decimal(18,6)",
                nullable: false,
                defaultValue: 1m);

            migrationBuilder.CreateTable(
                name: "CurrencyRate",
                schema: "organization",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(12)", maxLength: 12, nullable: false),
                    Symbol = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Rate = table.Column<decimal>(type: "decimal(18,6)", nullable: false),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
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

            migrationBuilder.CreateIndex(
                name: "IX_CurrencyRate_TenantId_Code",
                schema: "organization",
                table: "CurrencyRate",
                columns: new[] { "TenantId", "Code" },
                unique: true);

            migrationBuilder.Sql(
                "UPDATE [organization].[Tenant] SET CurrencyCode = 'GBP' WHERE CurrencyCode = 'USD';");

            migrationBuilder.Sql(@"
                UPDATE o
                SET o.CurrencyCode = t.CurrencyCode, o.CurrencySymbol = t.CurrencySymbol, o.ExchangeRate = 1
                FROM [pos].[Order] o
                JOIN [organization].[Tenant] t ON t.Id = o.TenantId;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CurrencyRate",
                schema: "organization");

            migrationBuilder.DropColumn(
                name: "CurrencySymbol",
                schema: "organization",
                table: "Tenant");

            migrationBuilder.DropColumn(
                name: "CurrencyCode",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "CurrencySymbol",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "ExchangeRate",
                schema: "pos",
                table: "Order");
        }
    }
}
