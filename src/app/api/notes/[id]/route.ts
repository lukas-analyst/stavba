import { NextResponse } from "next/server";
import { db } from "@/lib/db";

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
