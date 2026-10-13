import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { db, dbRead } from "@/lib/db";
import { logChanges } from "@/lib/audit";

// Explicit field selection — fetch only what the frontend uses.
const TIME_ENTRY_SELECT = {
  id: true,
  budgetItemId: true,
  contactId: true,
  workerName: true,
  workerType: true,
  date: true,
  dateTo: true,
  hours: true,
  workerCount: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  budgetItem: { select: { id: true, category: true, subcategory: true } },
  contact: { select: { id: true, name: true, type: true } },
} as const;

// Cached version of the time entries list query — keyed by projectId
// (passed as the function argument, which Next.js includes in the cache
// key automatically), tagged "time-entries" with a short 15s TTL. Time
// mutations bust this tag via `bustServerCache(projectId, [...])` in
// src/lib/api.ts.
const getCachedTimeEntries = unstable_cache(
  async (projectId: string) => {
    const entries = await dbRead.timeEntry.findMany({
      where: { budgetItem: { projectId } },
      orderBy: { date: "desc" },
      select: TIME_ENTRY_SELECT,
    });
    return entries;
  },
  ["time-entries"],
  {
    tags: ["time-entries"],
    revalidate: 15, // 15 seconds — user adds time entries often
  }
);

// GET /api/projects/[id]/time - list all time entries for a project
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const entries = await getCachedTimeEntries(id);
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
    const { budgetItemId, contactId, workerName, workerType, date, dateTo, hours, workerCount, description } = body;

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

    // Validate dateTo >= date if provided
    const startDate = date ? new Date(date) : new Date();
    let endDate: Date | null = null;
    if (dateTo) {
      endDate = new Date(dateTo);
      if (endDate < startDate) {
        return NextResponse.json({ error: "dateTo must be on or after date" }, { status: 400 });
      }
    }

    const entry = await db.timeEntry.create({
      data: {
        budgetItemId,
        contactId: contactId || null,
        workerName: (workerName || "Neznámý").trim(),
        workerType: workerType || "self",
        date: startDate,
        dateTo: endDate,
        hours: Number(hours),
        workerCount: workerCount ? Math.max(1, Number(workerCount)) : 1,
        description: description?.trim() || null,
      },
      select: TIME_ENTRY_SELECT,
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

    // Log creation to audit log. `item.projectId` is the parent project
    // (validated above to match the URL param `id`).
    await logChanges(
      item.projectId,
      "TimeEntry",
      entry.id,
      "create",
      null,
      {
        workerName: entry.workerName,
        hours: entry.hours,
        budgetItemId,
      },
      entry.workerName,
    );

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("POST time entry error:", error);
    return NextResponse.json({ error: "Failed to create time entry" }, { status: 500 });
  }
}
