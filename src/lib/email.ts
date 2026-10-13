import { db } from "@/lib/db";

// =====================================================================
// Brevo (Sendinblue) transactional email service
// ---------------------------------------------------------------------
// Uses Brevo's HTTP API (not SMTP) to send e-mails:
//   POST https://api.brevo.com/v3/smtp/email
//   Headers: api-key: <BREVO_API_KEY>
//   Body: { sender, to, subject, htmlContent }
//
// Free tier: 300 e-mails / day, no credit card required.
//
// The sender address must be verified in the Brevo dashboard
// (Senders & IP → Sender addresses). We use EMAIL_FROM env var.
// =====================================================================

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

type BrevoEmailParams = {
  to: string;
  subject: string;
  htmlContent: string;
};

/**
 * Send a transactional e-mail via the Brevo HTTP API.
 * Returns true on success, throws on failure.
 */
async function sendEmail({ to, subject, htmlContent }: BrevoEmailParams): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.EMAIL_FROM;
  const fromName = process.env.EMAIL_FROM_NAME ?? "Stavba";

  if (!apiKey || !fromEmail) {
    console.error("Brevo not configured: BREVO_API_KEY or EMAIL_FROM missing");
    throw new Error("E-mailová služba není nakonfigurována.");
  }

  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Brevo API error:", res.status, text);
    throw new Error(`Odeslání e-mailu selhalo (HTTP ${res.status}).`);
  }

  return true;
}

// =====================================================================
// E-mail templates
// =====================================================================

