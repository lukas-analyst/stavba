import { NextResponse } from "next/server";
import { db, dbRead } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { recalcParentDates } from "@/lib/recalc-parent-dates";
import { requireProjectAccess } from "@/lib/authz";
import { convertAmount } from "@/lib/currency";

// Explicit field selection — only fetch what the frontend actually uses.
const BUDGET_ITEM_SELECT = {
  id: true,
  category: true,
  subcategory: true,
  element: true,
  phase: true,
  required: true,
  completed: true,
  completedAt: true,
  rejected: true,
  note: true,
  unitPrice: true,
  parentId: true,
  dependsOnId: true,
  planCost: true,
  planCostCurrency: true,
  planCostConverted: true,
  flexibilityPercent: true,
  planDays: true,
  dateFrom: true,
  dateTo: true,
  actualCost: true,
  actualHours: true,
  subsidyEligible: true,
  subsidyAmount: true,
  contactId: true,
  contact: {
    select: { id: true, name: true, role: true, phone: true },
  },
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { payments: true, timeEntries: true, comments: true } },
  links: {
    orderBy: { sortOrder: "asc" },
    select: { id: true, label: true, url: true, sortOrder: true },
  },
} as const;

// GET /api/projects/[id]/budget - list all budget items for a project
// Returns items as a flat list; the frontend groups them by category and parent-child.
//
// NOTE: We intentionally do NOT use unstable_cache here. Budget items
// change frequently (user adds/edits/deletes items often), and server-side
// caching causes a race condition where the client-side refetch (triggered
// by React Query invalidation) arrives before the cache-busting
// revalidateTag call completes — resulting in stale data being returned
// and the newly added item not appearing until a manual page refresh.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireProjectAccess(id, "viewer");
    if (!access.ok) return access.response;
    const items = await dbRead.budgetItem.findMany({
      where: { projectId: id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: BUDGET_ITEM_SELECT,
    });

    // === On-the-fly currency conversion for incomplete items ===
    // For items with a foreign planCostCurrency that are NOT completed,
    // we recompute planCostConverted using today's exchange rate.
    // Completed items keep their frozen planCostConverted (set when
    // completed=true was saved).
    const project = await dbRead.project.findUnique({
      where: { id },
      select: { currency: true },
    });
    const projectCurrency = project?.currency ?? "CZK";

    const convertedItems = await Promise.all(
      items.map(async (item) => {
        // No foreign currency → no conversion needed
        if (!item.planCostCurrency || item.planCostCurrency === projectCurrency) {
          return { ...item, planCostConverted: item.planCost };
        }
        // Completed items → use frozen value (already stored)
        if (item.completed && item.completedAt) {
          return item;
        }
        // Incomplete items → recompute with today's rate
        if (item.planCost != null) {
          const conversion = await convertAmount(
            item.planCost,
            item.planCostCurrency,
            projectCurrency,
            new Date(),
          );
          if (conversion) {
            return { ...item, planCostConverted: conversion.converted };
          }
        }
        // Fallback: return as-is
        return item;
      }),
    );

    return NextResponse.json(convertedItems);
  } catch (error) {
    console.error("GET budget error:", error);
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
    const access = await requireProjectAccess(id, "editor");
    if (!access.ok) return access.response;
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
      planCostCurrency,
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
        planCostCurrency: planCostCurrency || null,
        // Compute planCostConverted at creation time
        planCostConverted: await (async () => {
          const numPlanCost = planCost !== undefined && planCost !== null && planCost !== "" ? Number(planCost) : null;
          if (numPlanCost == null) return null;
          const proj = await dbRead.project.findUnique({ where: { id }, select: { currency: true } });
          const projCurrency = proj?.currency ?? "CZK";
          if (!planCostCurrency || planCostCurrency === projCurrency) return numPlanCost;
          const conversion = await convertAmount(numPlanCost, planCostCurrency, projCurrency, new Date());
          return conversion?.converted ?? numPlanCost;
        })(),
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
