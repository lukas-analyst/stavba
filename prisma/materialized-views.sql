-- =====================================================================
-- Materialized views for dashboard performance
-- ---------------------------------------------------------------------
-- These views pre-aggregate data that the dashboard API needs on every
-- request. Without them, the dashboard route runs 10 parallel SQL queries
-- that each scan the entire BudgetItem / Payment / TimeEntry tables.
--
-- With materialized views, the heavy aggregation happens once (on REFRESH)
-- and the dashboard route can just SELECT from the views — which is
-- essentially an index lookup.
--
-- Refresh strategy:
--   1. After any mutation (create/update/delete on budget items, payments,
--      time entries) — called from the API routes via REFRESH MATERIALIZED
--      VIEW CONCURRENTLY (requires the unique indexes below).
--   2. As a fallback, the 60-second server-side cache TTL handles staleness.
--
-- CONCURRENTLY requires a unique index — that's why each view has one.
-- =====================================================================

-- Drop existing views (so the script is idempotent and can be re-run)
DROP MATERIALIZED VIEW IF EXISTS "mv_project_phase_stats" CASCADE;
DROP MATERIALIZED VIEW IF EXISTS "mv_project_category_stats" CASCADE;
DROP MATERIALIZED VIEW IF EXISTS "mv_project_totals" CASCADE;
DROP MATERIALIZED VIEW IF EXISTS "mv_rolled_up_items" CASCADE;

-- =====================================================================
-- 1) Per-project, per-phase stats
-- =====================================================================
CREATE MATERIALIZED VIEW "mv_project_phase_stats" AS
SELECT
  "projectId",
  COALESCE(NULLIF(phase, ''), 'Neurčeno') AS phase,
  SUM(COALESCE("planCost", 0)) AS plan,
  SUM(COALESCE("actualCost", 0)) AS actual,
  SUM(COALESCE("actualHours", 0)) AS hours,
  SUM(COALESCE("planDays", 0) * 8) AS "plannedHours",
  COUNT(*) AS count,
  COUNT(*) FILTER (WHERE completed) AS "completedCount",
  SUM(COALESCE("planCost", 0) * (1 + COALESCE("flexibilityPercent", 0) / 100.0)) AS "worstCase",
  SUM(GREATEST(0, COALESCE("actualCost", 0) - COALESCE("planCost", 0))) AS "costOverrun",
  SUM(GREATEST(0, COALESCE("actualHours", 0) - COALESCE("planDays", 0) * 8)) AS "timeOverrun",
  COUNT(*) FILTER (WHERE NOT completed AND NOT rejected AND (COALESCE("actualCost", 0) > 0 OR COALESCE("actualHours", 0) > 0)) AS "inProgress",
  COUNT(*) FILTER (WHERE NOT completed AND NOT rejected AND "dateFrom" IS NOT NULL AND "dateFrom" >= NOW() AND "dateFrom" <= NOW() + INTERVAL '7 days' AND COALESCE("actualCost", 0) = 0) AS "startingSoon"
FROM "BudgetItem"
GROUP BY "projectId", COALESCE(NULLIF(phase, ''), 'Neurčeno');

-- Unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX "mv_project_phase_stats_uidx" ON "mv_project_phase_stats" ("projectId", phase);
CREATE INDEX "mv_project_phase_stats_project" ON "mv_project_phase_stats" ("projectId");

-- =====================================================================
-- 2) Per-project, per-category stats
-- =====================================================================
CREATE MATERIALIZED VIEW "mv_project_category_stats" AS
SELECT
  "projectId",
  COALESCE(NULLIF(category, ''), '(bez kategorie)') AS category,
  SUM(COALESCE("planCost", 0)) AS plan,
  SUM(COALESCE("actualCost", 0)) AS actual,
  SUM(COALESCE("actualHours", 0)) AS hours,
  COUNT(*) AS count
FROM "BudgetItem"
GROUP BY "projectId", COALESCE(NULLIF(category, ''), '(bez kategorie)');

CREATE UNIQUE INDEX "mv_project_category_stats_uidx" ON "mv_project_category_stats" ("projectId", category);
CREATE INDEX "mv_project_category_stats_project" ON "mv_project_category_stats" ("projectId");

