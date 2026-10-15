import { NextResponse } from "next/server";
import { verifyResetToken } from "@/lib/email";

// =====================================================================
// GET /api/auth/verify-token?type=reset&token=...
// ---------------------------------------------------------------------
// Validates a token without consuming it. Used by the reset-password
// page to check token validity on mount (before showing the form).
//
// Query params:
//   type: "reset" | "verify" (currently only "reset" is implemented)
//   token: the token to validate
//
// Returns:
//   200 { valid: true } if token is valid + not expired
//   200 { valid: false, reason: "invalid" | "expired" } if invalid
//   400 if type or token is missing
// =====================================================================

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const token = searchParams.get("token");

  if (!type || !token) {
    return NextResponse.json(
      { error: "type a token jsou povinné." },
      { status: 400 },
    );
  }

  if (type === "reset") {
    const result = await verifyResetToken(token);
    if (result.success) {
      return NextResponse.json({ valid: true });
    }
    return NextResponse.json({ valid: false, reason: result.reason });
  }

  // For "verify" type, we don't expose token validity (security: don't
  // reveal whether a verification token exists for a specific e-mail).
  // The verify-email GET endpoint handles verification directly.
  return NextResponse.json(
    { error: "Neplatný typ tokenu." },
    { status: 400 },
  );
}
