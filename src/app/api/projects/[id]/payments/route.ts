import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/projects/[id]/payments - list all payments for a project
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const payments = await db.payment.findMany({
      where: { budgetItem: { projectId: id } },
      orderBy: { date: "desc" },
      include: {
        budgetItem: { select: { id: true, category: true, subcategory: true } },
        contact: { select: { id: true, name: true, type: true } },
      },
    });
    return NextResponse.json(payments);
  } catch (error) {
    console.error("GET payments error:", error);
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 });
  }
}

// POST /api/projects/[id]/payments - create a payment
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { budgetItemId, contactId, amount, date, type, vendor, invoiceNumber, description } = body;

    if (!budgetItemId) {
      return NextResponse.json({ error: "budgetItemId is required" }, { status: 400 });
    }
    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
    }

    // ensure the budget item belongs to this project
    const item = await db.budgetItem.findFirst({
      where: { id: budgetItemId, projectId: id },
    });
    if (!item) {
      return NextResponse.json({ error: "Budget item not found in this project" }, { status: 404 });
    }

    const payment = await db.payment.create({
      data: {
        budgetItemId,
        contactId: contactId || null,
        amount: Number(amount),
        date: date ? new Date(date) : new Date(),
        type: type || "other",
        vendor: vendor?.trim() || null,
        invoiceNumber: invoiceNumber?.trim() || null,
        description: description?.trim() || null,
      },
      include: {
        budgetItem: { select: { id: true, category: true, subcategory: true } },
        contact: { select: { id: true, name: true, type: true } },
      },
    });

    // Recompute the budget item actualCost (sum of payments)
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
