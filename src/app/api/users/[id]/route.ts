import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/require-user";

// =====================================================================
// /api/users/[id] — single-user mutations
// ---------------------------------------------------------------------
// PATCH /api/users/[id]
//   Body: { name?: string, isAdmin?: boolean }
//   - `name`     — editable by the user themselves OR by an admin.
//   - `isAdmin`  — ONLY editable by an existing admin. Non-admins who
//                  try to set this field receive 403. This is the only
//                  way to promote/demote admins (besides direct DB access).
//
//   Admins can also edit any other user's `name` (not just their own).
//   Non-admins can only edit their own profile.
//
//   Returns: 200 { id, name, email, image, isAdmin, createdAt }
//
// GET /api/users/[id]
//   Returns: 200 { id, name, email, image, createdAt } — used when the
//   client needs to fetch a single user (e.g. for the avatar dropdown).
//   Note: `isAdmin` is intentionally NOT returned here to avoid leaking
//   admin status to arbitrary clients. Use /api/users/profile for the
//   current user's own isAdmin flag.
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

    const { name, isAdmin } = body as {
      name?: string;
      isAdmin?: boolean;
    };

    // Build the update payload. `name` and `isAdmin` are both optional,
    // but at least one must be provided so we don't no-op silently.
    const data: { name?: string; isAdmin?: boolean } = {};

    if (typeof name === "string") {
      if (!name.trim()) {
        return NextResponse.json(
          { error: "name must be a non-empty string" },
          { status: 400 },
        );
      }
      data.name = name.trim().slice(0, 120);
    }

    // ===== Admin-gated field: isAdmin =====
    // Only an existing admin can set `isAdmin` (promote or demote).
    // We fetch the requester's isAdmin flag fresh from DB (not from the
    // JWT) so a just-demoted admin can't sneak in one last change using
    // a stale token. The requester must also be authenticated.
    if (isAdmin !== undefined) {
      const { user: requester, response: authResponse } = await requireUser();
      if (authResponse) return authResponse;
      if (!requester) {
        return NextResponse.json(
          { error: "Nejste přihlášen." },
          { status: 401 },
        );
      }
      const requesterUser = await db.user.findUnique({
        where: { id: requester.id },
        select: { isAdmin: true },
      });
      if (!requesterUser?.isAdmin) {
        return NextResponse.json(
          { error: "Pouze administrátor může měnit admin práva." },
          { status: 403 },
        );
      }
      // Optional safety: prevent self-demotion so the instance never
      // ends up with zero admins. Uncomment if you want this guard.
      // if (id === requester.id && isAdmin === false) {
      //   return NextResponse.json(
      //     { error: "Nemůžete odebrat admin práva sám sobě." },
      //     { status: 400 },
      //   );
      // }
      data.isAdmin = Boolean(isAdmin);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided (name, isAdmin)" },
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

    // Authorization for the `name` field:
    //   - Admins can edit ANY user's name.
    //   - Non-admins can only edit their own profile.
    // (The `isAdmin` field was already authorized above.)
    if (data.name !== undefined) {
      const { user: requester, response: authResponse } = await requireUser();
      if (authResponse) return authResponse;
      if (!requester) {
        return NextResponse.json(
          { error: "Nejste přihlášen." },
          { status: 401 },
        );
      }
      if (id !== requester.id && !requester.isAdmin) {
        return NextResponse.json(
          { error: "Úprava cizího profilu není povolena" },
          { status: 403 },
        );
      }
    }

    const updated = await db.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        isAdmin: true,
        createdAt: true,
      },
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
