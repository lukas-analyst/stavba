import { NextResponse } from "next/server";
import { dbRead } from "@/lib/db";
import { getDefaultOwnerId } from "@/lib/default-owner";

// =====================================================================
// GET /api/users/profile — current user profile
// ---------------------------------------------------------------------
// Until Google Auth is implemented, "current user" = the default owner
// (the user identified by email "hanzliklukas2@gmail.com" — created on
// first call by `getDefaultOwnerId`). After auth lands, this endpoint
// should return the session user instead.
//
// Returns:
//   { id, name, email, image, createdAt }
// =====================================================================
export async function GET() {
  try {
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
