using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZipFlow.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPrinterSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PrinterIpAddress",
                schema: "organization",
                table: "Tenant",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PrinterPort",
                schema: "organization",
                table: "Tenant",
                type: "integer",
                nullable: false,
                defaultValue: 9100);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PrinterIpAddress",
                schema: "organization",
                table: "Tenant");

            migrationBuilder.DropColumn(
                name: "PrinterPort",
                schema: "organization",
                table: "Tenant");
        }
    }
}
