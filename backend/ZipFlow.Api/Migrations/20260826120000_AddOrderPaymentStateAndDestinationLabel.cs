using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZipFlow.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderPaymentStateAndDestinationLabel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PaymentState",
                schema: "pos",
                table: "Order",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Unpaid");

            migrationBuilder.AddColumn<string>(
                name: "DestinationLabel",
                schema: "pos",
                table: "Order",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            // Status carried payment state before this migration: a "Completed" order was
            // always paid, and anything else was awaiting payment. Backfill from that history
            // now that payment has its own field; Status itself is left untouched.
            migrationBuilder.Sql(
                """
                UPDATE pos."Order" SET "PaymentState" = 'Paid' WHERE "Status" = 'Completed';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PaymentState",
                schema: "pos",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "DestinationLabel",
                schema: "pos",
                table: "Order");
        }
    }
}
