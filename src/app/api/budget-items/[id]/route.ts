import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { recalcParentDates } from "@/lib/recalc-parent-dates";

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

    // Build the update data
    const updateData: Record<string, unknown> = {};
    if (body.category !== undefined) updateData.category = String(body.category).trim();
    if (body.subcategory !== undefined) updateData.subcategory = body.subcategory?.trim() || null;
    if (body.element !== undefined) updateData.element = body.element?.trim() || null;
    if (body.phase !== undefined) updateData.phase = body.phase;
    if (body.required !== undefined) updateData.required = Boolean(body.required);
    if (body.completed !== undefined) updateData.completed = Boolean(body.completed);
    if (body.rejected !== undefined) updateData.rejected = Boolean(body.rejected);
    if (body.parentId !== undefined) updateData.parentId = body.parentId || null;
    if (body.dependsOnId !== undefined) updateData.dependsOnId = body.dependsOnId || null;
    if (body.note !== undefined) updateData.note = body.note?.trim() || null;
    if (body.unitPrice !== undefined) updateData.unitPrice = body.unitPrice?.trim() || null;
    if (body.planCost !== undefined) updateData.planCost = numOrUndef(body.planCost);
    if (body.flexibilityPercent !== undefined) updateData.flexibilityPercent = numOrUndef(body.flexibilityPercent);
    if (body.planDays !== undefined) updateData.planDays = numOrUndef(body.planDays);
    if (body.dateFrom !== undefined) updateData.dateFrom = body.dateFrom ? new Date(body.dateFrom) : null;
    if (body.dateTo !== undefined) updateData.dateTo = body.dateTo ? new Date(body.dateTo) : null;
    if (body.actualCost !== undefined) updateData.actualCost = numOrUndef(body.actualCost) ?? 0;
    if (body.actualHours !== undefined) updateData.actualHours = numOrUndef(body.actualHours) ?? 0;
    if (body.sortOrder !== undefined) updateData.sortOrder = Number(body.sortOrder);

    const updated = await db.budgetItem.update({
      where: { id },
      data: updateData,
    });

    // Log changes to audit log
    await logChanges(
      existing.projectId,
      "BudgetItem",
      id,
      "update",
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );

    // If dateFrom/dateTo changed or item was re-parented, recalculate parent dates
    const dateChanged =
      updateData.dateFrom !== undefined || updateData.dateTo !== undefined;
    const parentChanged =
      updateData.parentId !== undefined && updateData.parentId !== existing.parentId;

    if (updated.parentId && (dateChanged || parentChanged)) {
      await recalcParentDates(updated.parentId);
    }
    // If item was moved to a new parent, also recalc the OLD parent
    if (parentChanged && existing.parentId) {
      await recalcParentDates(existing.parentId);
    }

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

    // Log deletion before deleting
    await logChanges(
      existing.projectId,
      "BudgetItem",
      id,
      "delete",
      existing as unknown as Record<string, unknown>,
      null,
    );

    await db.budgetItem.delete({ where: { id } });

    // If this was a child task, recalculate parent's dateFrom/dateTo
    if (existing.parentId) {
      await recalcParentDates(existing.parentId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE budget item error:", error);
    return NextResponse.json({ error: "Failed to delete budget item" }, { status: 500 });
  }
}
