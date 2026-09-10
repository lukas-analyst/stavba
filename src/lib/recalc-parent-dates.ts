import { db } from "@/lib/db";

/**
 * Recalculate the parent item's dateFrom and dateTo based on its children.
 *
 * Rules:
 * - dateFrom = min(child.dateFrom) — earliest start date among children
 * - dateTo = max(child.dateTo) — latest end date among children
 *
 * The parent's own dateFrom/dateTo is NOT taken into account — only children's dates.
 * If the parent has no children with dates, the parent's dates remain unchanged.
 *
 * This should be called after any mutation on a child budget item (create/update/delete).
 *
 * @param parentId The ID of the parent BudgetItem to recalculate dates for.
 */
export async function recalcParentDates(parentId: string): Promise<void> {
  const children = await db.budgetItem.findMany({
    where: { parentId },
    select: { dateFrom: true, dateTo: true },
  });

  if (children.length === 0) return;

  // Collect all dateFrom and dateTo values
  const dateFroms = children
    .map((c) => c.dateFrom)
    .filter((d): d is Date => d !== null);
  const dateTos = children
    .map((c) => c.dateTo)
    .filter((d): d is Date => d !== null);

  // Only update if there are dates to aggregate
  if (dateFroms.length === 0 && dateTos.length === 0) return;

  const minDateFrom = dateFroms.length > 0
    ? new Date(Math.min(...dateFroms.map((d) => d.getTime())))
    : null;
  const maxDateTo = dateTos.length > 0
    ? new Date(Math.max(...dateTos.map((d) => d.getTime())))
    : null;

  // Get current parent values to avoid unnecessary writes
  const parent = await db.budgetItem.findUnique({
    where: { id: parentId },
    select: { dateFrom: true, dateTo: true },
  });

  if (!parent) return;

  // Only update if dates actually changed
  const dateFromChanged =
    (minDateFrom?.getTime() ?? null) !== (parent.dateFrom?.getTime() ?? null);
  const dateToChanged =
    (maxDateTo?.getTime() ?? null) !== (parent.dateTo?.getTime() ?? null);

  if (!dateFromChanged && !dateToChanged) return;

  await db.budgetItem.update({
    where: { id: parentId },
    data: {
      dateFrom: minDateFrom,
      dateTo: maxDateTo,
    },
  });
}
