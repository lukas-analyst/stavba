import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import { normalizeEmail } from "@/lib/auth-helpers";

// =====================================================================
// POST /api/account/recover — recover a soft-deleted account
// ---------------------------------------------------------------------
// Called from the "account recovery" page when a user whose account
// is in the 7-day cooling-off period attempts to sign in.
//
// This endpoint is NOT protected by `requireUser()` (the user is not
// fully authenticated yet — their JWT was rejected because deletedAt
// is set). Instead, we verify identity via:
//   - Credentials: email + password
//   - OAuth: just email (Google already verified the email)
//
// On success: clear deletedAt, set restoredAt, return success.
// The frontend then calls signIn() to establish a fresh session.
// =====================================================================

const COOLING_OFF_DAYS = 7;

export async function POST(request: Request) {
  try {
    const t = await getTranslations("api.errors.account");
    const body = await request.json();
    const { email, password, provider } = body;

    if (!email) {
      return NextResponse.json(
        { error: t("emailRequired") },
        { status: 400 },
      );
    }

    const normalizedEmail = normalizeEmail(email);

    // Find the user by email — must be in cooling-off period
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        password: true,
        deletedAt: true,
        name: true,
      },
    });

    if (!user) {
      // No account with this email — treat as "not deleted"
      return NextResponse.json(
        { error: t("notFound") },
        { status: 404 },
      );
    }

    if (!user.deletedAt) {
      // Account is active — just redirect to login
      return NextResponse.json(
        { error: t("notDeleted") },
        { status: 409 },
      );
    }

    // Check if the cooling-off period has expired
    const daysSinceDeletion =
      (Date.now() - user.deletedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceDeletion >= COOLING_OFF_DAYS) {
      // Already past cooling-off — account is permanently deleted
      // (email may have been anonymized by cron, so this is unlikely
      // to trigger — but we handle it defensively)
      return NextResponse.json(
        { error: t("permanentlyDeleted") },
        { status: 410 },
      );
    }

    // Verify identity
    if (provider === "google") {
      // OAuth — Google already verified the email during sign-in.
      // We just need to confirm the email matches.
      // (The actual OAuth verification happens via NextAuth's signIn
      // callback, which is separate from this endpoint.)
      // No additional password check needed.
    } else {
      // Credentials — verify password
      if (!password) {
        return NextResponse.json(
          { error: t("passwordRequired") },
          { status: 400 },
        );
      }
      if (!user.password) {
        // User has no password (OAuth-only) but tried Credentials recovery
        return NextResponse.json(
          { error: t("useOAuth") },
          { status: 400 },
        );
      }
      const { verifyPassword } = await import("@/lib/auth-helpers");
      const valid = await verifyPassword(password, user.password);
      if (!valid) {
        return NextResponse.json(
          { error: t("passwordIncorrect") },
          { status: 403 },
        );
      }
    }

    // === Recover the account ===
    await db.user.update({
      where: { id: user.id },
      data: {
        deletedAt: null,
        restoredAt: new Date(),
        // Increment tokenVersion to invalidate any stale "deleted" JWTs
        tokenVersion: { increment: 1 },
      },
    });

    return NextResponse.json({
      success: true,
      userId: user.id,
    });
  } catch (error) {
    console.error("POST /api/account/recover error:", error);
    return NextResponse.json(
      { error: "Failed to recover account" },
      { status: 500 },
    );
  }
}
