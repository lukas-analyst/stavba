import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// DELETE /api/snapshots/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await db.snapshot.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }
    await db.snapshot.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE snapshot error:", error);
    return NextResponse.json({ error: "Failed to delete snapshot" }, { status: 500 });
  }
}
