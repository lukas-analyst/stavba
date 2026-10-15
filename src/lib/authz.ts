import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// =====================================================================
// Authorization helpers for API routes
// ---------------------------------------------------------------------
// These helpers replace the old `getDefaultOwnerId()` pattern and
// enforce proper authorization:
//
//   1. requireUser() — must be authenticated (JWT valid)
//   2. requireVerifiedUser() — must be authenticated + e-mail verified
//      (middleware should already block this, but defense-in-depth)
//   3. requireProjectAccess(projectId, role) — must be authenticated +
//      verified + have access to the project (as owner or member with
//      sufficient role)
//
// Role hierarchy:
//   - "owner"  — full control (delete, share, edit, view)
//   - "editor" — edit budget/payments/time/contacts (no delete/share)
//   - "viewer" — read-only
//
// A user is considered to have a role if:
//   - They are the project owner (treated as "owner"), OR
//   - They have a ProjectMember record with role >= required role
//
// For "viewer" required role: owner, editor, or viewer all pass.
// For "editor" required role: owner or editor pass.
// For "owner" required role: only owner passes.
// =====================================================================

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: string | null;
};

/**
 * Get the authenticated user from the NextAuth session.
 * Returns `{ user, response: null }` if authenticated, or
 * `{ user: null, response: <401> }` if not.
 */
export async function requireUser(): Promise<{
  user: SessionUser | null;
  response: NextResponse | null;
}> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Nejste přihlášen." },
        { status: 401 },
      ),
    };
  }

  const user: SessionUser = {
    id: (session.user as { id?: string }).id ?? "",
    email: session.user.email,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
    emailVerified:
      (session.user as { emailVerified?: string | null }).emailVerified ?? null,
  };

  return { user, response: null };
}

/**
 * Get the authenticated user, requiring e-mail verification.
 * Returns `{ user, response: null }` if authenticated + verified,
 * or `{ user: null, response: <403> }` if not verified.
 *
 * Middleware should already block unverified users from reaching API
 * routes, but this is defense-in-depth in case middleware is bypassed.
 */
export async function requireVerifiedUser(): Promise<{
  user: SessionUser | null;
  response: NextResponse | null;
}> {
  const { user, response } = await requireUser();
  if (response) return { user: null, response };

  if (!user?.emailVerified) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "E-mail není ověřen. Zkontrolujte svou schránku." },
        { status: 403 },
      ),
    };
  }

  return { user, response: null };
}

// =====================================================================
// Project access helpers
// =====================================================================

const ROLE_RANK: Record<string, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

type ProjectRole = "viewer" | "editor" | "owner";

type ProjectAccessResult =
  | { ok: true; user: SessionUser; project: { id: string; ownerId: string; name: string } }
  | { ok: false; response: NextResponse };

/**
 * Verify that the authenticated user has access to a project with
 * at least the required role.
 *
 * @param projectId - The project ID from the URL
 * @param requiredRole - Minimum role required ("viewer" | "editor" | "owner")
 * @returns `{ ok: true, user, project }` if access granted,
 *          `{ ok: false, response }` if denied (401/403/404)
 *
 * Usage:
 *   const access = await requireProjectAccess(id, "editor");
 *   if (!access.ok) return access.response;
 *   // access.user.id, access.project.id, access.project.ownerId
 */
export async function requireProjectAccess(
  projectId: string,
  requiredRole: ProjectRole = "viewer",
): Promise<ProjectAccessResult> {
  // 1. Require authenticated + verified user
  const { user, response } = await requireVerifiedUser();
  if (response || !user) {
    return { ok: false, response: response! };
  }

  // 2. Fetch the project (just the fields we need for auth decision)
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true, name: true },
  });

  if (!project) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Projekt nebyl nalezen." },
        { status: 404 },
      ),
    };
  }

  // 3. Owner has full access (any role)
  if (project.ownerId === user.id) {
    return { ok: true, user, project };
  }

  // 4. Check ProjectMember record for non-owners
  const membership = await db.projectMember.findUnique({
    where: {
      projectId_userId: { projectId, userId: user.id },
    },
    select: { role: true },
  });

  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "K tomuto projektu nemáte přístup." },
        { status: 403 },
      ),
    };
  }

  // 5. Check role sufficiency
  const userRank = ROLE_RANK[membership.role] ?? 0;
  const requiredRank = ROLE_RANK[requiredRole] ?? 1;

  if (userRank < requiredRank) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Pro tuto akci je vyžadována role „${requiredRole}" nebo vyšší.`,
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user, project };
}
