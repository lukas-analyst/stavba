import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/authz";

// =====================================================================
// DELETE /api/snapshots/[id]
// ---------------------------------------------------------------------
// SECURITY (audit fix C2): previously this route had NO auth check at
// all — anyone on the internet with a snapshot cuid could delete any
// snapshot in the system. The sibling list endpoint
// `/api/projects/[id]/snapshots` IS properly gated via
// `requireProjectAccess("viewer")`, but this DELETE was missed.
//
// Fix: resolve the snapshot's `projectId` from the existing row, then
// require `editor` access to that project (only editors/owners should
// be able to delete historical snapshots — viewers get read-only).
// Pattern mirrors `/api/notes/[id]` DELETE.
// =====================================================================

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await db.snapshot.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }

    // IDOR fix: require editor access to the project that owns this snapshot.
    const access = await requireProjectAccess(existing.projectId, "editor");
    if (!access.ok) return access.response;

    await db.snapshot.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE snapshot error:", error);
    return NextResponse.json({ error: "Failed to delete snapshot" }, { status: 500 });
  }
}
