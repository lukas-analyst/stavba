import { NextResponse } from "next/server";
import { db, dbRead } from "@/lib/db";

// GET /api/projects/[id]/notes - list all notes for a project (newest first)
// Uses `dbRead` (read replica if configured, falls back to primary).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const notes = await dbRead.note.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(notes);
  } catch (error) {
    console.error("GET notes error:", error);
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

// POST /api/projects/[id]/notes - create a new plain-text note
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

    const note = await db.note.create({
      data: {
        projectId: id,
        author: (author || "Anonym").trim().slice(0, 100),
        text: text.trim(),
      },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error("POST note error:", error);
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}
