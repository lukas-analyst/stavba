import { NextResponse } from "next/server";
import { dbRead } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/authz";

export const dynamic = "force-dynamic";

// GET /api/export
// Returns the user's application state (projects they own or are a member of,
// plus the budget items, payments, contacts, time entries belonging to those
// projects) as a downloadable JSON file.
//
// Uses `dbRead` (read replica if configured, falls back to primary).
//
// SECURITY: This endpoint is scoped to the authenticated user. It returns
// only the projects the user owns or is a member of, and only the child
// records (budget items, payments, contacts, time entries) attached to
// those projects. It must NEVER leak other users' data.
export async function GET() {
  const { user, response } = await requireVerifiedUser();
  if (response || !user) return response!;

  try {
    // 1) Projects the user owns.
    // 2) Projects the user is a member of (via ProjectMember).
    const [owned, memberships] = await Promise.all([
      dbRead.project.findMany({
        where: { ownerId: user.id },
        select: { id: true },
      }),
      dbRead.projectMember.findMany({
        where: { userId: user.id },
        select: { projectId: true },
      }),
    ]);

    const projectIds = Array.from(
      new Set<string>([
        ...owned.map((p) => p.id),
        ...memberships.map((m) => m.projectId),
      ]),
    );

    if (projectIds.length === 0) {
      // No projects — return an empty (but well-formed) payload so the
      // client can still download a valid JSON file.
      const payload = {
        exportedAt: new Date().toISOString(),
        version: 1,
        projects: [],
        budgetItems: [],
        payments: [],
        contacts: [],
        timeEntries: [],
      };
      return NextResponse.json(payload, {
        headers: {
          "Content-Disposition": `attachment; filename="stavba-export-${new Date()
            .toISOString()
            .slice(0, 10)}.json"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const [projects, budgetItems, payments, contacts, timeEntries] =
      await Promise.all([
        dbRead.project.findMany({
          where: { id: { in: projectIds } },
          orderBy: { createdAt: "asc" },
        }),
        dbRead.budgetItem.findMany({
          where: { projectId: { in: projectIds } },
          orderBy: { createdAt: "asc" },
        }),
        dbRead.payment.findMany({
          where: { budgetItem: { projectId: { in: projectIds } } },
          orderBy: { createdAt: "asc" },
        }),
        dbRead.contact.findMany({
          where: { projectId: { in: projectIds } },
          orderBy: { createdAt: "asc" },
        }),
        dbRead.timeEntry.findMany({
          where: { budgetItem: { projectId: { in: projectIds } } },
          orderBy: { createdAt: "asc" },
        }),
      ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      projects,
      budgetItems,
      payments,
      contacts,
      timeEntries,
    };

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `stavba-export-${today}.json`;

    return NextResponse.json(payload, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/export error:", error);
    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 },
    );
  }
}
