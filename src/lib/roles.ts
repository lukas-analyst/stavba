"use client";

// =====================================================================
// Shared role-based UI helpers
// ---------------------------------------------------------------------
// Used by `AppSidebar` and the `ProjectManagementTab` to compute the
// current user's role within a project and to check whether a given
// role clears an item's `minRole` bar.
//
// The role hierarchy is:
//   viewer (1) → editor (2) → owner (3) → admin (4)
//
// `admin` is a global flag (`user.isAdmin === true`) and bypasses every
// project role check. Project-scoped roles come from `project.ownerId`
// (→ "owner") or `project.members[].role` (→ "viewer" | "editor").
// =====================================================================

import type { Session } from "next-auth";
import type { Project, ProjectMembersResponse } from "./api";

export type ProjectRole = "viewer" | "editor" | "owner" | "admin";

// Numeric rank for each role. Higher rank = more permissions.
// `admin` is intentionally above `owner` so it clears every `minRole`.
export const ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
  admin: 4,
};

/**
 * Compute the current user's role within a project.
 *
 * Resolution order (first match wins):
 *   1. No session / no selected project → "viewer" (most restrictive
 *      fallback — the sidebar will hide every restricted item).
 *   2. `session.user.isAdmin === true` → "admin" (global bypass).
 *   3. `project.ownerId === session.user.id` → "owner".
 *   4. Found in `members` array → that membership's role
 *      ("editor" or "viewer"). Unknown roles fall back to "viewer".
 *   5. Otherwise → "viewer".
 *
 * The `members` array is optional — if it isn't loaded yet, we still
 * resolve owner/admin correctly (so the sidebar doesn't flicker
 * restricted tabs while members are loading).
 */
export function computeUserRole(params: {
  session: Session | null;
  projectId: string | null;
  project?: Pick<Project, "ownerId"> | undefined;
  members?: ProjectMembersResponse["members"] | undefined;
}): ProjectRole {
  const { session, projectId, project, members } = params;
  if (!session?.user || !projectId) return "viewer";

  // Admin bypass — global admin flag from the JWT (refreshed every 60s).
  if ((session.user as { isAdmin?: boolean }).isAdmin) return "admin";

  const userId = (session.user as { id?: string }).id;
  if (!userId) return "viewer";

  // Owner — direct ownership of the project.
  if (project?.ownerId && project.ownerId === userId) return "owner";

  // Member — look up the membership row for this user.
  if (members && members.length > 0) {
    const member = members.find((m) => m.user.id === userId);
    if (member) {
      return member.role === "editor" ? "editor" : "viewer";
    }
  }

  return "viewer";
}

/**
 * Returns true if `role` clears the `minRole` bar.
 * Items without `minRole` default to "viewer" (everyone can see them).
 */
export function roleClears(
  role: ProjectRole,
  minRole?: ProjectRole,
): boolean {
  const required = minRole ?? "viewer";
  return ROLE_RANK[role] >= ROLE_RANK[required];
}
