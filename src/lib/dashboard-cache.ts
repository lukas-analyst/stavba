import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
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
      // 1) Global totals — single GROUP BY over all items in the project
      db.$queryRaw<RawTotals[]>`
        SELECT
          COALESCE(SUM("planCost"), 0)::float AS "planTotal",
          COALESCE(SUM("actualCost"), 0)::float AS "actualTotal",
          COALESCE(SUM("actualHours"), 0)::float AS "hoursTotal",
          COALESCE(SUM("planDays"), 0)::float AS "daysPlanned",
          COALESCE(SUM(CASE WHEN completed THEN GREATEST(0, COALESCE("planCost",0) - COALESCE("actualCost",0)) ELSE 0 END), 0)::float AS "savedTotal",
          COALESCE(SUM(COALESCE("planCost",0) * (1 + COALESCE("flexibilityPercent",0) / 100.0)), 0)::float AS "worstCase",
          COUNT(*) FILTER (WHERE required)::int AS "requiredCount",
          COUNT(*) FILTER (WHERE completed)::int AS "completedCount",
          COUNT(*)::int AS "itemCount",
          COUNT(*) FILTER (WHERE completed AND COALESCE("planCost",0) > 0)::int AS "completedWithPlanCount",
          COALESCE(SUM(CASE WHEN completed AND COALESCE("planCost",0) > 0 THEN COALESCE("actualCost",0) ELSE 0 END), 0)::float AS "completedActualSum",
          COALESCE(SUM(CASE WHEN completed AND COALESCE("planCost",0) > 0 THEN COALESCE("planCost",0) ELSE 0 END), 0)::float AS "completedPlanSum"
        FROM "BudgetItem"
        WHERE "projectId" = ${projectId}
      `,

      // 2) By-phase breakdown
      db.$queryRaw<RawPhaseRow[]>`
        SELECT
          COALESCE(NULLIF(phase, ''), 'Neurčeno') AS phase,
          COALESCE(SUM("planCost"), 0)::float AS plan,
          COALESCE(SUM("actualCost"), 0)::float AS actual,
          COALESCE(SUM("actualHours"), 0)::float AS hours,
          COALESCE(SUM(COALESCE("planDays",0) * 8), 0)::float AS "plannedHours",
          COUNT(*)::bigint AS count,
          COUNT(*) FILTER (WHERE completed)::bigint AS "completedCount",
          COALESCE(SUM(COALESCE("planCost",0) * (1 + COALESCE("flexibilityPercent",0) / 100.0)), 0)::float AS "worstCase",
          COALESCE(SUM(GREATEST(0, COALESCE("actualCost",0) - COALESCE("planCost",0))), 0)::float AS "costOverrun",
          COALESCE(SUM(GREATEST(0, COALESCE("actualHours",0) - COALESCE("planDays",0) * 8)), 0)::float AS "timeOverrun",
          COUNT(*) FILTER (WHERE NOT completed AND NOT rejected AND (COALESCE("actualCost",0) > 0 OR COALESCE("actualHours",0) > 0))::bigint AS "inProgress",
          COUNT(*) FILTER (WHERE NOT completed AND NOT rejected AND "dateFrom" IS NOT NULL AND "dateFrom" >= NOW() AND "dateFrom" <= NOW() + INTERVAL '7 days' AND COALESCE("actualCost",0) = 0)::bigint AS "startingSoon"
        FROM "BudgetItem"
        WHERE "projectId" = ${projectId}
        GROUP BY COALESCE(NULLIF(phase, ''), 'Neurčeno')
        ORDER BY MIN("sortOrder")
      `,

      // 3) By-category breakdown
      db.$queryRaw<RawCategoryRow[]>`
        SELECT
          COALESCE(NULLIF(category, ''), '(bez kategorie)') AS category,
          COALESCE(SUM("planCost"), 0)::float AS plan,
          COALESCE(SUM("actualCost"), 0)::float AS actual,
          COALESCE(SUM("actualHours"), 0)::float AS hours,
          COUNT(*)::bigint AS count
        FROM "BudgetItem"
        WHERE "projectId" = ${projectId}
        GROUP BY COALESCE(NULLIF(category, ''), '(bez kategorie)')
        ORDER BY COALESCE(SUM("planCost"), 0) DESC
      `,

      // 4a) In-progress alert: top-level items with rolled-up actuals > 0
      // (rolled-up via LEFT JOIN on children, payments, time entries)
      db.$queryRaw<RawAlertRow[]>`
        WITH rolled AS (
          SELECT
            p.id,
            (COALESCE(p."actualCost", 0) + COALESCE(c.child_actual, 0))::float AS "actualCost",
            (COALESCE(p."actualHours", 0) + COALESCE(c.child_hours, 0))::float AS "actualHours",
            COALESCE(latest_activity.latest, NULL) AS "latestActivity"
          FROM "BudgetItem" p
          LEFT JOIN LATERAL (
            SELECT
              COALESCE(SUM(ch."actualCost"), 0)::float AS child_actual,
              COALESCE(SUM(ch."actualHours"), 0)::float AS child_hours
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
          WHERE p."projectId" = ${projectId} AND p."parentId" IS NULL
        )
        SELECT
          bi.id, bi.category, bi.subcategory, bi.phase, bi."planCost",
          r."actualCost", r."actualHours", bi."dateFrom", bi."dateTo",
          bi.completed, bi.rejected, bi.required, r."latestActivity"
        FROM rolled r
        JOIN "BudgetItem" bi ON bi.id = r.id
        WHERE NOT bi.completed AND NOT bi.rejected
          AND (r."actualCost" > 0 OR r."actualHours" > 0)
        ORDER BY r."latestActivity" DESC NULLS LAST
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

      // 4c) Overdue alert
      db.$queryRaw<RawAlertRow[]>`
        WITH rolled AS (
          SELECT
            p.id,
            (COALESCE(p."actualCost", 0) + COALESCE(SUM(ch."actualCost"), 0))::float AS "actualCost",
            (COALESCE(p."actualHours", 0) + COALESCE(SUM(ch."actualHours"), 0))::float AS "actualHours"
          FROM "BudgetItem" p
          LEFT JOIN "BudgetItem" ch ON ch."parentId" = p.id
          WHERE p."projectId" = ${projectId} AND p."parentId" IS NULL
          GROUP BY p.id, p."actualCost", p."actualHours"
        )
        SELECT
          bi.id, bi.category, bi.subcategory, bi.phase, bi."planCost",
          r."actualCost", r."actualHours", bi."dateFrom", bi."dateTo",
          bi.completed, bi.rejected, bi.required, NULL::timestamp AS "latestActivity"
        FROM rolled r
        JOIN "BudgetItem" bi ON bi.id = r.id
        WHERE NOT bi.completed AND NOT bi.rejected
          AND bi."dateTo" IS NOT NULL AND bi."dateTo" < NOW()
          AND bi."planCost" IS NOT NULL AND bi."planCost" > 0
          AND r."actualCost" < bi."planCost" * 0.9
        ORDER BY bi."dateTo" ASC
      `,

      // 4d) Over-budget alert
      db.$queryRaw<RawAlertRow[]>`
        WITH rolled AS (
          SELECT
            p.id,
            (COALESCE(p."actualCost", 0) + COALESCE(SUM(ch."actualCost"), 0))::float AS "actualCost",
            (COALESCE(p."actualHours", 0) + COALESCE(SUM(ch."actualHours"), 0))::float AS "actualHours"
          FROM "BudgetItem" p
          LEFT JOIN "BudgetItem" ch ON ch."parentId" = p.id
          WHERE p."projectId" = ${projectId} AND p."parentId" IS NULL
          GROUP BY p.id, p."actualCost", p."actualHours"
        )
        SELECT
          bi.id, bi.category, bi.subcategory, bi.phase, bi."planCost",
          r."actualCost", r."actualHours", bi."dateFrom", bi."dateTo",
          bi.completed, bi.rejected, bi.required, NULL::timestamp AS "latestActivity"
        FROM rolled r
        JOIN "BudgetItem" bi ON bi.id = r.id
        WHERE NOT bi.completed AND NOT bi.rejected
          AND bi."planCost" IS NOT NULL AND bi."planCost" > 0
          AND r."actualCost" > bi."planCost"
        ORDER BY (r."actualCost" - bi."planCost") DESC
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
