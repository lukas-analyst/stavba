import { NextResponse } from "next/server";
import { dbRead } from "@/lib/db";
import { getDashboardData } from "@/lib/dashboard-cache";

// =====================================================================
// GET /api/projects/[id]/public — public read-only project view
// ---------------------------------------------------------------------
// The [id] param can be either a project ID (cuid) OR a slug (kebab-case).
// We look up by slug first, then by ID as fallback.
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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: slugOrId } = await params;

    // Look up the project by slug first, then by ID as fallback.
    // Only public projects are exposed.
    const project = await dbRead.project.findUnique({
      where: { slug: slugOrId },
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

    // If not found by slug, try by ID
    if (!project) {
      const byId = await dbRead.project.findUnique({
        where: { id: slugOrId },
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
      if (byId) {
        return handlePublicProject(byId);
      }
    } else {
      return handlePublicProject(project);
    }

    // Same response whether the project doesn't exist OR isn't public —
    // don't leak existence of private projects.
    return NextResponse.json(
      { error: "Projekt nebyl nalezen nebo není veřejný." },
      { status: 404 },
    );
  } catch (error) {
    console.error("GET /api/projects/[id]/public error:", error);
    return NextResponse.json(
      { error: "Nepodařilo se načíst veřejná data projektu." },
      { status: 500 },
    );
  }
}

// Helper — returns the public project data or 404 if not public
async function handlePublicProject(project: {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  description: string | null;
  status: string;
  currency: string;
  totalBudget: number;
  startDate: Date | null;
  endDate: Date | null;
  isPublic: boolean;
}) {
  // Check if project is public
  if (!project.isPublic) {
    return NextResponse.json(
      { error: "Projekt nebyl nalezen nebo není veřejný." },
      { status: 404 },
    );
  }

  // Reuse the cached dashboard query
  const dashboard = await getDashboardData(project.id);
  if (!dashboard) {
    return NextResponse.json(
      { error: "Projekt nebyl nalezen nebo není veřejný." },
      { status: 404 },
    );
  }

  // Compose a SAFE subset — strip PII
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
}
