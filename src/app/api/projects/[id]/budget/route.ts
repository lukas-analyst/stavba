import { NextResponse } from "next/server";
import { db, dbRead } from "@/lib/db";

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
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { payments: true, timeEntries: true, comments: true } },
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
    } = body;

    if (!category || typeof category !== "string" || !category.trim()) {
      return NextResponse.json({ error: "Category is required" }, { status: 400 });
    }

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
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
      select: BUDGET_ITEM_SELECT,
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("POST budget error:", error);
    return NextResponse.json({ error: "Failed to create budget item" }, { status: 500 });
  }
}
