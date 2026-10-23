import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { verifyResetToken } from "@/lib/email";
import {
  hashPassword,
  validatePassword,
  isValidTokenFormat,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { checkRateLimit, getClientIp, RESET_SUBMIT_RATE_LIMIT } from "@/lib/rate-limit";

// =====================================================================
// POST /api/auth/reset-password
// ---------------------------------------------------------------------
// Body: { token: string, password: string }
//
// Verifies the reset token, then sets the new password.
// Clears the token on success.
// =====================================================================

export async function POST(request: Request) {
  const t = await getTranslations("api.errors");
  try {
    const body = await request.json();
    const { token, password } = body as { token?: string; password?: string };

    // --- Rate limiting (IP-based: 5 per hour) ---
    const ip = getClientIp(request);
    const rl = checkRateLimit(`reset:${ip}`, RESET_SUBMIT_RATE_LIMIT);
    if (rl.limited) {
      const minutes = Math.ceil(rl.retryAfter / 60);
      return NextResponse.json(
        { error: t("auth.rateLimit.attempts", { minutes }) },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    if (!token || !password) {
      return NextResponse.json(
        { error: t("auth.tokenAndPasswordRequired") },
        { status: 400 },
      );
    }

    // Validate token format (64 hex chars) — prevents unnecessary DB queries
    if (!isValidTokenFormat(token)) {
      return NextResponse.json(
        { error: t("auth.invalidResetLink") },
        { status: 400 },
      );
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const tokenResult = await verifyResetToken(token);

    if (!tokenResult.success) {
      const message =
        tokenResult.reason === "expired"
          ? t("auth.resetLinkExpired")
          : t("auth.invalidResetLink");
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // Set the new password + clear reset token + increment tokenVersion
    // to invalidate all existing JWT sessions (S10 — "Odhlásit všude").
    //
    // Use atomic conditional updateMany: only updates if the token still
    // matches (prevents race condition if another request uses the same
    // token concurrently). This combines password update + token clear
    // + tokenVersion increment into a single atomic operation.
    const passwordHash = await hashPassword(password);

    const result = await db.user.updateMany({
      where: {
        id: tokenResult.userId,
        passwordResetToken: token,
        passwordResetExpiry: { gt: new Date() },
      },
      data: {
        password: passwordHash,
        passwordResetToken: null,
        passwordResetExpiry: null,
        tokenVersion: { increment: 1 },
      },
    });

    if (result.count === 0) {
      // Token was used by another request between our verify and update
      return NextResponse.json(
        { error: t("auth.resetLinkUsed") },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: t("auth.resetSuccess"),
    });
  } catch (error) {
    console.error("POST /api/auth/reset-password error:", error);
    return NextResponse.json(
      { error: t("auth.resetFailed") },
      { status: 500 },
    );
  }
}
