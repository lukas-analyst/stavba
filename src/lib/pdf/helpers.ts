// =====================================================================
// PDF Helpers — locale, formatting, sorting
// ---------------------------------------------------------------------
// Shared utility functions used by all PDF components. Extracted from
// the original monolithic pdf-components.tsx for maintainability.
// =====================================================================

import type { PdfBudgetItem, TableSort } from "./pdf-types";

// =====================================================================
// Locale helpers
// ---------------------------------------------------------------------
// The `locale` parameter on PdfExportOptions is a short code ("cs", "en")
// matching the values in @/i18n/config. Intl APIs require BCP-47 tags
// ("cs-CZ", "en-GB"). We map the short codes here, falling back to the
// raw string if it already looks like a BCP-47 tag, then to "cs-CZ".
// =====================================================================

const LOCALE_TO_BCP47: Record<string, string> = {
  cs: "cs-CZ",
  en: "en-GB",
  pl: "pl-PL",
  vi: "vi-VN",
  hu: "hu-HU",
  es: "es-ES",
  it: "it-IT",
};

export function toBcp47(locale: string): string {
  if (LOCALE_TO_BCP47[locale]) return LOCALE_TO_BCP47[locale];
  // Already looks like a BCP-47 tag (e.g. "cs-CZ") → use as-is.
  if (locale.includes("-")) return locale;
  // Unknown short code → default to Czech (project default locale).
  return "cs-CZ";
}

// =====================================================================
// Formatting helpers — locale-aware
// ---------------------------------------------------------------------
// Used by the components below AND exported for reuse by the generator
// (e.g. for filename building, log messages, …).
// =====================================================================

/**
 * Format a numeric amount with the given currency code + locale.
 *
 * - CZK / HUF / VND → 0 decimal places (high-denomination currencies,
 *   haléře-like subunits are not used in practice).
 * - EUR / USD / GBP / PLN / AUD → 2 decimal places.
 * - null/NaN → "—" (em dash).
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency: string,
  locale: string = "cs",
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return "—";
  }
  const decimals =
    currency === "CZK" || currency === "HUF" || currency === "VND" ? 0 : 2;
  try {
    return new Intl.NumberFormat(toBcp47(locale), {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    // Invalid currency code → fall back to plain number formatting.
    return new Intl.NumberFormat(toBcp47(locale), {
      maximumFractionDigits: decimals,
    }).format(amount);
  }
}

/**
 * Format a date as DD.MM.YYYY in the given locale.
 * Returns "—" for null / invalid dates.
 */
export function formatDate(
  date: Date | string | null | undefined,
  locale: string = "cs",
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (d instanceof Date === false || Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(toBcp47(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/**
 * Status icon for a budget item row in the table.
 * Uses ASCII-safe characters that work with any font:
 *   - "OK" — completed
 *   - "!" — over budget (actualCost > planCost, planCost > 0)
 *   - "-" — pending (everything else, including rejected items)
 */
export function getStatusIcon(item: PdfBudgetItem): string {
  if (item.completed) return "OK";
  const plan = item.planCostConverted ?? item.planCost ?? 0;
  if (plan > 0 && item.actualCost > plan) return "!";
  return "-";
}

// =====================================================================
// sortItems — generic comparator for table rows
// ---------------------------------------------------------------------
// Sorts an array of objects by a given field + direction.
// - Strings: locale-aware comparison (case-insensitive, accent-insensitive)
// - Numbers: numeric comparison
// - Dates: timestamp comparison (null dates sort last in asc, first in desc)
// - Booleans: false < true (so completed items sort last in asc)
//
// Returns a NEW array (does not mutate the input).
// =====================================================================

function compareValues(a: unknown, b: unknown): number {
  // Null / undefined handling — nulls sort to the end.
  const aIsNull = a === null || a === undefined;
  const bIsNull = b === null || b === undefined;
  if (aIsNull && bIsNull) return 0;
  if (aIsNull) return 1;
  if (bIsNull) return -1;

  // Numbers
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  // Dates (Date objects or date-like strings)
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  // Strings — locale-aware, case-insensitive, accent-insensitive
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  }

  // Booleans (false < true)
  if (typeof a === "boolean" && typeof b === "boolean") {
    return (a ? 1 : 0) - (b ? 1 : 0);
  }

  // Fallback — string coercion
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
}

export function sortItems<T>(items: T[], sort: TableSort | undefined): T[] {
  if (!sort) return items;
  const { field, direction } = sort;
  const sorted = [...items].sort((a, b) => {
    const aVal = (a as Record<string, unknown>)[field];
    const bVal = (b as Record<string, unknown>)[field];
    const cmp = compareValues(aVal, bVal);
    return direction === "desc" ? -cmp : cmp;
  });
  return sorted;
}
