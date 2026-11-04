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
    // Includes soft-deleted users (deletedAt set) so admins can see
    // "pending deletion" accounts in the admin panel.
    //
    // SECURITY (audit fix L3): mask the e-mail of soft-deleted users.
    // During the 7-day cooling-off period, the user's e-mail is
    // rewritten to `deleted_<userId>_<originalEmail>` — exposing the
    // full original e-mail in this admin response would defeat the
    // purpose of the anonymization (PII would still be visible to
    // admins / in the admin-tab export). We show only a truncated
    // hint so the admin can identify the user, without exposing the
    // full address. Once the cooling-off period expires, the cron
    // permanently anonymizes the row and the original e-mail is
    // irrecoverable.
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
          deletedAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
      // Mask emails of soft-deleted users (deleted_<id>_<originalEmail>).
      // The admin sees `<originalEmail prefix>…@<domain>` instead of the
      // full address — enough to identify the user without leaking PII.
      const masked = allUsers.map((u) => {
        if (u.deletedAt && u.email.startsWith("deleted_")) {
          // Format: `deleted_<userId>_<originalEmail>`
          // Strip prefix, then mask the e-mail part.
          const originalEmail = u.email.replace(/^deleted_[^_]+_/, "");
          const atIndex = originalEmail.lastIndexOf("@");
          if (atIndex > 0) {
            const localPart = originalEmail.slice(0, atIndex);
            const domain = originalEmail.slice(atIndex + 1);
            // Show first 2 chars of local part + "…" + domain.
            const maskedLocal =
              localPart.length > 2 ? localPart.slice(0, 2) + "…" : localPart;
            return {
              ...u,
              email: `${maskedLocal}@${domain}`,
            };
          }
          // Fallback: fully redact if parsing fails.
          return { ...u, email: "[redacted]" };
        }
        return u;
      });
      return NextResponse.json(masked);
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
