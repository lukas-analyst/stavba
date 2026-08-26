import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH /api/payments/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.payment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const updated = await db.payment.update({
      where: { id },
      data: {
        budgetItemId:
          body.budgetItemId !== undefined ? body.budgetItemId : undefined,
        contactId: body.contactId !== undefined ? body.contactId || null : undefined,
        amount: body.amount !== undefined ? Number(body.amount) : undefined,
        date: body.date !== undefined ? (body.date ? new Date(body.date) : new Date()) : undefined,
        type: body.type !== undefined ? body.type : undefined,
        vendor: body.vendor !== undefined ? (body.vendor?.trim() || null) : undefined,
        invoiceNumber:
          body.invoiceNumber !== undefined ? (body.invoiceNumber?.trim() || null) : undefined,
        description:
          body.description !== undefined ? (body.description?.trim() || null) : undefined,
      },
      include: {
        budgetItem: { select: { id: true, category: true, subcategory: true } },
        contact: { select: { id: true, name: true, type: true } },
      },
    });

    // Recompute the affected budget item actualCost
    const budgetItemId = existing.budgetItemId;
    const agg = await db.payment.aggregate({
      where: { budgetItemId },
      _sum: { amount: true },
    });
    await db.budgetItem.update({
      where: { id: budgetItemId },
      data: { actualCost: agg._sum.amount ?? 0 },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH payment error:", error);
    return NextResponse.json({ error: "Failed to update payment" }, { status: 500 });
  }
}

// DELETE /api/payments/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await db.payment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    const budgetItemId = existing.budgetItemId;
    await db.payment.delete({ where: { id } });

    // Recompute the budget item actualCost
    const agg = await db.payment.aggregate({
      where: { budgetItemId },
      _sum: { amount: true },
    });
    await db.budgetItem.update({
      where: { id: budgetItemId },
      data: { actualCost: agg._sum.amount ?? 0 },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE payment error:", error);
    return NextResponse.json({ error: "Failed to delete payment" }, { status: 500 });
  }
}
