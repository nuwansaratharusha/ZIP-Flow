using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZipFlow.Api.Migrations
{
    /// <inheritdoc />
    public partial class ArchivedRowsExcludedFromUniqueIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_RestaurantTable_TenantId_Name",
                schema: "pos",
                table: "RestaurantTable");

            migrationBuilder.DropIndex(
                name: "IX_CurrencyRate_TenantId_Code",
                schema: "organization",
                table: "CurrencyRate");

            migrationBuilder.CreateIndex(
                name: "IX_RestaurantTable_TenantId_Name",
                schema: "pos",
                table: "RestaurantTable",
                columns: new[] { "TenantId", "Name" },
                unique: true,
                filter: "\"IsArchived\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_CurrencyRate_TenantId_Code",
                schema: "organization",
                table: "CurrencyRate",
                columns: new[] { "TenantId", "Code" },
                unique: true,
                filter: "\"IsArchived\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_RestaurantTable_TenantId_Name",
                schema: "pos",
                table: "RestaurantTable");

            migrationBuilder.DropIndex(
                name: "IX_CurrencyRate_TenantId_Code",
                schema: "organization",
                table: "CurrencyRate");

            migrationBuilder.CreateIndex(
                name: "IX_RestaurantTable_TenantId_Name",
                schema: "pos",
                table: "RestaurantTable",
                columns: new[] { "TenantId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CurrencyRate_TenantId_Code",
                schema: "organization",
                table: "CurrencyRate",
                columns: new[] { "TenantId", "Code" },
                unique: true);
        }
    }
}
