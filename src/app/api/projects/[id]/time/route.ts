import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { unstable_cache } from "next/cache";
import { db, dbRead } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/authz";
import {
  parseBody,
  parseParam,
  cuidSchema,
  optionalNullableString,
  optionalIsoDate,
  optionalCuidOrNull,
} from "@/lib/api-validation";

// Body schema for POST /api/projects/[id]/time
const createTimeEntryBodySchema = z.object({
  budgetItemId: cuidSchema,
  contactId: optionalCuidOrNull,
  workerName: z.string().trim().max(200).nullish(),
  workerType: z.string().max(50).nullish(),
  date: optionalIsoDate,
  dateTo: optionalIsoDate,
  hours: z.preprocess(
    (v) => {
      if (typeof v === "string") return Number(v);
      return v;
    },
    z.number().positive().finite({ message: "time.hoursRequired" }),
  ),
  workerCount: z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return undefined;
      if (typeof v === "string") return Number(v);
      return v;
    },
    z.number().int().min(1).optional(),
  ),
  description: optionalNullableString.optional(),
});

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
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    const access = await requireProjectAccess(id, "viewer");
    if (!access.ok) return access.response;
    const entries = await getCachedTimeEntries(id);
    return NextResponse.json(entries);
  } catch (error) {
    console.error("GET time entries error:", error);
    return NextResponse.json(
      { error: t("time.fetchFailed") },
      { status: 500 },
    );
  }
}

// POST /api/projects/[id]/time - create a time entry
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    const access = await requireProjectAccess(id, "editor");
    if (!access.ok) return access.response;

    // Parse + validate body (Zod).
    const result = await parseBody(createTimeEntryBodySchema, request, t);
    if (!result.success) return result.response;
    const { budgetItemId, contactId, workerName, workerType, date, dateTo, hours, workerCount, description } = result.data;

    const item = await db.budgetItem.findFirst({
      where: { id: budgetItemId, projectId: id },
    });
    if (!item) {
      return NextResponse.json(
        { error: t("time.budgetItemNotFound") },
        { status: 404 },
      );
    }

    // Validate dateTo >= date if provided
    const startDate = date ? new Date(date) : new Date();
    let endDate: Date | null = null;
    if (dateTo) {
      endDate = new Date(dateTo);
      if (endDate < startDate) {
        return NextResponse.json(
          { error: t("time.dateToBeforeDate") },
          { status: 400 },
        );
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
        hours: hours,
        workerCount: workerCount ?? 1,
        description: description ?? null,
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

    // Log creation to audit log.
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
    return NextResponse.json(
      { error: t("time.createFailed") },
      { status: 500 },
    );
  }
}
