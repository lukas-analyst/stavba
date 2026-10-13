import { NextResponse } from "next/server";
import { sendPasswordResetEmail } from "@/lib/email";

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
