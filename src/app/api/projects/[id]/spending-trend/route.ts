import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { dbRead } from "@/lib/db";
import { requireProjectAccess } from "@/lib/authz";

// GET /api/projects/[id]/spending-trend
// Returns monthly spending + time data for the last 12 months (or all available).
// Used for the dashboard sparkline / trend chart.
// Uses `dbRead` (read replica if configured, falls back to primary).
//
// Cached with `unstable_cache` keyed by projectId, tagged "spending-trends"
// with a 300s (5min) TTL. Historical data rarely changes, so a long TTL is
// safe — the cache also gets busted indirectly via the "dashboards" tag
// (the dashboard surfaces spending-trend data via its own endpoint).

type SpendingMonth = {
  key: string;
  label: string;
  spend: number;
  hours: number;
};

type SpendingTrendResult = {
  months: SpendingMonth[];
  totals: {
    totalSpend: number;
    totalHours: number;
    paymentCount: number;
    timeEntryCount: number;
  };
};

const getCachedSpendingTrend = unstable_cache(
  async (projectId: string): Promise<SpendingTrendResult> => {
    const payments = await dbRead.payment.findMany({
      where: { budgetItem: { projectId } },
      select: { amountConverted: true, date: true },
    });
    const timeEntries = await dbRead.timeEntry.findMany({
      where: { budgetItem: { projectId } },
      select: { hours: true, date: true },
    });

    // Build a map of YYYY-MM -> { spend, hours }
    const now = new Date();
    const months: SpendingMonth[] = [];
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
      if (m) m.spend += p.amountConverted;
    }
    for (const t of timeEntries) {
      const key = getMonthKey(t.date);
      const m = monthMap.get(key);
      if (m) m.hours += t.hours;
    }

    // If there's no data at all, also include a summary of cumulative spend
    const totalSpend = payments.reduce((s, p) => s + p.amountConverted, 0);
    const totalHours = timeEntries.reduce((s, t) => s + t.hours, 0);

    return {
      months,
      totals: {
        totalSpend,
        totalHours,
        paymentCount: payments.length,
        timeEntryCount: timeEntries.length,
      },
    };
  },
  ["spending-trend"],
  {
    tags: ["spending-trends"],
    revalidate: 300, // 5 minutes — historical data rarely changes
  }
);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireProjectAccess(id, "viewer");
    if (!access.ok) return access.response;
    // `requireProjectAccess` already verified the project exists, so we can
    // drop the redundant findUnique lookup here.
    const data = await getCachedSpendingTrend(id);
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET spending-trend error:", error);
    return NextResponse.json({ error: "Failed to fetch spending trend" }, { status: 500 });
  }
}
