import { NextResponse } from "next/server";
import { db, dbRead } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/authz";
import { convertAmount } from "@/lib/currency";

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

    // IDOR fix: resolve the projectId via the parent BudgetItem and verify
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

    // === Multi-currency conversion ===
    // If currency or amount or date is being updated, recompute the conversion.
    const project = await dbRead.project.findUnique({
      where: { id: budgetItem.projectId },
      select: { currency: true },
    });
    const projectCurrency = project?.currency ?? "CZK";
    const effectiveAmount =
      body.amount !== undefined ? Number(body.amount) : existing.amount;
    const effectiveCurrency =
      body.currency !== undefined ? (body.currency || projectCurrency) : (existing.currency || projectCurrency);
    const effectiveDate =
      body.date !== undefined ? (body.date ? new Date(body.date) : new Date()) : existing.date;

    let amountConverted = effectiveAmount;
    let exchangeRateUsed: number | null | undefined = undefined;

    if (effectiveCurrency !== projectCurrency) {
      const conversion = await convertAmount(
        effectiveAmount,
        effectiveCurrency,
        projectCurrency,
        effectiveDate,
      );
      if (conversion) {
        amountConverted = conversion.converted;
        exchangeRateUsed = conversion.rate;
      }
    } else {
      exchangeRateUsed = null;
    }

    // Compute VAT amount if amount or vatRate is being updated
    let numVatRate: number | null | undefined = undefined;
    let numVatAmount: number | null | undefined = undefined;
    if (body.vatRate !== undefined) {
      numVatRate =
        body.vatRate === null || body.vatRate === ""
          ? null
          : Number(body.vatRate);
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
        currency: body.currency !== undefined
          ? (effectiveCurrency !== projectCurrency ? effectiveCurrency : null)
          : undefined,
        amountConverted: (body.amount !== undefined || body.currency !== undefined || body.date !== undefined)
          ? amountConverted
          : undefined,
        exchangeRateUsed: (body.amount !== undefined || body.currency !== undefined || body.date !== undefined)
          ? exchangeRateUsed
          : undefined,
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

    // Audit log (projectId already resolved above for authz)
    await logChanges(
      budgetItem.projectId,
      "Payment",
      id,
      "update",
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );

    // Recompute the affected budget item actualCost.
    // B24: If the payment was moved from one BudgetItem to another, both
    // the new AND the original item need to have actualCost recalculated —
    // otherwise the original item would retain the stale amount from the
    // moved payment.
    const newBudgetItemId = updated.budgetItemId;
    const originalBudgetItemId = existing.budgetItemId;

    const newAgg = await db.payment.aggregate({
      where: { budgetItemId: newBudgetItemId },
      _sum: { amountConverted: true },
    });
    await db.budgetItem.update({
      where: { id: newBudgetItemId },
      data: { actualCost: newAgg._sum.amountConverted ?? 0 },
    });

    if (
      originalBudgetItemId &&
      originalBudgetItemId !== newBudgetItemId
    ) {
      const originalAgg = await db.payment.aggregate({
        where: { budgetItemId: originalBudgetItemId },
        _sum: { amountConverted: true },
      });
      await db.budgetItem.update({
        where: { id: originalBudgetItemId },
        data: { actualCost: originalAgg._sum.amountConverted ?? 0 },
      });
    }

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
      "Payment",
      id,
      "delete",
      existing as unknown as Record<string, unknown>,
      null,
    );

    await db.payment.delete({ where: { id } });

    // Recompute the budget item actualCost using converted amounts
    const agg = await db.payment.aggregate({
      where: { budgetItemId },
      _sum: { amountConverted: true },
    });
    await db.budgetItem.update({
      where: { id: budgetItemId },
      data: { actualCost: agg._sum.amountConverted ?? 0 },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE payment error:", error);
    return NextResponse.json({ error: "Failed to delete payment" }, { status: 500 });
  }
}
