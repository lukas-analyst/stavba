import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/projects/[id]/contact-stats
// Returns aggregated stats per contact: total paid, total hours, payment count, time entry count
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const contacts = await db.contact.findMany({
      where: { projectId: id },
      include: {
        payments: {
          select: { amount: true, date: true, type: true },
        },
        timeEntries: {
          select: { hours: true, date: true, workerType: true },
        },
      },
      orderBy: { name: "asc" },
    });

    // Worker name → stats aggregation (for time entries that may not have a contactId)
    const timeEntries = await db.timeEntry.findMany({
      where: { budgetItem: { projectId: id } },
      select: {
        workerName: true,
        workerType: true,
        hours: true,
        date: true,
        contactId: true,
      },
    });

    const byWorker = new Map<
      string,
      { hours: number; entries: number; type: string }
    >();
    for (const t of timeEntries) {
      const key = t.workerName;
      const cur = byWorker.get(key) ?? { hours: 0, entries: 0, type: t.workerType };
      cur.hours += t.hours;
      cur.entries += 1;
      byWorker.set(key, cur);
    }

    const contactStats = contacts.map((c) => {
      const totalPaid = c.payments.reduce((s, p) => s + p.amount, 0);
      const totalHours = c.timeEntries.reduce((s, t) => s + t.hours, 0);
      // Latest activity date
      const allDates = [
        ...c.payments.map((p) => p.date),
        ...c.timeEntries.map((t) => t.date),
      ].sort((a, b) => b.getTime() - a.getTime());
      return {
        contactId: c.id,
        name: c.name,
        type: c.type,
        rating: c.rating,
        totalPaid,
        totalHours,
        paymentCount: c.payments.length,
        timeEntryCount: c.timeEntries.length,
        lastActivity: allDates[0] ?? null,
      };
    });

    // Sort by total paid + hours (most active first)
    contactStats.sort((a, b) => {
      const scoreA = a.totalPaid + a.totalHours * 500;
      const scoreB = b.totalPaid + b.totalHours * 500;
      return scoreB - scoreA;
    });

    // Worker stats (for entries without a linked contact)
    const workerStats = Array.from(byWorker.entries())
      .map(([name, s]) => ({ name, ...s }))
      .sort((a, b) => b.hours - a.hours);

    return NextResponse.json({ contactStats, workerStats });
  } catch (error) {
    console.error("GET contact-stats error:", error);
    return NextResponse.json({ error: "Failed to fetch contact stats" }, { status: 500 });
  }
}
