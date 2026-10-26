import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/authz";

// PATCH /api/time-entries/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.timeEntry.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Time entry not found" }, { status: 404 });
    }

    // IDOR fix: resolve projectId via the parent BudgetItem and verify
    // editor access before performing the update. The same fetch is reused
    // below for the audit log, so we hoist it here.
    const budgetItem = await db.budgetItem.findUnique({
      where: { id: existing.budgetItemId },
      select: { projectId: true },
    });
    if (!budgetItem) {
      return NextResponse.json({ error: "Budget item not found" }, { status: 404 });
    }
    const access = await requireProjectAccess(budgetItem.projectId, "editor");
    if (!access.ok) return access.response;

    // Security: if budgetItemId is being changed, verify the NEW budget item
    // belongs to the SAME project (prevent cross-project data moves).
    if (body.budgetItemId !== undefined && body.budgetItemId !== existing.budgetItemId) {
      const newBudgetItem = await db.budgetItem.findUnique({
        where: { id: body.budgetItemId },
        select: { projectId: true },
      });
      if (!newBudgetItem) {
        return NextResponse.json({ error: "New budget item not found" }, { status: 404 });
      }
      if (newBudgetItem.projectId !== budgetItem.projectId) {
        return NextResponse.json(
          { error: "Cannot move time entry to a budget item in a different project" },
          { status: 403 },
        );
      }
    }

    const updated = await db.timeEntry.update({
      where: { id },
      data: {
        budgetItemId: body.budgetItemId !== undefined ? body.budgetItemId : undefined,
        contactId: body.contactId !== undefined ? body.contactId || null : undefined,
        workerName: body.workerName !== undefined ? String(body.workerName).trim() : undefined,
        workerType: body.workerType !== undefined ? body.workerType : undefined,
        date: body.date !== undefined ? (body.date ? new Date(body.date) : new Date()) : undefined,
        dateTo:
          body.dateTo !== undefined
            ? body.dateTo
              ? new Date(body.dateTo)
              : null
            : undefined,
        hours: body.hours !== undefined ? Number(body.hours) : undefined,
        workerCount: body.workerCount !== undefined ? Math.max(1, Number(body.workerCount)) : undefined,
        description: body.description !== undefined ? (body.description?.trim() || null) : undefined,
      },
      include: {
        budgetItem: { select: { id: true, category: true, subcategory: true } },
        contact: { select: { id: true, name: true, type: true } },
      },
    });

    // Audit log (projectId already resolved above for authz)
    await logChanges(
      budgetItem.projectId,
      "TimeEntry",
      id,
      "update",
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );

    // Recompute affected budget item actualHours.
    // B25: If the time entry was moved from one BudgetItem to another,
    // both the new AND the original item need to have actualHours
    // recalculated — otherwise the original item would retain the stale
    // hours from the moved entry.
    const newBudgetItemId = updated.budgetItemId;
    const originalBudgetItemId = existing.budgetItemId;

    const newAgg = await db.timeEntry.aggregate({
      where: { budgetItemId: newBudgetItemId },
      _sum: { hours: true },
    });
    await db.budgetItem.update({
      where: { id: newBudgetItemId },
      data: { actualHours: newAgg._sum.hours ?? 0 },
    });

    if (
      originalBudgetItemId &&
      originalBudgetItemId !== newBudgetItemId
    ) {
      const originalAgg = await db.timeEntry.aggregate({
        where: { budgetItemId: originalBudgetItemId },
        _sum: { hours: true },
      });
      await db.budgetItem.update({
        where: { id: originalBudgetItemId },
        data: { actualHours: originalAgg._sum.hours ?? 0 },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH time entry error:", error);
    return NextResponse.json({ error: "Failed to update time entry" }, { status: 500 });
  }
}

// DELETE /api/time-entries/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await db.timeEntry.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Time entry not found" }, { status: 404 });
    }
    const budgetItemId = existing.budgetItemId;

    // IDOR fix: resolve projectId via the parent BudgetItem and require
    // editor access before deleting. The same fetch is reused below for
    // the audit log.
    const budgetItem = await db.budgetItem.findUnique({
      where: { id: budgetItemId },
      select: { projectId: true },
    });
    if (!budgetItem) {
      return NextResponse.json({ error: "Budget item not found" }, { status: 404 });
    }
    const access = await requireProjectAccess(budgetItem.projectId, "editor");
    if (!access.ok) return access.response;

    // Audit log before deleting (projectId already resolved above for authz)
    await logChanges(
      budgetItem.projectId,
      "TimeEntry",
      id,
      "delete",
      existing as unknown as Record<string, unknown>,
      null,
    );

    await db.timeEntry.delete({ where: { id } });

    const agg = await db.timeEntry.aggregate({
      where: { budgetItemId },
      _sum: { hours: true },
    });
    await db.budgetItem.update({
      where: { id: budgetItemId },
      data: { actualHours: agg._sum.hours ?? 0 },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE time entry error:", error);
    return NextResponse.json({ error: "Failed to delete time entry" }, { status: 500 });
  }
}
