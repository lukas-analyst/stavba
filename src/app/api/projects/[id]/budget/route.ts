import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db, dbRead } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { recalcParentDates } from "@/lib/recalc-parent-dates";
import { requireProjectAccess } from "@/lib/authz";
import { convertAmount } from "@/lib/currency";
import {
  parseBody,
  parseParam,
  cuidSchema,
  nonEmptyString,
  optionalNullableString,
  optionalNumOrNull,
  optionalIsoDate,
  optionalCuidOrNull,
} from "@/lib/api-validation";

// Link schema — each link must have a non-empty label + url.
const linkSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1),
  url: z.string().trim().min(1),
});

// POST body schema for /api/projects/[id]/budget
const createBudgetItemBodySchema = z.object({
  category: nonEmptyString.max(200, { message: "budget.categoryRequired" }),
  subcategory: optionalNullableString.optional(),
  element: optionalNullableString.optional(),
  phase: z.string().max(50).optional(),
  required: z.boolean().optional(),
  completed: z.boolean().optional(),
  rejected: z.boolean().optional(),
  note: optionalNullableString.optional(),
  unitPrice: optionalNullableString.optional(),
  parentId: optionalCuidOrNull,
  dependsOnId: optionalCuidOrNull,
  planCost: optionalNumOrNull,
  planCostCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
  flexibilityPercent: z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return null;
      if (typeof v === "string") return Number(v);
      return v;
    },
    z.union([z.number().min(0).max(100), z.null()]),
  ).optional(),
  planDays: z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return null;
      if (typeof v === "string") return Number(v);
      return v;
    },
    z.union([z.number().nonnegative(), z.null()]),
  ).optional(),
  dateFrom: optionalIsoDate,
  dateTo: optionalIsoDate,
  actualCost: optionalNumOrNull,
  actualHours: optionalNumOrNull,
  subsidyEligible: z.boolean().optional(),
  subsidyAmount: optionalNumOrNull,
  contactId: optionalCuidOrNull,
  links: z.array(linkSchema).max(100).optional(),
});

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
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

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
    return NextResponse.json(
      { error: t("budget.fetchFailed") },
      { status: 500 },
    );
  }
}

// POST /api/projects/[id]/budget - create a budget item (or a child task)
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

    // Parse + validate body (Zod). Replaces the ad-hoc
    // `body as { ... }` cast + 3 typeof checks.
    const result = await parseBody(createBudgetItemBodySchema, request, t);
    if (!result.success) return result.response;
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
    } = result.data;

    // Normalize incoming links — Zod already validated shape + trimmed.
    // We just extract label/url/sortOrder.
    const normalizedLinks = Array.isArray(links)
      ? links.map((l, idx) => ({
          label: l.label,
          url: l.url,
          sortOrder: idx,
        }))
      : [];

    // If parentId is set, validate it belongs to this project
    if (parentId) {
      const parent = await db.budgetItem.findFirst({
        where: { id: parentId, projectId: id },
      });
      if (!parent) {
        return NextResponse.json(
          { error: t("budget.parentNotFound") },
          { status: 404 },
        );
      }
    }

    // If dependsOnId is set, validate it belongs to this project and is a top-level item
    if (dependsOnId) {
      const dep = await db.budgetItem.findFirst({
        where: { id: dependsOnId, projectId: id, parentId: null },
      });
      if (!dep) {
        return NextResponse.json(
          { error: t("budget.dependsOnNotFound") },
          { status: 404 },
        );
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
        subcategory: subcategory ?? null,
        element: element ?? null,
        phase: phase || "Neurčeno",
        required: Boolean(required),
        completed: Boolean(completed),
        rejected: Boolean(rejected),
        note: note ?? null,
        unitPrice: unitPrice ?? null,
        parentId: parentId || null,
        dependsOnId: dependsOnId || null,
        planCost: planCost ?? null,
        planCostCurrency: planCostCurrency ?? null,
        // Compute planCostConverted at creation time
        planCostConverted: await (async () => {
          if (planCost == null) return null;
          const proj = await dbRead.project.findUnique({ where: { id }, select: { currency: true } });
          const projCurrency = proj?.currency ?? "CZK";
          if (!planCostCurrency || planCostCurrency === projCurrency) return planCost;
          const conversion = await convertAmount(planCost, planCostCurrency, projCurrency, new Date());
          return conversion?.converted ?? planCost;
        })(),
        flexibilityPercent: flexibilityPercent ?? null,
        planDays: planDays ?? null,
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? new Date(dateTo) : null,
        actualCost: actualCost ?? 0,
        actualHours: actualHours ?? 0,
        subsidyEligible: Boolean(subsidyEligible),
        subsidyAmount: subsidyAmount ?? null,
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
    return NextResponse.json(
      { error: t("budget.createFailed") },
      { status: 500 },
    );
  }
}
