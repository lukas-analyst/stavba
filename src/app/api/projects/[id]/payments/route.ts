import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { db, dbRead } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/authz";
import { convertAmount } from "@/lib/currency";

// Explicit field selection — fetch only what the frontend uses.
// `include` would fetch every column of budgetItem + contact (10+ columns each);
// `select` fetches only the 3-4 fields we actually display.
const PAYMENT_SELECT = {
  id: true,
  budgetItemId: true,
  contactId: true,
  amount: true,
  currency: true,
  amountConverted: true,
  exchangeRateUsed: true,
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

// Cached version of the payments list query — keyed by projectId (passed
// as the function argument, which Next.js includes in the cache key
// automatically), tagged "payments" with a short 15s TTL. Payment mutations
// bust this tag via `bustServerCache(projectId, [...])` in src/lib/api.ts.
const getCachedPayments = unstable_cache(
  async (projectId: string) => {
    const payments = await dbRead.payment.findMany({
      where: { budgetItem: { projectId } },
      orderBy: { date: "desc" },
      select: PAYMENT_SELECT,
    });
    return payments;
  },
  ["payments"],
  {
    tags: ["payments"],
    revalidate: 15, // 15 seconds — user adds payments often
  }
);

// GET /api/projects/[id]/payments - list all payments for a project
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireProjectAccess(id, "viewer");
    if (!access.ok) return access.response;
    const payments = await getCachedPayments(id);
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
    const access = await requireProjectAccess(id, "editor");
    if (!access.ok) return access.response;
    const body = await request.json();
    const {
      budgetItemId,
      contactId,
      amount,
      currency,
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

    // === Multi-currency conversion ===
    // Resolve the project's default currency to know what to convert TO.
    const project = await dbRead.project.findUnique({
      where: { id },
      select: { currency: true },
    });
    const projectCurrency = project?.currency ?? "CZK";
    const paymentCurrency = currency || projectCurrency;
    const paymentDate = date ? new Date(date) : new Date();

    // Convert amount to project currency
    let amountConverted = numAmount;
    let exchangeRateUsed: number | null = null;

    if (paymentCurrency !== projectCurrency) {
      const conversion = await convertAmount(
        numAmount,
        paymentCurrency,
        projectCurrency,
        paymentDate,
      );
      if (conversion) {
        amountConverted = conversion.converted;
        exchangeRateUsed = conversion.rate;
      }
      // If no rate available, amountConverted stays = numAmount (fallback)
    }

    const payment = await db.payment.create({
      data: {
        budgetItemId,
        contactId: contactId || null,
        amount: numAmount,
        currency: paymentCurrency !== projectCurrency ? paymentCurrency : null,
        amountConverted,
        exchangeRateUsed,
        invoiceTotal: invoiceTotal !== undefined && invoiceTotal !== null && invoiceTotal !== "" ? Number(invoiceTotal) : null,
        installmentOf: installmentOf || null,
        vatRate: numVatRate,
        vatAmount: numVatAmount,
        date: paymentDate,
        type: type || "other",
        vendor: vendor?.trim() || null,
        invoiceNumber: invoiceNumber?.trim() || null,
        description: description?.trim() || null,
      },
      select: PAYMENT_SELECT,
    });

    // Recompute the budget item actualCost using converted amounts.
    const agg = await db.payment.aggregate({
      where: { budgetItemId },
      _sum: { amountConverted: true },
    });
    await db.budgetItem.update({
      where: { id: budgetItemId },
      data: { actualCost: agg._sum.amountConverted ?? 0 },
    });

    // Log creation to audit log. `item.projectId` is the parent project
    // (validated above to match the URL param `id`).
    await logChanges(
      item.projectId,
      "Payment",
      payment.id,
      "create",
      null,
      {
        amount: payment.amount,
        type: payment.type,
        budgetItemId,
      },
      payment.description || payment.vendor,
    );

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error("POST payment error:", error);
    return NextResponse.json({ error: "Failed to create payment" }, { status: 500 });
  }
}
