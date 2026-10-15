import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/authz";

// =====================================================================
// DELETE /api/projects/[id]/invitations/[invitationId]
// ---------------------------------------------------------------------
// Revokes a pending invitation. Only the project owner can revoke.
//
// We don't hard-delete the row — we mark it `status = "revoked"` so the
// audit trail still has the record. (Hard deletion would also be fine
// since AuditLog rows are kept independently, but marking-as-revoked
// preserves the invitation history for the listing endpoint.)
// =====================================================================

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; invitationId: string }> },
) {
  const { id, invitationId } = await params;
  const access = await requireProjectAccess(id, "owner");
  if (!access.ok) return access.response;

  try {
    const invitation = await db.projectInvitation.findFirst({
      where: { id: invitationId, projectId: id },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Pozvánka nebyla nalezena." },
        { status: 404 },
      );
    }

    // Already in a terminal state — no-op (idempotent).
    if (invitation.status !== "pending") {
      return NextResponse.json({ ok: true });
    }

    await db.projectInvitation.update({
      where: { id: invitation.id },
      data: { status: "revoked" },
    });

    // Audit log: invitation revoked
    await logChanges(
      id,
      "ProjectInvitation",
      invitation.id,
      "update",
      { status: invitation.status },
      { status: "revoked", inviteeEmail: invitation.inviteeEmail },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/projects/[id]/invitations/[invitationId] error:", error);
    return NextResponse.json(
      { error: "Nepodařilo se zrušit pozvánku." },
      { status: 500 },
    );
  }
}
