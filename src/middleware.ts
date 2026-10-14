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
// =====================================================================

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const isAuthPage = pathname.startsWith("/auth");
  const isAuthApi = pathname.startsWith("/api/auth");

  // Public auth APIs — always let through (NextAuth handles these)
  if (isAuthApi) {
    return NextResponse.next();
  }

  // Get the JWT token from the cookie.
  // `getToken` verifies the JWT signature using NEXTAUTH_SECRET.
  // Returns null if no cookie or invalid/expired token.
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Auth pages (login, register, forgot-password, etc.)
  if (isAuthPage) {
    // If already logged in + verified → redirect to home
    if (token && (token as { emailVerified?: string | null }).emailVerified) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    // Allow access to auth pages for unauthenticated or unverified users
    return NextResponse.next();
  }

  // For all other pages — require authentication
  if (!token) {
    // Redirect to login with callback URL
    const loginUrl = new URL("/auth/login", req.url);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated but e-mail not verified → redirect to verify-pending
  if (!(token as { emailVerified?: string | null }).emailVerified) {
    // Allow access to the verify-pending page itself
    if (pathname === "/auth/verify-pending") {
      return NextResponse.next();
    }
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
