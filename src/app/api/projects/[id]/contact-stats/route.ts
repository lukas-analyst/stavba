import { NextResponse } from "next/server";
import { dbRead } from "@/lib/db";

// GET /api/projects/[id]/contact-stats
<<<<<<< Updated upstream
// Returns aggregated stats per contact: total paid, total hours, payment count, time entry count
// Performance: uses Prisma `groupBy` for aggregation in the DB instead of
// fetching all rows and aggregating in JS (N+1 → 3 queries total).
=======
// Returns aggregated stats per contact: total paid, total hours, payment count, time entry count,
// and the list of budget items the contact worked on (with hours and amount per item).
>>>>>>> Stashed changes
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // 1) Contact metadata (name, type, rating)
    const contacts = await dbRead.contact.findMany({
      where: { projectId: id },
<<<<<<< Updated upstream
      select: { id: true, name: true, type: true, rating: true },
=======
      include: {
        payments: {
          select: {
            amount: true,
            date: true,
            type: true,
            budgetItemId: true,
            budgetItem: {
              select: {
                id: true,
                category: true,
                subcategory: true,
                element: true,
                phase: true,
              },
            },
          },
        },
        timeEntries: {
          select: {
            hours: true,
            date: true,
            workerType: true,
            budgetItemId: true,
            budgetItem: {
              select: {
                id: true,
                category: true,
                subcategory: true,
                element: true,
                phase: true,
              },
            },
          },
        },
      },
>>>>>>> Stashed changes
      orderBy: { name: "asc" },
    });

    if (contacts.length === 0) {
      return NextResponse.json({ contactStats: [], workerStats: [] });
    }

    const contactIds = contacts.map((c) => c.id);

    // 2) Payment aggregates per contact (single GROUP BY query)
    const paymentAgg = await dbRead.payment.groupBy({
      by: ["contactId"],
      where: { contactId: { in: contactIds } },
      _sum: { amount: true },
      _count: { id: true },
      _max: { date: true },
    });

    // 3) Time entry aggregates per contact (single GROUP BY query)
    const timeAgg = await dbRead.timeEntry.groupBy({
      by: ["contactId"],
      where: { contactId: { in: contactIds } },
      _sum: { hours: true },
      _count: { id: true },
      _max: { date: true },
    });

    // Build lookup maps for O(1) join
    const paymentMap = new Map(paymentAgg.map((p) => [p.contactId, p]));
    const timeMap = new Map(timeAgg.map((t) => [t.contactId, t]));

    const contactStats = contacts.map((c) => {
<<<<<<< Updated upstream
      const p = paymentMap.get(c.id);
      const t = timeMap.get(c.id);
      const totalPaid = p?._sum.amount ?? 0;
      const totalHours = t?._sum.hours ?? 0;
      const paymentCount = p?._count.id ?? 0;
      const timeEntryCount = t?._count.id ?? 0;
      // Latest activity = max of (latest payment, latest time entry)
      const pDate = p?._max.date?.getTime() ?? 0;
      const tDate = t?._max.date?.getTime() ?? 0;
      const lastActivityTs = Math.max(pDate, tDate);
      const lastActivity = lastActivityTs > 0 ? new Date(lastActivityTs) : null;
=======
      const totalPaid = c.payments.reduce((s, p) => s + p.amount, 0);
      const totalHours = c.timeEntries.reduce((s, t) => s + t.hours, 0);
      // Latest activity date
      const allDates = [
        ...c.payments.map((p) => p.date),
        ...c.timeEntries.map((t) => t.date),
      ].sort((a, b) => b.getTime() - a.getTime());

      // Aggregate per-budget-item stats for this contact
      const itemMap = new Map<
        string,
        {
          budgetItemId: string;
          category: string;
          subcategory: string | null;
          element: string | null;
          phase: string;
          amount: number;
          hours: number;
        }
      >();
      for (const p of c.payments) {
        const bi = p.budgetItem;
        if (!bi) continue;
        const cur = itemMap.get(bi.id) ?? {
          budgetItemId: bi.id,
          category: bi.category,
          subcategory: bi.subcategory,
          element: bi.element,
          phase: bi.phase,
          amount: 0,
          hours: 0,
        };
        cur.amount += p.amount;
        itemMap.set(bi.id, cur);
      }
      for (const t of c.timeEntries) {
        const bi = t.budgetItem;
        if (!bi) continue;
        const cur = itemMap.get(bi.id) ?? {
          budgetItemId: bi.id,
          category: bi.category,
          subcategory: bi.subcategory,
          element: bi.element,
          phase: bi.phase,
          amount: 0,
          hours: 0,
        };
        cur.hours += t.hours;
        itemMap.set(bi.id, cur);
      }
      const budgetItems = Array.from(itemMap.values()).sort(
        (a, b) => b.amount + b.hours * 500 - (a.amount + a.hours * 500),
      );

>>>>>>> Stashed changes
      return {
        contactId: c.id,
        name: c.name,
        type: c.type,
        rating: c.rating,
        website: c.website,
        totalPaid,
        totalHours,
<<<<<<< Updated upstream
        paymentCount,
        timeEntryCount,
        lastActivity,
=======
        paymentCount: c.payments.length,
        timeEntryCount: c.timeEntries.length,
        lastActivity: allDates[0] ?? null,
        budgetItems,
>>>>>>> Stashed changes
      };
    });

    // Sort by total paid + hours (most active first)
    contactStats.sort((a, b) => {
      const scoreA = a.totalPaid + a.totalHours * 500;
      const scoreB = b.totalPaid + b.totalHours * 500;
      return scoreB - scoreA;
    });

    // Worker stats (time entries grouped by worker name, regardless of contact)
    const workerAgg = await dbRead.timeEntry.groupBy({
      by: ["workerName", "workerType"],
      where: { budgetItem: { projectId: id } },
      _sum: { hours: true },
      _count: { id: true },
    });
    const workerStats = workerAgg
      .map((w) => ({
        name: w.workerName,
        type: w.workerType,
        hours: w._sum.hours ?? 0,
        entries: w._count.id,
      }))
      .sort((a, b) => b.hours - a.hours);

    return NextResponse.json({ contactStats, workerStats });
  } catch (error) {
    console.error("GET contact-stats error:", error);
    return NextResponse.json({ error: "Failed to fetch contact stats" }, { status: 500 });
  }
}
