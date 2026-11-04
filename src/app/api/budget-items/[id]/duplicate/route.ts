import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/authz";
import { parseParam, cuidSchema } from "@/lib/api-validation";

// POST /api/budget-items/[id]/duplicate
// Creates a copy of the budget item with "(kopie)" suffix in the same project,
// placed right after the original. Also recursively copies child tasks.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    const original = await db.budgetItem.findUnique({ where: { id } });
    if (!original) {
      return NextResponse.json(
        { error: t("budget.notFound") },
        { status: 404 },
      );
    }

    // IDOR fix: duplicating an item is a write operation — require editor
    const access = await requireProjectAccess(original.projectId, "editor");
    if (!access.ok) return access.response;

    const maxOrder = await db.budgetItem.aggregate({
      where: { projectId: original.projectId },
      _max: { sortOrder: true },
    });

    const duplicate = await db.budgetItem.create({
      data: {
        projectId: original.projectId,
        category: original.category,
        subcategory: original.subcategory
          ? `${original.subcategory} (kopie)`
          : "(kopie)",
        element: original.element,
        phase: original.phase,
        required: original.required,
        completed: false,
        note: original.note,
        unitPrice: original.unitPrice,
        planCost: original.planCost,
        flexibilityPercent: original.flexibilityPercent,
        planDays: original.planDays,
        dateFrom: original.dateFrom,
        dateTo: original.dateTo,
        actualCost: 0,
        actualHours: 0,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });

    // Copy child tasks
    const children = await db.budgetItem.findMany({
      where: { parentId: id },
      orderBy: { sortOrder: "asc" },
    });

    let nextSortOrder = (maxOrder._max.sortOrder ?? -1) + 2;
    const duplicatedChildren: typeof children = [];
    for (const child of children) {
      const childCopy = await db.budgetItem.create({
        data: {
          projectId: original.projectId,
          parentId: duplicate.id,
          category: child.category,
          subcategory: child.subcategory,
          element: child.element,
          phase: child.phase,
          required: child.required,
          completed: false,
          note: child.note,
          unitPrice: child.unitPrice,
          planCost: child.planCost,
          flexibilityPercent: child.flexibilityPercent,
          planDays: child.planDays,
          dateFrom: child.dateFrom,
          dateTo: child.dateTo,
          actualCost: 0,
          actualHours: 0,
          sortOrder: nextSortOrder++,
        },
      });
      duplicatedChildren.push(childCopy);
    }

    await logChanges(
      original.projectId,
      "BudgetItem",
      duplicate.id,
      "create",
      null,
      {
        projectId: duplicate.projectId,
        category: duplicate.category,
        subcategory: duplicate.subcategory,
        element: duplicate.element,
        phase: duplicate.phase,
        planCost: duplicate.planCost,
        parentId: duplicate.parentId,
        duplicatedFromId: original.id,
        duplicatedChildrenCount: duplicatedChildren.length,
      },
      `Kopie: ${original.subcategory ?? original.element ?? original.category}`,
    );

    return NextResponse.json(
      { ...duplicate, children: duplicatedChildren },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST duplicate budget item error:", error);
    return NextResponse.json(
      { error: t("budget.createFailed") },
      { status: 500 },
    );
  }
}
