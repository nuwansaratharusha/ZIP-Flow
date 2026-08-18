using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZipFlow.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTaxAndServiceCharge : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "ServiceChargeRate",
                schema: "organization",
                table: "Tenant",
                type: "decimal(9,6)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "VatRate",
                schema: "organization",
                table: "Tenant",
                type: "decimal(9,6)",
                nullable: false,
                defaultValue: 0.10m);

            migrationBuilder.AddColumn<decimal>(
                name: "ServiceCharge",
                schema: "pos",
                table: "Order",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ServiceChargeRate",
                schema: "organization",
                table: "Tenant");

            migrationBuilder.DropColumn(
                name: "VatRate",
                schema: "organization",
                table: "Tenant");

            migrationBuilder.DropColumn(
                name: "ServiceCharge",
                schema: "pos",
                table: "Order");
        }
    }
}
