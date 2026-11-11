// =====================================================================
// Error reporting — console + optional webhook (Sentry/Slack/Discord)
// ---------------------------------------------------------------------
// In production, set ERROR_REPORTING_WEBHOOK_URL env var to receive
// error reports on an external service.
//
// Functions:
//   - reportError(error, context?) — for route error boundaries
//   - logApiError(module, error, context?) — for API route handlers
//
// PII redaction: passwords, tokens, and e-mails in stack traces are
// masked before logging/sending to webhook.
// =====================================================================

// ─── PII redaction ───────────────────────────────────────────────
// Patterns that should never appear in logs or webhook payloads.
const PII_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  // Password fields in JSON: "password":"secret123"
  { regex: /"password"\s*:\s*"[^"]*"/gi, replacement: '"password":"***"' },
  // Token fields: "token":"abc123..."
  { regex: /"token"\s*:\s*"[^"]*"/gi, replacement: '"token":"***"' },
  { regex: /"passwordResetToken"\s*:\s*"[^"]*"/gi, replacement: '"passwordResetToken":"***"' },
  { regex: /"emailVerifyToken"\s*:\s*"[^"]*"/gi, replacement: '"emailVerifyToken":"***"' },
  // Authorization headers
  { regex: /Authorization:\s*Bearer\s+[^\s]+/gi, replacement: "Authorization: Bearer ***" },
  // Session cookies
  { regex: /next-auth\.session-token=[^\s;]+/gi, replacement: "next-auth.session-token=***" },
];

function redactPii(text: string): string {
  let result = text;
  for (const { regex, replacement } of PII_PATTERNS) {
    result = result.replace(regex, replacement);
  }
  return result;
}

function redactError(error: Error): Error {
  const redacted = new Error(redactPii(error.message));
  if (error.stack) {
    redacted.stack = redactPii(error.stack);
  }
  redacted.name = error.name;
  return redacted;
}

// ─── Core reporting ──────────────────────────────────────────────

function sendToWebhook(payload: Record<string, unknown>): void {
  const webhookUrl = process.env.ERROR_REPORTING_WEBHOOK_URL;
  if (!webhookUrl) return;
  // Fire-and-forget — never block the response on webhook delivery.
  fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    // ignore webhook errors
  });
}

/**
 * Report an error from a route error boundary (error.tsx / global-error.tsx).
 * Logs to console + optionally sends to webhook.
 *
 * PII (passwords, tokens, session cookies) in error messages and stack
 * traces is redacted before logging/sending.
 */
export function reportError(error: Error | unknown, context?: Record<string, unknown>) {
  const errorObj = error instanceof Error ? redactError(error) : new Error(redactPii(String(error)));
  const payload = {
    message: errorObj.message,
    stack: errorObj.stack,
    context: context ?? {},
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  };

  // Always log to console
  console.error("[error-reporting]", payload);

  // Optionally send to webhook (non-blocking)
  sendToWebhook(payload);

  return payload;
}

/**
 * Log an error from an API route handler.
 *
 * Uses a consistent format: `[module] HTTP_METHOD /api/path error:`
 * Also sends to webhook if ERROR_REPORTING_WEBHOOK_URL is set.
 *
 * PII is redacted before logging/sending.
 *
 * Usage:
 *   } catch (error) {
 *     logApiError("budget", "GET /api/projects/[id]/budget", error);
 *     return NextResponse.json({ error: t("budget.fetchFailed") }, { status: 500 });
 *   }
 */
export function logApiError(
  module: string,
  route: string,
  error: Error | unknown,
  context?: Record<string, unknown>,
) {
  const errorObj = error instanceof Error ? redactError(error) : new Error(redactPii(String(error)));
  const logPrefix = `[${module}] ${route}`;

  // Always log to console with consistent format
  console.error(`${logPrefix} error:`, errorObj.message, errorObj.stack ?? "");

  // Optionally send to webhook with full context
  const payload = {
    module,
    route,
    message: errorObj.message,
    stack: errorObj.stack,
    context: context ?? {},
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  };
  sendToWebhook(payload);
}
