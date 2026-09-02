import { unstable_cache } from "next/cache";
import { dbRead as db } from "@/lib/db";
import type { AlertItem } from "@/lib/api-types";

// =====================================================================
// Dashboard data access layer — single source of truth for the dashboard
// ---------------------------------------------------------------------
// All heavy DB queries live here and are wrapped with `unstable_cache`
// so the entire dashboard response is cached per-project for 60 seconds.
//
// Cache invalidation happens via `revalidateTag("dashboard:${projectId}")`
// which is called from the mutation hooks (create/update/delete on
// budget items, payments, time entries, contacts, notes).
//
// The cache key is the project id + a fixed tag. The fetch happens
// only on cache miss (first request after invalidation or after 60s TTL).
// =====================================================================

// Raw row types returned by Prisma's \$queryRaw (camelCase is preserved
// because we use double-quoted column aliases in the SQL).
type RawTotals = {
  planTotal: number;
  actualTotal: number;
  hoursTotal: number;
  daysPlanned: number;
  savedTotal: number;
  worstCase: number;
  requiredCount: number;
  completedCount: number;
  itemCount: number;
  completedWithPlanCount: number;
  completedActualSum: number;
  completedPlanSum: number;
};

type RawPhaseRow = {
  phase: string;
  plan: number;
  actual: number;
  hours: number;
  plannedHours: number;
  count: bigint;
  completedCount: bigint;
  worstCase: number;
  costOverrun: number;
  timeOverrun: number;
  inProgress: bigint;
  startingSoon: bigint;
};

type RawCategoryRow = {
  category: string;
  plan: number;
  actual: number;
  hours: number;
  count: bigint;
};

type RawAlertRow = {
  id: string;
  category: string;
  subcategory: string | null;
  phase: string;
  planCost: number | null;
  actualCost: number;
  actualHours: number;
  dateFrom: Date | null;
  dateTo: Date | null;
  completed: boolean;
  rejected: boolean;
  required: boolean;
  latestActivity: Date | null;
};

type RawTimelineRow = {
  id: string;
  category: string;
  subcategory: string | null;
  phase: string;
  dateFrom: Date | null;
  dateTo: Date | null;
  planCost: number | null;
  actualCost: number;
  planDays: number | null;
  required: boolean;
  completed: boolean;
  rejected: boolean;
};

type RawPaymentRow = {
  id: string;
  amount: number;
  date: Date;
  type: string;
  vendor: string | null;
  description: string | null;
  invoiceNumber: string | null;
  bi_category: string | null;
  bi_subcategory: string | null;
  c_name: string | null;
};

type RawTimeRow = {
  id: string;
  workerName: string;
  workerType: string;
  date: Date;
  hours: number;
  description: string | null;
  bi_category: string | null;
  bi_subcategory: string | null;
};

// Helper: convert Postgres boolean (already boolean in pg driver) and bigint
function normalizeRow(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "bigint") out[k] = Number(v);
    else out[k] = v;
  }
  return out;
}

