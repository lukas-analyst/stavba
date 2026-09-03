import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDefaultOwnerId } from "@/lib/default-owner";
import { getTemplate } from "@/lib/project-templates";

// POST /api/projects/from-template
// Body: { name, address, description, templateType, scope?, startDate?, endDate? }
// Creates a project with pre-filled budget items from a template.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name,
      address,
      description,
      templateType,
      scope,
      startDate,
      endDate,
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!templateType) {
      return NextResponse.json({ error: "templateType is required" }, { status: 400 });
    }

    const template = getTemplate(templateType, scope);
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 400 });
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

    // Get the default owner (until auth is implemented)
    const ownerId = await getDefaultOwnerId();

    // Create the project
    const project = await db.project.create({
      data: {
        name: name.trim(),
        slug,
        ownerId,
        address: address?.trim() || null,
        description: description?.trim() || template.description,
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
    return NextResponse.json({ error: "Failed to create project from template" }, { status: 500 });
  }
}
