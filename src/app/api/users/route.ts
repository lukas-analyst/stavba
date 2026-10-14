import { NextResponse } from "next/server";
import { dbRead } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/authz";

// GET /api/users — list users that the authenticated user shares a project
// with (for project sharing dropdowns).
//
// SECURITY: Returns only users who are members of projects that the
// authenticated user is also a member of (or owns). This prevents leaking
// the entire user base (including e-mail addresses) to any authenticated
// user. Returns minimal fields: id, name, email. Ordered by name.
export async function GET() {
  const { user, response } = await requireVerifiedUser();
  if (response || !user) return response!;

  try {
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
