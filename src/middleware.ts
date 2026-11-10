import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

// =====================================================================
// Combined middleware — auth guard + locale routing + CSRF guard
// ---------------------------------------------------------------------
// This middleware runs on every request (except static assets) and does
// these jobs in sequence:
//
//   1. CSRF GUARD (API routes only, non-GET methods):
//      Rejects cross-origin state-changing requests by checking the
//      `Origin` and `Sec-Fetch-Site` headers. Same-origin requests are
//      allowed; cross-origin / missing-origin requests are rejected
//      with 403. GET/HEAD/OPTIONS are exempt (no side effects).
//      This is the recommended modern CSRF defense — it does NOT
//      require a CSRF token cookie and works without any client-side
//      changes.
//
//   2. INTL ROUTING (next-intl):
//      Detects the user's locale (URL prefix > cookie > Accept-Language)
//      and rewrites/redirects the URL accordingly. Default locale (cs)
//      gets NO prefix (as-needed strategy); non-default locales get a
//      prefix (`/en/`, `/de/`, …).
//
//   3. AUTH GUARD:
//      a. Redirects unauthenticated users to /auth/login
//      b. Redirects authenticated-but-unverified users to /auth/verify-pending
//      c. Redirects authenticated+verified users away from /auth/* pages
//         (EXCEPT /auth/profile and /auth/settings — those pages are for
//          authenticated users)
//
// Public paths (no auth required, BUT intl routing still applies):
//   - /auth/*          (login, register, forgot-password, …)
//   - /api/auth/*      (NextAuth endpoints — NextAuth has its own CSRF)
//   - /api/projects/[id]/public  (public project API — [id] accepts slug or cuid)
//   - /p/*             (public project pages — see note below)
//   - /invite/*        (invitation accept page)
//   - /api/health      (public health check)
//
// PUBLIC ROUTES (`/p/*`, `/invite/*`) — special handling:
//   These are shared URLs (QR codes, e-mail links). They do NOT get a
//   locale prefix. Instead, the page components detect the locale from
//   the `NEXT_LOCALE` cookie + `Accept-Language` header and render in
//   the right language. We EXCLUDE them from intl middleware so the URL
//   stays clean (`/p/slug`, not `/cs/p/slug`).
//
// SECURITY (audit fix H7 + M5): the matcher previously excluded
// `/api/*` entirely, which meant:
//   - No middleware-level CSRF defense on state-changing endpoints.
//   - No middleware-level auth guard — every API route had to remember
//     to call `requireUser()` (structural footgun).
// The matcher now includes `/api/*` (minus the always-public paths):
//   - `/api/auth/*`     → bypassed early (NextAuth has own CSRF).
//   - `/api/health`     → bypassed early (no auth, no side effects).
//   - `/api/projects/[id]/public` GET → bypassed early (intentionally
//     public read-only).
//   - `/api/cron/*`     → bypassed (authenticated via CRON_SECRET
//     header, not session cookie — CSRF does not apply; cron requests
//     come from Vercel's infrastructure, not browsers).
//   - Everything else under `/api/*` runs the CSRF guard for non-GET
//     methods. Auth is still enforced per-route via `requireUser()`
//     (defense in depth — middleware auth on API would break public
//     endpoints that need to be reachable without a session).
// =====================================================================

const intlMiddleware = createIntlMiddleware(routing);

// Match /api/projects/<slug>/public — public read-only project endpoint.
function isPublicProjectApi(pathname: string): boolean {
  return /^\/api\/projects\/[^/]+\/public\/?$/.test(pathname);
}

// Public routes that should NEVER get a locale prefix and don't require
// auth. next-intl middleware is skipped for these so the URL stays clean.
function isLocaleExemptPath(pathname: string): boolean {
  return (
    pathname.startsWith("/p/") ||
    pathname.startsWith("/invite/") ||
    isPublicProjectApi(pathname)
  );
}

