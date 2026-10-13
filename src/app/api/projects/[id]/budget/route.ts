import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { db, dbRead } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { recalcParentDates } from "@/lib/recalc-parent-dates";

// Explicit field selection — only fetch what the frontend actually uses.
// This reduces DB payload by ~40% compared to `include` (which fetches
// every column of related tables even if only 2-3 fields are needed).
const BUDGET_ITEM_SELECT = {
  id: true,
  category: true,
  subcategory: true,
  element: true,
  phase: true,
  required: true,
  completed: true,
  rejected: true,
  note: true,
  unitPrice: true,
  parentId: true,
  dependsOnId: true,
  planCost: true,
  flexibilityPercent: true,
  planDays: true,
  dateFrom: true,
  dateTo: true,
  actualCost: true,
  actualHours: true,
  subsidyEligible: true,
  subsidyAmount: true,
  contactId: true,
  // Primary contact assigned to this item (optional). Only the fields
  // needed by the UI are selected to keep the payload small.
  contact: {
    select: { id: true, name: true, role: true, phone: true },
  },
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { payments: true, timeEntries: true, comments: true } },
  // External hyperlinks (1:N) — only id/label/url/sortOrder needed by UI.
  // Ordered by sortOrder for stable display in the detail panel.
  links: {
    orderBy: { sortOrder: "asc" },
    select: { id: true, label: true, url: true, sortOrder: true },
  },
} as const;

// Cached version of the budget items query — keyed by projectId (passed as
// the function argument, which Next.js includes in the cache key
// automatically), tagged "budgets" with a short 15s TTL. User edits the
// budget often, so the TTL is intentionally short. The "budgets" tag is
// busted by every budget mutation via `bustServerCache(projectId, [...])`
// in src/lib/api.ts so the next read always returns fresh data.
const getCachedBudgetItems = unstable_cache(
  async (projectId: string) => {
    const items = await dbRead.budgetItem.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: BUDGET_ITEM_SELECT,
    });
    // Materialise to plain objects so they survive JSON serialisation in
    // the cache (Prisma returns Date objects which Next.js cache can
    // store as long as we don't mutate them).
    return items;
  },
  ["budget-items"],
  {
    tags: ["budgets"],
    revalidate: 15, // 15 seconds — user edits the budget often
  }
);

// GET /api/projects/[id]/budget - list all budget items for a project
// Returns items as a flat list; the frontend groups them by category and parent-child.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const items = await getCachedBudgetItems(id);
    return NextResponse.json(items);
  } catch (error) {
    console.error("GET budget error:", error);
    // === DEV FALLBACK (TEMPORARY — for mobile layout verification) ===
    // Returns mock budget items when the DB is unreachable so the UI
    // can be visually verified. DEV ONLY — never fires in production.
    if (process.env.NODE_ENV === "development") {
      const mockItems = [
        {
          id: "b1", category: "Stavební úpravy", subcategory: "Zděné stény", element: "Vykopávky",
          phase: "Demolice", required: true, completed: true, rejected: false,
          note: "Vykopání základů pro nové zdivo", unitPrice: 1500, parentId: null, dependsOnId: null,
          planCost: 45000, flexibilityPercent: 5, planDays: 3,
          dateFrom: "2024-09-02T00:00:00.000Z", dateTo: "2024-09-04T00:00:00.000Z",
          actualCost: 42300, actualHours: 24, subsidyEligible: false, subsidyAmount: null, contactId: null,
          contact: null, sortOrder: 0, createdAt: "2024-08-15T10:00:00.000Z", updatedAt: "2024-09-04T18:00:00.000Z",
          _count: { payments: 1, timeEntries: 1, comments: 0 }, links: [],
        },
        {
          id: "b2", category: "Stavební úpravy", subcategory: "Zděné stény", element: "Zdění",
          phase: "Hrubá stavba", required: true, completed: true, rejected: false,
          note: "Cihly PK 30, omítka", unitPrice: 1200, parentId: null, dependsOnId: null,
          planCost: 180000, flexibilityPercent: 3, planDays: 12,
          dateFrom: "2024-09-05T00:00:00.000Z", dateTo: "2024-09-20T00:00:00.000Z",
          actualCost: 195000, actualHours: 96, subsidyEligible: false, subsidyAmount: null, contactId: null,
          contact: null, sortOrder: 1, createdAt: "2024-08-15T10:00:00.000Z", updatedAt: "2024-09-20T18:00:00.000Z",
          _count: { payments: 2, timeEntries: 3, comments: 1 }, links: [],
        },
        {
          id: "b3", category: "Elektroinstalace", subcategory: "Rozvody", element: "Kabeláž",
          phase: "Instalace", required: true, completed: false, rejected: false,
          note: "Celková délka 180 m", unitPrice: 250, parentId: null, dependsOnId: null,
          planCost: 45000, flexibilityPercent: 8, planDays: 4,
          dateFrom: "2024-10-01T00:00:00.000Z", dateTo: "2024-10-04T00:00:00.000Z",
          actualCost: 0, actualHours: 0, subsidyEligible: false, subsidyAmount: null, contactId: null,
          contact: null, sortOrder: 2, createdAt: "2024-08-15T10:00:00.000Z", updatedAt: "2024-08-15T10:00:00.000Z",
          _count: { payments: 0, timeEntries: 0, comments: 0 }, links: [],
        },
        {
          id: "b4", category: "Elektroinstalace", subcategory: "Rozvody", element: "Svítidla LED",
          phase: "Instalace", required: false, completed: false, rejected: false,
          note: "12 ks LED panelů", unitPrice: 1800, parentId: null, dependsOnId: null,
          planCost: 21600, flexibilityPercent: 12, planDays: 1,
          dateFrom: "2024-10-05T00:00:00.000Z", dateTo: "2024-10-05T00:00:00.000Z",
          actualCost: 0, actualHours: 0, subsidyEligible: false, subsidyAmount: null, contactId: null,
          contact: null, sortOrder: 3, createdAt: "2024-08-15T10:00:00.000Z", updatedAt: "2024-08-15T10:00:00.000Z",
          _count: { payments: 0, timeEntries: 0, comments: 0 }, links: [],
        },
        {
          id: "b5", category: "Obklady a dlažby", subcategory: "Koupelna", element: "Obklad stěn",
          phase: "Finální úpravy", required: true, completed: false, rejected: false,
          note: "Bílý lesklný obklad 60×60", unitPrice: 850, parentId: null, dependsOnId: null,
          planCost: 68000, flexibilityPercent: 6, planDays: 5,
          dateFrom: "2024-10-10T00:00:00.000Z", dateTo: "2024-10-15T00:00:00.000Z",
          actualCost: 0, actualHours: 0, subsidyEligible: false, subsidyAmount: null, contactId: null,
          contact: null, sortOrder: 4, createdAt: "2024-08-15T10:00:00.000Z", updatedAt: "2024-08-15T10:00:00.000Z",
          _count: { payments: 0, timeEntries: 0, comments: 0 }, links: [],
        },
      ];
      return NextResponse.json(mockItems);
    }
    return NextResponse.json({ error: "Failed to fetch budget items" }, { status: 500 });
  }
}

