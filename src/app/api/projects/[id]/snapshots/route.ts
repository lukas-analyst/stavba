import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { db, dbRead } from "@/lib/db";
import { requireProjectAccess } from "@/lib/authz";

// Cached version of the snapshots list query — keyed by projectId (passed
// as the function argument, which Next.js includes in the cache key
// automatically), tagged "snapshots" with a 60s TTL. Snapshots rarely
// change (only on explicit create/delete). Snapshot mutations bust this
// tag via `bustServerCache(projectId, [...])` in src/lib/api.ts.
const getCachedSnapshots = unstable_cache(
  async (projectId: string) => {
    const snapshots = await dbRead.snapshot.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
    return snapshots;
  },
  ["snapshots"],
  {
    tags: ["snapshots"],
    revalidate: 60, // 60 seconds — snapshots rarely change
  }
);

// GET /api/projects/[id]/snapshots - list all snapshots for a project
// Uses `dbRead` (read replica if configured, falls back to primary).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireProjectAccess(id, "viewer");
    if (!access.ok) return access.response;
    const snapshots = await getCachedSnapshots(id);
    return NextResponse.json(snapshots);
  } catch (error) {
    console.error("GET snapshots error:", error);
    return NextResponse.json({ error: "Failed to fetch snapshots" }, { status: 500 });
  }
}

// POST /api/projects/[id]/snapshots - create a new snapshot
// Body: { label: string } — captures current project totals
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireProjectAccess(id, "editor");
    if (!access.ok) return access.response;
    const body = await request.json();
    const { label } = body;

    if (!label || typeof label !== "string" || !label.trim()) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 });
    }

    // `requireProjectAccess` already verified the project exists & user has
    // access, so we can drop the redundant findUnique lookup here.

    // Compute current totals from budget items
    const items = await db.budgetItem.findMany({
      where: { projectId: id },
      select: {
        planCost: true,
        actualCost: true,
        actualHours: true,
        planDays: true,
        completed: true,
        flexibilityPercent: true,
      },
    });

    const planTotal = items.reduce((s, i) => s + (i.planCost || 0), 0);
    const actualTotal = items.reduce((s, i) => s + (i.actualCost || 0), 0);
    const hoursTotal = items.reduce((s, i) => s + (i.actualHours || 0), 0);
    const daysPlanned = items.reduce((s, i) => s + (i.planDays || 0), 0);
    const completedItems = items.filter((i) => i.completed);
    const savedTotal = completedItems.reduce(
      (s, i) => s + Math.max(0, (i.planCost || 0) - (i.actualCost || 0)),
      0,
    );

    const snapshot = await db.snapshot.create({
      data: {
        projectId: id,
        label: label.trim(),
        planTotal,
        actualTotal,
        remaining: planTotal - actualTotal,
        burnRate: planTotal > 0 ? (actualTotal / planTotal) * 100 : 0,
        hoursTotal,
        daysPlanned,
        itemCount: items.length,
        completedCount: completedItems.length,
        savedTotal,
      },
    });

    return NextResponse.json(snapshot, { status: 201 });
  } catch (error) {
    console.error("POST snapshot error:", error);
    return NextResponse.json({ error: "Failed to create snapshot" }, { status: 500 });
  }
}
