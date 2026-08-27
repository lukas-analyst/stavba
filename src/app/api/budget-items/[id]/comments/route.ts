import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/budget-items/[id]/comments - list all comments for a budget item
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const comments = await db.comment.findMany({
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

    const comment = await db.comment.create({
      data: {
        budgetItemId: id,
        author: (author || "Anonym").trim(),
        text: text.trim(),
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("POST comment error:", error);
    return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
  }
}
