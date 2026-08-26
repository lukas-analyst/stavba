import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH /api/budget-items/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.budgetItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Budget item not found" }, { status: 404 });
    }

    const numOrUndef = (v: unknown) =>
      v === undefined ? undefined : v === null || v === "" ? null : Number(v);

    const updated = await db.budgetItem.update({
      where: { id },
      data: {
        category: body.category !== undefined ? String(body.category).trim() : undefined,
        subcategory: body.subcategory !== undefined ? (body.subcategory?.trim() || null) : undefined,
        element: body.element !== undefined ? (body.element?.trim() || null) : undefined,
        phase: body.phase !== undefined ? body.phase : undefined,
        required: body.required !== undefined ? Boolean(body.required) : undefined,
        completed: body.completed !== undefined ? Boolean(body.completed) : undefined,
        note: body.note !== undefined ? (body.note?.trim() || null) : undefined,
        unitPrice: body.unitPrice !== undefined ? (body.unitPrice?.trim() || null) : undefined,
        planCost: body.planCost !== undefined ? numOrUndef(body.planCost) : undefined,
        flexibilityPercent:
          body.flexibilityPercent !== undefined ? numOrUndef(body.flexibilityPercent) : undefined,
        planDays: body.planDays !== undefined ? numOrUndef(body.planDays) : undefined,
        dateFrom:
          body.dateFrom !== undefined
            ? body.dateFrom
              ? new Date(body.dateFrom)
              : null
            : undefined,
        dateTo:
          body.dateTo !== undefined
            ? body.dateTo
              ? new Date(body.dateTo)
              : null
            : undefined,
        actualCost: body.actualCost !== undefined ? numOrUndef(body.actualCost) ?? 0 : undefined,
        actualHours: body.actualHours !== undefined ? numOrUndef(body.actualHours) ?? 0 : undefined,
        sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH budget item error:", error);
    return NextResponse.json({ error: "Failed to update budget item" }, { status: 500 });
  }
}

// DELETE /api/budget-items/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await db.budgetItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Budget item not found" }, { status: 404 });
    }
    await db.budgetItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE budget item error:", error);
    return NextResponse.json({ error: "Failed to delete budget item" }, { status: 500 });
  }
}
