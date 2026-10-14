import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

// =====================================================================
// requireUser — server-side helper for API routes
// ---------------------------------------------------------------------
// Usage:
//   const { user, response } = await requireUser();
//   if (response) return response; // 401 — not authenticated
//   // user.id, user.email, user.name, user.image are available
//
// This replaces the old `getDefaultOwnerId()` pattern. Every API route
// that creates data (projects, audit logs, analytics events) MUST use
// this to attribute the action to the authenticated user, not a
// hardcoded "default owner".
//
// The `response` field is a 401 NextResponse that you should return
// immediately if the user is not authenticated. The middleware should
// already block unauthenticated requests, but this is a defense-in-depth
// in case middleware is bypassed (e.g. direct API call).
// =====================================================================

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: string | null;
};

/**
 * Get the authenticated user from the NextAuth session.
 * Returns `{ user, response: null }` if authenticated, or
 * `{ user: null, response: <401> }` if not.
 *
 * @example
 * const { user, response } = await requireUser();
 * if (response) return response;
 * // use user.id
 */
export async function requireUser(): Promise<{
  user: SessionUser | null;
  response: NextResponse | null;
}> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Nejste přihlášen." },
        { status: 401 },
      ),
    };
  }

  const user: SessionUser = {
    id: (session.user as { id?: string }).id ?? "",
    email: session.user.email,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
    emailVerified:
      (session.user as { emailVerified?: string | null }).emailVerified ?? null,
  };

  return { user, response: null };
}
