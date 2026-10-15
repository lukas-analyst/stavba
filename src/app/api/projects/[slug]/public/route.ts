import { NextResponse } from "next/server";
import { dbRead } from "@/lib/db";
import { getDashboardData } from "@/lib/dashboard-cache";

// =====================================================================
// GET /api/projects/[slug]/public — public read-only project view
// ---------------------------------------------------------------------
// Returns a SAFE subset of project data for anyone with the URL:
//   - project basic info (id, name, slug, address, description,
//     status, currency, totalBudget, startDate, endDate)
//   - dashboard totals + byPhase + byCategory breakdowns
//
// Excluded (PII / sensitive):
//   - contacts (byContact, contact names, phones, roles)
//   - notes
//   - audit log
//   - recent payments (vendor, invoice numbers, contact names)
//   - recent time entries (worker names)
//   - alerts with PII
//   - timeline (kept off for simplicity — re-add later if needed)
//
// SECURITY:
//   - This endpoint does NOT require authentication — it is reachable
//     by anyone with the project slug.
//   - If the project does not exist OR `isPublic === false`, we return
//     404 with the SAME body either way to avoid leaking the existence
//     of private projects.
//   - The middleware bypasses auth for this path (see `src/middleware.ts`).
// =====================================================================

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    // Look up the project by slug — only public projects are exposed.
    const project = await dbRead.project.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        address: true,
        description: true,
        status: true,
        currency: true,
        totalBudget: true,
        startDate: true,
        endDate: true,
        isPublic: true,
      },
    });

    // Same response whether the project doesn't exist OR isn't public —
    // don't leak existence of private projects.
    if (!project || !project.isPublic) {
      return NextResponse.json(
        { error: "Projekt nebyl nalezen nebo není veřejný." },
        { status: 404 },
      );
    }

    // Reuse the cached dashboard query (read replica + 60s TTL).
    const dashboard = await getDashboardData(project.id);
    if (!dashboard) {
      // Shouldn't happen since we just fetched the project above,
      // but defend against race conditions (project deleted between
      // the two queries).
      return NextResponse.json(
        { error: "Projekt nebyl nalezen nebo není veřejný." },
        { status: 404 },
      );
    }

    // Compose a SAFE subset of the dashboard data — strip anything that
    // could contain PII (contact names, vendor names, worker names,
    // invoice numbers, internal notes, audit log entries).
    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        address: project.address,
        description: project.description,
        status: project.status,
        currency: project.currency,
        totalBudget: project.totalBudget,
        startDate: project.startDate ? project.startDate.toISOString() : null,
        endDate: project.endDate ? project.endDate.toISOString() : null,
      },
      totals: dashboard.totals,
      byPhase: dashboard.byPhase,
      byCategory: dashboard.byCategory,
    });
  } catch (error) {
    console.error("GET /api/projects/[slug]/public error:", error);
    return NextResponse.json(
      { error: "Nepodařilo se načíst veřejná data projektu." },
      { status: 500 },
    );
  }
}
