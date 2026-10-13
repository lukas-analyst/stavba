import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { dbRead } from "@/lib/db";
import { getDefaultOwnerId } from "@/lib/default-owner";

// =====================================================================
// GET /api/users/profile — current user profile
// ---------------------------------------------------------------------
// Returns the authenticated user's profile from the NextAuth session.
//
// If no session exists (e.g. during dev before auth is set up, or if
// the middleware somehow lets a request through), we fall back to the
// default owner for backwards compatibility. This fallback will be
// removed once auth is fully rolled out.
//
// Returns:
//   { id, name, email, image, createdAt }
//   401 if no session and no default owner fallback
// =====================================================================
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    // If we have a valid session, return the session user
    if (session?.user?.email) {
      const user = await dbRead.user.findUnique({
        where: { email: session.user.email },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
        },
      });

      if (user) {
        return NextResponse.json(user);
      }
    }

    // === Fallback: default owner (backwards compatibility) ===
    // This branch is hit when:
    //   - The user is not logged in (shouldn't happen — middleware blocks)
    //   - The session user's e-mail doesn't exist in the DB (data issue)
    // In both cases we fall back to the default owner so the app
    // doesn't crash. This will be removed in a future cleanup.
    const userId = await getDefaultOwnerId();
    const user = await dbRead.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("GET /api/users/profile error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user profile" },
      { status: 500 },
    );
  }
}
