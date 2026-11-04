import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkRateLimit, getClientIp, RESET_REQUEST_RATE_LIMIT } from "@/lib/rate-limit";
import { emailSchema, parseBody } from "@/lib/api-validation";

// =====================================================================
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------
// Body: { email: string }
//
// Sends a password-reset e-mail if the account exists. Always returns
// 200 OK (even if the e-mail doesn't exist) to prevent enumeration.
// =====================================================================

const forgotPasswordBodySchema = z.object({
  email: emailSchema,
});

export async function POST(request: Request) {
  const t = await getTranslations("api.errors");
  try {
    // --- Rate limiting (IP-based: 3 requests per hour) ---
    const ip = getClientIp(request);
    const rl = checkRateLimit(`forgot:${ip}`, RESET_REQUEST_RATE_LIMIT);
    if (rl.limited) {
      const minutes = Math.ceil(rl.retryAfter / 60);
      return NextResponse.json(
        { error: t("auth.rateLimit.requests", { minutes }) },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    // Parse + validate body. `emailSchema` already returns normalized
    // (trim + lowercase) email, so no separate normalizeEmail call needed.
    const result = await parseBody(forgotPasswordBodySchema, request, t);
    if (!result.success) return result.response;
    const { email } = result.data;

    await sendPasswordResetEmail(email);

    // Always return OK — don't reveal whether the e-mail exists
    return NextResponse.json({
      ok: true,
      message: t("auth.forgotPasswordSent"),
    });
  } catch (error) {
    console.error("POST /api/auth/forgot-password error:", error);
    // Still return OK to avoid enumeration
    return NextResponse.json({
      ok: true,
      message: t("auth.forgotPasswordSent"),
    });
  }
}
