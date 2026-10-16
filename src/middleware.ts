import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// =====================================================================
// Auth middleware — auth guard + e-mail verification enforcement
// ---------------------------------------------------------------------
// This middleware runs on every request (except static assets) and:
//   1. Redirects unauthenticated users to /auth/login
//   2. Redirects authenticated-but-unverified users to /auth/verify-pending
//   3. Redirects authenticated+verified users away from /auth/* pages
//      (EXCEPT /auth/profile and /auth/settings — those pages are for
//       authenticated users)
//
// We use `getToken` from `next-auth/jwt` directly instead of `withAuth`
// because `withAuth` can cause redirect loops on Vercel Edge Runtime
// (it sometimes ignores the `authorized` callback and redirects to
// /api/auth/signin, creating a loop with our custom login page).
//
// `getToken` is simpler and more predictable: it reads the JWT from
// the cookie, verifies it with NEXTAUTH_SECRET, and returns the
// decoded token (or null if not authenticated).
//
// Public paths (no auth required):
//   - /auth/*          (login, register, forgot-password, reset-password,
//                       verify-email, verify-pending)
//   - /api/auth/*      (NextAuth endpoints + our register/verify/reset)
//   - /api/projects/[slug]/public  (public read-only project view — B25)
//   - /p/*             (public project pages — read-only, no auth)
//   - /invite/*        (invitation accept page — the page itself redirects
//                       to /auth/login if not authenticated; middleware
//                       lets through so the page can do that)
//
// Authenticated paths:
//   - /auth/profile    (account settings — requires verified e-mail)
//   - /auth/settings   (unified settings: hidden projects, profile, about)
// =====================================================================

// Match /api/projects/<slug>/public — public read-only project endpoint.
// We don't allow ANY other /api/projects/* path to bypass auth.
function isPublicProjectApi(pathname: string): boolean {
  // /api/projects/<slug>/public
  //   segments: ["", "api", "projects", "<slug>", "public"]
  // We use a regex to keep this strict — only this exact shape passes.
  return /^\/api\/projects\/[^/]+\/public\/?$/.test(pathname);
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const isAuthApi = pathname.startsWith("/api/auth");

  // Public auth APIs — always let through (NextAuth handles these)
  if (isAuthApi) {
    return NextResponse.next();
  }

  // Public project view API — no auth required (B25: shared project view).
  if (isPublicProjectApi(pathname)) {
    return NextResponse.next();
  }

  // Public project page — anyone can view a public project.
  // The page itself fetches /api/projects/[slug]/public which returns 404
  // if the project isn't public, then the page redirects to /auth/login.
  // We must let these through here so unauthenticated users can see
  // public projects without first being bounced to /auth/login.
  if (pathname.startsWith("/p/")) {
    return NextResponse.next();
  }

  // Invitation accept page — handled client-side. The page itself
  // redirects to /auth/login?callbackUrl=/invite/[token] if not
  // authenticated, so we let it through here regardless of auth state.
  if (pathname.startsWith("/invite/")) {
    return NextResponse.next();
  }

  // Get the JWT token from the cookie.
  // `getToken` verifies the JWT signature using NEXTAUTH_SECRET.
  // Returns null if no cookie or invalid/expired token.
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // /auth/profile and /auth/settings are special auth pages — they require
  // authentication + verification, unlike the other /auth/* pages. Treat
  // them like normal authenticated routes (handled below).
  const isProfilePage =
    pathname === "/auth/profile" ||
    pathname.startsWith("/auth/profile/") ||
    pathname === "/auth/settings";
  const isAuthPage = pathname.startsWith("/auth") && !isProfilePage;

  // Auth pages (login, register, forgot-password, etc.)
  if (isAuthPage) {
    // If already logged in + verified → redirect to home
    // Check both emailVerified AND email/id to handle the case where
    // the JWT callback returned an empty token {} (tokenVersion mismatch)
    // — in that case, token exists but has no email, so we treat the
    // user as logged out and let them see the login page.
    if (
      token &&
      (token as { email?: string }).email &&
      (token as { emailVerified?: string | null }).emailVerified
    ) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    // Allow access to auth pages for unauthenticated or unverified users
    return NextResponse.next();
  }

  // For all other pages — require authentication
  // token might be {} (empty object from tokenVersion mismatch) — treat
  // it the same as null (not authenticated)
  if (!token || !(token as { email?: string }).email) {
    // Redirect to login with callback URL
    const loginUrl = new URL("/auth/login", req.url);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated but e-mail not verified
  if (!(token as { emailVerified?: string | null }).emailVerified) {
    // Allow access to the verify-pending page itself
    if (pathname === "/auth/verify-pending") {
      return NextResponse.next();
    }

    // For API routes (non-auth), return 403 JSON instead of redirect
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "E-mail není ověřen. Zkontrolujte svou schránku." },
        { status: 403 },
      );
    }

    // For pages, redirect to verify-pending
    return NextResponse.redirect(new URL("/auth/verify-pending", req.url));
  }

  // Authenticated + verified → allow
  return NextResponse.next();
}

export const config = {
  // Match all paths except:
  //   - _next/static, _next/image (Next.js internals)
  //   - favicon.ico and image files
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
