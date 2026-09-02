import { NextResponse } from "next/server";
import { db, dbRead } from "@/lib/db";

// Explicit field selection — fetch only what the frontend uses.
// `include` would fetch every column of budgetItem + contact (10+ columns each);
// `select` fetches only the 3-4 fields we actually display.
const PAYMENT_SELECT = {
  id: true,
  budgetItemId: true,
  contactId: true,
  amount: true,
  invoiceTotal: true,
  installmentOf: true,
  vatRate: true,
  vatAmount: true,
  date: true,
  type: true,
  vendor: true,
  invoiceNumber: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  budgetItem: { select: { id: true, category: true, subcategory: true } },
  contact: { select: { id: true, name: true, type: true } },
} as const;

// GET /api/projects/[id]/payments - list all payments for a project
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const payments = await dbRead.payment.findMany({
      where: { budgetItem: { projectId: id } },
      orderBy: { date: "desc" },
      select: PAYMENT_SELECT,
    });
    return NextResponse.json(payments);
  } catch (error) {
    console.error("GET payments error:", error);
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 });
  }
}

// POST /api/projects/[id]/payments - create a payment (or an invoice/installment)
// Body fields:
//   amount, budgetItemId (required)
//   invoiceTotal (optional) - if set, this is an invoice with an expected total
//   installmentOf (optional) - parent payment id, makes this an installment of that invoice
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      budgetItemId,
      contactId,
      amount,
      invoiceTotal,
      installmentOf,
      vatRate,
      date,
      type,
      vendor,
      invoiceNumber,
      description,
    } = body;

    if (!budgetItemId) {
      return NextResponse.json({ error: "budgetItemId is required" }, { status: 400 });
    }
    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
    }

    const item = await db.budgetItem.findFirst({
      where: { id: budgetItemId, projectId: id },
    });
    if (!item) {
      return NextResponse.json({ error: "Budget item not found in this project" }, { status: 404 });
    }

    // If this is an installment, validate the parent exists & belongs to same project
    if (installmentOf) {
      const parent = await db.payment.findFirst({
        where: { id: installmentOf, budgetItem: { projectId: id } },
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent payment not found" }, { status: 404 });
      }
    }

    const numAmount = Number(amount);
    const numVatRate = vatRate !== undefined && vatRate !== null && vatRate !== "" ? Number(vatRate) : null;
    // Compute VAT amount: if amount includes VAT, vatAmount = amount * vatRate / (100 + vatRate)
    const numVatAmount =
      numVatRate !== null && numVatRate > 0
        ? (numAmount * numVatRate) / (100 + numVatRate)
        : null;

    const payment = await db.payment.create({
      data: {
        budgetItemId,
        contactId: contactId || null,
        amount: numAmount,
        invoiceTotal: invoiceTotal !== undefined && invoiceTotal !== null && invoiceTotal !== "" ? Number(invoiceTotal) : null,
        installmentOf: installmentOf || null,
        vatRate: numVatRate,
        vatAmount: numVatAmount,
        date: date ? new Date(date) : new Date(),
        type: type || "other",
        vendor: vendor?.trim() || null,
        invoiceNumber: invoiceNumber?.trim() || null,
        description: description?.trim() || null,
      },
      select: PAYMENT_SELECT,
    });

    // Recompute the budget item actualCost.
    // Important: parent/invoice payments have amount=0 (they are just the "expected total" record),
    // installments have the actual paid amount. So summing all payments works correctly.
    const agg = await db.payment.aggregate({
      where: { budgetItemId },
      _sum: { amount: true },
    });
    await db.budgetItem.update({
      where: { id: budgetItemId },
      data: { actualCost: agg._sum.amount ?? 0 },
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error("POST payment error:", error);
    return NextResponse.json({ error: "Failed to create payment" }, { status: 500 });
  }
}
