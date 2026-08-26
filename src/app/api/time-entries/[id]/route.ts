import { NextResponse } from "next/server";
import { db } from "@/lib/db";

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

    const updated = await db.timeEntry.update({
      where: { id },
      data: {
        budgetItemId: body.budgetItemId !== undefined ? body.budgetItemId : undefined,
        contactId: body.contactId !== undefined ? body.contactId || null : undefined,
        workerName: body.workerName !== undefined ? String(body.workerName).trim() : undefined,
        workerType: body.workerType !== undefined ? body.workerType : undefined,
        date: body.date !== undefined ? (body.date ? new Date(body.date) : new Date()) : undefined,
        hours: body.hours !== undefined ? Number(body.hours) : undefined,
        description: body.description !== undefined ? (body.description?.trim() || null) : undefined,
      },
      include: {
        budgetItem: { select: { id: true, category: true, subcategory: true } },
        contact: { select: { id: true, name: true, type: true } },
      },
    });

    // Recompute affected budget item actualHours
    const budgetItemId = existing.budgetItemId;
    const agg = await db.timeEntry.aggregate({
      where: { budgetItemId },
      _sum: { hours: true },
    });
    await db.budgetItem.update({
      where: { id: budgetItemId },
      data: { actualHours: agg._sum.hours ?? 0 },
    });

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
