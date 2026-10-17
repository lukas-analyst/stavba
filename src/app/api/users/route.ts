import { NextResponse } from "next/server";
import { dbRead } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/authz";

// GET /api/users — list users visible to the authenticated user.
//
// Two behaviours depending on the requester's role:
//
//   1. ADMIN requesters (isAdmin === true) — receive ALL users in the
//      instance, including the `isAdmin` flag. This powers the
//      "Správa uživatelů" section in the admin tab.
//
//   2. Non-admin requesters — receive only users that share a project
//      with them (for project sharing dropdowns). SECURITY: this prevents
//      leaking the entire user base (including e-mail addresses) to any
//      authenticated user. Returns minimal fields: id, name, email.
//      Ordered by name.
//
// Returns: 200 Array<{
//   id: string;
//   name: string | null;
//   email: string;
//   isAdmin?: boolean;   // only present for admin requesters
// }>
export async function GET() {
  const { user, response } = await requireVerifiedUser();
  if (response || !user) return response!;

  try {
    // ===== Admin bypass — return ALL users with isAdmin flag =====
    if (user.isAdmin) {
      const allUsers = await dbRead.user.findMany({
        where: { id: { not: user.id } },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          isAdmin: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json(allUsers);
    }

    // 1) Find projects the current user can see (owned + member of).
    const [owned, memberships] = await Promise.all([
      dbRead.project.findMany({
        where: { ownerId: user.id },
        select: { id: true, ownerId: true },
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
      return NextResponse.json([]);
    }

    // 2) Find other members of these projects (distinct users).
    const otherMembers = await dbRead.projectMember.findMany({
      where: { projectId: { in: projectIds } },
      select: { userId: true },
    });

    // 3) Include project owners (who may not be in the ProjectMember table,
    //    per the schema comment).
    const ownerIds = Array.from(
      new Set<string>([
        ...owned.map((p) => p.ownerId),
        ...otherMembers.map((m) => m.userId),
      ]),
    );

    if (ownerIds.length === 0) {
      return NextResponse.json([]);
    }

    const users = await dbRead.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, name: true, email: true },
    });

    users.sort((a, b) => {
      const an = (a.name ?? a.email).toLowerCase();
      const bn = (b.name ?? b.email).toLowerCase();
      return an.localeCompare(bn);
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("GET users error:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
