// =====================================================================
// Rate limiter — in-memory implementation for auth endpoints
// ---------------------------------------------------------------------
// Uses a simple Map with sliding window. Each key (IP or e-mail) has
// an array of timestamps; requests older than the window are pruned.
//
// Limitations:
//   - In-memory only — resets when the server restarts.
//   - On Vercel (serverless), each function instance has its own Map,
//     so the effective limit is N × number_of_instances. For true
//     distributed rate limiting, use Upstash Ratelimit (Redis-based).
//   - For dev/early production with low traffic, this is sufficient.
//
// Usage:
//   const { limited, retryAfter } = await checkRateLimit(
//     `login:${ip}`,
//     { windowMs: 15 * 60 * 1000, max: 5 }
//   );
//   if (limited) {
//     return NextResponse.json(
//       { error: "Příliš mnoho pokusů. Zkuste to za X minut." },
//       { status: 429, headers: { "Retry-After": String(retryAfter) } }
//     );
//   }
// =====================================================================

type RateLimitEntry = {
  timestamps: number[];
};

const store = new Map<string, RateLimitEntry>();

// Periodic cleanup: remove entries that haven't been accessed in the
// last hour. This prevents memory leaks from abandoned IP addresses.
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let lastCleanup = Date.now();

function cleanupOldEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  // Remove entries where all timestamps are older than 1 hour
  const oneHourAgo = now - 60 * 60 * 1000;
  for (const [key, entry] of store) {
    const recent = entry.timestamps.filter((t) => t > oneHourAgo);
    if (recent.length === 0) {
      store.delete(key);
    } else {
      entry.timestamps = recent;
    }
  }
}

type RateLimitOptions = {
  /** Time window in milliseconds (e.g., 15 * 60 * 1000 for 15 minutes) */
  windowMs: number;
  /** Maximum number of requests in the window */
  max: number;
};

type RateLimitResult = {
  limited: boolean;
  /** Seconds until the oldest request in the window expires (Retry-After) */
  retryAfter: number;
  /** Number of requests remaining in the current window */
  remaining: number;
};

/**
 * Check if a key (IP, e-mail, etc.) has exceeded the rate limit.
 * Records the current timestamp if not limited.
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions,
): RateLimitResult {
  cleanupOldEntries();

  const now = Date.now();
  const windowStart = now - options.windowMs;

  const entry = store.get(key) ?? { timestamps: [] };

  // Prune timestamps older than the window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= options.max) {
    // Limited — calculate retry-after based on oldest timestamp in window
    const oldest = entry.timestamps[0];
    const retryAfterMs = oldest + options.windowMs - now;
    const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
    return {
      limited: true,
      retryAfter: retryAfterSec,
      remaining: 0,
    };
  }

  // Not limited — record this request
  entry.timestamps.push(now);
  store.set(key, entry);

  return {
    limited: false,
    retryAfter: 0,
    remaining: options.max - entry.timestamps.length,
  };
}

/**
 * Get the client IP from a Next.js Request.
 * Checks X-Forwarded-For, X-Real-IP, and falls back to "unknown".
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // X-Forwarded-For can be "client, proxy1, proxy2" — take the first
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

// =====================================================================
// Pre-configured rate limits for auth endpoints
// =====================================================================

/** Login: 5 attempts per 15 minutes per IP */
export const LOGIN_RATE_LIMIT: RateLimitOptions = {
  windowMs: 15 * 60 * 1000,
  max: 5,
};

/** Registration: 3 per hour per IP */
export const REGISTER_RATE_LIMIT: RateLimitOptions = {
  windowMs: 60 * 60 * 1000,
  max: 3,
};

/** Password reset request: 3 per hour per IP */
export const RESET_REQUEST_RATE_LIMIT: RateLimitOptions = {
  windowMs: 60 * 60 * 1000,
  max: 3,
};

/** Password reset (with token): 5 per hour per IP */
export const RESET_SUBMIT_RATE_LIMIT: RateLimitOptions = {
  windowMs: 60 * 60 * 1000,
  max: 5,
};

/** E-mail verification resend: 3 per hour per e-mail */
export const VERIFY_RESEND_RATE_LIMIT: RateLimitOptions = {
  windowMs: 60 * 60 * 1000,
  max: 3,
};
