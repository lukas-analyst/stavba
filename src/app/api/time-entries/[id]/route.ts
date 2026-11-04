import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
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

// PATCH body schema — all fields optional (partial update).
const patchTimeEntryBodySchema = z.object({
  budgetItemId: cuidSchema.optional(),
  contactId: optionalCuidOrNull,
  workerName: z.string().trim().max(200).optional(),
  workerType: z.string().max(50).optional(),
  date: optionalIsoDate,
  dateTo: optionalIsoDate,
  hours: z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return undefined;
      if (typeof v === "string") return Number(v);
      return v;
    },
    z.number().positive().finite().optional(),
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

// PATCH /api/time-entries/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    // Parse + validate body (Zod).
    const result = await parseBody(patchTimeEntryBodySchema, request, t);
    if (!result.success) return result.response;
    const body: Record<string, unknown> = { ...result.data };

    const existing = await db.timeEntry.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: t("time.notFound") },
        { status: 404 },
      );
    }

    // IDOR fix: resolve projectId via the parent BudgetItem and verify
    // editor access before performing the update.
    const budgetItem = await db.budgetItem.findUnique({
      where: { id: existing.budgetItemId },
      select: { projectId: true },
    });
    if (!budgetItem) {
      return NextResponse.json(
        { error: t("time.budgetItemNotFound") },
        { status: 404 },
      );
    }
    const access = await requireProjectAccess(budgetItem.projectId, "editor");
    if (!access.ok) return access.response;

    // Security: if budgetItemId is being changed, verify the NEW budget item
    // belongs to the SAME project (prevent cross-project data moves).
    if (body.budgetItemId !== undefined && body.budgetItemId !== existing.budgetItemId) {
      const newBudgetItem = await db.budgetItem.findUnique({
        where: { id: body.budgetItemId as string },
        select: { projectId: true },
      });
      if (!newBudgetItem) {
        return NextResponse.json(
          { error: t("time.newBudgetItemNotFound") },
          { status: 404 },
        );
      }
      if (newBudgetItem.projectId !== budgetItem.projectId) {
        return NextResponse.json(
          { error: t("time.cannotMoveAcrossProjects") },
          { status: 403 },
        );
      }
    }

    const updated = await db.timeEntry.update({
      where: { id },
      data: {
        budgetItemId: body.budgetItemId !== undefined ? (body.budgetItemId as string) : undefined,
        contactId: body.contactId !== undefined ? ((body.contactId as string | null) || null) : undefined,
        workerName: body.workerName !== undefined ? (body.workerName as string) : undefined,
        workerType: body.workerType !== undefined ? (body.workerType as string) : undefined,
        date: body.date !== undefined ? (body.date ? new Date(body.date as string) : new Date()) : undefined,
        dateTo:
          body.dateTo !== undefined
            ? body.dateTo
              ? new Date(body.dateTo as string)
              : null
            : undefined,
        hours: body.hours !== undefined ? (body.hours as number) : undefined,
        workerCount: body.workerCount !== undefined ? (body.workerCount as number) : undefined,
        description: body.description !== undefined ? (body.description as string | null) : undefined,
      },
      include: {
        budgetItem: { select: { id: true, category: true, subcategory: true } },
        contact: { select: { id: true, name: true, type: true } },
      },
    });

    // Audit log
    await logChanges(
      budgetItem.projectId,
      "TimeEntry",
      id,
      "update",
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );

    // Recompute affected budget item actualHours.
    const newBudgetItemId = updated.budgetItemId;
    const originalBudgetItemId = existing.budgetItemId;

    const newAgg = await db.timeEntry.aggregate({
      where: { budgetItemId: newBudgetItemId },
      _sum: { hours: true },
    });
    await db.budgetItem.update({
      where: { id: newBudgetItemId },
      data: { actualHours: newAgg._sum.hours ?? 0 },
    });

    if (originalBudgetItemId && originalBudgetItemId !== newBudgetItemId) {
      const originalAgg = await db.timeEntry.aggregate({
        where: { budgetItemId: originalBudgetItemId },
        _sum: { hours: true },
      });
      await db.budgetItem.update({
        where: { id: originalBudgetItemId },
        data: { actualHours: originalAgg._sum.hours ?? 0 },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH time entry error:", error);
    return NextResponse.json(
      { error: t("time.updateFailed") },
      { status: 500 },
    );
  }
}

// DELETE /api/time-entries/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    const existing = await db.timeEntry.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: t("time.notFound") },
        { status: 404 },
      );
    }
    const budgetItemId = existing.budgetItemId;

    // IDOR fix: resolve projectId via the parent BudgetItem and require
    // editor access before deleting.
    const budgetItem = await db.budgetItem.findUnique({
      where: { id: budgetItemId },
      select: { projectId: true },
    });
    if (!budgetItem) {
      return NextResponse.json(
        { error: t("time.budgetItemNotFound") },
        { status: 404 },
      );
    }
    const access = await requireProjectAccess(budgetItem.projectId, "editor");
    if (!access.ok) return access.response;

    // Audit log before deleting
    await logChanges(
      budgetItem.projectId,
      "TimeEntry",
      id,
      "delete",
      existing as unknown as Record<string, unknown>,
      null,
    );

    await db.timeEntry.delete({ where: { id } });

    const agg = await db.timeEntry.aggregate({
      where: { budgetItemId },
      _sum: { hours: true },
    });
    await db.budgetItem.update({
      where: { id: budgetItemId },
      data: { actualHours: agg._sum.hours ?? 0 },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE time entry error:", error);
    return NextResponse.json(
      { error: t("time.deleteFailed") },
      { status: 500 },
    );
  }
}
