import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
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
//   { id, name, email, image, isAdmin, createdAt }
//   401 if no session
//
// `isAdmin` is the DB source of truth (not the JWT-stale value) so the
// client UI (admin tab visibility, etc.) reflects promotions/demotions
// immediately.
// =====================================================================
export async function GET() {
  const t = await getTranslations("api.errors");
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

    const userProfile = await dbRead.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        isAdmin: true,
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
