import { db } from "@/lib/db";

// =====================================================================
// Auth audit logging (F8)
// ---------------------------------------------------------------------
// Central helper for recording auth-related events (login, logout,
// password change, password reset, registration, e-mail verify, …).
//
// We reuse the existing `AnalyticsEvent` model instead of introducing a
// separate `AuthLog` table — `eventType` is prefixed with `auth_` to
// distinguish auth events from regular telemetry events.
//
// `userId` is nullable: failed login attempts where the user could not
// be authenticated are still logged (with userId=null) so we can audit
// brute-force attempts.
//
// Server-side callers (API routes) should import and call `logAuthEvent`
// directly — no need to make a self-fetch to /api/auth/audit-log.
// Client-side callers (login page, top-bar) use the HTTP endpoint
// /api/auth/audit-log which itself calls `logAuthEvent`.
// =====================================================================

export type AuthAction =
  | "login"
  | "logout"
  | "register"
  | "password_change"
  | "password_reset"
  | "email_verify"
  | "session_revoke"
  | "oauth_login";

/**
 * Record an auth event in the AnalyticsEvent table.
 *
 * @param userId   The user's ID, or null if unauthenticated (e.g. failed login).
 * @param action   One of the AuthAction literals.
 * @param success  Whether the action succeeded.
 * @param metadata Optional additional metadata (IP, user agent, reason, …).
 *                 Stored as JSON string in the `metadata` column.
 */
export async function logAuthEvent(
  userId: string | null,
  action: AuthAction,
  success: boolean,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.analyticsEvent.create({
      data: {
        userId,
        eventType: `auth_${action}`,
        pageUrl: null,
        timeSpent: null,
        metadata: JSON.stringify({ success, ...(metadata ?? {}) }).slice(0, 4000),
      },
    });
  } catch (error) {
    // Telemetry must never break the actual operation.
    console.error("[auth-audit] Failed to log auth event:", error);
  }
}
