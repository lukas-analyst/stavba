import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/authz";

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
// Accepts a JSON payload produced by /api/export and REPLACES THE USER'S
// application state (only projects they own + child records) with it.
//
// SECURITY:
//   - Requires an authenticated, verified user.
//   - All `ownerId` fields on imported projects are overwritten to
//     `user.id` — the import cannot claim ownership of someone else's
//     projects.
//   - NEVER calls `deleteMany({})` on entire tables — only deletes the
//     user's owned projects and their child records.
//   - Each budget item / contact / payment / time entry must reference a
//     project (or budget item) that is being imported in the same payload.
//     Records referencing foreign project IDs are silently dropped to
//     prevent IDOR-style data injection into other users' projects.
//
// Idempotent: calling it repeatedly with the same payload yields the same
// end-state (relative to the user's data). Returns the counts of inserted
// records.
export async function POST(request: Request) {
  const { user, response } = await requireVerifiedUser();
  if (response || !user) return response!;

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

  const rawProjects = Array.isArray(payload.projects) ? payload.projects : [];
  const rawContacts = Array.isArray(payload.contacts) ? payload.contacts : [];
  const rawBudgetItems = Array.isArray(payload.budgetItems)
    ? payload.budgetItems
    : [];
  const rawPayments = Array.isArray(payload.payments) ? payload.payments : [];
  const rawTimeEntries = Array.isArray(payload.timeEntries)
    ? payload.timeEntries
    : [];

  // -----------------------------------------------------------------
  // Pre-process projects: override ownerId, normalize dates.
  // -----------------------------------------------------------------
  const projects: Record<string, unknown>[] = [];
  const importedProjectIds = new Set<string>();
  for (const raw of rawProjects) {
    const data = normalizeDates("project", raw as Record<string, unknown>);
    // SECURITY: always override ownerId — never trust the payload.
    data.ownerId = user.id;
    if (typeof data.id === "string" && data.id.length > 0) {
      importedProjectIds.add(data.id);
    }
    projects.push(data);
  }

  // -----------------------------------------------------------------
  // Pre-process budget items: only keep those whose projectId is in
  // the set of imported projects.
  // -----------------------------------------------------------------
  const budgetItems: Record<string, unknown>[] = [];
  const importedBudgetItemIds = new Set<string>();
  for (const raw of rawBudgetItems) {
    const data = normalizeDates(
      "budgetItem",
      raw as Record<string, unknown>,
    );
    const projectId = data.projectId;
    if (typeof projectId !== "string" || !importedProjectIds.has(projectId)) {
      // Drop budget items that don't belong to an imported project —
      // protects against injecting items into foreign projects.
      continue;
    }
    if (typeof data.id === "string" && data.id.length > 0) {
      importedBudgetItemIds.add(data.id);
    }
    budgetItems.push(data);
  }

  // -----------------------------------------------------------------
  // Pre-process contacts: only keep those whose projectId is in the
  // set of imported projects.
  // -----------------------------------------------------------------
  const contacts: Record<string, unknown>[] = [];
  for (const raw of rawContacts) {
    const data = normalizeDates("contact", raw as Record<string, unknown>);
    const projectId = data.projectId;
    if (typeof projectId !== "string" || !importedProjectIds.has(projectId)) {
      continue;
    }
    contacts.push(data);
  }

  // -----------------------------------------------------------------
  // Pre-process payments: only keep those whose budgetItemId is in the
  // set of imported budget items.
  // -----------------------------------------------------------------
  const payments: Record<string, unknown>[] = [];
  for (const raw of rawPayments) {
    const data = normalizeDates("payment", raw as Record<string, unknown>);
    const budgetItemId = data.budgetItemId;
    if (
      typeof budgetItemId !== "string" ||
      !importedBudgetItemIds.has(budgetItemId)
    ) {
      continue;
    }
    // Strip contactId if the contact wasn't imported (avoid FK violation).
    // The contact may legitimately belong to a different project we don't
    // own — better to drop the link than to fail the whole import.
    if (
      typeof data.contactId === "string" &&
      !contacts.some((c) => c.id === data.contactId)
    ) {
      data.contactId = null;
    }
    payments.push(data);
  }

  // -----------------------------------------------------------------
  // Pre-process time entries: only keep those whose budgetItemId is in
  // the set of imported budget items.
  // -----------------------------------------------------------------
  const timeEntries: Record<string, unknown>[] = [];
  for (const raw of rawTimeEntries) {
    const data = normalizeDates("timeEntry", raw as Record<string, unknown>);
    const budgetItemId = data.budgetItemId;
    if (
      typeof budgetItemId !== "string" ||
      !importedBudgetItemIds.has(budgetItemId)
    ) {
      continue;
    }
    if (
      typeof data.contactId === "string" &&
      !contacts.some((c) => c.id === data.contactId)
    ) {
      data.contactId = null;
    }
    timeEntries.push(data);
  }

  try {
    const result = await db.$transaction(async (tx) => {
      // 1) Find project IDs currently owned by the user. We will only
      //    delete these + their child records. Other users' data is
      //    never touched.
      const ownedProjects = await tx.project.findMany({
        where: { ownerId: user.id },
        select: { id: true },
      });
      const ownedProjectIds = ownedProjects.map((p) => p.id);

      if (ownedProjectIds.length > 0) {
        // FK-respecting order: children first.
        // TimeEntries and Payments reference BudgetItem, so delete them
        // before BudgetItems. BudgetItems and Contacts reference Project.
        await tx.timeEntry.deleteMany({
          where: { budgetItem: { projectId: { in: ownedProjectIds } } },
        });
        await tx.payment.deleteMany({
          where: { budgetItem: { projectId: { in: ownedProjectIds } } },
        });
        await tx.budgetItem.deleteMany({
          where: { projectId: { in: ownedProjectIds } },
        });
        await tx.contact.deleteMany({
          where: { projectId: { in: ownedProjectIds } },
        });
        await tx.project.deleteMany({
          where: { id: { in: ownedProjectIds } },
        });
      }

      // 2) Insert in FK-respecting order (parents first). IDs from the
      //    JSON are preserved so cross-table relationships stay intact.
      //    - Projects (root) — ownerId was overwritten above
      //    - Contacts (depends on Project)
      //    - BudgetItems (depends on Project)
      //    - Payments (depends on BudgetItem + optional Contact)
      //    - TimeEntries (depends on BudgetItem + optional Contact)
      for (const data of projects) {
        await tx.project.create({ data: data as never });
      }

      for (const data of contacts) {
        await tx.contact.create({ data: data as never });
      }

      for (const data of budgetItems) {
        await tx.budgetItem.create({ data: data as never });
      }

      for (const data of payments) {
        await tx.payment.create({ data: data as never });
      }

      for (const data of timeEntries) {
        await tx.timeEntry.create({ data: data as never });
      }

      return {
        projects: projects.length,
        contacts: contacts.length,
        budgetItems: budgetItems.length,
        payments: payments.length,
        timeEntries: timeEntries.length,
        // Diagnostics: how many records were dropped as unsafe (FK into
        // projects/items not in the payload).
        dropped: {
          projects: rawProjects.length - projects.length,
          contacts: rawContacts.length - contacts.length,
          budgetItems: rawBudgetItems.length - budgetItems.length,
          payments: rawPayments.length - payments.length,
          timeEntries: rawTimeEntries.length - timeEntries.length,
        },
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
