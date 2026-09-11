import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/dashboard-cache";

// GET /api/projects/[id]/dashboard
// Aggregated stats: totals, by-phase breakdown, by-category breakdown,
// upcoming deadlines (alerts), burn-rate warnings, timeline.
//
// Performance: the heavy lifting is done in `getDashboardData` which is
// wrapped with `unstable_cache` and tagged `dashboard:${projectId}`.
// Mutations call `invalidateDashboard(projectId)` to bust the cache so
// the next request re-computes fresh data.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const data = await getDashboardData(id);
    if (!data) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
<<<<<<< Updated upstream
    return NextResponse.json(data);
=======

    const items = await db.budgetItem.findMany({
      where: { projectId: id },
      orderBy: { sortOrder: "asc" },
      include: {
        payments: { select: { amount: true, date: true } },
        timeEntries: { select: { hours: true, date: true } },
        _count: { select: { payments: true, timeEntries: true } },
      },
    });

    // ===== TOTALS =====
    const planTotal = items.reduce((s, i) => s + (i.planCost || 0), 0);
    const actualTotal = items.reduce((s, i) => s + (i.actualCost || 0), 0);
    const hoursTotal = items.reduce((s, i) => s + (i.actualHours || 0), 0);
    const daysPlanned = items.reduce((s, i) => s + (i.planDays || 0), 0);

    // "Ušetřeno" — saved vs plan, only counted for completed items where actual < plan
    const completedItems = items.filter((i) => i.completed);
    const savedTotal = completedItems.reduce(
      (s, i) => s + Math.max(0, (i.planCost || 0) - (i.actualCost || 0)),
      0,
    );

    // Flexibility-adjusted estimate: plan * (1 + flexibility/100)
    // The "vůle" represents how much the price could swing up.
    const worstCase = items.reduce(
      (s, i) => s + (i.planCost || 0) * (1 + (i.flexibilityPercent || 0) / 100),
      0,
    );

    // ===== PROJECTION =====
    // Predicted final cost based on current burn rate of completed items.
    // For completed items: use actual cost.
    // For incomplete items: estimate using the average overrun ratio of completed items.
    const completedWithPlan = completedItems.filter((i) => i.planCost && i.planCost > 0);
    const avgOverrunRatio =
      completedWithPlan.length > 0
        ? completedWithPlan.reduce((s, i) => s + (i.actualCost || 0) / (i.planCost || 1), 0) /
          completedWithPlan.length
        : 1;
    const incompleteItems = items.filter((i) => !i.completed);
    const projectedRemaining = incompleteItems.reduce(
      (s, i) => s + (i.planCost || 0) * avgOverrunRatio,
      0,
    );
    const projectedFinal = actualTotal + projectedRemaining;
    const projectedOverrun = projectedFinal - planTotal;

    // ===== BY PHASE =====
    // Includes worstCase per phase (plan * (1 + vůle/100) summed) so the UI
    // can show whether the phase has exceeded its flexibility-adjusted ceiling.
    const byPhase = new Map<
      string,
      { plan: number; actual: number; hours: number; count: number; worstCase: number }
    >();
    for (const it of items) {
      const key = it.phase || "Neurčeno";
      const cur = byPhase.get(key) || { plan: 0, actual: 0, hours: 0, count: 0, worstCase: 0 };
      cur.plan += it.planCost || 0;
      cur.actual += it.actualCost || 0;
      cur.hours += it.actualHours || 0;
      cur.count += 1;
      cur.worstCase += (it.planCost || 0) * (1 + (it.flexibilityPercent || 0) / 100);
      byPhase.set(key, cur);
    }

    // ===== BY CATEGORY =====
    const byCategory = new Map<
      string,
      { plan: number; actual: number; hours: number; count: number }
    >();
    for (const it of items) {
      const key = it.category || "(bez kategorie)";
      const cur = byCategory.get(key) || { plan: 0, actual: 0, hours: 0, count: 0 };
      cur.plan += it.planCost || 0;
      cur.actual += it.actualCost || 0;
      cur.hours += it.actualHours || 0;
      cur.count += 1;
      byCategory.set(key, cur);
    }

    // ===== ALERTS =====
    // All alert filters exclude completed items — a finished item has nothing
    // left to act on.
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 1) In-progress items: any real activity (cost or hours) but not yet completed.
    const inProgress = items.filter(
      (it) =>
        !it.completed &&
        ((it.actualCost || 0) > 0 || (it.actualHours || 0) > 0),
    );

    // 2) Must pay: work was logged (time entries) but no payment was ever made.
    //    The work happened but the contractor hasn't been paid yet.
    const mustPay = items.filter(
      (it) =>
        !it.completed &&
        it._count.timeEntries > 0 &&
        it._count.payments === 0,
    );

    // 3) Risk: actual cost exceeds the worst-case ceiling (plan * (1 + vůle/100)).
    //    Even with the flexibility margin we provided, the price has gone higher.
    const overBudgetWorst = items.filter((it) => {
      if (it.completed) return false;
      const plan = it.planCost || 0;
      if (plan <= 0) return false;
      const ceiling = plan * (1 + (it.flexibilityPercent || 0) / 100);
      return (it.actualCost || 0) > ceiling;
    });

    // 4) Overdue items (dateTo in past, actualCost < planCost, not fully paid)
    const overdue = items.filter(
      (it) =>
        !it.completed &&
        it.dateTo &&
        it.dateTo < now &&
        it.planCost &&
        (it.actualCost || 0) < it.planCost * 0.9,
    );

    // 5) Over-budget items (actualCost > planCost, not completed)
    const overBudget = items.filter(
      (it) => !it.completed && it.planCost && it.actualCost > it.planCost,
    );

    // 6) Items whose dateFrom is within next 30 days (need to arrange craftsman / order material)
    const upcoming = items.filter(
      (it) =>
        !it.completed &&
        it.dateFrom &&
        it.dateFrom >= now &&
        it.dateFrom <= in30 &&
        (it.actualCost || 0) === 0,
    );

    // 7) Should start: dateFrom is today or in the next 7 days (or already in the past)
    //    but no payments and no time entries have been recorded yet — work that
    //    was supposed to begin but hasn't.
    const shouldStart = items.filter(
      (it) =>
        !it.completed &&
        it.dateFrom &&
        it.dateFrom <= in7 &&
        it._count.payments === 0 &&
        it._count.timeEntries === 0,
    );

    // 8) Items without dates (need scheduling)
    const unscheduled = items.filter(
      (it) =>
        !it.completed &&
        !it.dateFrom &&
        !it.dateTo &&
        (it.planCost || 0) > 0 &&
        it.phase !== "Do budoucna" &&
        it.phase !== "Neurčeno",
    );

    // ===== TIMELINE =====
    // Sort items by dateFrom for Gantt-like view
    const timeline = items
      .filter((it) => it.dateFrom || it.dateTo)
      .map((it) => ({
        id: it.id,
        category: it.category,
        subcategory: it.subcategory,
        phase: it.phase,
        dateFrom: it.dateFrom,
        dateTo: it.dateTo || it.dateFrom,
        planCost: it.planCost,
        actualCost: it.actualCost,
        planDays: it.planDays,
        required: it.required,
        completed: it.completed,
      }))
      .sort((a, b) => {
        const ad = a.dateFrom?.getTime() ?? 0;
        const bd = b.dateFrom?.getTime() ?? 0;
        return ad - bd;
      });

    // ===== RECENT ACTIVITY =====
    const payments = await db.payment.findMany({
      where: { budgetItem: { projectId: id } },
      orderBy: { date: "desc" },
      take: 5,
      include: {
        budgetItem: { select: { category: true, subcategory: true } },
      },
    });
    const timeEntries = await db.timeEntry.findMany({
      where: { budgetItem: { projectId: id } },
      orderBy: { date: "desc" },
      take: 5,
      include: {
        budgetItem: { select: { category: true, subcategory: true } },
      },
    });

    return NextResponse.json({
      project,
      totals: {
        planTotal,
        actualTotal,
        remaining: planTotal - actualTotal,
        burnRate: planTotal > 0 ? (actualTotal / planTotal) * 100 : 0,
        worstCase,
        worstCaseRemaining: worstCase - actualTotal,
        hoursTotal,
        daysPlanned,
        itemCount: items.length,
        requiredCount: items.filter((i) => i.required).length,
        completedCount: completedItems.length,
        savedTotal,
        projectedFinal,
        projectedOverrun,
        avgOverrunRatio,
      },
      byPhase: Array.from(byPhase.entries()).map(([phase, v]) => ({ phase, ...v })),
      byCategory: Array.from(byCategory.entries())
        .map(([category, v]) => ({ category, ...v }))
        .sort((a, b) => b.plan - a.plan),
      alerts: {
        upcoming,
        overdue,
        overBudget,
        overBudgetWorst,
        unscheduled,
        inProgress,
        mustPay,
        shouldStart,
      },
      timeline,
      recent: {
        payments,
        timeEntries,
      },
    });
>>>>>>> Stashed changes
  } catch (error) {
    console.error("GET dashboard error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard" }, { status: 500 });
  }
}
