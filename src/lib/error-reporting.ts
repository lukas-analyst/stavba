// Lightweight error reporting — logs to console + optionally to a
// webhook endpoint (e.g., Sentry-compatible, Slack, Discord).
// In production, set ERROR_REPORTING_WEBHOOK_URL env var.

export function reportError(error: Error | unknown, context?: Record<string, unknown>) {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  const payload = {
    message: errorObj.message,
    stack: errorObj.stack,
    context: context ?? {},
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  };

  // Always log to console
  console.error("[error-reporting]", payload);

  // Optionally send to webhook (non-blocking, fire-and-forget)
  const webhookUrl = process.env.ERROR_REPORTING_WEBHOOK_URL;
  if (webhookUrl) {
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      // ignore webhook errors
    });
  }

  return payload;
}

export function reportWarning(message: string, context?: Record<string, unknown>) {
  const payload = {
    level: "warning",
    message,
    context: context ?? {},
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  };
  console.warn("[error-reporting]", payload);

  const webhookUrl = process.env.ERROR_REPORTING_WEBHOOK_URL;
  if (webhookUrl) {
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }
}
