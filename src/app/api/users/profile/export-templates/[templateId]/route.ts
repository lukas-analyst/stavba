import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db, dbRead } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/authz";
import { parseParam, parseBody, cuidSchema } from "@/lib/api-validation";
import type { ExportTemplateData } from "@/lib/pdf/pdf-types";

// PUT /api/users/profile/export-templates/[templateId]
// Updates an existing export template with the current selection.
// Body: same shape as POST (name, sections, locale, currency, + optional
// sectionOrientations, tableSorts, reportStyle).
const updateTemplateBodySchema = z.object({
  sections: z.array(z.string()).min(1).max(30),
  locale: z.string().min(2).max(5),
  currency: z.string().length(3),
  sectionOrientations: z.record(z.string(), z.enum(["portrait", "landscape"])).optional(),
  tableSorts: z.record(
    z.string(),
    z.object({ field: z.string(), direction: z.enum(["asc", "desc"]) }),
  ).optional(),
  reportStyle: z.enum(["minimal", "colorful"]).optional(),
});

export async function PUT(
  request: Request,
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
    const existing = await dbRead.exportTemplate.findUnique({
      where: { id: templateId },
      select: { userId: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 },
      );
    }
    if (existing.userId !== user.id) {
      return NextResponse.json(
        { error: "You can only update your own templates" },
        { status: 403 },
      );
    }

    const result = await parseBody(updateTemplateBodySchema, request, t);
    if (!result.success) return result.response;
    const { sections, locale, currency, sectionOrientations, tableSorts, reportStyle } = result.data;

    const template = await db.exportTemplate.update({
      where: { id: templateId },
      data: {
        sections: JSON.stringify(sections),
        locale,
        currency,
        sectionOrientations: sectionOrientations
          ? JSON.stringify(sectionOrientations)
          : null,
        tableSorts: tableSorts
          ? JSON.stringify(tableSorts)
          : null,
        reportStyle: reportStyle ?? "minimal",
      },
    });

    const updated: ExportTemplateData = {
      id: template.id,
      name: template.name,
      sections: JSON.parse(template.sections) as string[],
      locale: template.locale,
      currency: template.currency,
      sectionOrientations: template.sectionOrientations
        ? JSON.parse(template.sectionOrientations)
        : null,
      tableSorts: template.tableSorts
        ? JSON.parse(template.tableSorts)
        : null,
      reportStyle: (template.reportStyle as "minimal" | "colorful") ?? "minimal",
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    };

    return NextResponse.json({ template: updated });
  } catch (error) {
    console.error("PUT export-templates error:", error);

    let errorMessage = "Failed to update template";
    if (error instanceof Error) {
      const prismaError = error as Error & { code?: string };
      if (prismaError.code === "P2021") {
        errorMessage = "Database schema is out of date — run 'bunx prisma db push' to apply the latest schema changes.";
      } else {
        errorMessage = prismaError.message || errorMessage;
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 },
    );
  }
}

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
