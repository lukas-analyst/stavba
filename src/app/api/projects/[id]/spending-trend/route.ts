import { NextResponse } from "next/server";
import { dbRead } from "@/lib/db";

// GET /api/projects/[id]/spending-trend
// Returns monthly spending + time data for the last 12 months (or all available).
// Used for the dashboard sparkline / trend chart.
// Uses `dbRead` (read replica if configured, falls back to primary).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await dbRead.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const payments = await dbRead.payment.findMany({
      where: { budgetItem: { projectId: id } },
      select: { amount: true, date: true },
    });
    const timeEntries = await dbRead.timeEntry.findMany({
      where: { budgetItem: { projectId: id } },
      select: { hours: true, date: true },
    });

    // Build a map of YYYY-MM -> { spend, hours }
    const now = new Date();
    const months: { key: string; label: string; spend: number; hours: number }[] = [];
    // Start from 11 months ago up to current month
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = ["Led", "Úno", "Bře", "Dub", "Kvě", "Čvn", "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro"][d.getMonth()];
      months.push({ key, label, spend: 0, hours: 0 });
    }
    const monthMap = new Map(months.map((m) => [m.key, m]));

    const getMonthKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    for (const p of payments) {
      const key = getMonthKey(p.date);
      const m = monthMap.get(key);
      if (m) m.spend += p.amount;
    }
    for (const t of timeEntries) {
      const key = getMonthKey(t.date);
      const m = monthMap.get(key);
      if (m) m.hours += t.hours;
    }

    // If there's no data at all, also include a summary of cumulative spend
    const totalSpend = payments.reduce((s, p) => s + p.amount, 0);
    const totalHours = timeEntries.reduce((s, t) => s + t.hours, 0);

    return NextResponse.json({
      months,
      totals: { totalSpend, totalHours, paymentCount: payments.length, timeEntryCount: timeEntries.length },
    });
  } catch (error) {
    console.error("GET spending-trend error:", error);
    return NextResponse.json({ error: "Failed to fetch spending trend" }, { status: 500 });
  }
}
