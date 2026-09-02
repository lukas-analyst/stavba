#!/usr/bin/env bun
// Run the materialized views SQL migration against the database.
//
// Usage:
//   bun run scripts/setup-materialized-views.ts
//
// This is idempotent — the SQL uses DROP MATERIALIZED VIEW IF EXISTS
// before creating each view, so re-running it is safe.
//
// Uses the `pg` driver directly (instead of Prisma) because Prisma's
// $executeRawUnsafe does not support multi-statement scripts.

import pg from "pg";

async function main() {
  console.log("🔧 Setting up materialized views...\n");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const sqlPath = new URL("../prisma/materialized-views.sql", import.meta.url);
  const sql = await Bun.file(sqlPath).text();

  console.log("📄 Connecting to database...");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  console.log("📄 Executing SQL migration (multi-statement)...");
  try {
    await client.query(sql);
    console.log("\n✅ Materialized views created successfully.");
  } finally {
    // Verify by counting rows in each view
    const views = [
      "mv_project_phase_stats",
      "mv_project_category_stats",
      "mv_project_totals",
      "mv_rolled_up_items",
    ];
    for (const view of views) {
      try {
        const result = await client.query(`SELECT COUNT(*) AS count FROM "${view}"`);
        console.log(`  - ${view}: ${result.rows[0]?.count ?? 0} rows`);
      } catch (err) {
        console.log(`  - ${view}: verification failed (${(err as Error).message})`);
      }
    }
    await client.end();
  }
}

main()
  .catch((e) => {
    console.error("\n❌ Migration failed:", e);
    process.exit(1);
  });
