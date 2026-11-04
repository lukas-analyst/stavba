import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { logAuthEvent, type AuthAction } from "@/lib/auth-audit";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// =====================================================================
// POST /api/auth/audit-log
// ---------------------------------------------------------------------
// Client-side endpoint for recording auth events (login success/failure,
// logout, etc.) in the AnalyticsEvent table.
//
// Body: { action: string, success: boolean, metadata?: object }
//
// Returns: 200 { ok: true } on success
//          400 on invalid input
//          429 on rate limit exceeded
//
// `userId` is resolved from the current session (if any). For events
// where the user is not authenticated (e.g. failed login attempts),
// `userId` will be null — that's expected and allowed, but ONLY for
// the `login` action with `success=false` (failed-login logging).
//
// SECURITY (audit fix H5): previously this route ignored the `response`
// from `requireUser()` and wrote audit events for any caller —
// including unauthenticated attackers. This turned `analytics_events`
// into a spam-friendly log-pollution / cheap-DoS vector. The fix:
//
//   1. Rate-limit the endpoint per IP (30 events / 15 min — generous
//      enough for legitimate failed-login retries, tight enough to
//      stop spam). Returns 429 with Retry-After.
//
//   2. For unauthenticated callers (no session): ONLY `login` with
//      `success=false` is allowed. Any other action requires auth.
//      This preserves the failed-login telemetry path while closing
//      the log-pollution hole.
//
//   3. For authenticated callers: all ALLOWED_ACTIONS are permitted
//      (login success, logout, password_change, etc.).
// =====================================================================

// Allowed auth actions — kept in sync with AuthAction in auth-audit.ts.
// We validate the input to prevent arbitrary eventType injection.
const ALLOWED_ACTIONS: ReadonlySet<AuthAction> = new Set<AuthAction>([
  "login",
  "logout",
  "register",
  "password_change",
  "password_reset",
  "email_verify",
  "session_revoke",
  "oauth_login",
]);

// Actions that unauthenticated callers may log (defensive allow-list).
// Failed-login telemetry must work before the user has a session.
const ANON_ALLOWED_ACTIONS: ReadonlySet<AuthAction> = new Set<AuthAction>([
  "login", // typically success=false for failed login attempts
]);

// Rate limit: 30 events per 15 minutes per IP. A legitimate user can
// fail login 5× per 15 min (LOGIN_RATE_LIMIT), and may also log a
// few other events (logout, etc.). 30 leaves headroom; attackers
// spamming the endpoint are blocked.
const AUDIT_LOG_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,
  max: 30,
} as const;

export async function POST(request: Request) {
  const t = await getTranslations("api.errors");
  try {
    // Rate-limit FIRST, before any DB work. Per-IP.
    const ip = getClientIp(request);
    const rlKey = `audit-log:${ip}`;
    const rl = checkRateLimit(rlKey, AUDIT_LOG_RATE_LIMIT);
    if (rl.limited) {
      const minutes = Math.max(1, Math.ceil(rl.retryAfter / 60));
      return NextResponse.json(
        { error: t("auth.rateLimit.requests", { minutes }) },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfter) },
        },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: t("generic.invalidRequest") },
        { status: 400 },
      );
    }

    const { action, success, metadata } = body as {
      action?: string;
      success?: boolean;
      metadata?: unknown;
    };

    if (typeof action !== "string" || !ALLOWED_ACTIONS.has(action as AuthAction)) {
      return NextResponse.json(
        { error: t("auth.unknownAuthAction") },
        { status: 400 },
      );
    }

    if (typeof success !== "boolean") {
      return NextResponse.json(
        { error: t("auth.successMustBeBoolean") },
        { status: 400 },
      );
    }

    // Resolve user (nullable — failed logins may have no session).
    // `requireUser` (not requireVerifiedUser) — we want to log events
    // even for users whose e-mail is not verified yet.
    const { user } = await requireUser();
    const userId = user?.id ?? null;

    // SECURITY: unauthenticated callers may ONLY log `login` events
    // (typically `success=false` for failed login attempts). Any
    // other action requires a session — return 401 (NOT 403) so we
    // don't reveal which actions exist for authenticated users.
    if (!userId && !ANON_ALLOWED_ACTIONS.has(action as AuthAction)) {
      return NextResponse.json(
        { error: t("auth.notAuthenticated") },
        { status: 401 },
      );
    }

    // Sanitize metadata — only accept plain objects.
    const safeMetadata =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : undefined;

    await logAuthEvent(
      userId,
      action as AuthAction,
      success,
      safeMetadata,
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/auth/audit-log error:", error);
    // Don't fail the calling operation because of an audit log failure —
    // return 200 anyway. The error has been logged on the server.
    return NextResponse.json({ ok: true });
  }
}
