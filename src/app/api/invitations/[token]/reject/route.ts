import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireUser } from "@/lib/authz";

// =====================================================================
// POST /api/invitations/[token]/reject
// ---------------------------------------------------------------------
// Rejects a project invitation. The signed-in user explicitly declines
// the invitation — no ProjectMember is created.
//
// Rules:
//   1. Must be signed in (requireUser)
//   2. Invitation must exist (by token) → else 404
//   3. Invitation status must be "pending" → else 400
//   4. Invitation must not be expired → else 400
//   5. The signed-in user's e-mail must match invitation.inviteeEmail
//      → else 403
//
// On success:
//   - Marks invitation as rejected (status="rejected")
//   - Audit log
//   - Returns 200 { ok: true }
// =====================================================================

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { user, response } = await requireUser();
  if (response || !user) return response!;

  try {
    const { token } = await params;

    const invitation = await db.projectInvitation.findUnique({
      where: { token },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Pozvánka nebyla nalezena." },
        { status: 404 },
      );
    }

    if (invitation.status !== "pending") {
      return NextResponse.json(
        { error: "Pozvánka již byla použita." },
        { status: 400 },
      );
    }

    const now = new Date();
    if (invitation.expiresAt < now) {
      await db.projectInvitation.update({
        where: { id: invitation.id },
        data: { status: "expired" },
      });
      return NextResponse.json(
        { error: "Pozvánka vypršela." },
        { status: 400 },
      );
    }

    if (
      !user.email ||
      user.email.trim().toLowerCase() !== invitation.inviteeEmail
    ) {
      return NextResponse.json(
        { error: "Tato pozvánka není pro váš e-mail." },
        { status: 403 },
      );
    }

    await db.projectInvitation.update({
      where: { id: invitation.id },
      data: { status: "rejected" },
    });

    // Audit log — record the rejection as an invitation update.
    await logChanges(
      invitation.projectId,
      "ProjectInvitation",
      invitation.id,
      "update",
      { status: "pending" },
      { status: "rejected", inviteeEmail: invitation.inviteeEmail },
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("POST /api/invitations/[token]/reject error:", error);
    return NextResponse.json(
      { error: "Nepodařilo se odmítnout pozvánku." },
      { status: 500 },
    );
  }
}
