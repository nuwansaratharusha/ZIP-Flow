using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZipFlow.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderBaseCurrencyTotals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
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

            // Backfill existing rows: prior to this migration Subtotal/Total were already stored
            // post-conversion with ExchangeRate recorded per order, so the base-currency amount is
            // recoverable by dividing back out the rate. BaseCurrencyCode is backfilled from the
            // owning tenant's currency.
            migrationBuilder.Sql(
                """
                UPDATE "pos"."Order" o
                SET "BaseCurrencyCode" = t."CurrencyCode",
                    "BaseCurrencySubtotal" = ROUND(o."Subtotal" / o."ExchangeRate", 2),
                    "BaseCurrencyTotal" = ROUND(o."Total" / o."ExchangeRate", 2)
                FROM "organization"."Tenant" t
                WHERE o."TenantId" = t."Id" AND o."ExchangeRate" <> 0;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
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
        }
    }
}
