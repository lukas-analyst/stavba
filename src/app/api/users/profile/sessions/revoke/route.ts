import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/authz";
import { logAuthEvent } from "@/lib/auth-audit";

// =====================================================================
// POST /api/users/profile/sessions/revoke
// ---------------------------------------------------------------------
// "Odhlásit všude" — invalidate all OTHER sessions for the current user.
//
// No request body.
//
// Logic:
//   1. requireVerifiedUser() — must be authenticated + e-mail verified
//   2. Increment `tokenVersion` on the user record.
//      The jwt callback in auth.ts compares the token's version with
//      the DB version. After increment, any other session's JWT will
//      fail the check (on the next periodic re-check, max 60s) and be
//      revoked — forcing re-authentication on those devices.
//   3. Log auth_session_revoke audit event
//   4. Return 200 { ok: true, message: "Všechny ostatní relace byly odhlášeny." }
//
// Important: the CURRENT session is NOT immediately revoked — the user
// clicking the button keeps their session. Their JWT's `tokenVersion`
// will be re-synced from the DB on the next jwt callback run (max 60s),
// so the current session continues to work.
//
// For immediate sign-out from the current device, the client must
// additionally call `signOut()` from next-auth/react.
// =====================================================================

export async function POST() {
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

    await db.user.update({
      where: { id: user.id },
      data: {
        tokenVersion: { increment: 1 },
      },
    });

    await logAuthEvent(user.id, "session_revoke", true);

    return NextResponse.json({
      ok: true,
      message: t("sessions.allRevoked"),
    });
  } catch (error) {
    console.error("POST /api/users/profile/sessions/revoke error:", error);
    return NextResponse.json(
      { error: t("sessions.revokeFailed") },
      { status: 500 },
    );
  }
}
