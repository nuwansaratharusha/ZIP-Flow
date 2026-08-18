using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZipFlow.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentTender : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "AmountTendered",
                schema: "pos",
                table: "Order",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "ChangeDue",
                schema: "pos",
                table: "Order",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.Sql(
                "UPDATE [pos].[Order] SET AmountTendered = Total WHERE Status = 'Completed';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AmountTendered",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "ChangeDue",
                schema: "pos",
                table: "Order");
        }
    }
}
