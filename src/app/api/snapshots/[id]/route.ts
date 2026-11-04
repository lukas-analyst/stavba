import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/authz";
import { parseParam, cuidSchema } from "@/lib/api-validation";

// =====================================================================
// DELETE /api/snapshots/[id]
// SECURITY: requires editor access to the project that owns the snapshot.
// =====================================================================

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

    const existing = await db.snapshot.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: t("snapshot.fetchFailed") },
        { status: 404 },
      );
    }

    // IDOR fix: require editor access to the project that owns this snapshot.
    const access = await requireProjectAccess(existing.projectId, "editor");
    if (!access.ok) return access.response;

    await db.snapshot.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE snapshot error:", error);
    return NextResponse.json(
      { error: t("snapshot.fetchFailed") },
      { status: 500 },
    );
  }
}
