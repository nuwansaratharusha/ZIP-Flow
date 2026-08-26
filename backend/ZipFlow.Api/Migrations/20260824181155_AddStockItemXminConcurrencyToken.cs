using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZipFlow.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddStockItemXminConcurrencyToken : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // No-op: xmin is a Postgres system column that already exists on every table.
            // This migration only updates the EF Core model to map StockItem.RowVersion to
            // it as a concurrency token (see AppDbContext) — there is no column to add.
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // No-op: see Up — xmin is not a column this migration owns.
        }
    }
}
