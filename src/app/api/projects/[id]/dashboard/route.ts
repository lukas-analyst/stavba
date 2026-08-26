import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/projects/[id]/dashboard
// Aggregated stats: totals, by-phase breakdown, by-category breakdown,
// upcoming deadlines (alerts), burn-rate warnings, timeline.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await db.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const items = await db.budgetItem.findMany({
      where: { projectId: id },
      orderBy: { sortOrder: "asc" },
      include: {
        payments: { select: { amount: true, date: true } },
        timeEntries: { select: { hours: true, date: true } },
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
    const byPhase = new Map<string, { plan: number; actual: number; hours: number; count: number }>();
    for (const it of items) {
      const key = it.phase || "Neurčeno";
      const cur = byPhase.get(key) || { plan: 0, actual: 0, hours: 0, count: 0 };
      cur.plan += it.planCost || 0;
      cur.actual += it.actualCost || 0;
      cur.hours += it.actualHours || 0;
      cur.count += 1;
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
    // 1) Items whose dateFrom is within next 30 days (need to arrange craftsman / order material)
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const upcoming = items.filter(
      (it) =>
        it.dateFrom &&
        it.dateFrom >= now &&
        it.dateFrom <= in30 &&
        (it.actualCost || 0) === 0,
    );

    // 2) Overdue items (dateTo in past, actualCost < planCost, not fully paid)
    const overdue = items.filter(
      (it) =>
        it.dateTo &&
        it.dateTo < now &&
        it.planCost &&
        (it.actualCost || 0) < it.planCost * 0.9,
    );

    // 3) Over-budget items (actualCost > planCost)
    const overBudget = items.filter(
      (it) => it.planCost && it.actualCost > it.planCost,
    );

    // 4) Items without dates (need scheduling)
    const unscheduled = items.filter(
      (it) =>
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
        unscheduled,
      },
      timeline,
      recent: {
        payments,
        timeEntries,
      },
    });
  } catch (error) {
    console.error("GET dashboard error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard" }, { status: 500 });
  }
}