-- =====================================================================
-- 3) Per-project totals (single row per project)
-- =====================================================================
CREATE MATERIALIZED VIEW "mv_project_totals" AS
SELECT
  "projectId",
  SUM(COALESCE("planCost", 0)) AS "planTotal",
  SUM(COALESCE("actualCost", 0)) AS "actualTotal",
  SUM(COALESCE("actualHours", 0)) AS "hoursTotal",
  SUM(COALESCE("planDays", 0)) AS "daysPlanned",
  SUM(CASE WHEN completed THEN GREATEST(0, COALESCE("planCost", 0) - COALESCE("actualCost", 0)) ELSE 0 END) AS "savedTotal",
  SUM(COALESCE("planCost", 0) * (1 + COALESCE("flexibilityPercent", 0) / 100.0)) AS "worstCase",
  COUNT(*) FILTER (WHERE required) AS "requiredCount",
  COUNT(*) FILTER (WHERE completed) AS "completedCount",
  COUNT(*) AS "itemCount",
  COUNT(*) FILTER (WHERE completed AND COALESCE("planCost", 0) > 0) AS "completedWithPlanCount",
  SUM(CASE WHEN completed AND COALESCE("planCost", 0) > 0 THEN COALESCE("actualCost", 0) ELSE 0 END) AS "completedActualSum",
  SUM(CASE WHEN completed AND COALESCE("planCost", 0) > 0 THEN COALESCE("planCost", 0) ELSE 0 END) AS "completedPlanSum"
FROM "BudgetItem"
GROUP BY "projectId";

CREATE UNIQUE INDEX "mv_project_totals_uidx" ON "mv_project_totals" ("projectId");

-- =====================================================================
-- 4) Rolled-up items — for each top-level item, pre-compute the sum of
--    its children's actualCost and actualHours. This is the heaviest
--    query in the dashboard (LATERAL JOIN) so caching it in a view helps
--    the most.
-- =====================================================================
CREATE MATERIALIZED VIEW "mv_rolled_up_items" AS
SELECT
  p.id,
  p."projectId",
  p.category,
  p.subcategory,
  p.phase,
  p."planCost",
  p."dateFrom",
  p."dateTo",
  p.completed,
  p.rejected,
  p.required,
  (COALESCE(p."actualCost", 0) + COALESCE(c.child_actual, 0)) AS "rolledActualCost",
  (COALESCE(p."actualHours", 0) + COALESCE(c.child_hours, 0)) AS "rolledActualHours",
  COALESCE(latest_activity.latest, NULL) AS "latestActivity"
FROM "BudgetItem" p
LEFT JOIN LATERAL (
  SELECT
    COALESCE(SUM(ch."actualCost"), 0) AS child_actual,
    COALESCE(SUM(ch."actualHours"), 0) AS child_hours
  FROM "BudgetItem" ch
  WHERE ch."parentId" = p.id
) c ON TRUE
LEFT JOIN LATERAL (
  SELECT MAX(d) AS latest FROM (
    SELECT MAX(pay.date) AS d FROM "Payment" pay WHERE pay."budgetItemId" = p.id
    UNION ALL
    SELECT MAX(te.date) AS d FROM "TimeEntry" te WHERE te."budgetItemId" = p.id
    UNION ALL
    SELECT MAX(pay.date) AS d FROM "Payment" pay JOIN "BudgetItem" ch ON ch.id = pay."budgetItemId" WHERE ch."parentId" = p.id
    UNION ALL
    SELECT MAX(te.date) AS d FROM "TimeEntry" te JOIN "BudgetItem" ch ON ch.id = te."budgetItemId" WHERE ch."parentId" = p.id
  ) s
) latest_activity ON TRUE
WHERE p."parentId" IS NULL;

CREATE UNIQUE INDEX "mv_rolled_up_items_uidx" ON "mv_rolled_up_items" (id);
CREATE INDEX "mv_rolled_up_items_project" ON "mv_rolled_up_items" ("projectId");
CREATE INDEX "mv_rolled_up_items_activity" ON "mv_rolled_up_items" ("latestActivity" DESC);

-- =====================================================================
-- Initial refresh (populates the views with current data)
-- =====================================================================
REFRESH MATERIALIZED VIEW "mv_project_phase_stats";
REFRESH MATERIALIZED VIEW "mv_project_category_stats";
REFRESH MATERIALIZED VIEW "mv_project_totals";
REFRESH MATERIALIZED VIEW "mv_rolled_up_items";
