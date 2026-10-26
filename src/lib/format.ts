// =====================================================================
// Formatting helpers — locale-aware (i18n)
// ---------------------------------------------------------------------
// HYBRID approach:
//   • Server-side / utility functions accept an optional `locale` param.
//     When omitted, they default to `cs-CZ` (backward compatible).
//   • Client components should prefer `useFormatter()` from `next-intl`
//     for live locale switching without re-renders. But for places where
//     the format helpers are used outside React (e.g. CSV export, emails),
//     passing `locale` explicitly is the way to go.
//
// The `Locale` type is re-exported so callers don't have to import from
// two places. `toBcp47()` converts a short locale code ("cs", "en") to
// the BCP-47 tag ("cs-CZ", "en-GB") expected by `Intl`.
// =====================================================================

import type { Locale } from "@/i18n/config";
import { LOCALE_META, defaultLocale } from "@/i18n/config";

// Convert short locale ("cs") to BCP-47 ("cs-CZ") for Intl APIs.
export function toBcp47(locale: Locale = defaultLocale): string {
  return LOCALE_META[locale]?.bcp47 ?? LOCALE_META[defaultLocale].bcp47;
}

// ───────────────────────────────────────────────────────────────
// Currency / number formatting
// ───────────────────────────────────────────────────────────────

