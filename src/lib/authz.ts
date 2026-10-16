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
//   - "admin"  — admin bypass: owner-level access to ALL projects
//                (but project deletion still restricted to real owners)
//
// A user is considered to have a role if:
//   - They are an admin (isAdmin === true) → treated as "admin" everywhere
//   - They are the project owner (treated as "owner"), OR
//   - They have a ProjectMember record with role >= required role
//
// For "viewer" required role: owner, editor, or viewer all pass.
// For "editor" required role: owner or editor pass.
// For "owner" required role: only owner (or admin) passes.
// =====================================================================

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: string | null;
  isAdmin: boolean;
};

/**
 * Get the authenticated user from the NextAuth session.
 * Returns `{ user, response: null }` if authenticated, or
 * `{ user: null, response: <401> }` if not.
 *
 * `isAdmin` is fetched fresh from the DB on every call (defense-in-depth)
 * — the JWT also carries it, but DB is the source of truth so a freshly-
 * promoted admin sees their new powers without re-login, and a demoted
 * admin loses them immediately.
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

  // Fetch isAdmin from DB (source of truth — beats trusting the JWT, which
  // can be stale by up to 60s due to the jwt callback's staleness window).
  // If the user no longer exists in DB, treat them as logged out.
  const dbUser = await db.user.findUnique({
    where: { id: (session.user as { id?: string }).id ?? "" },
    select: { isAdmin: true },
  });

  if (!dbUser) {
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
    isAdmin: dbUser.isAdmin,
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
  | {
      ok: true;
      user: SessionUser;
      project: { id: string; ownerId: string; name: string };
      role: "owner" | "editor" | "viewer" | "admin";
    }
  | {
      ok: false;
      response: NextResponse;
      reason:
        | "not_authenticated"
        | "not_verified"
        | "not_found"
        | "insufficient_role";
      requiredRole?: string;
      currentRole?: string;
    };

/**
 * Human-readable Czech label for a project role, used in error messages.
 */
function roleLabel(role: string): string {
  switch (role) {
    case "owner":
      return "Správce";
    case "editor":
      return "Editor";
    case "viewer":
      return "Čtenář";
    case "admin":
      return "Administrátor";
    default:
      return role;
  }
}

/**
 * Verify that the authenticated user has access to a project with
 * at least the required role.
 *
 * Admin bypass: if `user.isAdmin === true`, the user has owner-level
 * access to ALL projects (returned `role` is "admin"). They still
 * cannot delete projects they don't own — that check is enforced in
 * the DELETE handler via comparison of `project.ownerId === user.id`.
 *
 * @param projectId - The project ID from the URL
 * @param requiredRole - Minimum role required ("viewer" | "editor" | "owner")
 * @returns `{ ok: true, user, project, role }` if access granted,
 *          `{ ok: false, response, reason }` if denied (401/403/404)
 *
 * Usage:
 *   const access = await requireProjectAccess(id, "editor");
 *   if (!access.ok) return access.response;
 *   // access.user.id, access.project.id, access.project.ownerId, access.role
 */
export async function requireProjectAccess(
  projectId: string,
  requiredRole: ProjectRole = "viewer",
): Promise<ProjectAccessResult> {
  // 1. Require authenticated + verified user
  const { user, response } = await requireVerifiedUser();
  if (response || !user) {
    // requireVerifiedUser returns 401 for unauthenticated and 403 for
    // unverified — we surface the same distinction via `reason` so callers
    // (and telemetry) can tell the two apart without re-parsing HTTP status.
    const status = response?.status ?? 401;
    const reason: "not_authenticated" | "not_verified" =
      status === 403 ? "not_verified" : "not_authenticated";
    return { ok: false, response: response!, reason };
  }

  // 2. ADMIN BYPASS — admins have owner-level access to ALL projects.
  // We re-fetch `isAdmin` from DB to be 100% sure (defense-in-depth:
  // the session/JWT may be slightly stale).
  const fullUser = await db.user.findUnique({
    where: { id: user.id },
    select: { isAdmin: true },
  });
  if (fullUser?.isAdmin) {
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
        reason: "not_found",
      };
    }
    return { ok: true, user, project, role: "admin" as const };
  }

  // 3. Fetch the project (just the fields we need for auth decision)
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
      reason: "not_found",
    };
  }

  // 4. Owner has full access (any role)
  if (project.ownerId === user.id) {
    return { ok: true, user, project, role: "owner" };
  }

  // 5. Check ProjectMember record for non-owners
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
      reason: "insufficient_role",
      requiredRole,
      currentRole: "none",
    };
  }

  // 6. Check role sufficiency
  const userRank = ROLE_RANK[membership.role] ?? 0;
  const requiredRank = ROLE_RANK[requiredRole] ?? 1;

  if (userRank < requiredRank) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Pro tuto akci je vyžadována role „${roleLabel(
            requiredRole,
          )}" nebo vyšší.`,
          code: "INSUFFICIENT_ROLE",
          requiredRole,
          currentRole: membership.role,
        },
        { status: 403 },
      ),
      reason: "insufficient_role",
      requiredRole,
      currentRole: membership.role,
    };
  }

  // 7. Access granted — narrow role to the known union
  const role: "editor" | "viewer" =
    membership.role === "editor" ? "editor" : "viewer";
  return { ok: true, user, project, role };
}
