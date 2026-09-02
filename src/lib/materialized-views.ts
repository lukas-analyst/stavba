// Refresh helpers for materialized views.
//
// Called from API routes after mutations (create/update/delete on budget
// items, payments, time entries) to keep the materialized views in sync.
//
// Uses REFRESH MATERIALIZED VIEW CONCURRENTLY which does not block reads
// (requires the unique indexes defined in prisma/materialized-views.sql).
//
// If the views don't exist yet (e.g. setup-materialized-views.ts hasn't
// been run), the refresh silently fails — the dashboard will fall back to
// the raw SQL queries which is slower but still correct.

import { db } from "@/lib/db";

const VIEWS = [
  "mv_project_phase_stats",
  "mv_project_category_stats",
  "mv_project_totals",
  "mv_rolled_up_items",
] as const;

/**
 * Refresh all materialized views.
 *
 * Runs CONCURRENTLY so reads are not blocked. Each view is refreshed in
 * parallel for speed (they're independent of each other).
 *
 * Errors are caught and logged — we don't want a materialized view refresh
 * failure to break the user's mutation. The 60s server-side cache TTL
 * provides a fallback: even if the view is stale, the next cache miss
 * (after 60s) will re-compute from raw SQL which always reads fresh data.
 */
export async function refreshMaterializedViews(): Promise<void> {
  try {
    await Promise.all(
      VIEWS.map(async (view) => {
        try {
          // db.$executeRawUnsafe is used because view names can't be
          // parameterized in Prisma's tagged template syntax.
          await db.$executeRawUnsafe(
            `REFRESH MATERIALIZED VIEW CONCURRENTLY "${view}"`,
          );
        } catch (err) {
          // View probably doesn't exist yet — log but don't throw.
          // The dashboard route falls back to raw SQL queries.
          if (process.env.NODE_ENV !== "production") {
            console.warn(`[materialized-views] Could not refresh ${view}:`, (err as Error).message);
          }
        }
      }),
    );
  } catch (err) {
    // Top-level catch — never throw from this function.
    console.error("[materialized-views] refreshAll failed:", err);
  }
}
