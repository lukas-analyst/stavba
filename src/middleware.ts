import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// =====================================================================
// NextAuth middleware — auth guard + e-mail verification enforcement
// ---------------------------------------------------------------------
// This middleware runs on every request (except static assets) and:
//   1. Redirects unauthenticated users to /auth/login
//   2. Redirects authenticated-but-unverified users to /auth/verify-pending
//   3. Redirects authenticated+verified users away from /auth/* pages
//      (they're already logged in, no need to see login/register)
//
// Public paths (no auth required):
//   - /auth/*          (login, register, forgot-password, reset-password,
//                       verify-email, verify-pending)
//   - /api/auth/*      (NextAuth endpoints + our register/verify/reset)
//
// Note: Next.js 16 recommends `proxy.ts` over `middleware.ts`, but
// `middleware.ts` is still fully supported (just shows a deprecation
// warning in dev). NextAuth's `withAuth` helper is designed for
// `middleware.ts`, so we keep it here.
// =====================================================================

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const { pathname } = req.nextUrl;

    const isAuthPage = pathname.startsWith("/auth");
    const isAuthApi = pathname.startsWith("/api/auth");

    // Public auth APIs — let them through (NextAuth handles these)
    if (isAuthApi) {
      return NextResponse.next();
    }

    // Auth pages (login, register, etc.)
    if (isAuthPage) {
      // If already logged in + verified → redirect to home
      if (token && token.emailVerified) {
        return NextResponse.redirect(new URL("/", req.url));
      }
      // Allow access to auth pages for unauthenticated or unverified users
      return NextResponse.next();
    }

    // For all other pages — the `authorized` callback already handles
    // the redirect to /auth/login if not authenticated.
    // Here we add the e-mail verification check.
    if (token && !token.emailVerified) {
      // Allow access to the verify-pending page itself
      if (pathname === "/auth/verify-pending") {
        return NextResponse.next();
      }
      // Redirect to verify-pending
      return NextResponse.redirect(new URL("/auth/verify-pending", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // `authorized` controls whether a user can access the page.
      // Returns true if:
      //   - the user is authenticated (token exists), OR
      //   - the page is a public auth page/API
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        const isAuthPage = pathname.startsWith("/auth");
        const isAuthApi = pathname.startsWith("/api/auth");

        // Public: auth APIs always allowed
        if (isAuthApi) return true;
        // Public: auth pages always allowed (so users can log in/register)
        if (isAuthPage) return true;

        // All other pages require authentication
        return !!token;
      },
    },
    // Tell withAuth to redirect directly to /auth/login (not the
    // default /api/auth/signin). This avoids an extra redirect hop
    // that was causing a redirect loop in some browser/cookie states.
    pages: {
      signIn: "/auth/login",
    },
  },
);

export const config = {
  // Match all paths except:
  //   - _next/static, _next/image (Next.js internals)
  //   - favicon.ico and image files
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
