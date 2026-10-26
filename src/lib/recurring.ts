// =====================================================================
// Recurring payment helpers
// ---------------------------------------------------------------------
// Shared logic for computing the next recurring date based on an
// interval string ("weekly" | "monthly" | "quarterly" | "yearly").
// Used by:
//   - POST /api/projects/[id]/payments        (set recurringNextDate)
//   - PATCH /api/payments/[id]               (recalc recurringNextDate)
//   - GET  /api/cron/process-recurring-payments (advance template)
// =====================================================================

export type RecurringInterval = "weekly" | "monthly" | "quarterly" | "yearly";

export const RECURRING_INTERVALS: RecurringInterval[] = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
];

/**
 * Type-guard / validator for the recurringInterval value.
 * Returns `null` for empty string / invalid input (treated as "no recurrence").
 */
export function normalizeRecurringInterval(
  value: unknown,
): RecurringInterval | null {
  if (typeof value !== "string") return null;
  if (value === "" || value === "none") return null;
  return RECURRING_INTERVALS.includes(value as RecurringInterval)
    ? (value as RecurringInterval)
    : null;
}

/**
 * Compute the next date a recurring payment should fire, given the
 * "anchor" date (typically the payment's own date) and the interval.
 *
 * The result is normalized to UTC midnight to keep the comparison
 * `recurringNextDate <= now()` stable across DST transitions.
 */
export function computeNextRecurringDate(
  anchor: Date,
  interval: RecurringInterval,
): Date {
  const next = new Date(anchor.getTime());
  switch (interval) {
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case "quarterly":
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    case "yearly":
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      break;
  }
  // Normalize to UTC midnight so daily-cron comparisons are stable.
  next.setUTCHours(0, 0, 0, 0);
  return next;
}
