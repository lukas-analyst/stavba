import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/authz";
import { verifyPassword } from "@/lib/auth-helpers";
import { getTranslations } from "next-intl/server";

// =====================================================================
// DELETE /api/account — soft-delete the current user's account
// ---------------------------------------------------------------------
// Implements account deletion with a 7-day cooling-off period:
//
//   1. Verify identity:
//      - Credentials users must provide their password
//      - OAuth (Google) users must type their email address
//   2. Soft-delete: set deletedAt = now(), increment tokenVersion
//      (kills all active sessions via JWT callback)
//   3. Remove all project memberships (ProjectMember rows)
//   4. Expire pending invitations sent to the user's email
//   5. Delete NextAuth Account rows (so Google login creates a NEW
//      account if they sign in again, not restoring the old one)
//
// During the 7-day cooling-off period, the user can recover the
// account by signing in (deletedAt is cleared in the signIn callback).
// After 7 days, a cron job (/api/cron/finalize-deletions) anonymizes
// the email and name permanently.
//
// Projects owned by the user remain in the DB (orphaned). Other
// members still see them with a "Bez vlastníka" badge.
// =====================================================================

const COOLING_OFF_DAYS = 7;

export async function DELETE(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const t = await getTranslations("api.errors.account");
    const body = await request.json();
    const { password, emailConfirm, acknowledged } = body;

    // Require the "I understand" checkbox
    if (!acknowledged) {
      return NextResponse.json(
        { error: t("mustAcknowledge") },
        { status: 400 },
      );
    }

    // Fetch the full user record (including password + provider info)
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        password: true,
        deletedAt: true,
      },
    });

    if (!dbUser) {
      return NextResponse.json(
        { error: t("notFound") },
        { status: 404 },
      );
    }

    // Already deleted?
    if (dbUser.deletedAt) {
      return NextResponse.json(
        { error: t("alreadyDeleted") },
        { status: 409 },
      );
    }

    // Verify identity based on auth provider
    if (dbUser.password) {
      // Credentials user — verify password
      if (!password) {
        return NextResponse.json(
          { error: t("passwordRequired") },
          { status: 400 },
        );
      }
      const valid = await verifyPassword(password, dbUser.password);
      if (!valid) {
        return NextResponse.json(
          { error: t("passwordIncorrect") },
          { status: 403 },
        );
      }
    } else {
      // OAuth (Google) user — verify email confirmation
      if (!emailConfirm) {
        return NextResponse.json(
          { error: t("emailConfirmRequired") },
          { status: 400 },
        );
      }
      if (emailConfirm.toLowerCase() !== dbUser.email.toLowerCase()) {
        return NextResponse.json(
          { error: t("emailConfirmMismatch") },
          { status: 403 },
        );
      }
    }

    // === Soft-delete the account ===
    // Use a transaction to ensure all cleanup steps succeed atomically.
    await db.$transaction([
      // 1. Mark as deleted + kill sessions
      db.user.update({
        where: { id: user.id },
        data: {
          deletedAt: new Date(),
          // Increment tokenVersion so all existing JWTs are rejected
          tokenVersion: { increment: 1 },
        },
      }),
      // 2. Remove all project memberships
      db.projectMember.deleteMany({
        where: { userId: user.id },
      }),
      // 3. Delete NextAuth Account (OAuth link) — so Google sign-in
      //    creates a NEW account, not restoring the deleted one
      db.account.deleteMany({
        where: { userId: user.id },
      }),
      // 4. Expire pending invitations sent to this email
      db.projectInvitation.updateMany({
        where: {
          inviteeEmail: dbUser.email,
          status: "pending",
        },
        data: { status: "expired" },
      }),
    ]);

    // Compute the permanent deletion date for the response
    const permanentDeletionDate = new Date(
      Date.now() + COOLING_OFF_DAYS * 24 * 60 * 60 * 1000,
    );

    return NextResponse.json({
      success: true,
      permanentDeletionDate: permanentDeletionDate.toISOString(),
      coolingOffDays: COOLING_OFF_DAYS,
    });
  } catch (error) {
    console.error("DELETE /api/account error:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 },
    );
  }
}