function emailShell(innerHtml: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 32px 24px; }
    .card { background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .logo { font-size: 22px; font-weight: 700; color: #0a0a0a; margin-bottom: 8px; }
    .logo .accent { color: #16a34a; }
    h1 { font-size: 20px; font-weight: 600; color: #18181b; margin: 0 0 16px; }
    p { font-size: 15px; line-height: 1.6; color: #52525b; margin: 0 0 16px; }
    .btn { display: inline-block; background: #18181b; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 9999px; font-size: 14px; font-weight: 600; margin: 8px 0 16px; }
    .hint { font-size: 13px; color: #a1a1aa; margin-top: 24px; padding-top: 16px; border-top: 1px solid #f4f4f5; }
    .link-fallback { font-size: 13px; color: #71717a; word-break: break-all; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">Stavba<span class="accent">.</span></div>
      ${innerHtml}
    </div>
  </div>
</body>
</html>`;
}

// =====================================================================
// Verification e-mail
// =====================================================================

const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;

/**
 * Generate a verification token, store it on the user, and send the
 * verification e-mail.
 */
export async function sendVerificationEmail(userEmail: string, userName: string | null): Promise<void> {
  const { generateToken } = await import("@/lib/auth-helpers");
  const token = generateToken();
  const expiry = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  // Store token + expiry on the user record
  await db.user.update({
    where: { email: userEmail },
    data: {
      emailVerifyToken: token,
      emailVerifyExpiry: expiry,
    },
  });

  const verifyUrl = `${process.env.NEXTAUTH_URL}/auth/verify-email?token=${token}`;

  const html = emailShell(`
    <h1>Ověřte svou e-mailovou adresu</h1>
    <p>Ahoj${userName ? ` ${userName}` : ""},</p>
    <p>Děkujeme za registraci v aplikaci Stavba. Pro dokončení registrace a přístup k vašim projektům prosím potvrďte svou e-mailovou adresu.</p>
    <a href="${verifyUrl}" class="btn">Ověřit e-mail</a>
    <p class="link-fallback">Pokud tlačítko nefunguje, zkopírujte tento odkaz do prohlížeče:<br>${verifyUrl}</p>
    <p class="hint">Tento odkaz vyprší za 24 hodin. Pokud jste se neregistrovali, tento e-mail můžete ignorovat.</p>
  `, "Ověření e-mailu — Stavba");

  await sendEmail({
    to: userEmail,
    subject: "Ověřte svou e-mailovou adresu — Stavba",
    htmlContent: html,
  });
}

// =====================================================================
// Password reset e-mail
// =====================================================================

const RESET_TOKEN_EXPIRY_HOURS = 1;

/**
 * Generate a password-reset token, store it on the user, and send the
 * reset e-mail. Returns false if the user doesn't exist (to avoid
 * revealing which e-mails are registered).
 */
export async function sendPasswordResetEmail(userEmail: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { email: userEmail },
    select: { id: true, name: true },
  });

  if (!user) {
    // Don't reveal that the e-mail doesn't exist — return true so the
    // UI always shows "Pokud účet existuje, e-mail byl odeslán."
    return true;
  }

  const { generateToken } = await import("@/lib/auth-helpers");
  const token = generateToken();
  const expiry = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: token,
      passwordResetExpiry: expiry,
    },
  });

  const resetUrl = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${token}`;

  const html = emailShell(`
    <h1>Reset hesla</h1>
    <p>Ahoj${user.name ? ` ${user.name}` : ""},</p>
    <p>Obdrželi jsme žádost o reset hesla k vašemu účtu v aplikaci Stavba. Pokud jste to byli vy, klikněte na tlačítko níže a nastavte si nové heslo.</p>
    <a href="${resetUrl}" class="btn">Resetovat heslo</a>
    <p class="link-fallback">Pokud tlačítko nefunguje, zkopírujte tento odkaz do prohlížeče:<br>${resetUrl}</p>
    <p class="hint">Tento odkaz vyprší za 1 hodinu. Pokud jste o reset hesla nežádali, tento e-mail můžete ignorovat — vaše heslo zůstává beze změny.</p>
  `, "Reset hesla — Stavba");

  await sendEmail({
    to: userEmail,
    subject: "Reset hesla — Stavba",
    htmlContent: html,
  });

  return true;
}

// =====================================================================
// Verification helpers (used by the verify-email API endpoint)
// =====================================================================

/**
 * Verify a verification token. Returns the user if valid + not expired.
 * Clears the token on success.
 */
export async function verifyEmailToken(token: string): Promise<{ success: true; email: string } | { success: false; reason: "invalid" | "expired" }> {
  const user = await db.user.findFirst({
    where: { emailVerifyToken: token },
    select: { id: true, email: true, emailVerifyExpiry: true },
  });

  if (!user) {
    return { success: false, reason: "invalid" };
  }

  if (!user.emailVerifyExpiry || user.emailVerifyExpiry < new Date()) {
    // Token expired — clear it
    await db.user.update({
      where: { id: user.id },
      data: { emailVerifyToken: null, emailVerifyExpiry: null },
    });
    return { success: false, reason: "expired" };
  }

  // Valid — mark e-mail as verified + clear token
  await db.user.update({
    where: { id: user.id },
    data: {
      emailVerified: new Date(),
      emailVerifyToken: null,
      emailVerifyExpiry: null,
    },
  });

  return { success: true, email: user.email };
}

/**
 * Verify a password-reset token. Returns the user if valid + not expired.
 * Does NOT clear the token — that happens only when the password is
 * actually changed (in the reset-password endpoint).
 */
export async function verifyResetToken(token: string): Promise<{ success: true; userId: string; email: string } | { success: false; reason: "invalid" | "expired" }> {
  const user = await db.user.findFirst({
    where: { passwordResetToken: token },
    select: { id: true, email: true, passwordResetExpiry: true },
  });

  if (!user) {
    return { success: false, reason: "invalid" };
  }

  if (!user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
    // Token expired — clear it
    await db.user.update({
      where: { id: user.id },
      data: { passwordResetToken: null, passwordResetExpiry: null },
    });
    return { success: false, reason: "expired" };
  }

  return { success: true, userId: user.id, email: user.email };
}

/**
 * Clear the password-reset token after a successful password change.
 */
export async function clearResetToken(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { passwordResetToken: null, passwordResetExpiry: null },
  });
}