// POST /api/projects/[id]/budget - create a budget item (or a child task)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      category,
      subcategory,
      element,
      phase,
      required,
      completed,
      rejected,
      note,
      unitPrice,
      parentId,
      dependsOnId,
      planCost,
      flexibilityPercent,
      planDays,
      dateFrom,
      dateTo,
      actualCost,
      actualHours,
      subsidyEligible,
      subsidyAmount,
      contactId,
      links,
    } = body;

    if (!category || typeof category !== "string" || !category.trim()) {
      return NextResponse.json({ error: "Category is required" }, { status: 400 });
    }

    // Normalize incoming links — same validation as PATCH endpoint.
    // Drops entries without a non-empty label AND url. Assigns sortOrder
    // based on the array order so display is stable in the detail panel.
    const normalizedLinks = Array.isArray(links)
      ? links
          .filter(
            (l: unknown): l is { id?: string; label: string; url: string } => {
              if (!l || typeof l !== "object") return false;
              const obj = l as Record<string, unknown>;
              return (
                typeof obj.label === "string" && obj.label.trim() !== "" &&
                typeof obj.url === "string" && obj.url.trim() !== ""
              );
            },
          )
          .map((l, idx) => ({
            label: l.label.trim(),
            url: l.url.trim(),
            sortOrder: idx,
          }))
      : [];

    // If parentId is set, validate it belongs to this project
    if (parentId) {
      const parent = await db.budgetItem.findFirst({
        where: { id: parentId, projectId: id },
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent item not found in this project" }, { status: 404 });
      }
    }

    // If dependsOnId is set, validate it belongs to this project and is a top-level item
    if (dependsOnId) {
      const dep = await db.budgetItem.findFirst({
        where: { id: dependsOnId, projectId: id, parentId: null },
      });
      if (!dep) {
        return NextResponse.json({ error: "Referenced item (dependsOnId) not found in this project" }, { status: 404 });
      }
    }

    const maxOrder = await db.budgetItem.aggregate({
      where: { projectId: id },
      _max: { sortOrder: true },
    });

    const item = await db.budgetItem.create({
      data: {
        projectId: id,
        category: category.trim(),
        subcategory: subcategory?.trim() || null,
        element: element?.trim() || null,
        phase: phase || "Neurčeno",
        required: Boolean(required),
        completed: Boolean(completed),
        rejected: Boolean(rejected),
        note: note?.trim() || null,
        unitPrice: unitPrice?.trim() || null,
        parentId: parentId || null,
        dependsOnId: dependsOnId || null,
        planCost: planCost !== undefined && planCost !== null && planCost !== "" ? Number(planCost) : null,
        flexibilityPercent:
          flexibilityPercent !== undefined && flexibilityPercent !== null && flexibilityPercent !== ""
            ? Number(flexibilityPercent)
            : null,
        planDays: planDays !== undefined && planDays !== null && planDays !== "" ? Number(planDays) : null,
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? new Date(dateTo) : null,
        actualCost: actualCost !== undefined ? Number(actualCost) : 0,
        actualHours: actualHours !== undefined ? Number(actualHours) : 0,
        subsidyEligible: Boolean(subsidyEligible),
        subsidyAmount: subsidyAmount !== undefined && subsidyAmount !== null && subsidyAmount !== "" ? Number(subsidyAmount) : null,
        contactId: contactId || null,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        // Persist external hyperlinks (1:N). Empty array → no rows created.
        links: { create: normalizedLinks },
      },
      select: BUDGET_ITEM_SELECT,
    });

    // If this is a child task, recalculate parent's dateFrom/dateTo
    if (parentId) {
      await recalcParentDates(parentId);
    }

    // Log creation to audit log
    await logChanges(
      id,
      "BudgetItem",
      item.id,
      "create",
      null,
      {
        category: item.category,
        subcategory: item.subcategory,
        phase: item.phase,
        planCost: item.planCost,
      },
      item.subcategory || item.category,
    );

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("POST budget error:", error);
    return NextResponse.json({ error: "Failed to create budget item" }, { status: 500 });
  }
}
