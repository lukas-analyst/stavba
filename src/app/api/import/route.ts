import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Maybe<T> = T | null | undefined;

// Date fields per model — used to convert ISO strings back into Date objects
// so Prisma accepts them on write.
const DATE_FIELDS: Record<string, string[]> = {
  project: ["startDate", "endDate", "createdAt", "updatedAt"],
  budgetItem: ["dateFrom", "dateTo", "createdAt", "updatedAt"],
  contact: ["createdAt", "updatedAt"],
  payment: ["date", "createdAt", "updatedAt"],
  timeEntry: ["date", "dateTo", "createdAt", "updatedAt"],
};

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }
  return null;
}

// Convert all known date fields of a record from ISO strings to Date objects,
// leaving all other fields untouched.
function normalizeDates(
  model: keyof typeof DATE_FIELDS,
  record: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...record };
  for (const field of DATE_FIELDS[model]) {
    if (field in out) {
      out[field] = toDate(out[field]);
    }
  }
  return out;
}

interface ImportPayload {
  version?: Maybe<number>;
  projects?: Maybe<unknown[]>;
  budgetItems?: Maybe<unknown[]>;
  payments?: Maybe<unknown[]>;
  contacts?: Maybe<unknown[]>;
  timeEntries?: Maybe<unknown[]>;
}

// POST /api/import
// Accepts a JSON payload produced by /api/export and replaces the entire
// application state with it. Idempotent: calling it repeatedly with the same
// payload yields the same end-state. Returns the counts of inserted records.
export async function POST(request: Request) {
  let payload: ImportPayload;
  try {
    payload = (await request.json()) as ImportPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const projects = Array.isArray(payload.projects) ? payload.projects : [];
  const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
  const budgetItems = Array.isArray(payload.budgetItems)
    ? payload.budgetItems
    : [];
  const payments = Array.isArray(payload.payments) ? payload.payments : [];
  const timeEntries = Array.isArray(payload.timeEntries)
    ? payload.timeEntries
    : [];

  try {
    const result = await db.$transaction(async (tx) => {
      // 1) Delete everything in FK-respecting order (children first).
      await tx.timeEntry.deleteMany({});
      await tx.payment.deleteMany({});
      await tx.budgetItem.deleteMany({});
      await tx.contact.deleteMany({});
      await tx.project.deleteMany({});

      // 2) Insert in FK-respecting order (parents first). IDs from the JSON
      //    are preserved so cross-table relationships stay intact.
      //    - Projects (root)
      //    - Contacts (depends on Project)
      //    - BudgetItems (depends on Project)
      //    - Payments (depends on BudgetItem + optional Contact)
      //    - TimeEntries (depends on BudgetItem + optional Contact)
      for (const raw of projects) {
        const data = normalizeDates(
          "project",
          raw as Record<string, unknown>,
        );
        await tx.project.create({ data: data as never });
      }

      for (const raw of contacts) {
        const data = normalizeDates(
          "contact",
          raw as Record<string, unknown>,
        );
        await tx.contact.create({ data: data as never });
      }

      for (const raw of budgetItems) {
        const data = normalizeDates(
          "budgetItem",
          raw as Record<string, unknown>,
        );
        await tx.budgetItem.create({ data: data as never });
      }

      for (const raw of payments) {
        const data = normalizeDates(
          "payment",
          raw as Record<string, unknown>,
        );
        await tx.payment.create({ data: data as never });
      }

      for (const raw of timeEntries) {
        const data = normalizeDates(
          "timeEntry",
          raw as Record<string, unknown>,
        );
        await tx.timeEntry.create({ data: data as never });
      }

      return {
        projects: projects.length,
        contacts: contacts.length,
        budgetItems: budgetItems.length,
        payments: payments.length,
        timeEntries: timeEntries.length,
      };
    });

    return NextResponse.json({ success: true, imported: result });
  } catch (error) {
    console.error("POST /api/import error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to import data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
