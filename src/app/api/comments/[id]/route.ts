import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/authz";

// DELETE /api/comments/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await db.comment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    // IDOR fix: resolve the projectId via the parent BudgetItem, require
    // editor access, and additionally restrict delete to the comment author
    // (or the project owner). Legacy comments with `userId === null` can
    // only be deleted by the project owner.
    const budgetItem = await db.budgetItem.findUnique({
      where: { id: existing.budgetItemId },
      select: { projectId: true },
    });
    if (!budgetItem) {
      return NextResponse.json({ error: "Budget item not found" }, { status: 404 });
    }
    const access = await requireProjectAccess(budgetItem.projectId, "editor");
    if (!access.ok) return access.response;
    const isOwner = access.project.ownerId === access.user.id;
    if (!isOwner && existing.userId !== access.user.id) {
      return NextResponse.json(
        { error: "Můžete mazat pouze své komentáře." },
        { status: 403 },
      );
    }

    await db.comment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE comment error:", error);
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}
