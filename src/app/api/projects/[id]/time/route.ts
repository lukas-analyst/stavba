import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/projects/[id]/time - list all time entries for a project
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const entries = await db.timeEntry.findMany({
      where: { budgetItem: { projectId: id } },
      orderBy: { date: "desc" },
      include: {
        budgetItem: { select: { id: true, category: true, subcategory: true } },
        contact: { select: { id: true, name: true, type: true } },
      },
    });
    return NextResponse.json(entries);
  } catch (error) {
    console.error("GET time entries error:", error);
    return NextResponse.json({ error: "Failed to fetch time entries" }, { status: 500 });
  }
}

// POST /api/projects/[id]/time - create a time entry
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { budgetItemId, contactId, workerName, workerType, date, hours, description } = body;

    if (!budgetItemId) {
      return NextResponse.json({ error: "budgetItemId is required" }, { status: 400 });
    }
    if (hours === undefined || hours === null || isNaN(Number(hours)) || Number(hours) <= 0) {
      return NextResponse.json({ error: "Valid hours (> 0) is required" }, { status: 400 });
    }

    const item = await db.budgetItem.findFirst({
      where: { id: budgetItemId, projectId: id },
    });
    if (!item) {
      return NextResponse.json({ error: "Budget item not found in this project" }, { status: 404 });
    }

    const entry = await db.timeEntry.create({
      data: {
        budgetItemId,
        contactId: contactId || null,
        workerName: (workerName || "Neznámý").trim(),
        workerType: workerType || "self",
        date: date ? new Date(date) : new Date(),
        hours: Number(hours),
        description: description?.trim() || null,
      },
      include: {
        budgetItem: { select: { id: true, category: true, subcategory: true } },
        contact: { select: { id: true, name: true, type: true } },
      },
    });

    // Recompute the budget item actualHours
    const agg = await db.timeEntry.aggregate({
      where: { budgetItemId },
      _sum: { hours: true },
    });
    await db.budgetItem.update({
      where: { id: budgetItemId },
      data: { actualHours: agg._sum.hours ?? 0 },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("POST time entry error:", error);
    return NextResponse.json({ error: "Failed to create time entry" }, { status: 500 });
  }
}
