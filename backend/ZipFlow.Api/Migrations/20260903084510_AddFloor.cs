using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZipFlow.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFloor : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Floor",
                schema: "pos",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    IsArchived = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Floor", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Floor_Tenant_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "organization",
                        principalTable: "Tenant",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Floor_TenantId_Name",
                schema: "pos",
                table: "Floor",
                columns: new[] { "TenantId", "Name" },
                unique: true,
                filter: "\"IsArchived\" = false");

            migrationBuilder.AddColumn<Guid>(
                name: "FloorId",
                schema: "pos",
                table: "RestaurantTable",
                type: "uuid",
                nullable: true);

            // Postgres 13+ ships gen_random_uuid() built in — no extension needed.
            migrationBuilder.Sql(@"
                INSERT INTO pos.""Floor"" (""Id"", ""TenantId"", ""Name"", ""IsArchived"", ""CreatedAt"", ""UpdatedAt"")
                SELECT gen_random_uuid(), t.""Id"", 'Main Floor', false, now(), now()
                FROM organization.""Tenant"" t;
            ");

            migrationBuilder.Sql(@"
                UPDATE pos.""RestaurantTable"" rt
                SET ""FloorId"" = f.""Id""
                FROM pos.""Floor"" f
                WHERE f.""TenantId"" = rt.""TenantId"" AND f.""Name"" = 'Main Floor';
            ");

            migrationBuilder.AlterColumn<Guid>(
                name: "FloorId",
                schema: "pos",
                table: "RestaurantTable",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid?),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_RestaurantTable_FloorId",
                schema: "pos",
                table: "RestaurantTable",
                column: "FloorId");

            migrationBuilder.AddForeignKey(
                name: "FK_RestaurantTable_Floor_FloorId",
                schema: "pos",
                table: "RestaurantTable",
                column: "FloorId",
                principalSchema: "pos",
                principalTable: "Floor",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_RestaurantTable_Floor_FloorId",
                schema: "pos",
                table: "RestaurantTable");

            migrationBuilder.DropIndex(
                name: "IX_RestaurantTable_FloorId",
                schema: "pos",
                table: "RestaurantTable");

            migrationBuilder.DropColumn(
                name: "FloorId",
                schema: "pos",
                table: "RestaurantTable");

            migrationBuilder.DropTable(
                name: "Floor",
                schema: "pos");
        }
    }
}
