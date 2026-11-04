import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { db, dbRead } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/authz";
import { parseParam, cuidSchema } from "@/lib/api-validation";

// DELETE /api/users/profile/export-templates/[templateId]
// Deletes an export template. Only the owner can delete their own templates.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { user, response } = await requireVerifiedUser();
    if (response || !user) return response!;

    const { templateId: rawId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const templateId = idResult.data;

    // Verify ownership
    const template = await dbRead.exportTemplate.findUnique({
      where: { id: templateId },
      select: { userId: true },
    });
    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 },
      );
    }
    if (template.userId !== user.id) {
      return NextResponse.json(
        { error: "You can only delete your own templates" },
        { status: 403 },
      );
    }

    await db.exportTemplate.delete({ where: { id: templateId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE export-templates error:", error);
    return NextResponse.json(
      { error: "Failed to delete template" },
      { status: 500 },
    );
  }
}
