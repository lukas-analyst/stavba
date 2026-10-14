import { NextResponse } from "next/server";
import { verifyResetToken, clearResetToken } from "@/lib/email";
import { hashPassword, validatePassword } from "@/lib/auth-helpers";
import { db } from "@/lib/db";

// =====================================================================
// POST /api/auth/reset-password
// ---------------------------------------------------------------------
// Body: { token: string, password: string }
//
// Verifies the reset token, then sets the new password.
// Clears the token on success.
// =====================================================================

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, password } = body as { token?: string; password?: string };

    if (!token || !password) {
      return NextResponse.json(
        { error: "Token a nové heslo jsou povinné." },
        { status: 400 },
      );
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const result = verifyResetToken;

    const tokenResult = await verifyResetToken(token);

    if (!tokenResult.success) {
      const message =
        tokenResult.reason === "expired"
          ? "Odkaz pro reset hesla vypršel. Vyžádejte si nový."
          : "Neplatný odkaz pro reset hesla.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // Set the new password
    const passwordHash = await hashPassword(password);

    await db.user.update({
      where: { id: tokenResult.userId },
      data: { password: passwordHash },
    });

    // Clear the reset token
    await clearResetToken(tokenResult.userId);

    return NextResponse.json({
      ok: true,
      message: "Heslo bylo úspěšně změněno. Můžete se přihlásit.",
    });
  } catch (error) {
    console.error("POST /api/auth/reset-password error:", error);
    return NextResponse.json(
      { error: "Reset hesla selhal." },
      { status: 500 },
    );
  }
}
