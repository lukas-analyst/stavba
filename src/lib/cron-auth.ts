import { NextResponse } from "next/server";
import * as crypto from "crypto";

// =====================================================================
// CRON_SECRET verification helper — shared by /api/cron/* routes
// ---------------------------------------------------------------------
// SECURITY (audit fix M1):
//   1. Uses `crypto.timingSafeEqual` for the secret comparison instead
//      of `===`. String `===` short-circuits on the first byte mismatch,
//      leaking the secret byte-by-byte via timing (a real but hard-to-
//      exploit side channel). `timingSafeEqual` always compares the full
//      length in constant time.
//   2. Removed the `?secret=<secret>` query-param fallback. Query strings
//      are logged by Vercel, by any CDN/proxy in between, and by any
//      browser history that accidentally captures the URL — leaking the
//      secret. Only the `Authorization: Bearer <secret>` header is
//      accepted now (matches Vercel Cron's documented convention).
//   3. Returns a typed `CronAuthResult` so callers can early-return
//      the prepared 401 response without duplicating logic.
//
// Usage:
//   import { verifyCronSecret } from "@/lib/cron-auth";
//   export async function GET(request: Request) {
//     const auth = verifyCronSecret(request);
//     if (!auth.ok) return auth.response;
//     // ... route body
//   }
// =====================================================================

type CronAuthResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * Verify the `Authorization: Bearer <CRON_SECRET>` header against the
 * expected secret. Returns `{ok: true}` on match, or `{ok: false, response}`
 * with a prepared 401 on mismatch / missing / unconfigured.
 *
 * The `?secret=` query-param fallback has been REMOVED for security
 * (query strings leak into logs everywhere). Cron callers MUST send the
 * `Authorization` header — this matches Vercel Cron's documented
 * convention and is also what `curl -H "Authorization: Bearer ..."`
 * does for manual testing.
 */
export function verifyCronSecret(request: Request): CronAuthResult {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    // Fail closed. NEVER fall back to allowing the request when the
    // secret isn't configured — that would let anyone trigger cron jobs
    // (e.g. finalize-deletions could prematurely anonymize soft-deleted
    // users during their 7-day cooling-off window).
    console.error(
      "[cron-auth] CRON_SECRET env var is not set — refusing to authenticate the request.",
    );
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Cron secret not configured" },
        { status: 500 },
      ),
    };
  }

  const authHeader = request.headers.get("authorization") ?? "";

  // Expect exactly "Bearer <secret>". Reject anything else.
  // We don't trim or normalize — malformed headers should fail loudly.
  const expected = `Bearer ${cronSecret}`;

  // Constant-time comparison. Both buffers MUST be the same length for
  // `timingSafeEqual` — if not, we still compare against a fixed-length
  // buffer to avoid leaking the secret length via the comparison timing.
  // We do this by:
  //   - computing the length of `authHeader`
  //   - if it matches `expected.length`, do the safe comparison
  //   - if it doesn't, do a dummy comparison (against `expected` itself)
  //     just to spend the same amount of time, then return false.
  if (authHeader.length !== expected.length) {
    // Burn the same amount of time as a real comparison, then reject.
    // Comparing `expected` to itself is harmless and never throws.
    crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(expected),
    );
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // Lengths match — safe to compare with timingSafeEqual.
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  const isValid = crypto.timingSafeEqual(a, b);

  if (!isValid) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true };
}
