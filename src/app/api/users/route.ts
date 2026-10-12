import { NextResponse } from "next/server";
import { dbRead } from "@/lib/db";

// GET /api/users — list all users (for project sharing dropdowns)
// Returns minimal fields: id, name, email. Ordered by name.
export async function GET() {
  try {
    const users = await dbRead.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });
    return NextResponse.json(users);
  } catch (error) {
    console.error("GET users error:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
