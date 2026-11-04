import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { getTemplate } from "@/lib/project-templates";
import {
  parseBody,
  nonEmptyString,
  optionalNullableString,
} from "@/lib/api-validation";

// POST /api/projects/from-template
// Body: { name, address, description, templateType, scope?, startDate?, endDate? }
// Creates a project with pre-filled budget items from a template.

// Template type is a free-form string (validated by `getTemplate` lookup
// which returns null for unknown types). We constrain it to non-empty
// string + reasonable max length to prevent abuse.
const fromTemplateBodySchema = z.object({
  name: nonEmptyString.max(200, { message: "project.nameRequired" }),
  address: optionalNullableString.optional(),
  description: optionalNullableString.optional(),
  templateType: nonEmptyString.max(50, { message: "project.templateTypeRequired" }),
  scope: nonEmptyString.max(50).optional(),
  startDate: z
    .string()
    .refine((s) => !isNaN(Date.parse(s)), { message: "project.invalidStartDate" })
    .optional(),
  endDate: z
    .string()
    .refine((s) => !isNaN(Date.parse(s)), { message: "project.invalidEndDate" })
    .optional(),
});

export async function POST(request: Request) {
  const t = await getTranslations("api.errors");
  try {
    // Parse + validate body (Zod).
    const result = await parseBody(fromTemplateBodySchema, request, t);
    if (!result.success) return result.response;
    const { name, address, description, templateType, scope, startDate, endDate } = result.data;

    const template = getTemplate(templateType, scope);
    if (!template) {
      return NextResponse.json(
        { error: t("project.templateNotFound") },
        { status: 400 },
      );
    }

    // Generate slug
    const baseSlug = name.trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
    let slug = baseSlug;
    let suffix = 1;
    while (await db.project.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    // Require authentication — projects are owned by the logged-in user
    const { user, response } = await requireUser();
    if (response) return response;
    if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
    const ownerId = user.id;

    // Create the project
    const project = await db.project.create({
      data: {
        name: name.trim(),
        slug,
        ownerId,
        address: address ?? null,
        description: description ?? template.description,
        starred: false,
        status: "planning",
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
    });

    // Create budget items from template
    let sortOrder = 0;
    for (const item of template.items) {
      await db.budgetItem.create({
        data: {
          projectId: project.id,
          category: item.category,
          subcategory: item.subcategory,
          element: item.element || null,
          phase: item.phase,
          required: item.required,
          completed: false,
          note: item.note || null,
          planCost: item.planCost || null,
          flexibilityPercent: item.flexibilityPercent || null,
          planDays: item.planDays || null,
          sortOrder: sortOrder++,
        },
      });
    }

    return NextResponse.json(
      { ...project, templateItems: template.items.length },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST from-template error:", error);
    return NextResponse.json(
      { error: t("project.fromTemplateFailed") },
      { status: 500 },
    );
  }
}
