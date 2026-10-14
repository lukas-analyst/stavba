import { NextResponse } from "next/server";
import { verifyEmailToken, sendVerificationEmail } from "@/lib/email";
import { db } from "@/lib/db";
import { checkRateLimit, getClientIp, VERIFY_RESEND_RATE_LIMIT } from "@/lib/rate-limit";
import { isValidTokenFormat } from "@/lib/auth-helpers";

// =====================================================================
// GET /api/auth/verify-email?token=...
// ---------------------------------------------------------------------
// Verifies the e-mail verification token from the URL.
// On success: marks the user's emailVerified = now + clears the token.
// Redirects to /auth/verify-email?status=valid|expired|invalid|missing
// =====================================================================

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(`${origin}/auth/verify-email?status=missing`);
  }

  // Validate token format (64 hex chars) — prevents unnecessary DB queries
  if (!isValidTokenFormat(token)) {
    return NextResponse.redirect(`${origin}/auth/verify-email?status=invalid`);
  }

  try {
    const result = await verifyEmailToken(token);

    if (!result.success) {
      // Map reason to URL status param
      const statusMap: Record<string, string> = {
        expired: "expired",
        invalid: "invalid",
        already: "already",
      };
      const status = statusMap[result.reason] ?? "invalid";
      return NextResponse.redirect(`${origin}/auth/verify-email?status=${status}`);
    }

    // Success — redirect to the success page
    return NextResponse.redirect(`${origin}/auth/verify-email?status=valid`);
  } catch (error) {
    console.error("GET /api/auth/verify-email error:", error);
    return NextResponse.redirect(`${origin}/auth/verify-email?status=error`);
  }
}

// =====================================================================
// POST /api/auth/verify-email
// ---------------------------------------------------------------------
// Resend the verification e-mail. Used by the verify-pending page.
// Body: { email: string }
// =====================================================================

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body as { email?: string };

    if (!email) {
      return NextResponse.json(
        { error: "E-mail je povinný." },
        { status: 400 },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Rate limit: 3 resends per hour per e-mail (prevents e-mail flooding)
    const rl = checkRateLimit(`verify-resend:${normalizedEmail}`, VERIFY_RESEND_RATE_LIMIT);
    if (rl.limited) {
      const minutes = Math.ceil(rl.retryAfter / 60);
      return NextResponse.json(
        { error: `Příliš mnoho požadavků. Zkuste to za ${minutes} minut.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true, emailVerified: true },
    });

    if (!user) {
      // Don't reveal that the e-mail doesn't exist
      return NextResponse.json({ ok: true });
    }

    if (user.emailVerified) {
      return NextResponse.json(
        { error: "Váš e-mail je již ověřen. Můžete se přihlásit." },
        { status: 400 },
      );
    }

    await sendVerificationEmail(normalizedEmail, user.name);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/auth/verify-email error:", error);
    return NextResponse.json(
      { error: "Odeslání verifikačního e-mailu selhalo." },
      { status: 500 },
    );
  }
}
