import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH /api/notes/[id] - update text and/or author of an existing note.
// Body: { text?: string, author?: string }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : undefined;
    const author = typeof body.author === "string" ? body.author.trim() : undefined;

    // Validate: at least one field must be provided.
    if (text === undefined && author === undefined) {
      return NextResponse.json(
        { error: "Nothing to update — provide text or author" },
        { status: 400 },
      );
    }

    // If text is provided it must not be empty.
    if (text !== undefined && text.length === 0) {
      return NextResponse.json({ error: "Text cannot be empty" }, { status: 400 });
    }

    const existing = await db.note.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const data: { text?: string; author?: string } = {};
    if (text !== undefined) data.text = text.slice(0, 5000);
    if (author !== undefined) data.author = (author || "Anonym").slice(0, 100);

    const updated = await db.note.update({
      where: { id },
      data,
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH note error:", error);
    return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
  }
}

// DELETE /api/notes/[id] - delete a single note
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await db.note.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    await db.note.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE note error:", error);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
