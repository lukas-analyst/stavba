import { NextResponse } from "next/server";
import { dbRead } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/authz";

// GET /api/search?q=query
// Global search across projects, budget items, contacts, payments, and notes.
//
// SECURITY: Only searches across projects the authenticated user owns or is
// a member of. Uses `dbRead` (read replica if configured, falls back to
// primary). Uses `mode: "insensitive"` for case-insensitive matching.
export async function GET(request: Request) {
  const { user, response } = await requireVerifiedUser();
  if (response || !user) return response!;

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";

    if (q.length < 2) {
      return NextResponse.json({
        projects: [],
        items: [],
        contacts: [],
        payments: [],
        notes: [],
      });
    }

    // 1) Collect the set of project IDs the user can see (owned + member of).
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
      return NextResponse.json({
        projects: [],
        items: [],
        contacts: [],
        payments: [],
        notes: [],
      });
    }

    const [projects, items, contacts, payments, notes] = await Promise.all([
      dbRead.project.findMany({
        where: {
          id: { in: projectIds },
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { address: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 5,
        select: {
          id: true,
          name: true,
          address: true,
          status: true,
          starred: true,
        },
        orderBy: [{ starred: "desc" }, { name: "asc" }],
      }),
      dbRead.budgetItem.findMany({
        where: {
          projectId: { in: projectIds },
          OR: [
            { category: { contains: q, mode: "insensitive" } },
            { subcategory: { contains: q, mode: "insensitive" } },
            { element: { contains: q, mode: "insensitive" } },
            { note: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 8,
        select: {
          id: true,
          projectId: true,
          category: true,
          subcategory: true,
          phase: true,
          planCost: true,
        },
        orderBy: { sortOrder: "asc" },
      }),
      dbRead.contact.findMany({
        where: {
          projectId: { in: projectIds },
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { role: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 5,
        select: {
          id: true,
          projectId: true,
          name: true,
          type: true,
          role: true,
          phone: true,
        },
        orderBy: { name: "asc" },
      }),
      dbRead.payment.findMany({
        where: {
          budgetItem: { projectId: { in: projectIds } },
          OR: [
            { description: { contains: q, mode: "insensitive" } },
            { vendor: { contains: q, mode: "insensitive" } },
            { invoiceNumber: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 5,
        select: {
          id: true,
          amount: true,
          type: true,
          description: true,
          vendor: true,
          date: true,
          budgetItem: {
            select: {
              projectId: true,
              category: true,
              subcategory: true,
            },
          },
        },
        orderBy: { date: "desc" },
      }),
      dbRead.note.findMany({
        where: {
          projectId: { in: projectIds },
          OR: [
            { text: { contains: q, mode: "insensitive" } },
            { author: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 5,
        select: {
          id: true,
          projectId: true,
          text: true,
          author: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({ projects, items, contacts, payments, notes });
  } catch (error) {
    console.error("GET search error:", error);
    return NextResponse.json({ error: "Failed to search" }, { status: 500 });
  }
}
