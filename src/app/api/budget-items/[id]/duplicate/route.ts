import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/budget-items/[id]/duplicate
// Creates a copy of the budget item with "(kopie)" suffix in the same project,
// placed right after the original.
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

    return NextResponse.json(duplicate, { status: 201 });
  } catch (error) {
    console.error("POST duplicate budget item error:", error);
    return NextResponse.json({ error: "Failed to duplicate budget item" }, { status: 500 });
  }
}
