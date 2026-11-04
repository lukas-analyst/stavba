import bcrypt from "bcryptjs";
import crypto from "crypto";

// =====================================================================
// Auth helpers — password hashing + token generation
// ---------------------------------------------------------------------
// bcrypt cost factor 10 = ~80ms per hash on modern hardware. Good balance
// of security vs. performance for a B2C app. (12 would be ~250ms, too
// slow for a responsive login flow.)
// =====================================================================

const BCRYPT_ROUNDS = 10;

/** Hash a plaintext password using bcrypt. */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

/** Verify a plaintext password against a bcrypt hash. */
export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/**
 * Generate a cryptographically-secure random token (32 bytes → 64 hex chars).
 * Used for e-mail verification and password-reset links.
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Validate a password against our policy:
 *   - At least 8 characters
 *   - At least one letter and one number
 *
 * Returns null if valid, or an i18n error CODE (e.g. "password.tooShort")
 * if invalid. The code is translated to a localized string by the caller
 * via next-intl's `t()` function — see `parseBody` in api-validation.ts.
 *
 * This separation of validation (returns code) from presentation (translates
 * code) ensures that error messages are shown in the user's preferred
 * language, not hardcoded in Czech.
 */
export function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "password.tooShort";
  }
  if (!/[a-zA-Z]/.test(password)) {
    return "password.missingLetter";
  }
  if (!/[0-9]/.test(password)) {
    return "password.missingDigit";
  }
  return null;
}

/**
 * Validate an e-mail address format.
 *
 * Returns null if valid, or an i18n error CODE if invalid.
 * See `validatePassword` for the validation/presentation separation rationale.
 */
export function validateEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return "auth.emailRequired";
  // Simple but practical RFC 5322 subset
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(trimmed)) return "auth.invalidEmailFormat";
  return null;
}

/**
 * Normalize an e-mail address (trim + lowercase).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Validate a display name.
 * - Max 120 characters (matches DB constraint in /api/users/[id] PATCH)
 * - No HTML tags (basic XSS prevention — React escapes by default,
 *   but defense-in-depth)
 * - No control characters
 *
 * Returns null if valid (including empty — name is optional), or an i18n
 * error CODE if invalid. See `validatePassword` for the validation/presentation
 * separation rationale.
 */
export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return null; // name is optional
  if (trimmed.length > 120) {
    return "users.nameTooLong";
  }
  // Reject HTML tags (basic check)
  if (/<[^>]+>/.test(trimmed)) {
    return "users.nameHtmlTags";
  }
  // Reject control characters
  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    return "users.nameInvalidChars";
  }
  return null;
}

/**
 * Validate a token format (64 hex characters).
 * Used for emailVerifyToken and passwordResetToken.
 *
 * Returns true if valid, false otherwise.
 */
export function isValidTokenFormat(token: string): boolean {
  return /^[a-f0-9]{64}$/.test(token);
}
