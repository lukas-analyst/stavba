import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";

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

    // Compute VAT amount if amount or vatRate is being updated
    let numVatRate: number | null | undefined = undefined;
    let numVatAmount: number | null | undefined = undefined;
    if (body.vatRate !== undefined) {
      numVatRate =
        body.vatRate === null || body.vatRate === ""
          ? null
          : Number(body.vatRate);
      const effectiveAmount =
        body.amount !== undefined ? Number(body.amount) : existing.amount;
      numVatAmount =
        numVatRate !== null && numVatRate > 0
          ? (effectiveAmount * numVatRate) / (100 + numVatRate)
          : null;
    } else if (body.amount !== undefined && existing.vatRate !== null && existing.vatRate > 0) {
      // Amount changed but VAT rate unchanged -> recompute VAT amount
      numVatAmount = (Number(body.amount) * existing.vatRate) / (100 + existing.vatRate);
    }

    const updated = await db.payment.update({
      where: { id },
      data: {
        budgetItemId:
          body.budgetItemId !== undefined ? body.budgetItemId : undefined,
        contactId: body.contactId !== undefined ? body.contactId || null : undefined,
        amount: body.amount !== undefined ? Number(body.amount) : undefined,
        invoiceTotal:
          body.invoiceTotal !== undefined
            ? body.invoiceTotal === null || body.invoiceTotal === ""
              ? null
              : Number(body.invoiceTotal)
            : undefined,
        installmentOf:
          body.installmentOf !== undefined ? body.installmentOf || null : undefined,
        date: body.date !== undefined ? (body.date ? new Date(body.date) : new Date()) : undefined,
        type: body.type !== undefined ? body.type : undefined,
        vendor: body.vendor !== undefined ? (body.vendor?.trim() || null) : undefined,
        invoiceNumber:
          body.invoiceNumber !== undefined ? (body.invoiceNumber?.trim() || null) : undefined,
        description:
          body.description !== undefined ? (body.description?.trim() || null) : undefined,
        vatRate: numVatRate,
        vatAmount: numVatAmount,
      },
      include: {
        budgetItem: { select: { id: true, category: true, subcategory: true } },
        contact: { select: { id: true, name: true, type: true } },
      },
    });

    // Get projectId for audit log
    const budgetItem = await db.budgetItem.findUnique({
      where: { id: existing.budgetItemId },
      select: { projectId: true },
    });
    if (budgetItem) {
      await logChanges(
        budgetItem.projectId,
        "Payment",
        id,
        "update",
        existing as unknown as Record<string, unknown>,
        updated as unknown as Record<string, unknown>,
      );
    }

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

    // Get projectId for audit log before deleting
    const budgetItem = await db.budgetItem.findUnique({
      where: { id: budgetItemId },
      select: { projectId: true },
    });
    if (budgetItem) {
      await logChanges(
        budgetItem.projectId,
        "Payment",
        id,
        "delete",
        existing as unknown as Record<string, unknown>,
        null,
      );
    }

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