// CZK currency formatter. Kept as `formatCzk` for backward compatibility —
// the project's currency is CZK and we don't currently support multi-
// currency display, so the currency code is hardcoded. Only the locale
// (digit grouping, decimal separator) changes.
export function formatCzk(
  amount: number | null | undefined,
  locale: Locale = defaultLocale,
): string {
  if (amount === null || amount === undefined || isNaN(amount)) return "—";
  return new Intl.NumberFormat(toBcp47(locale), {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(
  value: number | null | undefined,
  suffix = "",
  locale: Locale = defaultLocale,
): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return (
    new Intl.NumberFormat(toBcp47(locale), { maximumFractionDigits: 1 }).format(
      value,
    ) + suffix
  );
}

export function formatPercent(
  value: number | null | undefined,
  locale: Locale = defaultLocale,
): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return (
    new Intl.NumberFormat(toBcp47(locale), { maximumFractionDigits: 0 }).format(
      value,
    ) + " %"
  );
}

// ───────────────────────────────────────────────────────────────
// Multi-currency formatting
// ---------------------------------------------------------------------
// Formats an amount with the appropriate currency symbol + locale-aware
// digit grouping. Uses Intl.NumberFormat with `style: "currency"`.
//
// For CZK: no decimal places (Kč amounts are whole numbers in practice).
// For EUR/USD/GBP: 2 decimal places.
// For HUF/VND: 0 decimal places.
// =====================================================================
export function formatCurrency(
  amount: number | null | undefined,
  currency: string = "CZK",
  locale: Locale = defaultLocale,
): string {
  if (amount === null || amount === undefined || isNaN(amount)) return "—";
  // CZK: 0 decimals (Czech practice — haléře are not used)
  // HUF, VND: 0 decimals (high denomination currencies)
  // EUR, USD, GBP, PLN, AUD: 2 decimals
  const decimals = currency === "CZK" || currency === "HUF" || currency === "VND" ? 0 : 2;
  return new Intl.NumberFormat(toBcp47(locale), {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

// ───────────────────────────────────────────────────────────────
// Date formatting
// ───────────────────────────────────────────────────────────────

/**
 * Extract YYYY-MM-DD from a date string or Date object, treating the
 * date as UTC (not local timezone). This prevents dates from shifting
 * back by one day in negative-offset timezones.
 *
 * Use this instead of `date.substring(0, 10)` for all date input fields
 * (`<input type="date">`).
 */
export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toISOString().substring(0, 10);
}

export function formatDate(
  date: Date | string | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
  locale: Locale = defaultLocale,
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(
    toBcp47(locale),
    opts ?? { day: "2-digit", month: "2-digit", year: "numeric" },
  ).format(d);
}

export function formatDateShort(
  date: Date | string | null | undefined,
  locale: Locale = defaultLocale,
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(toBcp47(locale), {
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

// ───────────────────────────────────────────────────────────────
// Date math (locale-independent, kept as-is)
// ───────────────────────────────────────────────────────────────

export function daysUntil(target: Date | string | null | undefined): number | null {
  if (!target) return null;
  const d = typeof target === "string" ? new Date(target) : target;
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOfTarget.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
}

// NOTE: `daysUntilLabel` returns Czech strings today. It will be migrated
// to message keys in a follow-up (the label is used in many places and
// needs the locale to be threaded through). For now it stays as-is.
export function daysUntilLabel(target: Date | string | null | undefined): { text: string; tone: "past" | "today" | "soon" | "future" | "none"; days: number | null } {
  const days = daysUntil(target);
  if (days === null) return { text: "", tone: "none", days: null };
  if (days === 0) return { text: "dnes", tone: "today", days };
  if (days < 0) {
    const abs = Math.abs(days);
    return {
      text: abs === 1 ? "včera" : `před ${abs} dny`,
      tone: "past",
      days,
    };
  }
  if (days <= 7) return { text: `za ${days} ${days === 1 ? "den" : days < 5 ? "dny" : "dní"}`, tone: "soon", days };
  if (days <= 30) return { text: `za ${days} dní`, tone: "future", days };
  if (days <= 365) return { text: `za ${Math.round(days / 30)} měs.`, tone: "future", days };
  return { text: `za ${Math.round(days / 365)} rok${Math.round(days / 365) === 1 ? "" : "y"}`, tone: "future", days };
}

export function burnRate(actual: number, plan: number | null): number | null {
  if (!plan || plan === 0) return null;
  return (actual / plan) * 100;
}

export function remaining(plan: number | null, actual: number): number {
  if (plan === null) return -actual;
  return plan - actual;
}

// ───────────────────────────────────────────────────────────────
// Phase constants — STABLE ENGLISH IDs + legacy Czech mapping
// ---------------------------------------------------------------------
// IMPORTANT: The DB currently stores CZECH phase names (e.g. "Příprava")
// for the 3 existing production projects. We are migrating to STABLE
// ENGLISH IDs ("preparation", "demolition", …) so that:
//   • Translations don't break when the DB stores the ID.
//   • Filtering `WHERE phase = 'preparation'` works regardless of locale.
//   • Sorting/order is stable (`PHASE_ORDER` uses English IDs).
//
// To avoid breaking existing data, we keep a legacy mapping
// (`PHASE_LEGACY_TO_ID`) that converts Czech values to IDs on read.
// A SQL migration script (`scripts/migrate-phases-to-ids.sql`) will
// convert the actual DB values; once it runs, the legacy mapping can
// be removed (but it's safe to keep indefinitely as a safety net).
// ───────────────────────────────────────────────────────────────

// Stable English phase IDs — used everywhere in code + stored in DB.
// Expanded (2025) with finer-grained construction phases (earthworks,
// foundation, installations, facade, roof, interior, exterior,
// final_inspection). Existing data with the original 6 IDs remains
// valid — we only ADDED new ones, no renames.
export const PHASES = [
  "preparation",
  "demolition",
  "earthworks",
  "foundation",
  "shell",
  "installations",
  "finishing",
  "facade",
  "roof",
  "interior",
  "exterior",
  "final_inspection",
  "future",
  "unspecified",
] as const;

export type PhaseId = (typeof PHASES)[number];

// Display order for phases (used by sort + filter UI).
export const PHASE_ORDER = [...PHASES] as const;

// Legacy Czech → English ID mapping. Used by `normalizePhase()` to
// convert any DB value (old Czech or new English) to a stable ID.
// After the SQL migration runs, every row will already be English —
// but this mapping ensures backward compatibility if any old data slips
// through (e.g. restored from a snapshot).
//
// NOTE: The expanded phases (earthworks, foundation, installations,
// facade, roof, interior, exterior, final_inspection) have NO legacy
// Czech values — they were added in 2025. They are listed here as
// English→English pass-throughs so `normalizePhase()` returns the ID
// unchanged when it encounters them.
export const PHASE_LEGACY_TO_ID: Record<string, PhaseId> = {
  // Czech (legacy)
  "Příprava": "preparation",
  "Demolice": "demolition",
  "Hrubá stavba": "shell",
  "Zabydlování": "finishing",
  "Do budoucna": "future",
  "Neurčeno": "unspecified",
  // English (current — pass-through, ensures idempotency)
  preparation: "preparation",
  demolition: "demolition",
  earthworks: "earthworks",
  foundation: "foundation",
  shell: "shell",
  installations: "installations",
  finishing: "finishing",
  facade: "facade",
  roof: "roof",
  interior: "interior",
  exterior: "exterior",
  final_inspection: "final_inspection",
  future: "future",
  unspecified: "unspecified",
};

// Reverse mapping (ID → Czech) — used ONLY by the SQL migration script
// to validate that all legacy values are covered. Not for runtime use.
// For the NEW phases added in 2025, there is no legacy Czech value —
// we store the English ID itself as the placeholder.
export const PHASE_ID_TO_LEGACY: Record<PhaseId, string> = {
  preparation: "Příprava",
  demolition: "Demolice",
  earthworks: "earthworks",
  foundation: "foundation",
  shell: "Hrubá stavba",
  installations: "installations",
  finishing: "Zabydlování",
  facade: "facade",
  roof: "roof",
  interior: "interior",
  exterior: "exterior",
  final_inspection: "final_inspection",
  future: "Do budoucna",
  unspecified: "Neurčeno",
};

/**
 * Convert any phase value (legacy Czech or new English ID) to a stable
 * English ID. Returns "unspecified" if the input doesn't match anything.
 *
 * Use this on every `item.phase` read from the DB before passing it to
 * translation or color lookup functions.
 */
export function normalizePhase(raw: string | null | undefined): PhaseId {
  if (!raw) return "unspecified";
  return PHASE_LEGACY_TO_ID[raw] ?? "unspecified";
}

// ───────────────────────────────────────────────────────────────
// Phase colors — keyed by ENGLISH ID now (was Czech before)
// ---------------------------------------------------------------------
// `phaseColor(phase)` looks up by ID, with fallback to "unspecified".
// Callers should pass the normalized ID (from `normalizePhase`), but
// we also accept legacy Czech values for safety (auto-normalizes).
// ───────────────────────────────────────────────────────────────

export const PHASE_COLORS: Record<PhaseId, string> = {
  preparation: "bg-info-soft text-info-strong border-info/30 dark:bg-info-soft dark:text-info-strong dark:border-info/40",
  demolition: "bg-danger-soft text-danger-strong border-danger/30 dark:bg-danger-soft dark:text-danger-strong dark:border-danger/40",
  earthworks: "bg-warning-soft text-warning-strong border-warning/30 dark:bg-warning-soft dark:text-warning-strong dark:border-warning/40",
  foundation: "bg-muted text-muted-foreground border-border dark:bg-muted dark:text-muted-foreground dark:border-border",
  shell: "bg-warning-soft text-warning-strong border-warning/30 dark:bg-warning-soft dark:text-warning-strong dark:border-warning/40",
  installations: "bg-info-soft text-info-strong border-info/30 dark:bg-info-soft dark:text-info-strong dark:border-info/40",
  finishing: "bg-success-soft text-success-strong border-success/30 dark:bg-success-soft dark:text-success-strong dark:border-success/40",
  facade: "bg-warning-soft text-warning-strong border-warning/30 dark:bg-warning-soft dark:text-warning-strong dark:border-warning/40",
  roof: "bg-danger-soft text-danger-strong border-danger/30 dark:bg-danger-soft dark:text-danger-strong dark:border-danger/40",
  interior: "bg-success-soft text-success-strong border-success/30 dark:bg-success-soft dark:text-success-strong dark:border-success/40",
  exterior: "bg-success-soft text-success-strong border-success/30 dark:bg-success-soft dark:text-success-strong dark:border-success/40",
  final_inspection: "bg-primary/10 text-primary border-primary/30 dark:bg-primary/10 dark:text-primary dark:border-primary/40",
  future: "bg-time-soft text-time-strong border-time/30 dark:bg-time-soft dark:text-time-strong dark:border-time/40",
  unspecified: "bg-muted text-muted-foreground border-border dark:bg-muted dark:text-muted-foreground dark:border-border",
};

export const PHASE_BORDER_COLORS: Record<PhaseId, string> = {
  preparation: "border-l-info",
  demolition: "border-l-danger",
  earthworks: "border-l-warning",
  foundation: "border-l-border",
  shell: "border-l-warning",
  installations: "border-l-info",
  finishing: "border-l-success",
  facade: "border-l-warning",
  roof: "border-l-danger",
  interior: "border-l-success",
  exterior: "border-l-success",
  final_inspection: "border-l-primary",
  future: "border-l-time",
  unspecified: "border-l-border",
};

export const PHASE_BG_COLORS: Record<PhaseId, string> = {
  preparation: "bg-info",
  demolition: "bg-danger",
  earthworks: "bg-warning",
  foundation: "bg-muted-foreground/50",
  shell: "bg-warning",
  installations: "bg-info",
  finishing: "bg-success",
  facade: "bg-warning",
  roof: "bg-danger",
  interior: "bg-success",
  exterior: "bg-success",
  final_inspection: "bg-primary",
  future: "bg-time",
  unspecified: "bg-muted-foreground/50",
};

export const PHASE_DOT_COLORS: Record<PhaseId, string> = {
  preparation: "bg-info",
  demolition: "bg-danger",
  earthworks: "bg-warning",
  foundation: "bg-muted-foreground",
  shell: "bg-warning",
  installations: "bg-info",
  finishing: "bg-success",
  facade: "bg-warning",
  roof: "bg-danger",
  interior: "bg-success",
  exterior: "bg-success",
  final_inspection: "bg-primary",
  future: "bg-time",
  unspecified: "bg-muted-foreground",
};

// CSS custom properties for charts. Reuses existing semantic CSS vars
// (--info, --warning, --danger, --success, --time, --primary,
// --muted-foreground) so charts automatically adapt to light/dark mode
// via the variables defined in globals.css.
export const PHASE_CSS_VARS: Record<string, string> = {
  preparation: "var(--info)",
  demolition: "var(--danger)",
  earthworks: "var(--warning)",
  foundation: "var(--muted-foreground)",
  shell: "var(--warning)",
  installations: "var(--info)",
  finishing: "var(--success)",
  facade: "var(--warning)",
  roof: "var(--danger)",
  interior: "var(--success)",
  exterior: "var(--success)",
  final_inspection: "var(--time)",
  future: "var(--time)",
  unspecified: "var(--muted-foreground)",
  // Rejected items use danger regardless of phase
  rose: "var(--danger)",
};

// Convenience: color by raw phase value (auto-normalizes legacy Czech).
// Use this in components that receive `item.phase` directly from the DB.
export function phaseColor(rawPhase: string | null | undefined): string {
  return PHASE_COLORS[normalizePhase(rawPhase)];
}
export function phaseBorderColor(rawPhase: string | null | undefined): string {
  return PHASE_BORDER_COLORS[normalizePhase(rawPhase)];
}
export function phaseBgColor(rawPhase: string | null | undefined): string {
  return PHASE_BG_COLORS[normalizePhase(rawPhase)];
}
export function phaseDotColor(rawPhase: string | null | undefined): string {
  return PHASE_DOT_COLORS[normalizePhase(rawPhase)];
}
export function phaseCssVar(rawPhase: string | null | undefined): string {
  return PHASE_CSS_VARS[normalizePhase(rawPhase)] ?? PHASE_CSS_VARS.unspecified;
}

// ───────────────────────────────────────────────────────────────
// Status labels — keyed by ENGLISH ID (already stable, no legacy)
// ---------------------------------------------------------------------
// `status` is already stored as English ID in the DB ("active", "planning",
// "completed", "paused"). Only the LABEL was Czech. We keep the structure
// but move the `label` into message bundles (translate via `t(status)`).
// `color` and `dot` stay here (they're CSS classes, not text).
// ───────────────────────────────────────────────────────────────

export type StatusId = "active" | "planning" | "completed" | "paused";

export const STATUS_IDS: StatusId[] = ["active", "planning", "completed", "paused"];

// Colors/dots are locale-independent (CSS classes).
// LABEL is now in messages → t(`statuses.${status}`)
export const STATUS_COLORS: Record<StatusId, { color: string; dot: string }> = {
  active: {
    color: "bg-success-soft text-success-strong dark:bg-success-soft dark:text-success-strong",
    dot: "bg-success",
  },
  planning: {
    color: "bg-info-soft text-info-strong dark:bg-info-soft dark:text-info-strong",
    dot: "bg-info",
  },
  completed: {
    color: "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  paused: {
    color: "bg-warning-soft text-warning-strong dark:bg-warning-soft dark:text-warning-strong",
    dot: "bg-warning",
  },
};

// Backward-compat: keep `STATUS_LABELS` export (some callers may use it
// directly), but `label` is now the ENGLISH ID itself (not a localized
// string). Callers should use `t(\`statuses.${status}\`)` for display.
// @deprecated — use STATUS_COLORS + message bundle instead.
export const STATUS_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  active: { label: "active", ...STATUS_COLORS.active },
  planning: { label: "planning", ...STATUS_COLORS.planning },
  completed: { label: "completed", ...STATUS_COLORS.completed },
  paused: { label: "paused", ...STATUS_COLORS.paused },
};

// ───────────────────────────────────────────────────────────────
// Contact / Payment / Worker types — keyed by ENGLISH ID
// ---------------------------------------------------------------------
// These were ALREADY stored as English IDs in the DB (e.g. `contactType`
// is "company", "craftsman", etc.). Only the LABEL was Czech. We move
// the label to message bundles and keep the emoji here (locale-neutral).
// ───────────────────────────────────────────────────────────────

export type ContactTypeId =
  | "company"
  | "craftsman"
  | "self"
  | "family"
  | "supplier"
  | "architect"
  | "office";

export const CONTACT_TYPES: { value: ContactTypeId; emoji: string }[] = [
  { value: "company", emoji: "🏢" },
  { value: "craftsman", emoji: "🔧" },
  { value: "self", emoji: "🛠️" },
  { value: "family", emoji: "👨‍👩‍👧" },
  { value: "supplier", emoji: "📦" },
  { value: "architect", emoji: "📐" },
  { value: "office", emoji: "🏛️" },
];

export type PaymentTypeId =
  | "receipt"
  | "invoice"
  | "work"
  | "material"
  | "person"
  | "other";

export const PAYMENT_TYPES: { value: PaymentTypeId; emoji: string }[] = [
  { value: "receipt", emoji: "🧾" },
  { value: "invoice", emoji: "📄" },
  { value: "work", emoji: "🔨" },
  { value: "material", emoji: "🧱" },
  { value: "person", emoji: "👤" },
  { value: "other", emoji: "📌" },
];

export type WorkerTypeId = "company" | "craftsman" | "self" | "family";

export const WORKER_TYPES: { value: WorkerTypeId; emoji: string }[] = [
  { value: "company", emoji: "🏢" },
  { value: "craftsman", emoji: "🔧" },
  { value: "self", emoji: "🛠️" },
  { value: "family", emoji: "👨‍👩‍👧" },
];

// ───────────────────────────────────────────────────────────────
// Label helpers — now require a translator function
// ---------------------------------------------------------------------
// `contactTypeLabel(type, t)` returns `{ label, emoji }` where `label`
// comes from the message bundle (`t(\`contactTypes.${type}\`)`).
//
// This is a transitional API: existing callers that DON'T have access
// to a translator can pass `undefined` and get the raw English ID back
// (better than nothing — at least it's stable). Once all callers are
// migrated to pass `t`, we can make `t` required.
// ───────────────────────────────────────────────────────────────

type Translator = (key: string) => string;

export function contactTypeLabel(
  type: string,
  t?: Translator,
): { label: string; emoji: string } {
  const found = CONTACT_TYPES.find((c) => c.value === type);
  if (!found) return { label: type, emoji: "•" };
  return {
    emoji: found.emoji,
    label: t ? t(`contactTypes.${type}`) : type,
  };
}

export function paymentTypeLabel(
  type: string,
  t?: Translator,
): { label: string; emoji: string } {
  const found = PAYMENT_TYPES.find((p) => p.value === type);
  if (!found) return { label: type, emoji: "•" };
  return {
    emoji: found.emoji,
    label: t ? t(`paymentTypes.${type}`) : type,
  };
}

export function workerTypeLabel(
  type: string,
  t?: Translator,
): { label: string; emoji: string } {
  const found = WORKER_TYPES.find((w) => w.value === type);
  if (!found) return { label: type, emoji: "•" };
  return {
    emoji: found.emoji,
    label: t ? t(`workerTypes.${type}`) : type,
  };
}
