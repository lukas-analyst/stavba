import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { recalcParentDates } from "@/lib/recalc-parent-dates";
import { requireProjectAccess } from "@/lib/authz";

// PATCH /api/budget-items/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.budgetItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Budget item not found" }, { status: 404 });
    }

    // IDOR fix: verify the caller has editor access to the project that owns
    // this budget item. Item-scoped routes can't rely on a projectId in the
    // URL, so we resolve it from the item itself.
    const access = await requireProjectAccess(existing.projectId, "editor");
    if (!access.ok) return access.response;

    const numOrUndef = (v: unknown) =>
      v === undefined ? undefined : v === null || v === "" ? null : Number(v);

    // ───────────────────────────────────────────────────────────────
    // Re-parenting: moving a task (or sub-item) under a different parent.
    // We must validate several things BEFORE building updateData:
    //   1. New parent must be in the SAME project (cross-project moves
    //      would orphan payments/time entries aggregation logic).
    //   2. New parent must not be the item itself (no self-loop).
    //   3. New parent must not be one of the item's descendants — that
    //      would create a cycle in BudgetItemHierarchy and crash any
    //      recursive query. We walk DOWN from the item through its
    //      children to collect all descendant IDs and reject if the
    //      proposed new parentId is among them.
    //   4. When moving to a new parent, inherit the parent's `category`
    //      so the item appears in the correct category group, and bump
    //      `sortOrder` to the end of the new parent's children list.
    // ───────────────────────────────────────────────────────────────
    const parentChanged =
      body.parentId !== undefined &&
      (body.parentId || null) !== (existing.parentId || null);

    if (parentChanged) {
      const newParentId = body.parentId || null;

      if (newParentId === id) {
        return NextResponse.json(
          { error: "Položku nelze přesunout pod ni samotnou." },
          { status: 400 },
        );
      }

      if (newParentId) {
        // (1) Same-project check + fetch new parent's category
        const newParent = await db.budgetItem.findUnique({
          where: { id: newParentId },
          select: { projectId: true, category: true },
        });
        if (!newParent) {
          return NextResponse.json(
            { error: "Cílová položka neexistuje." },
            { status: 404 },
          );
        }
        if (newParent.projectId !== existing.projectId) {
          return NextResponse.json(
            { error: "Nelze přesunout úkol do jiného projektu." },
            { status: 400 },
          );
        }

        // (3) Cycle detection — collect ALL descendants of `id`
        //     (breadth-first walk). If newParentId is among them, reject.
        const descendants = new Set<string>();
        const queue: string[] = [id];
        while (queue.length > 0) {
          const currentId = queue.shift()!;
          const kids = await db.budgetItem.findMany({
            where: { parentId: currentId },
            select: { id: true },
          });
          for (const k of kids) {
            if (!descendants.has(k.id)) {
              descendants.add(k.id);
              queue.push(k.id);
            }
          }
        }
        if (descendants.has(newParentId)) {
          return NextResponse.json(
            { error: "Nelze přesunout položku pod jejího vlastního potomka (cyklus)." },
            { status: 400 },
          );
        }

        // (4) Inherit category + append to end of new parent's children
        body.category = newParent.category;
        const maxSort = await db.budgetItem.aggregate({
          where: { parentId: newParentId },
          _max: { sortOrder: true },
        });
        body.sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
      }
      // If newParentId is null (move to top-level), we leave the existing
      // category/sortOrder alone — the user can re-categorize manually.
    }

    // Build the update data
    const updateData: Record<string, unknown> = {};
    if (body.category !== undefined) updateData.category = String(body.category).trim();
    if (body.subcategory !== undefined) updateData.subcategory = body.subcategory?.trim() || null;
    if (body.element !== undefined) updateData.element = body.element?.trim() || null;
    if (body.phase !== undefined) updateData.phase = body.phase;
    if (body.required !== undefined) updateData.required = Boolean(body.required);
    if (body.completed !== undefined) updateData.completed = Boolean(body.completed);
    if (body.rejected !== undefined) updateData.rejected = Boolean(body.rejected);
    if (body.parentId !== undefined) updateData.parentId = body.parentId || null;
    if (body.dependsOnId !== undefined) updateData.dependsOnId = body.dependsOnId || null;
    if (body.note !== undefined) updateData.note = body.note?.trim() || null;
    if (body.unitPrice !== undefined) updateData.unitPrice = body.unitPrice?.trim() || null;
    if (body.planCost !== undefined) updateData.planCost = numOrUndef(body.planCost);
    if (body.flexibilityPercent !== undefined) updateData.flexibilityPercent = numOrUndef(body.flexibilityPercent);
    if (body.planDays !== undefined) updateData.planDays = numOrUndef(body.planDays);
    if (body.dateFrom !== undefined) updateData.dateFrom = body.dateFrom ? new Date(body.dateFrom) : null;
    if (body.dateTo !== undefined) updateData.dateTo = body.dateTo ? new Date(body.dateTo) : null;
    if (body.actualCost !== undefined) updateData.actualCost = numOrUndef(body.actualCost) ?? 0;
    if (body.actualHours !== undefined) updateData.actualHours = numOrUndef(body.actualHours) ?? 0;
    if (body.subsidyEligible !== undefined) updateData.subsidyEligible = Boolean(body.subsidyEligible);
    if (body.subsidyAmount !== undefined) updateData.subsidyAmount = numOrUndef(body.subsidyAmount);
    if (body.contactId !== undefined) updateData.contactId = body.contactId || null;
    if (body.sortOrder !== undefined) updateData.sortOrder = Number(body.sortOrder);

    // Synchronize external hyperlinks (1:N) when `links` is provided.
    // The frontend sends the FULL desired state of the links array, so we
    // perform a replace: delete links no longer in the array, upsert
    // (by id) the ones that are. This keeps the operation atomic with
    // the budget item update via a single transaction.
    //   - link.id = undefined → create new link
    //   - link.id matches existing → update label/url
    //   - existing link not in array → delete
    // Validation: label + url required, url trimmed.
    let linksWereSynced = false;
    if (Array.isArray(body.links)) {
      const incomingLinks = body.links
        .filter((l: unknown): l is { id?: string; label: string; url: string } => {
          if (!l || typeof l !== "object") return false;
          const obj = l as Record<string, unknown>;
          return (
            typeof obj.label === "string" && obj.label.trim() !== "" &&
            typeof obj.url === "string" && obj.url.trim() !== ""
          );
        })
        .map((l, idx) => ({
          id: typeof l.id === "string" ? l.id : undefined,
          label: l.label.trim(),
          url: l.url.trim(),
          sortOrder: idx,
        }));

      updateData.links = {
        deleteMany: {}, // delete all existing, then recreate from incoming
        create: incomingLinks.map(({ id: _id, ...rest }) => rest),
      };
      linksWereSynced = true;
    }

    const updated = await db.budgetItem.update({
      where: { id },
      data: updateData,
      include: {
        // Always include contact so the UI can display it after update
        contact: { select: { id: true, name: true, role: true, phone: true } },
        // Include links only when they were synced in this request
        ...(linksWereSynced
          ? { links: { orderBy: { sortOrder: "asc" }, select: { id: true, label: true, url: true, sortOrder: true } } }
          : {}),
      },
    });

    // Log changes to audit log
    await logChanges(
      existing.projectId,
      "BudgetItem",
      id,
      "update",
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );

    // If dateFrom/dateTo changed or item was re-parented, recalculate parent dates
    const dateChanged =
      updateData.dateFrom !== undefined || updateData.dateTo !== undefined;
    const parentChanged =
      updateData.parentId !== undefined && updateData.parentId !== existing.parentId;

    if (updated.parentId && (dateChanged || parentChanged)) {
      await recalcParentDates(updated.parentId);
    }
    // If item was moved to a new parent, also recalc the OLD parent
    if (parentChanged && existing.parentId) {
      await recalcParentDates(existing.parentId);
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH budget item error:", error);
    return NextResponse.json({ error: "Failed to update budget item" }, { status: 500 });
  }
}

// DELETE /api/budget-items/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await db.budgetItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Budget item not found" }, { status: 404 });
    }

    // IDOR fix: verify editor access to the owning project before deleting.
    const access = await requireProjectAccess(existing.projectId, "editor");
    if (!access.ok) return access.response;

    // Log deletion before deleting
    await logChanges(
      existing.projectId,
      "BudgetItem",
      id,
      "delete",
      existing as unknown as Record<string, unknown>,
      null,
    );

    await db.budgetItem.delete({ where: { id } });

    // If this was a child task, recalculate parent's dateFrom/dateTo
    if (existing.parentId) {
      await recalcParentDates(existing.parentId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE budget item error:", error);
    return NextResponse.json({ error: "Failed to delete budget item" }, { status: 500 });
  }
}
