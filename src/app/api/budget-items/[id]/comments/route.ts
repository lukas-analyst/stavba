import { NextResponse } from "next/server";
import { db, dbRead } from "@/lib/db";
import { requireProjectAccess } from "@/lib/authz";

// GET /api/budget-items/[id]/comments - list all comments for a budget item
// Uses `dbRead` (read replica if configured, falls back to primary).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // IDOR fix: resolve the budget item's projectId and verify the caller
    // has at least viewer access before returning comments.
    const item = await dbRead.budgetItem.findUnique({
      where: { id },
      select: { projectId: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Budget item not found" }, { status: 404 });
    }
    const access = await requireProjectAccess(item.projectId, "viewer");
    if (!access.ok) return access.response;

    const comments = await dbRead.comment.findMany({
      where: { budgetItemId: id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(comments);
  } catch (error) {
    console.error("GET comments error:", error);
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}

// POST /api/budget-items/[id]/comments - add a comment
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { author, text } = body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const item = await db.budgetItem.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json({ error: "Budget item not found" }, { status: 404 });
    }

    // IDOR fix: require editor access to the project that owns the budget
    // item. We also use access.user.id as the author identity so comments
    // are reliably attributed to the authenticated user, not the free-text
    // `author` field which is display-only.
    const access = await requireProjectAccess(item.projectId, "editor");
    if (!access.ok) return access.response;

    const comment = await db.comment.create({
      data: {
        budgetItemId: id,
        userId: access.user.id,
        author: (author || access.user.name || access.user.email || "Anonym").trim(),
        text: text.trim(),
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("POST comment error:", error);
    return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
  }
}
