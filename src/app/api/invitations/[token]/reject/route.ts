import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireUser } from "@/lib/authz";
import { parseParam, tokenSchema } from "@/lib/api-validation";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { user, response } = await requireUser();
  if (response || !user) return response!;

  const t = await getTranslations("api.errors");
  try {
    const { token: rawToken } = await params;
    const tokenResult = parseParam(tokenSchema, rawToken, t);
    if (!tokenResult.success) return tokenResult.response;
    const token = tokenResult.data;

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
      await db.projectInvitation.update({
        where: { id: invitation.id },
        data: { status: "expired" },
      });
      return NextResponse.json(
        { error: t("invitations.expired") },
        { status: 400 },
      );
    }

    if (
      !user.email ||
      user.email.trim().toLowerCase() !== invitation.inviteeEmail
    ) {
      return NextResponse.json(
        { error: t("invitations.notYourEmail") },
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
      { error: t("invitations.rejectFailed") },
      { status: 500 },
    );
  }
}
