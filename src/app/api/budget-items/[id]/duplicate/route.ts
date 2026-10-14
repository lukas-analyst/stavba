import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/authz";

// POST /api/budget-items/[id]/duplicate
// Creates a copy of the budget item with "(kopie)" suffix in the same project,
// placed right after the original. Also recursively copies child tasks
// (BudgetItems where parentId === id) so that task hierarchies are preserved.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const original = await db.budgetItem.findUnique({ where: { id } });
    if (!original) {
      return NextResponse.json({ error: "Budget item not found" }, { status: 404 });
    }

    // IDOR fix: duplicating an item is a write operation — require editor
    // access to the project that owns the source item.
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
        completed: false, // reset completed for the duplicate
        note: original.note,
        unitPrice: original.unitPrice,
        planCost: original.planCost,
        flexibilityPercent: original.flexibilityPercent,
        planDays: original.planDays,
        dateFrom: original.dateFrom,
        dateTo: original.dateTo,
        actualCost: 0, // reset actuals for the duplicate
        actualHours: 0,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });

    // Copy child tasks (BudgetItems where parentId === id).
    // Children are reset to defaults that imply "not yet started":
    // completed=false, actualCost=0, actualHours=0.
    // Their parentId points to the freshly created duplicate so the
    // hierarchy is preserved on the copy side.
    const children = await db.budgetItem.findMany({
      where: { parentId: id },
      orderBy: { sortOrder: "asc" },
    });

    let nextSortOrder = (maxOrder._max.sortOrder ?? -1) + 2; // parent already used +1
    const duplicatedChildren: typeof children = [];
    for (const child of children) {
      const childCopy = await db.budgetItem.create({
        data: {
          projectId: original.projectId,
          parentId: duplicate.id, // link to the new parent copy
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

    // Audit log — single "create" entry for the duplicate operation.
    // Entity label indicates this is a copy of the original item.
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
    return NextResponse.json({ error: "Failed to duplicate budget item" }, { status: 500 });
  }
}
