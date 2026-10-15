import { NextResponse } from "next/server";
import { requireUser } from "@/lib/authz";
import { logAuthEvent, type AuthAction } from "@/lib/auth-audit";

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
//
// `userId` is resolved from the current session (if any). For events
// where the user is not authenticated (e.g. failed login attempts),
// `userId` will be null — that's expected and allowed.
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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Neplatný požadavek." },
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
        { error: "Neznámá auth akce." },
        { status: 400 },
      );
    }

    if (typeof success !== "boolean") {
      return NextResponse.json(
        { error: "`success` musí být boolean." },
        { status: 400 },
      );
    }

    // Resolve user (nullable — failed logins may have no session).
    // `requireUser` (not requireVerifiedUser) — we want to log events
    // even for users whose e-mail is not verified yet.
    const { user } = await requireUser();
    const userId = user?.id ?? null;

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
