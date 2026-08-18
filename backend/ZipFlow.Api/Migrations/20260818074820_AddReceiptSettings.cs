using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZipFlow.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddReceiptSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ReceiptBusinessName",
                schema: "organization",
                table: "Tenant",
                type: "nvarchar(160)",
                maxLength: 160,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReceiptFooterMessage",
                schema: "organization",
                table: "Tenant",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "Thank you for your visit!");

            migrationBuilder.AddColumn<bool>(
                name: "ReceiptShowCollectionCode",
                schema: "organization",
                table: "Tenant",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "ReceiptShowTaxId",
                schema: "organization",
                table: "Tenant",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "ReceiptTaxId",
                schema: "organization",
                table: "Tenant",
                type: "nvarchar(60)",
                maxLength: 60,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ReceiptBusinessName",
                schema: "organization",
                table: "Tenant");

            migrationBuilder.DropColumn(
                name: "ReceiptFooterMessage",
                schema: "organization",
                table: "Tenant");

            migrationBuilder.DropColumn(
                name: "ReceiptShowCollectionCode",
                schema: "organization",
                table: "Tenant");

            migrationBuilder.DropColumn(
                name: "ReceiptShowTaxId",
                schema: "organization",
                table: "Tenant");

            migrationBuilder.DropColumn(
                name: "ReceiptTaxId",
                schema: "organization",
                table: "Tenant");
        }
    }
}
