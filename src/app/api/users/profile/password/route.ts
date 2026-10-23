import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/authz";
import {
  hashPassword,
  verifyPassword,
  validatePassword,
} from "@/lib/auth-helpers";
import { logAuthEvent } from "@/lib/auth-audit";

// =====================================================================
// POST /api/users/profile/password
// ---------------------------------------------------------------------
// Change the current user's password.
//
// Body: { currentPassword: string, newPassword: string }
//
// Logic:
//   1. requireVerifiedUser() — must be authenticated + e-mail verified
//   2. Fetch user.password from DB
//   3. verifyPassword(currentPassword, user.password) → 400 on mismatch
//   4. validatePassword(newPassword) → 400 on policy violation
//   5. hashPassword(newPassword)
//   6. Update DB: set password + increment tokenVersion (invalidates all
//      other JWT sessions — see jwt callback in auth.ts)
//   7. Log auth_password_change audit event
//   8. Return 200 { ok: true, message: "Heslo bylo změněno." }
//
// Note: the user's CURRENT session remains valid because the jwt callback
// re-syncs `tokenVersion` from the DB on the next periodic check (within
// 60s — see `STALE_MS` in auth.ts). Other sessions (different devices)
// will be invalidated on their next jwt callback run.
// =====================================================================

export async function POST(request: Request) {
  const t = await getTranslations("api.errors");
  try {
    const { user, response } = await requireVerifiedUser();
    if (response) return response;
    if (!user) {
      return NextResponse.json(
        { error: t("auth.notAuthenticated") },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: t("generic.invalidRequest") },
        { status: 400 },
      );
    }

    const { currentPassword, newPassword } = body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (typeof currentPassword !== "string" || !currentPassword) {
      return NextResponse.json(
        { error: t("password.currentRequired") },
        { status: 400 },
      );
    }
    if (typeof newPassword !== "string" || !newPassword) {
      return NextResponse.json(
        { error: t("password.newRequired") },
        { status: 400 },
      );
    }

    // Fetch the current password hash
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { password: true },
    });

    if (!dbUser) {
      return NextResponse.json(
        { error: t("users.userNotFound") },
        { status: 404 },
      );
    }

    // OAuth-only users don't have a password — they can't change it here.
    // (They would need to use the forgot-password flow to set one.)
    if (!dbUser.password) {
      return NextResponse.json(
        { error: t("users.noPasswordSet") },
        { status: 400 },
      );
    }

    // Verify the current password
    const isCurrentValid = await verifyPassword(currentPassword, dbUser.password);
    if (!isCurrentValid) {
      // Log failed attempt (security audit)
      await logAuthEvent(user.id, "password_change", false, {
        reason: "invalid_current_password",
      });
      return NextResponse.json(
        { error: t("password.incorrectCurrent") },
        { status: 400 },
      );
    }

    // Validate the new password against our policy
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      await logAuthEvent(user.id, "password_change", false, {
        reason: "weak_password",
      });
      return NextResponse.json(
        { error: passwordError },
        { status: 400 },
      );
    }

    // Hash + save. Incrementing tokenVersion invalidates all OTHER sessions
    // (their JWTs will fail the tokenVersion check in the jwt callback).
    const newHash = await hashPassword(newPassword);
    await db.user.update({
      where: { id: user.id },
      data: {
        password: newHash,
        tokenVersion: { increment: 1 },
      },
    });

    // Log successful password change
    await logAuthEvent(user.id, "password_change", true);

    return NextResponse.json({
      ok: true,
      message: t("password.changed"),
    });
  } catch (error) {
    console.error("POST /api/users/profile/password error:", error);
    return NextResponse.json(
      { error: t("password.changeFailed") },
      { status: 500 },
    );
  }
}
