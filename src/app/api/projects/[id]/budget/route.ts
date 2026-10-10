import { NextResponse } from "next/server";
import { db, dbRead } from "@/lib/db";
import { recalcParentDates } from "@/lib/recalc-parent-dates";

// Explicit field selection — only fetch what the frontend actually uses.
// This reduces DB payload by ~40% compared to `include` (which fetches
// every column of related tables even if only 2-3 fields are needed).
const BUDGET_ITEM_SELECT = {
  id: true,
  category: true,
  subcategory: true,
  element: true,
  phase: true,
  required: true,
  completed: true,
  rejected: true,
  note: true,
  unitPrice: true,
  parentId: true,
  dependsOnId: true,
  planCost: true,
  flexibilityPercent: true,
  planDays: true,
  dateFrom: true,
  dateTo: true,
  actualCost: true,
  actualHours: true,
  subsidyEligible: true,
  subsidyAmount: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { payments: true, timeEntries: true, comments: true } },
  // External hyperlinks (1:N) — only id/label/url/sortOrder needed by UI.
  // Ordered by sortOrder for stable display in the detail panel.
  links: {
    orderBy: { sortOrder: "asc" },
    select: { id: true, label: true, url: true, sortOrder: true },
  },
} as const;

// GET /api/projects/[id]/budget - list all budget items for a project
// Returns items as a flat list; the frontend groups them by category and parent-child.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const items = await dbRead.budgetItem.findMany({
      where: { projectId: id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: BUDGET_ITEM_SELECT,
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error("GET budget error:", error);
    return NextResponse.json({ error: "Failed to fetch budget items" }, { status: 500 });
  }
}

// POST /api/projects/[id]/budget - create a budget item (or a child task)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      category,
      subcategory,
      element,
      phase,
      required,
      completed,
      rejected,
      note,
      unitPrice,
      parentId,
      dependsOnId,
      planCost,
      flexibilityPercent,
      planDays,
      dateFrom,
      dateTo,
      actualCost,
      actualHours,
      subsidyEligible,
      subsidyAmount,
      links,
    } = body;

    if (!category || typeof category !== "string" || !category.trim()) {
      return NextResponse.json({ error: "Category is required" }, { status: 400 });
    }

    // Normalize incoming links — same validation as PATCH endpoint.
    // Drops entries without a non-empty label AND url. Assigns sortOrder
    // based on the array order so display is stable in the detail panel.
    const normalizedLinks = Array.isArray(links)
      ? links
          .filter(
            (l: unknown): l is { id?: string; label: string; url: string } => {
              if (!l || typeof l !== "object") return false;
              const obj = l as Record<string, unknown>;
              return (
                typeof obj.label === "string" && obj.label.trim() !== "" &&
                typeof obj.url === "string" && obj.url.trim() !== ""
              );
            },
          )
          .map((l, idx) => ({
            label: l.label.trim(),
            url: l.url.trim(),
            sortOrder: idx,
          }))
      : [];

    // If parentId is set, validate it belongs to this project
    if (parentId) {
      const parent = await db.budgetItem.findFirst({
        where: { id: parentId, projectId: id },
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent item not found in this project" }, { status: 404 });
      }
    }

    // If dependsOnId is set, validate it belongs to this project and is a top-level item
    if (dependsOnId) {
      const dep = await db.budgetItem.findFirst({
        where: { id: dependsOnId, projectId: id, parentId: null },
      });
      if (!dep) {
        return NextResponse.json({ error: "Referenced item (dependsOnId) not found in this project" }, { status: 404 });
      }
    }

    const maxOrder = await db.budgetItem.aggregate({
      where: { projectId: id },
      _max: { sortOrder: true },
    });

    const item = await db.budgetItem.create({
      data: {
        projectId: id,
        category: category.trim(),
        subcategory: subcategory?.trim() || null,
        element: element?.trim() || null,
        phase: phase || "Neurčeno",
        required: Boolean(required),
        completed: Boolean(completed),
        rejected: Boolean(rejected),
        note: note?.trim() || null,
        unitPrice: unitPrice?.trim() || null,
        parentId: parentId || null,
        dependsOnId: dependsOnId || null,
        planCost: planCost !== undefined && planCost !== null && planCost !== "" ? Number(planCost) : null,
        flexibilityPercent:
          flexibilityPercent !== undefined && flexibilityPercent !== null && flexibilityPercent !== ""
            ? Number(flexibilityPercent)
            : null,
        planDays: planDays !== undefined && planDays !== null && planDays !== "" ? Number(planDays) : null,
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? new Date(dateTo) : null,
        actualCost: actualCost !== undefined ? Number(actualCost) : 0,
        actualHours: actualHours !== undefined ? Number(actualHours) : 0,
        subsidyEligible: Boolean(subsidyEligible),
        subsidyAmount: subsidyAmount !== undefined && subsidyAmount !== null && subsidyAmount !== "" ? Number(subsidyAmount) : null,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        // Persist external hyperlinks (1:N). Empty array → no rows created.
        links: { create: normalizedLinks },
      },
      select: BUDGET_ITEM_SELECT,
    });

    // If this is a child task, recalculate parent's dateFrom/dateTo
    if (parentId) {
      await recalcParentDates(parentId);
    }

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("POST budget error:", error);
    return NextResponse.json({ error: "Failed to create budget item" }, { status: 500 });
  }
}
