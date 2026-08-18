using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZipFlow.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderNumber : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "OrderNumber",
                schema: "pos",
                table: "Order",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql(@"
                ;WITH Numbered AS (
                    SELECT Id, ROW_NUMBER() OVER (PARTITION BY TenantId ORDER BY CreatedAt) AS RowNum
                    FROM pos.[Order]
                )
                UPDATE o
                SET o.OrderNumber = n.RowNum
                FROM pos.[Order] o
                JOIN Numbered n ON o.Id = n.Id;
            ");

            migrationBuilder.CreateIndex(
                name: "IX_Order_TenantId_OrderNumber",
                schema: "pos",
                table: "Order",
                columns: new[] { "TenantId", "OrderNumber" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Order_TenantId_OrderNumber",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "OrderNumber",
                schema: "pos",
                table: "Order");
        }
    }
}