// =====================================================================
// Cached dashboard query — runs all aggregation in a single batch of
// parallel raw SQL queries, then assembles the response.
// =====================================================================
export const getDashboardData = unstable_cache(
  async (projectId: string) => {
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) return null;

    // ===== Run all heavy aggregations in parallel (one round-trip via Prisma's batching) =====
    // Performance: totals, byPhase, byCategory, and rolled-up alerts read from
    // pre-aggregated MATERIALIZED VIEWS (see prisma/materialized-views.sql).
    // The views are refreshed after mutations via refreshMaterializedViews().
    // If the views don't exist (setup script not run), the queries below will
    // throw and the route will return 500 — so the setup script is required.
    const [
      totalsRow,
      phaseRows,
      categoryRows,
      inProgressRows,
      upcomingRows,
      overdueRows,
      overBudgetRows,
      unscheduledRows,
      timelineRows,
      recentPayments,
      recentTimeEntries,
    ] = await Promise.all([
      // 1) Global totals — read from materialized view (single index lookup)
      db.$queryRaw<RawTotals[]>`
        SELECT
          "planTotal"::float AS "planTotal",
          "actualTotal"::float AS "actualTotal",
          "hoursTotal"::float AS "hoursTotal",
          "daysPlanned"::float AS "daysPlanned",
          "savedTotal"::float AS "savedTotal",
          "worstCase"::float AS "worstCase",
          "requiredCount"::int AS "requiredCount",
          "completedCount"::int AS "completedCount",
          "itemCount"::int AS "itemCount",
          "completedWithPlanCount"::int AS "completedWithPlanCount",
          "completedActualSum"::float AS "completedActualSum",
          "completedPlanSum"::float AS "completedPlanSum"
        FROM "mv_project_totals"
        WHERE "projectId" = ${projectId}
      `,

      // 2) By-phase breakdown — read from materialized view
      db.$queryRaw<RawPhaseRow[]>`
        SELECT
          phase,
          plan::float AS plan,
          actual::float AS actual,
          hours::float AS hours,
          "plannedHours"::float AS "plannedHours",
          count::bigint AS count,
          "completedCount"::bigint AS "completedCount",
          "worstCase"::float AS "worstCase",
          "costOverrun"::float AS "costOverrun",
          "timeOverrun"::float AS "timeOverrun",
          "inProgress"::bigint AS "inProgress",
          "startingSoon"::bigint AS "startingSoon"
        FROM "mv_project_phase_stats"
        WHERE "projectId" = ${projectId}
        ORDER BY phase
      `,

      // 3) By-category breakdown — read from materialized view
      db.$queryRaw<RawCategoryRow[]>`
        SELECT
          category,
          plan::float AS plan,
          actual::float AS actual,
          hours::float AS hours,
          count::bigint AS count
        FROM "mv_project_category_stats"
        WHERE "projectId" = ${projectId}
        ORDER BY plan DESC
      `,

      // 4a) In-progress alert: read from mv_rolled_up_items (pre-computed
      // LATERAL JOIN) — this is the heaviest query so caching it helps most.
      db.$queryRaw<RawAlertRow[]>`
        SELECT
          id, category, subcategory, phase, "planCost",
          "rolledActualCost"::float AS "actualCost",
          "rolledActualHours"::float AS "actualHours",
          "dateFrom", "dateTo",
          completed, rejected, required,
          "latestActivity"
        FROM "mv_rolled_up_items"
        WHERE "projectId" = ${projectId}
          AND NOT completed AND NOT rejected
          AND ("rolledActualCost" > 0 OR "rolledActualHours" > 0)
        ORDER BY "latestActivity" DESC NULLS LAST
        LIMIT 12
      `,

      // 4b) Upcoming alert: top-level items whose dateFrom is within next 30 days
      db.$queryRaw<RawAlertRow[]>`
        SELECT
          bi.id, bi.category, bi.subcategory, bi.phase, bi."planCost",
          bi."actualCost", bi."actualHours", bi."dateFrom", bi."dateTo",
          bi.completed, bi.rejected, bi.required, NULL::timestamp AS "latestActivity"
        FROM "BudgetItem" bi
        WHERE bi."projectId" = ${projectId}
          AND bi."parentId" IS NULL
          AND NOT bi.completed AND NOT bi.rejected
          AND bi."dateFrom" IS NOT NULL
          AND bi."dateFrom" >= NOW()
          AND bi."dateFrom" <= NOW() + INTERVAL '30 days'
          AND COALESCE(bi."actualCost", 0) = 0
        ORDER BY bi."dateFrom" ASC
      `,

      // 4c) Overdue alert — read from mv_rolled_up_items (pre-computed
      // rolled-up actuals via LATERAL JOIN)
      db.$queryRaw<RawAlertRow[]>`
        SELECT
          id, category, subcategory, phase, "planCost",
          "rolledActualCost"::float AS "actualCost",
          "rolledActualHours"::float AS "actualHours",
          "dateFrom", "dateTo",
          completed, rejected, required,
          NULL::timestamp AS "latestActivity"
        FROM "mv_rolled_up_items"
        WHERE "projectId" = ${projectId}
          AND NOT completed AND NOT rejected
          AND "dateTo" IS NOT NULL AND "dateTo" < NOW()
          AND "planCost" IS NOT NULL AND "planCost" > 0
          AND "rolledActualCost" < "planCost" * 0.9
        ORDER BY "dateTo" ASC
      `,

      // 4d) Over-budget alert — read from mv_rolled_up_items
      db.$queryRaw<RawAlertRow[]>`
        SELECT
          id, category, subcategory, phase, "planCost",
          "rolledActualCost"::float AS "actualCost",
          "rolledActualHours"::float AS "actualHours",
          "dateFrom", "dateTo",
          completed, rejected, required,
          NULL::timestamp AS "latestActivity"
        FROM "mv_rolled_up_items"
        WHERE "projectId" = ${projectId}
          AND NOT completed AND NOT rejected
          AND "planCost" IS NOT NULL AND "planCost" > 0
          AND "rolledActualCost" > "planCost"
        ORDER BY ("rolledActualCost" - "planCost") DESC
      `,

      // 4e) Unscheduled alert
      db.$queryRaw<RawAlertRow[]>`
        SELECT
          bi.id, bi.category, bi.subcategory, bi.phase, bi."planCost",
          bi."actualCost", bi."actualHours", bi."dateFrom", bi."dateTo",
          bi.completed, bi.rejected, bi.required, NULL::timestamp AS "latestActivity"
        FROM "BudgetItem" bi
        WHERE bi."projectId" = ${projectId}
          AND bi."parentId" IS NULL
          AND NOT bi.completed AND NOT bi.rejected
          AND bi."dateFrom" IS NULL AND bi."dateTo" IS NULL
          AND COALESCE(bi."planCost", 0) > 0
          AND bi.phase <> 'Do budoucna' AND bi.phase <> 'Neurčeno'
        ORDER BY bi."sortOrder" ASC
      `,

      // 5) Timeline — items with at least one date
      db.$queryRaw<RawTimelineRow[]>`
        SELECT
          id, category, subcategory, phase, "dateFrom",
          COALESCE("dateTo", "dateFrom") AS "dateTo",
          "planCost", "actualCost", "planDays", required, completed, rejected
        FROM "BudgetItem"
        WHERE "projectId" = ${projectId}
          AND ("dateFrom" IS NOT NULL OR "dateTo" IS NOT NULL)
        ORDER BY "dateFrom" ASC NULLS LAST
      `,

      // 6) Recent payments (top 5)
      db.$queryRaw<RawPaymentRow[]>`
        SELECT
          p.id, p.amount, p.date, p.type, p.vendor, p.description, p."invoiceNumber",
          bi.category AS bi_category, bi.subcategory AS bi_subcategory,
          c.name AS c_name
        FROM "Payment" p
        JOIN "BudgetItem" bi ON bi.id = p."budgetItemId"
        LEFT JOIN "Contact" c ON c.id = p."contactId"
        WHERE bi."projectId" = ${projectId}
        ORDER BY p.date DESC
        LIMIT 5
      `,

      // 7) Recent time entries (top 5)
      db.$queryRaw<RawTimeRow[]>`
        SELECT
          t.id, t."workerName", t."workerType", t.date, t.hours, t.description,
          bi.category AS bi_category, bi.subcategory AS bi_subcategory
        FROM "TimeEntry" t
        JOIN "BudgetItem" bi ON bi.id = t."budgetItemId"
        WHERE bi."projectId" = ${projectId}
        ORDER BY t.date DESC
        LIMIT 5
      `,
    ]);

    // ===== Assemble totals =====
    const t = normalizeRow(totalsRow[0] ?? {}) as Partial<RawTotals> & Record<string, unknown>;
    const planTotal = Number(t.planTotal ?? 0);
    const actualTotal = Number(t.actualTotal ?? 0);
    const hoursTotal = Number(t.hoursTotal ?? 0);
    const daysPlanned = Number(t.daysPlanned ?? 0);
    const savedTotal = Number(t.savedTotal ?? 0);
    const worstCase = Number(t.worstCase ?? 0);
    const requiredCount = Number(t.requiredCount ?? 0);
    const completedCount = Number(t.completedCount ?? 0);
    const itemCount = Number(t.itemCount ?? 0);
    const completedWithPlanCount = Number(t.completedWithPlanCount ?? 0);
    const completedActualSum = Number(t.completedActualSum ?? 0);
    const completedPlanSum = Number(t.completedPlanSum ?? 0);

    // Projection: average overrun ratio from completed items with planCost > 0
    const avgOverrunRatio =
      completedWithPlanCount > 0 && completedPlanSum > 0
        ? completedActualSum / completedPlanSum
        : 1;
    const incompletePlanSum = planTotal - completedPlanSum;
    const projectedRemaining = incompletePlanSum * avgOverrunRatio;
    const projectedFinal = actualTotal + projectedRemaining;
    const projectedOverrun = projectedFinal - planTotal;

    // ===== Assemble byPhase =====
    const byPhase = phaseRows.map((row) => {
      const r = normalizeRow(row as unknown as Record<string, unknown>) as RawPhaseRow & Record<string, unknown>;
      return {
        phase: r.phase,
        plan: Number(r.plan),
        actual: Number(r.actual),
        hours: Number(r.hours),
        plannedHours: Number(r.plannedHours),
        count: Number(r.count),
        completedCount: Number(r.completedCount),
        worstCase: Number(r.worstCase),
        costOverrun: Number(r.costOverrun),
        timeOverrun: Number(r.timeOverrun),
        inProgress: Number(r.inProgress) > 0,
        startingSoon: Number(r.startingSoon) > 0,
      };
    });

    // ===== Assemble byCategory =====
    const byCategory = categoryRows.map((row) => {
      const r = normalizeRow(row as unknown as Record<string, unknown>) as RawCategoryRow & Record<string, unknown>;
      return {
        category: r.category,
        plan: Number(r.plan),
        actual: Number(r.actual),
        hours: Number(r.hours),
        count: Number(r.count),
      };
    });

    // ===== Helper to normalize a raw alert row into AlertItem =====
    const toAlert = (row: RawAlertRow): AlertItem => ({
      id: row.id,
      category: row.category,
      subcategory: row.subcategory,
      phase: row.phase,
      planCost: row.planCost,
      actualCost: Number(row.actualCost),
      actualHours: Number(row.actualHours),
      dateFrom: row.dateFrom ? row.dateFrom.toISOString() : null,
      dateTo: row.dateTo ? row.dateTo.toISOString() : null,
      completed: row.completed,
      rejected: row.rejected,
      required: row.required,
    });

    // ===== Assemble alerts =====
    const alerts = {
      inProgress: inProgressRows.map(toAlert),
      upcoming: upcomingRows.map(toAlert),
      overdue: overdueRows.map(toAlert),
      overBudget: overBudgetRows.map(toAlert),
      unscheduled: unscheduledRows.map(toAlert),
    };

    // ===== Assemble timeline =====
    const timeline = timelineRows.map((row) => ({
      id: row.id,
      category: row.category,
      subcategory: row.subcategory,
      phase: row.phase,
      dateFrom: row.dateFrom ? row.dateFrom.toISOString() : null,
      dateTo: row.dateTo ? row.dateTo.toISOString() : null,
      planCost: row.planCost,
      actualCost: Number(row.actualCost),
      planDays: row.planDays,
      required: row.required,
      completed: row.completed,
      rejected: row.rejected,
    }));

    // ===== Assemble recent activity =====
    const recentPaymentsList = recentPayments.map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      date: row.date.toISOString(),
      type: row.type,
      vendor: row.vendor,
      description: row.description,
      invoiceNumber: row.invoiceNumber,
      budgetItem: {
        category: row.bi_category,
        subcategory: row.bi_subcategory,
      },
      contact: row.c_name ? { name: row.c_name } : null,
    }));
    const recentTimeEntriesList = recentTimeEntries.map((row) => ({
      id: row.id,
      workerName: row.workerName,
      workerType: row.workerType,
      date: row.date.toISOString(),
      hours: Number(row.hours),
      description: row.description,
      budgetItem: {
        category: row.bi_category,
        subcategory: row.bi_subcategory,
      },
    }));

    return {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        address: project.address,
        description: project.description,
        starred: project.starred,
        status: project.status,
        startDate: project.startDate ? project.startDate.toISOString() : null,
        endDate: project.endDate ? project.endDate.toISOString() : null,
      },
      totals: {
        planTotal,
        actualTotal,
        remaining: planTotal - actualTotal,
        burnRate: planTotal > 0 ? (actualTotal / planTotal) * 100 : 0,
        worstCase,
        worstCaseRemaining: worstCase - actualTotal,
        hoursTotal,
        daysPlanned,
        itemCount,
        requiredCount,
        completedCount,
        savedTotal,
        projectedFinal,
        projectedOverrun,
        avgOverrunRatio,
      },
      byPhase,
      byCategory,
      alerts,
      timeline,
      recent: {
        payments: recentPaymentsList,
        timeEntries: recentTimeEntriesList,
      },
    };
  },
  // Cache key parts — projectId makes each project's dashboard cached separately.
  // IMPORTANT: Next.js's `unstable_cache` does NOT support a callback for `tags` —
  // it must be a static string array. So instead of trying to tag per-project from
  // here, we tag with a single static "dashboards" tag and rely on the 60s TTL
  // for per-project invalidation. Per-project invalidation is done via the
  // /api/revalidate endpoint + bustServerCache() helper, which calls
  // revalidateTag("dashboards") — busting ALL projects' caches at once.
  // (For a multi-tenant app this would be too aggressive, but for this
  // single-user app with one active project at a time it's fine.)
  ["dashboard"],
  {
    tags: ["dashboards"],
    revalidate: 60, // 60 seconds TTL as a safety net
  }
);

// =====================================================================
// Invalidation helper — called from /api/revalidate.
// Busts the server-side cache for all dashboards. The 60s TTL also
// provides automatic per-project invalidation as a fallback.
// =====================================================================
export async function invalidateDashboard(_projectId: string) {
  const { revalidateTag } = await import("next/cache");
  revalidateTag("dashboards");
}
