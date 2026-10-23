import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkRateLimit, getClientIp, RESET_REQUEST_RATE_LIMIT } from "@/lib/rate-limit";

// =====================================================================
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------
// Body: { email: string }
//
// Sends a password-reset e-mail if the account exists. Always returns
// 200 OK (even if the e-mail doesn't exist) to prevent enumeration.
// =====================================================================

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

    const body = await request.json();
    const { email } = body as { email?: string };

    if (!email) {
      return NextResponse.json(
        { error: t("auth.emailRequired") },
        { status: 400 },
      );
    }

    await sendPasswordResetEmail(email.trim().toLowerCase());

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
