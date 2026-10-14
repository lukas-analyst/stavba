import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  hashPassword,
  validatePassword,
  validateEmail,
  normalizeEmail,
} from "@/lib/auth-helpers";
import { sendVerificationEmail } from "@/lib/email";

// =====================================================================
// POST /api/auth/register
// ---------------------------------------------------------------------
// Registration endpoint with "account claiming" support.
//
// Scenarios:
//   1. E-mail doesn't exist → create new user (empty, no projects)
//   2. E-mail exists + password is null → "account claiming":
//      set the password on the existing ghost user. All their projects
//      and data are preserved.
//   3. E-mail exists + password is set → reject: "already registered"
//
// After registration, a verification e-mail is sent (async, non-blocking).
// The user is NOT automatically logged in here — they need to log in
// via the NextAuth Credentials provider (POST /api/auth/callback/credentials).
// This gives us better control over the flow + error handling.
// =====================================================================

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name } = body as {
      email?: string;
      password?: string;
      name?: string;
    };

    // --- Validation ---
    if (!email || !password) {
      return NextResponse.json(
        { error: "E-mail a heslo jsou povinné." },
        { status: 400 },
      );
    }

    const emailError = validateEmail(email);
    if (emailError) {
      return NextResponse.json({ error: emailError }, { status: 400 });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const normalizedEmail = normalizeEmail(email);

    // --- Find existing user ---
    const existing = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, password: true, name: true },
    });

    if (existing && existing.password) {
      // Scenario 3: already registered
      return NextResponse.json(
        {
          error: "Účet s tímto e-mailem již existuje. Přihlaste se nebo si resetujte heslo.",
        },
        { status: 409 },
      );
    }

    // --- Hash the password ---
    const passwordHash = await hashPassword(password);

    if (existing) {
      // Scenario 2: account claiming
      // Update the existing ghost user — preserve their projects, contacts, etc.
      await db.user.update({
        where: { id: existing.id },
        data: {
          password: passwordHash,
          // Only update name if the existing user doesn't have one
          ...(existing.name ? {} : { name: name?.trim() || null }),
        },
      });
    } else {
      // Scenario 1: new user
      await db.user.create({
        data: {
          email: normalizedEmail,
          name: name?.trim() || null,
          password: passwordHash,
        },
      });
    }

    // --- Send verification e-mail (async, non-blocking) ---
    // We await it so we can report errors to the user, but we don't fail
    // the registration if the e-mail fails — the user can request a
    // resend from the verify-pending page.
    try {
      await sendVerificationEmail(normalizedEmail, name?.trim() || null);
    } catch (emailError) {
      console.error("Failed to send verification e-mail:", emailError);
      // Don't fail the registration — the user can resend from the
      // verify-pending page. But we DO return a warning.
      return NextResponse.json(
        {
          ok: true,
          warning: "Registrace proběhla, ale odeslání verifikačního e-mailu selhalo. Můžete si ho nechat zaslat znovu.",
        },
        { status: 201 },
      );
    }

    return NextResponse.json(
      { ok: true, message: "Registrace proběhla. Zkontrolujte svůj e-mail pro ověření." },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/auth/register error:", error);
    return NextResponse.json(
      { error: "Registrace selhala. Zkuste to prosím znovu." },
      { status: 500 },
    );
  }
}
