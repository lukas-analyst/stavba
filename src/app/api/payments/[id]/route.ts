import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db, dbRead } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/authz";
import { convertAmount } from "@/lib/currency";
import { normalizeRecurringInterval, computeNextRecurringDate } from "@/lib/recurring";
import {
  parseBody,
  parseParam,
  cuidSchema,
  optionalNullableString,
} from "@/lib/api-validation";

// PATCH body schema — all fields optional (partial update).
const patchPaymentBodySchema = z.object({
  budgetItemId: cuidSchema.optional(),
  contactId: z.union([cuidSchema, z.null()]).optional(),
  amount: z.number().finite().optional(),
  currency: z.union([z.string().regex(/^[A-Z]{3}$/), z.null()]).optional(),
  invoiceTotal: z.union([z.number().finite(), z.null()]).optional(),
  installmentOf: z.union([cuidSchema, z.null()]).optional(),
  vatRate: z.union([z.number().min(0).max(100), z.null()]).optional(),
  date: z
    .union([z.string().refine((s) => !isNaN(Date.parse(s)), { message: "payment.invalidDate" }), z.null()])
    .optional(),
  type: z.string().max(50).optional(),
  vendor: optionalNullableString.optional(),
  invoiceNumber: optionalNullableString.optional(),
  description: optionalNullableString.optional(),
  recurringInterval: z.union([z.string().max(20), z.null()]).optional(),
});

