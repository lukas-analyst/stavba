import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { verifyResetToken } from "@/lib/email";
import { hashPassword } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { checkRateLimit, getClientIp, RESET_SUBMIT_RATE_LIMIT } from "@/lib/rate-limit";
import { passwordSchema, tokenSchema, parseBody } from "@/lib/api-validation";

// =====================================================================
// POST /api/auth/reset-password
// ---------------------------------------------------------------------
// Body: { token: string, password: string }
//
// Verifies the reset token, then sets the new password.
// Clears the token on success.
// =====================================================================

const resetPasswordBodySchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
});

export async function POST(request: Request) {
  const t = await getTranslations("api.errors");
  try {
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

    // Parse + validate body. `tokenSchema` validates 64-hex format
    // (replaces the manual `isValidTokenFormat` check) + `passwordSchema`
    // validates password policy (replaces `validatePassword`).
    const result = await parseBody(resetPasswordBodySchema, request, t);
    if (!result.success) return result.response;
    const { token, password } = result.data;

    const tokenResult = await verifyResetToken(token);

    if (!tokenResult.success) {
      const code =
        tokenResult.reason === "expired" ? "TOKEN_EXPIRED" : "TOKEN_INVALID";
      const message =
        tokenResult.reason === "expired"
          ? t("auth.resetLinkExpired")
          : t("auth.invalidResetLink");
      return NextResponse.json({ error: message, code }, { status: 400 });
    }

    // Set the new password + clear reset token + increment tokenVersion
    // to invalidate all existing JWT sessions (S10 — "Odhlásit všude").
    //
    // Use atomic conditional updateMany: only updates if the token still
    // matches (prevents race condition if another request uses the same
    // token concurrently). This combines password update + token clear
    // + tokenVersion increment into a single atomic operation.
    const passwordHash = await hashPassword(password);

    const result2 = await db.user.updateMany({
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

    if (result2.count === 0) {
      // Token was used by another request between our verify and update
      return NextResponse.json(
        { error: t("auth.resetLinkUsed"), code: "TOKEN_USED" },
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
