import { NextResponse } from "next/server";
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
  try {
    // --- Rate limiting (IP-based: 3 requests per hour) ---
    const ip = getClientIp(request);
    const rl = checkRateLimit(`forgot:${ip}`, RESET_REQUEST_RATE_LIMIT);
    if (rl.limited) {
      const minutes = Math.ceil(rl.retryAfter / 60);
      return NextResponse.json(
        { error: `Příliš mnoho požadavků. Zkuste to za ${minutes} minut.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const body = await request.json();
    const { email } = body as { email?: string };

    if (!email) {
      return NextResponse.json(
        { error: "E-mail je povinný." },
        { status: 400 },
      );
    }

    await sendPasswordResetEmail(email.trim().toLowerCase());

    // Always return OK — don't reveal whether the e-mail exists
    return NextResponse.json({
      ok: true,
      message: "Pokud účet existuje, e-mail s odkazem pro reset byl odeslán.",
    });
  } catch (error) {
    console.error("POST /api/auth/forgot-password error:", error);
    // Still return OK to avoid enumeration
    return NextResponse.json({
      ok: true,
      message: "Pokud účet existuje, e-mail s odkazem pro reset byl odeslán.",
    });
  }
}
