import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireUser } from "@/lib/authz";

// =====================================================================
// POST /api/invitations/[token]/accept
// ---------------------------------------------------------------------
// Accepts a project invitation. The currently signed-in user becomes
// a member of the project with the role specified in the invitation.
//
// Rules:
//   1. Must be signed in (requireUser)
//   2. Invitation must exist (by token) → else 404
//   3. Invitation status must be "pending" → else 400
//   4. Invitation must not be expired → else 400
//   5. The signed-in user's e-mail must match invitation.inviteeEmail
//      → else 403 (prevents someone from accepting an invitation
//      that was sent to a different address)
//
// On success:
//   - Creates a ProjectMember record (idempotent — if already a member,
//     no error)
//   - Marks invitation as accepted (status="accepted", acceptedAt=now)
//   - Audit log
//   - Returns 200 { ok: true, projectId }
// =====================================================================

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { user, response } = await requireUser();
  if (response || !user) return response!;

  const t = await getTranslations("api.errors");
  try {
    const { token } = await params;

    const invitation = await db.projectInvitation.findUnique({
      where: { token },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: t("invitations.notFound") },
        { status: 404 },
      );
    }

    if (invitation.status !== "pending") {
      return NextResponse.json(
        { error: t("invitations.alreadyUsed") },
        { status: 400 },
      );
    }

    const now = new Date();
    if (invitation.expiresAt < now) {
      // Mark as expired so the listing endpoint reflects reality.
      await db.projectInvitation.update({
        where: { id: invitation.id },
        data: { status: "expired" },
      });
      return NextResponse.json(
        { error: t("invitations.expired") },
        { status: 400 },
      );
    }

    // The signed-in user's e-mail must match the invitee e-mail.
    if (
      !user.email ||
      user.email.trim().toLowerCase() !== invitation.inviteeEmail
    ) {
      return NextResponse.json(
        { error: t("invitations.notYourEmail") },
        { status: 403 },
      );
    }

    // Create the membership. Use upsert so we're idempotent if a member
    // row already exists (e.g., from a race with the signIn auto-accept).
    const validRole =
      invitation.role === "editor" ? "editor" : "viewer";

    await db.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: invitation.projectId,
          userId: user.id,
        },
      },
      create: {
        projectId: invitation.projectId,
        userId: user.id,
        role: validRole,
      },
      update: {
        // Don't downgrade a user who already has higher access via
        // a separate membership flow. If they already exist as a member,
        // leave the role untouched.
      },
    });

    // Mark the invitation as accepted.
    await db.projectInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "accepted",
        acceptedAt: now,
      },
    });

    // Audit log
    await logChanges(
      invitation.projectId,
      "ProjectMember",
      user.id,
      "create",
      null,
      {
        userId: user.id,
        userEmail: user.email,
        role: validRole,
      },
    );

    return NextResponse.json(
      { ok: true, projectId: invitation.projectId },
      { status: 200 },
    );
  } catch (error) {
    console.error("POST /api/invitations/[token]/accept error:", error);
    return NextResponse.json(
      { error: t("invitations.acceptFailed") },
      { status: 500 },
    );
  }
}