// PATCH /api/payments/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    // Parse + validate body (Zod).
    const result = await parseBody(patchPaymentBodySchema, request, t);
    if (!result.success) return result.response;
    const body: Record<string, unknown> = { ...result.data };

    const existing = await db.payment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: t("payment.notFound") },
        { status: 404 },
      );
    }

    // IDOR fix: resolve the projectId via the parent BudgetItem and verify
    // editor access before performing the update.
    const budgetItem = await db.budgetItem.findUnique({
      where: { id: existing.budgetItemId },
      select: { projectId: true },
    });
    if (!budgetItem) {
      return NextResponse.json(
        { error: t("payment.budgetItemNotFound") },
        { status: 404 },
      );
    }
    const access = await requireProjectAccess(budgetItem.projectId, "editor");
    if (!access.ok) return access.response;

    // Security: if budgetItemId is being changed, verify the NEW budget item
    // belongs to the SAME project as the current one.
    if (body.budgetItemId !== undefined && body.budgetItemId !== existing.budgetItemId) {
      const newBudgetItem = await db.budgetItem.findUnique({
        where: { id: body.budgetItemId as string },
        select: { projectId: true },
      });
      if (!newBudgetItem) {
        return NextResponse.json(
          { error: t("payment.newBudgetItemNotFound") },
          { status: 404 },
        );
      }
      if (newBudgetItem.projectId !== budgetItem.projectId) {
        return NextResponse.json(
          { error: t("payment.cannotMoveAcrossProjects") },
          { status: 403 },
        );
      }
    }

    // === Multi-currency conversion ===
    const project = await dbRead.project.findUnique({
      where: { id: budgetItem.projectId },
      select: { currency: true },
    });
    const projectCurrency = project?.currency ?? "CZK";
    const effectiveAmount =
      body.amount !== undefined ? (body.amount as number) : existing.amount;
    const effectiveCurrency =
      body.currency !== undefined
        ? ((body.currency as string) || projectCurrency)
        : (existing.currency || projectCurrency);
    const effectiveDate =
      body.date !== undefined
        ? (body.date ? new Date(body.date as string) : new Date())
        : existing.date;

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
      numVatRate = body.vatRate as number | null;
      numVatAmount =
        numVatRate !== null && numVatRate > 0
          ? (effectiveAmount * numVatRate) / (100 + numVatRate)
          : null;
    } else if (body.amount !== undefined && existing.vatRate !== null && existing.vatRate > 0) {
      numVatAmount = ((body.amount as number) * existing.vatRate) / (100 + existing.vatRate);
    }

    // === Recurring payment fields ===
    let recurringIntervalValue: "weekly" | "monthly" | "quarterly" | "yearly" | null | undefined = undefined;
    let recurringNextDateValue: Date | null | undefined = undefined;
    if (body.recurringInterval !== undefined) {
      const normalized = normalizeRecurringInterval(body.recurringInterval as string | null | undefined);
      recurringIntervalValue = normalized;
      if (normalized !== null) {
        recurringNextDateValue = computeNextRecurringDate(effectiveDate, normalized);
      } else {
        recurringNextDateValue = null;
      }
    } else if (
      body.date !== undefined &&
      existing.recurringInterval !== null &&
      existing.recurringInterval !== undefined
    ) {
      const normalized = normalizeRecurringInterval(existing.recurringInterval);
      if (normalized !== null) {
        recurringIntervalValue = normalized;
        recurringNextDateValue = computeNextRecurringDate(effectiveDate, normalized);
      }
    }

    const updated = await db.payment.update({
      where: { id },
      data: {
        budgetItemId: body.budgetItemId !== undefined ? (body.budgetItemId as string) : undefined,
        contactId: body.contactId !== undefined ? ((body.contactId as string | null) || null) : undefined,
        amount: body.amount !== undefined ? (body.amount as number) : undefined,
        currency: body.currency !== undefined
          ? (effectiveCurrency !== projectCurrency ? effectiveCurrency : null)
          : undefined,
        amountConverted: (body.amount !== undefined || body.currency !== undefined || body.date !== undefined)
          ? amountConverted
          : undefined,
        exchangeRateUsed: (body.amount !== undefined || body.currency !== undefined || body.date !== undefined)
          ? exchangeRateUsed
          : undefined,
        invoiceTotal: body.invoiceTotal !== undefined ? (body.invoiceTotal as number | null) : undefined,
        installmentOf: body.installmentOf !== undefined ? ((body.installmentOf as string | null) || null) : undefined,
        date: body.date !== undefined ? (body.date ? new Date(body.date as string) : new Date()) : undefined,
        type: body.type !== undefined ? (body.type as string) : undefined,
        vendor: body.vendor !== undefined ? (body.vendor as string | null) : undefined,
        invoiceNumber: body.invoiceNumber !== undefined ? (body.invoiceNumber as string | null) : undefined,
        description: body.description !== undefined ? (body.description as string | null) : undefined,
        vatRate: numVatRate,
        vatAmount: numVatAmount,
        recurringInterval: recurringIntervalValue,
        recurringNextDate: recurringNextDateValue,
      },
      include: {
        budgetItem: { select: { id: true, category: true, subcategory: true } },
        contact: { select: { id: true, name: true, type: true } },
      },
    });

    // Audit log
    await logChanges(
      budgetItem.projectId,
      "Payment",
      id,
      "update",
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );

    // Recompute the affected budget item actualCost.
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

    if (originalBudgetItemId && originalBudgetItemId !== newBudgetItemId) {
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
    return NextResponse.json(
      { error: t("payment.updateFailed") },
      { status: 500 },
    );
  }
}

// DELETE /api/payments/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    const existing = await db.payment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: t("payment.notFound") },
        { status: 404 },
      );
    }
    const budgetItemId = existing.budgetItemId;

    // IDOR fix: resolve projectId via the parent BudgetItem and require
    // editor access before deleting.
    const budgetItem = await db.budgetItem.findUnique({
      where: { id: budgetItemId },
      select: { projectId: true },
    });
    if (!budgetItem) {
      return NextResponse.json(
        { error: t("payment.budgetItemNotFound") },
        { status: 404 },
      );
    }
    const access = await requireProjectAccess(budgetItem.projectId, "editor");
    if (!access.ok) return access.response;

    // Audit log before deleting
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
    return NextResponse.json(
      { error: t("payment.deleteFailed") },
      { status: 500 },
    );
  }
}
