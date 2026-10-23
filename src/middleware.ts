import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

// =====================================================================
// Combined middleware — auth guard + locale routing
// ---------------------------------------------------------------------
// This middleware runs on every request (except static assets) and does
// TWO jobs in sequence:
//
//   1. INTL ROUTING (next-intl):
//      Detects the user's locale (URL prefix > cookie > Accept-Language)
//      and rewrites/redirects the URL accordingly. Default locale (cs)
//      gets NO prefix (as-needed strategy); non-default locales get a
//      prefix (`/en/`, `/de/`, …).
//
//   2. AUTH GUARD:
//      a. Redirects unauthenticated users to /auth/login
//      b. Redirects authenticated-but-unverified users to /auth/verify-pending
//      c. Redirects authenticated+verified users away from /auth/* pages
//         (EXCEPT /auth/profile and /auth/settings — those pages are for
//          authenticated users)
//
// Public paths (no auth required, BUT intl routing still applies):
//   - /auth/*          (login, register, forgot-password, …)
//   - /api/auth/*      (NextAuth endpoints)
//   - /api/projects/[slug]/public  (public project API)
//   - /p/*             (public project pages — see note below)
//   - /invite/*        (invitation accept page)
//
// PUBLIC ROUTES (`/p/*`, `/invite/*`) — special handling:
//   These are shared URLs (QR codes, e-mail links). They do NOT get a
//   locale prefix. Instead, the page components detect the locale from
//   the `NEXT_LOCALE` cookie + `Accept-Language` header and render in
//   the right language. We EXCLUDE them from intl middleware so the URL
//   stays clean (`/p/slug`, not `/cs/p/slug`).
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

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const isAuthApi = pathname.startsWith("/api/auth");

  // Public auth APIs — always let through (NextAuth handles these).
  // No intl routing on /api/* at all.
  if (isAuthApi) {
    return NextResponse.next();
  }

  // Public project view API — no auth, no intl.
  if (isPublicProjectApi(pathname)) {
    return NextResponse.next();
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
  // STEP 2: Auth guard
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

    // For API routes (non-auth), return 403 JSON instead of redirect
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
  //   - /api/* (API routes handle their own auth via `requireUser()` and
  //     don't need locale routing — intl middleware on API routes can
  //     cause issues with URL rewriting and break fetch calls)
  //
  // Note: /api/auth/* and public API routes are let through by the auth
  // logic above, but they never reach this matcher anyway because we
  // return early for them. Excluding /api/* entirely keeps the intl
  // middleware from accidentally rewriting API URLs.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
