import { NextResponse } from "next/server";
import { dbRead } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { requireUser } from "@/lib/require-user";

// =====================================================================
// GET /api/users/profile — current user profile
// ---------------------------------------------------------------------
// Returns the authenticated user's profile from the NextAuth session.
// Requires authentication (middleware blocks unauthenticated requests,
// but requireUser() is a defense-in-depth).
//
// Returns:
//   { id, name, email, image, createdAt }
//   401 if no session
// =====================================================================
export async function GET() {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const userProfile = await dbRead.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
      },
    });

    if (!userProfile) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(userProfile);
  } catch (error) {
    console.error("GET /api/users/profile error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user profile" },
      { status: 500 },
    );
  }
}
