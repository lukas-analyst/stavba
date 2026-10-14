import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/require-user";

// =====================================================================
// /api/users/[id] — single-user mutations
// ---------------------------------------------------------------------
// Until Google Auth is implemented, the "current user" is the default
// owner (email "hanzliklukas2@gmail.com"). This endpoint allows the
// admin UI to update the current user's `name`. After auth lands, this
// should be guarded by an `isAdmin` check (or limited to the session
// user's own record).
//
// PATCH /api/users/[id]
//   Body: { name: string }
//   Returns: 200 { id, name, email, image, createdAt } on success
//
// GET /api/users/[id]
//   Returns: 200 { id, name, email, image, createdAt } — used when the
//   client needs to fetch a single user (e.g. for the avatar dropdown).
// =====================================================================

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, image: true, createdAt: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json(user);
  } catch (error) {
    console.error("GET /api/users/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { name } = body as { name?: string };

    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "name is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    // Verify the target user exists.
    const existing = await db.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Only allow editing your own profile (session user).
    // This replaces the old "default owner" check.
    const { user, response: authResponse } = await requireUser();
    if (authResponse) return authResponse;
    if (id !== user.id) {
      return NextResponse.json(
        { error: "Úprava cizího profilu není povolena" },
        { status: 403 },
      );
    }

    const updated = await db.user.update({
      where: { id },
      data: { name: name.trim().slice(0, 120) },
      select: { id: true, name: true, email: true, image: true, createdAt: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/users/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 },
    );
  }
}
