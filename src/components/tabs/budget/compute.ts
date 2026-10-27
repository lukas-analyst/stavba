import type { BudgetItem } from "@/lib/api";

// Rolled-up totals for a budget item — its own values plus the sums of
// all its child tasks. Used by BudgetRow, BudgetItemRows, SortableBudgetItemRows,
// and BudgetTab's grand-total computations.
export type RolledUp = {
  planCost: number;
  planDays: number;
  actualCost: number;
  actualHours: number;
};

// Sum an item's own numbers together with all of its children's numbers.
// Returns a single RolledUp object with the combined totals. Pure function —
// no side effects, safe to memoize at the call site.
export function computeRolledUp(item: BudgetItem, children: BudgetItem[]): RolledUp {
  const own = {
    planCost: item.planCost || 0,
    planDays: item.planDays || 0,
    actualCost: item.actualCost || 0,
    actualHours: item.actualHours || 0,
  };
  const childSum = children.reduce(
    (acc, c) => {
      acc.planCost += c.planCost || 0;
      acc.planDays += c.planDays || 0;
      acc.actualCost += c.actualCost || 0;
      acc.actualHours += c.actualHours || 0;
      return acc;
    },
    { planCost: 0, planDays: 0, actualCost: 0, actualHours: 0 },
  );
  return {
    planCost: own.planCost + childSum.planCost,
    planDays: own.planDays + childSum.planDays,
    actualCost: own.actualCost + childSum.actualCost,
    actualHours: own.actualHours + childSum.actualHours,
  };
}

// Saved amount = planCost - actualCost, but only for completed items
// (otherwise the item isn't "done" so there's no defined savings yet).
// Returns null when the item isn't completed so the caller can hide the badge.
export function computeSaved(item: BudgetItem, children: BudgetItem[]): number | null {
  if (!item.completed) return null;
  const rolled = computeRolledUp(item, children);
  return Math.max(0, rolled.planCost - rolled.actualCost);
}
