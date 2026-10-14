import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { db, dbRead } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/authz";

// Cached version of the notes list query — keyed by projectId (passed as
// the function argument, which Next.js includes in the cache key
// automatically), tagged "notes" with a short 15s TTL. Notes are
// conversation-like, so the client-side React Query uses staleTime: 0 +
// refetchOnMount: "always"; this server cache just protects against
// redundant DB hits when React Query refetches. Note mutations bust this
// tag via `bustServerCache(projectId, [...])` in src/lib/api.ts.
const getCachedNotes = unstable_cache(
  async (projectId: string) => {
    const notes = await dbRead.note.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
    return notes;
  },
  ["notes"],
  {
    tags: ["notes"],
    revalidate: 15, // 15 seconds — notes are conversation-like
  }
);

// GET /api/projects/[id]/notes - list all notes for a project (newest first)
// Uses `dbRead` (read replica if configured, falls back to primary).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireProjectAccess(id, "viewer");
    if (!access.ok) return access.response;
    const notes = await getCachedNotes(id);
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
    const access = await requireProjectAccess(id, "editor");
    if (!access.ok) return access.response;
    const body = await request.json();
    const { author, text } = body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    // Attribute note to the authenticated user. Prefer the user-provided
    // author label, but fall back to the user's display name / e-mail so
    // notes are never anonymously authored once auth is enforced.
    const fallbackAuthor = access.user.name ?? access.user.email;
    const note = await db.note.create({
      data: {
        projectId: id,
        userId: access.user.id,
        author: (author?.trim() || fallbackAuthor).slice(0, 100),
        text: text.trim(),
      },
    });

    // Log creation to audit log
    await logChanges(
      id,
      "Note",
      note.id,
      "create",
      null,
      {
        author: note.author,
        text: note.text,
      },
      note.author,
    );

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error("POST note error:", error);
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}
