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
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET dashboard error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard" }, { status: 500 });
  }
}
