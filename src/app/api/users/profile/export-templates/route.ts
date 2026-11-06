import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db, dbRead } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/authz";
import { parseBody } from "@/lib/api-validation";
import type { ExportTemplateData } from "@/lib/pdf/pdf-types";

// GET /api/users/profile/export-templates
// Lists all export templates for the authenticated user.
export async function GET() {
  const t = await getTranslations("api.errors");
  try {
    const { user, response } = await requireVerifiedUser();
    if (response || !user) return response!;

    const templates = await dbRead.exportTemplate.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    const result: ExportTemplateData[] = templates.map((tpl) => ({
      id: tpl.id,
      name: tpl.name,
      sections: JSON.parse(tpl.sections) as string[],
      locale: tpl.locale,
      currency: tpl.currency,
      sectionOrientations: tpl.sectionOrientations
        ? JSON.parse(tpl.sectionOrientations)
        : null,
      tableSorts: tpl.tableSorts
        ? JSON.parse(tpl.tableSorts)
        : null,
      reportStyle: (tpl.reportStyle as "minimal" | "colorful") ?? "minimal",
      createdAt: tpl.createdAt.toISOString(),
      updatedAt: tpl.updatedAt.toISOString(),
    }));

    return NextResponse.json({ templates: result });
  } catch (error) {
    console.error("GET export-templates error:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 },
    );
  }
}

// POST /api/users/profile/export-templates
// Creates a new export template.
// Body: { name: string, sections: string[], locale: string, currency: string }
const createTemplateBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
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

export async function POST(request: Request) {
  const t = await getTranslations("api.errors");
  try {
    const { user, response } = await requireVerifiedUser();
    if (response || !user) return response!;

    const result = await parseBody(createTemplateBodySchema, request, t);
    if (!result.success) return result.response;
    const { name, sections, locale, currency, sectionOrientations, tableSorts, reportStyle } = result.data;

    // Check for name uniqueness per user
    const existing = await dbRead.exportTemplate.findUnique({
      where: { userId_name: { userId: user.id, name } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Template with this name already exists" },
        { status: 409 },
      );
    }

    const template = await db.exportTemplate.create({
      data: {
        userId: user.id,
        name,
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

    const result2: ExportTemplateData = {
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

    return NextResponse.json({ template: result2 }, { status: 201 });
  } catch (error) {
    console.error("POST export-templates error:", error);

    // Return a helpful error message — include the Prisma error code
    // so the user can diagnose schema mismatches (e.g., missing columns
    // after a schema change that hasn't been migrated yet).
    let errorMessage = "Failed to create template";
    let statusCode = 500;

    if (error instanceof Error) {
      // Prisma P2002 = unique constraint (shouldn't reach here — checked above)
      // Prisma P2003 = foreign key constraint
      // Prisma P2021 = column does not exist (schema not migrated)
      const prismaError = error as Error & { code?: string };
      if (prismaError.code === "P2021") {
        errorMessage = "Database schema is out of date — run 'bunx prisma db push' to apply the latest schema changes.";
        statusCode = 500;
      } else if (prismaError.code === "P2002") {
        errorMessage = "Template with this name already exists";
        statusCode = 409;
      } else {
        errorMessage = prismaError.message || errorMessage;
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode },
    );
  }
}
