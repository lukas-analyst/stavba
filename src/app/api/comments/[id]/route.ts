import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/authz";
import { parseParam, cuidSchema } from "@/lib/api-validation";

// DELETE /api/comments/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    const existing = await db.comment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: t("comment.notFound") },
        { status: 404 },
      );
    }

    // IDOR fix: resolve projectId via parent BudgetItem, require editor
    // + author-or-owner check for delete.
    const budgetItem = await db.budgetItem.findUnique({
      where: { id: existing.budgetItemId },
      select: { projectId: true },
    });
    if (!budgetItem) {
      return NextResponse.json(
        { error: t("comment.budgetItemNotFound") },
        { status: 404 },
      );
    }
    const access = await requireProjectAccess(budgetItem.projectId, "editor");
    if (!access.ok) return access.response;
    const isOwner = access.project.ownerId === access.user.id;
    if (!isOwner && existing.userId !== access.user.id) {
      return NextResponse.json(
        { error: t("comment.cannotDeleteOthers") },
        { status: 403 },
      );
    }

    await db.comment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE comment error:", error);
    return NextResponse.json(
      { error: t("comment.deleteFailed") },
      { status: 500 },
    );
  }
}