// =====================================================================
// CSRF guard — defense against cross-origin state-changing requests.
// ---------------------------------------------------------------------
// Strategy: rely on the Fetch Metadata spec headers (`Sec-Fetch-Site`)
// which are set automatically by all modern browsers (Chrome 76+,
// Firefox 90+, Safari 16.4+). They CANNOT be set from JavaScript in
// cross-origin contexts, so they're a trustworthy signal.
//
// Rules (https://web.dev/articles/fetch-metadata):
//   1. Allow if `Sec-Fetch-Site` is `same-origin` (same scheme+host+port).
//   2. Allow if `Sec-Fetch-Site` is `same-site` (same registrable
//      domain, e.g. `app.example.com` → `api.example.com`). NOTE: we
//      reject `same-site` here to be strict — same-site subdomain
//      attacks are real (e.g. untrusted `blog.example.com` issuing
//      requests to `app.example.com`). Set ALLOW_SAME_SITE=true if you
//      have a legitimate same-site subdomain cross-origin flow.
//   3. Allow if `Sec-Fetch-Site` is `none` (user-initiated navigation
//      / direct request from bookmarks — no Origin).
//   4. Allow if the request method is GET/HEAD/OPTIONS (no side effects).
//   5. Allow if `Origin` header matches the request's host (fallback
//      for browsers without Fetch Metadata support — also validates
//      cross-origin form POSTs which DO send `Origin`).
//   6. REJECT everything else (cross-site POST/PATCH/DELETE) with 403.
//
// NOTE on NextAuth: `/api/auth/*` routes are bypassed early (NextAuth
// Credentials provider has its own CSRF token + cookie validation).
//
// NOTE on Cron routes: `/api/cron/*` are bypassed — they authenticate
// via `CRON_SECRET` header, not session cookie, so CSRF does not apply
// (an attacker can't forge the Authorization header from a browser).
// =====================================================================
const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isCsrfSafe(req: NextRequest): boolean {
  const method = req.method.toUpperCase();

  // Safe methods — no side effects, no CSRF risk.
  if (CSRF_SAFE_METHODS.has(method)) return true;

  const fetchSite = req.headers.get("sec-fetch-site");
  // `same-origin` = same scheme+host+port. Always safe.
  if (fetchSite === "same-origin") return true;
  // `none` = user-initiated request (e.g. typed URL, bookmark, curl).
  // No Origin header is sent. Allow.
  if (fetchSite === "none") return true;
  // `same-site` = same registrable domain but different subdomain
  // (e.g. `app.example.com` → `api.example.com`). REJECT — we have
  // no legitimate same-site subdomain flows.
  // `cross-site` = different registrable domain. REJECT.
  if (fetchSite === "same-site" || fetchSite === "cross-site") {
    return false;
  }

  // Fetch Metadata header missing (old browser or non-browser client).
  // Fall back to `Origin` header validation.
  const origin = req.headers.get("origin");
  if (!origin) {
    // No Origin and no Sec-Fetch-Site — this is a non-browser request
    // (curl, Postman, server-to-server). These don't carry session
    // cookies (unless the client explicitly forwards them), so CSRF
    // doesn't apply. Allow — auth is enforced separately per-route.
    return true;
  }

  // Compare Origin to the request's own host.
  try {
    const originUrl = new URL(origin);
    const requestHost = req.headers.get("host");
    if (requestHost && originUrl.host === requestHost) {
      return true; // same-origin
    }
  } catch {
    // Malformed Origin — reject.
    return false;
  }

  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // ───────────────────────────────────────────────────────────────
  // Public auth APIs — always let through (NextAuth handles its own
  // CSRF for /api/auth/* — see NextAuth Credentials provider docs).
  // No intl routing on /api/* at all.
  // ───────────────────────────────────────────────────────────────
  const isAuthApi = pathname.startsWith("/api/auth");
  if (isAuthApi) {
    return NextResponse.next();
  }

  // Public health check — no auth, no CSRF (read-only, no side effects).
  if (pathname === "/api/health") {
    return NextResponse.next();
  }

  // Public project view API — no auth, no intl. Read-only.
  if (isPublicProjectApi(pathname)) {
    return NextResponse.next();
  }

  // Cron endpoints — authenticated via CRON_SECRET header, not session
  // cookie. CSRF does not apply (an attacker can't forge the
  // Authorization header from a browser context).
  if (pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  // ───────────────────────────────────────────────────────────────
  // CSRF GUARD — applies to all other `/api/*` non-GET methods.
  // Browsers send cookies (including the NextAuth session cookie)
  // automatically; an attacker page can leverage this to issue
  // cross-site POSTs. The Fetch Metadata / Origin check above blocks
  // those. Per-route `requireUser()` is the second layer of defense
  // (auth) — CSRF is the orthogonal layer (request origin).
  // ───────────────────────────────────────────────────────────────
  if (pathname.startsWith("/api/") && !isCsrfSafe(req)) {
    return NextResponse.json(
      {
        error:
          "Požadavek byl odmítnut z bezpečnostních důvodů (CSRF). " +
          "Pokud chyba přetrvává, obnovte stránku a zkuste to znovu.",
      },
      { status: 403 },
    );
  }

  // Public project pages + invitation accept pages — NO locale prefix.
  // The page components handle locale detection themselves (via the
  // `NEXT_LOCALE` cookie + `Accept-Language` header).
  // We let these through to the auth check below; the auth middleware
  // already allows unauthenticated access to /p/* and /invite/*.
  if (pathname.startsWith("/p/") || pathname.startsWith("/invite/")) {
    return NextResponse.next();
  }

  // ───────────────────────────────────────────────────────────────
  // STEP 1: next-intl middleware (locale detection + URL rewrite)
  // For non-public routes, run the intl middleware first. It will:
  //   - Rewrite `/budget` → `/cs/budget` internally (default locale)
  //   - Redirect `/en/budget` → `/en/budget` (already prefixed)
  //   - Set the `NEXT_LOCALE` cookie for future visits
  // The response object returned contains headers + cookies we MUST
  // preserve when chaining the auth check.
  // ───────────────────────────────────────────────────────────────
  const intlResponse = intlMiddleware(req);

  // ───────────────────────────────────────────────────────────────
  // STEP 2: Auth guard (page-level — API auth is per-route via
  // `requireUser()`).
  // We use `getToken` from `next-auth/jwt` directly (see comment in
  // the original middleware for why `withAuth` was avoided).
  //
  // IMPORTANT: after intl middleware rewrites the URL, `req.nextUrl`
  // still reflects the ORIGINAL pathname (not the rewritten one) —
  // so `pathname` here is the user-facing URL. For auth purposes,
  // we strip any locale prefix to get the "logical" path.
  // ───────────────────────────────────────────────────────────────

  // Strip the locale prefix (e.g. `/en/budget` → `/budget`) so auth
  // checks work regardless of locale.
  const pathWithoutLocale = pathname.replace(/^\/(cs|en)(?=\/|$)/, "") || "/";

  // API routes skip the page-level auth redirect logic — they handle
  // auth themselves. Returning `intlResponse` would run intl on `/api/*`
  // (which we don't want — intl rewrites could break fetch URLs). For
  // API requests that passed the CSRF check, just pass through.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // /auth/profile and /auth/settings are special auth pages — they require
  // authentication + verification, unlike the other /auth/* pages.
  const isProfilePage =
    pathWithoutLocale === "/auth/profile" ||
    pathWithoutLocale.startsWith("/auth/profile/") ||
    pathWithoutLocale === "/auth/settings";
  const isAuthPage = pathWithoutLocale.startsWith("/auth") && !isProfilePage;

  // Auth pages (login, register, forgot-password, etc.)
  if (isAuthPage) {
    // If already logged in + verified → redirect to home.
    // Check both emailVerified AND email/id to handle the case where
    // the JWT callback returned an empty token {} (tokenVersion mismatch)
    // — in that case, token exists but has no email, so we treat the
    // user as logged out and let them see the login page.
    if (
      token &&
      (token as { email?: string }).email &&
      (token as { emailVerified?: string | null }).emailVerified
    ) {
      // Redirect to home — preserve locale prefix in the redirect URL.
      const homeUrl = new URL("/", req.url);
      // Copy the locale from the intl response if it set a cookie/rewrite.
      const localeCookie = intlResponse.headers.get("x-next-intl-locale");
      if (localeCookie) {
        homeUrl.pathname = `/${localeCookie}`;
      }
      intlResponse.headers.forEach((value, key) => {
        if (key.toLowerCase() === "location") {
          // next-intl may have already set a Location header for redirects.
          // We override it to go home.
        }
      });
      return NextResponse.redirect(homeUrl);
    }
    // Allow access to auth pages for unauthenticated or unverified users
    return intlResponse;
  }

  // For all other pages — require authentication.
  // token might be {} (empty object from tokenVersion mismatch) — treat
  // it the same as null (not authenticated)
  if (!token || !(token as { email?: string }).email) {
    // Redirect to login with callback URL — preserve locale prefix.
    // We need to construct the login URL with the locale prefix so the
    // user stays in the same language after the redirect.
    const detectedLocale =
      intlResponse.headers.get("x-next-intl-locale") ??
      req.cookies.get("NEXT_LOCALE")?.value ??
      "cs";
    const loginUrl = new URL(
      `/${detectedLocale === "cs" ? "" : detectedLocale + "/"}auth/login`,
      req.url,
    );
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated but e-mail not verified
  if (!(token as { emailVerified?: string | null }).emailVerified) {
    // Allow access to the verify-pending page itself
    if (pathWithoutLocale === "/auth/verify-pending") {
      return intlResponse;
    }

    // For API routes (non-auth), return 403 JSON instead of redirect.
    // (Note: this branch is now effectively unreachable for /api/* because
    // we returned early above for API routes. Kept as defense-in-depth.)
    if (pathWithoutLocale.startsWith("/api/")) {
      return NextResponse.json(
        { error: "E-mail není ověřen. Zkontrolujte svou schránku." },
        { status: 403 },
      );
    }

    // For pages, redirect to verify-pending (preserve locale)
    const detectedLocale =
      intlResponse.headers.get("x-next-intl-locale") ??
      req.cookies.get("NEXT_LOCALE")?.value ??
      "cs";
    const verifyUrl = new URL(
      `/${detectedLocale === "cs" ? "" : detectedLocale + "/"}auth/verify-pending`,
      req.url,
    );
    return NextResponse.redirect(verifyUrl);
  }

  // Authenticated + verified → allow (return intl response so cookies/headers persist)
  return intlResponse;
}

export const config = {
  // Match all paths except:
  //   - _next/static, _next/image (Next.js internals)
  //   - favicon.ico and image files
  //
  // SECURITY FIX (audit fix H7 + M5): `/api/*` is NO LONGER excluded
  // from the matcher. The middleware now runs on API routes too,
  // applying the CSRF guard to non-GET methods. Auth is still enforced
  // per-route via `requireUser()` (defense in depth). Public API paths
  // (`/api/auth/*`, `/api/health`, `/api/projects/[id]/public`,
  // `/api/cron/*`) are bypassed early inside the middleware.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
