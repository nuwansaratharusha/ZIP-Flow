using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZipFlow.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderNumberCounter : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OrderNumberCounter",
                schema: "pos",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    NextValue = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderNumberCounter", x => x.TenantId);
                    table.ForeignKey(
                        name: "FK_OrderNumberCounter_Tenant_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "organization",
                        principalTable: "Tenant",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            // Seed each tenant's counter from its existing orders so numbering continues
            // where it left off instead of restarting at 1 and colliding with the unique
            // (TenantId, OrderNumber) index on rows that already exist.
            migrationBuilder.Sql(
                """
                INSERT INTO pos."OrderNumberCounter" ("TenantId", "NextValue")
                SELECT "TenantId", COALESCE(MAX("OrderNumber"), 0) + 1
                FROM pos."Order"
                GROUP BY "TenantId";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OrderNumberCounter",
                schema: "pos");
        }
    }
}
