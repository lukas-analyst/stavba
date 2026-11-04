import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/authz";
import { parseParam, cuidSchema } from "@/lib/api-validation";

// =====================================================================
// DELETE /api/projects/[id]/invitations/[invitationId]
// ---------------------------------------------------------------------
// Revokes a pending invitation. Only the project owner can revoke.
// =====================================================================

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; invitationId: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId, invitationId: rawInvitationId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;
    const invitationIdResult = parseParam(cuidSchema, rawInvitationId, t);
    if (!invitationIdResult.success) return invitationIdResult.response;
    const invitationId = invitationIdResult.data;

    const access = await requireProjectAccess(id, "owner");
    if (!access.ok) return access.response;

    const invitation = await db.projectInvitation.findFirst({
      where: { id: invitationId, projectId: id },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: t("invitations.notFound") },
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
      { error: t("invitations.cancelFailed") },
      { status: 500 },
    );
  }
}
