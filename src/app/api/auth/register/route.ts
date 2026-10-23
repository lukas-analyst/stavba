import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import {
  hashPassword,
  validatePassword,
  validateEmail,
  validateName,
  normalizeEmail,
} from "@/lib/auth-helpers";
import { sendVerificationEmail } from "@/lib/email";
import { checkRateLimit, getClientIp, REGISTER_RATE_LIMIT } from "@/lib/rate-limit";

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
  const t = await getTranslations("api.errors");
  try {
    const body = await request.json();
    const { email, password, name } = body as {
      email?: string;
      password?: string;
      name?: string;
    };

    // --- Rate limiting (IP-based: 3 registrations per hour) ---
    const ip = getClientIp(request);
    const rl = checkRateLimit(`register:${ip}`, REGISTER_RATE_LIMIT);
    if (rl.limited) {
      const minutes = Math.ceil(rl.retryAfter / 60);
      return NextResponse.json(
        { error: t("auth.rateLimit.register", { minutes }) },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    // --- Validation ---
    if (!email || !password) {
      return NextResponse.json(
        { error: t("auth.emailAndPasswordRequired") },
        { status: 400 },
      );
    }

    const emailError = validateEmail(email);
    if (emailError) {
      return NextResponse.json({ error: emailError }, { status: 400 });
    }

    // Validate name if provided (optional field)
    if (name !== undefined && name !== null && name.trim()) {
      const nameError = validateName(name);
      if (nameError) {
        return NextResponse.json({ error: nameError }, { status: 400 });
      }
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const normalizedEmail = normalizeEmail(email);

    // --- Find existing user ---
    // Also check for linked OAuth accounts to prevent account takeover
    // (S7): if a user already has a Google Account linked, we must NOT
    // allow setting a password via registration — that would let an
    // attacker who knows the e-mail take over the account.
    const existing = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        password: true,
        name: true,
        accounts: {
          select: { provider: true },
          take: 1,
        },
      },
    });

    if (existing && existing.password) {
      // Scenario 3: already registered with password
      return NextResponse.json(
        { error: t("auth.accountExists") },
        { status: 409 },
      );
    }

    // --- Hash the password ---
    const passwordHash = await hashPassword(password);

    try {
      if (existing) {
        // Scenario 2: account claiming
        // SECURITY (S7): Only allow claiming if the existing user has NO
        // linked OAuth account. If they have a Google Account, they are a
        // real Google user — not a ghost user — and must NOT be claimable
        // via password registration. This prevents account takeover.
        const hasOAuthAccount = existing.accounts.length > 0;
        if (hasOAuthAccount) {
          return NextResponse.json(
            { error: t("auth.accountExists") },
            { status: 409 },
          );
        }

        // Safe to claim — this is a genuine ghost user.
        // Use updateMany with conditional where clause to prevent race
        // condition: only update if password is still null (another
        // concurrent request might have claimed it already).
        const result = await db.user.updateMany({
          where: { id: existing.id, password: null },
          data: {
            password: passwordHash,
            tokenVersion: { increment: 1 },
            ...(existing.name ? {} : { name: name?.trim() || null }),
          },
        });

        if (result.count === 0) {
          // Another request claimed this account between our check and
          // update — treat as already registered.
          return NextResponse.json(
            { error: t("auth.accountExists") },
            { status: 409 },
          );
        }
      } else {
        // Scenario 1: new user — use create with catch for P2002
        // (race condition: another request created the same e-mail)
        await db.user.create({
          data: {
            email: normalizedEmail,
            name: name?.trim() || null,
            password: passwordHash,
          },
        });
      }
    } catch (error: unknown) {
      // Prisma P2002 = unique constraint violation (concurrent registration)
      const code = (error as { code?: string })?.code;
      if (code === "P2002") {
        return NextResponse.json(
          { error: t("auth.accountExists") },
          { status: 409 },
        );
      }
      throw error; // re-throw to be caught by outer catch
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
          warning: t("auth.registerWarningEmailFailed"),
        },
        { status: 201 },
      );
    }

    return NextResponse.json(
      { ok: true, message: t("auth.registerSuccess") },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/auth/register error:", error);
    return NextResponse.json(
      { error: t("auth.registerFailed") },
      { status: 500 },
    );
  }
}
