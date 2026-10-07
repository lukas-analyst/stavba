// Formatting helpers for CZ locale

export function formatCzk(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return "—";
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(value: number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 }).format(value) + suffix;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 }).format(value) + " %";
}

export function formatDate(
  date: Date | string | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(
    "cs-CZ",
    opts ?? { day: "2-digit", month: "2-digit", year: "numeric" },
  ).format(d);
}

export function formatDateShort(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("cs-CZ", { day: "2-digit", month: "2-digit" }).format(d);
}

// Compute days remaining until a target date (from now)
export function daysUntil(target: Date | string | null | undefined): number | null {
  if (!target) return null;
  const d = typeof target === "string" ? new Date(target) : target;
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOfTarget.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
}

// Human-readable "in X days" / "X days ago" / "today"
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

// Calculate "burn rate" % = actualCost / planCost * 100
export function burnRate(actual: number, plan: number | null): number | null {
  if (!plan || plan === 0) return null;
  return (actual / plan) * 100;
}

// Calculate remaining budget
export function remaining(plan: number | null, actual: number): number {
  if (plan === null) return -actual;
  return plan - actual;
}

// Phase color mapping — uses sémantic tokens (info/danger/warning/success/time)
// defined in globals.css. Same palette is used across all phase representations
// (badge, border, background stripe, dot) so changing a phase color is a
// single-token edit in globals.css.
export const PHASE_COLORS: Record<string, string> = {
  Příprava: "bg-info-soft text-info-strong border-info/30 dark:bg-info-soft dark:text-info-strong dark:border-info/40",
  Demolice: "bg-danger-soft text-danger-strong border-danger/30 dark:bg-danger-soft dark:text-danger-strong dark:border-danger/40",
  "Hrubá stavba": "bg-warning-soft text-warning-strong border-warning/30 dark:bg-warning-soft dark:text-warning-strong dark:border-warning/40",
  Zabydlování: "bg-success-soft text-success-strong border-success/30 dark:bg-success-soft dark:text-success-strong dark:border-success/40",
  "Do budoucna": "bg-time-soft text-time-strong border-time/30 dark:bg-time-soft dark:text-time-strong dark:border-time/40",
  Neurčeno: "bg-muted text-muted-foreground border-border dark:bg-muted dark:text-muted-foreground dark:border-border",
};

// Phase left-border accent colors (for table rows)
export const PHASE_BORDER_COLORS: Record<string, string> = {
  Příprava: "border-l-info",
  Demolice: "border-l-danger",
  "Hrubá stavba": "border-l-warning",
  Zabydlování: "border-l-success",
  "Do budoucna": "border-l-time",
  Neurčeno: "border-l-border",
};

// Phase background colors used for absolute-positioned colored stripes
// (replaces border-l-2 to avoid rounded-corner clipping at the last row of a category).
export const PHASE_BG_COLORS: Record<string, string> = {
  Příprava: "bg-info",
  Demolice: "bg-danger",
  "Hrubá stavba": "bg-warning",
  Zabydlování: "bg-success",
  "Do budoucna": "bg-time",
  Neurčeno: "bg-muted-foreground/50",
};

export const PHASE_DOT_COLORS: Record<string, string> = {
  Příprava: "bg-info",
  Demolice: "bg-danger",
  "Hrubá stavba": "bg-warning",
  Zabydlování: "bg-success",
  "Do budoucna": "bg-time",
  Neurčeno: "bg-muted-foreground",
};

// Phase CSS variable mapping — used by budget-tab.tsx to set the
// `--phase-color` custom property for the gradient stripe under child rows.
// Each value references a design token (defined in globals.css), so the
// gradient stays in sync with the badge/border colors automatically.
export const PHASE_CSS_VARS: Record<string, string> = {
  Příprava: "var(--info)",
  Demolice: "var(--danger)",
  "Hrubá stavba": "var(--warning)",
  Zabydlování: "var(--success)",
  "Do budoucna": "var(--time)",
  Neurčeno: "var(--muted-foreground)",
  // Rejected items use danger regardless of phase
  rose: "var(--danger)",
};

// Project status labels — SINGLE SOURCE OF TRUTH (previously duplicated in
// app-sidebar.tsx and project-detail.tsx). Includes a `dot` color used by
// project-detail header; app-sidebar simply ignores the `dot` field.
export const STATUS_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  active: {
    label: "Aktivní",
    color: "bg-success-soft text-success-strong dark:bg-success-soft dark:text-success-strong",
    dot: "bg-success",
  },
  planning: {
    label: "Plánování",
    color: "bg-info-soft text-info-strong dark:bg-info-soft dark:text-info-strong",
    dot: "bg-info",
  },
  completed: {
    label: "Dokončeno",
    color: "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  paused: {
    label: "Pozastaveno",
    color: "bg-warning-soft text-warning-strong dark:bg-warning-soft dark:text-warning-strong",
    dot: "bg-warning",
  },
};

export const PHASE_ORDER = [
  "Příprava",
  "Demolice",
  "Hrubá stavba",
  "Zabydlování",
  "Do budoucna",
  "Neurčeno",
];

export const PHASES = [
  "Příprava",
  "Demolice",
  "Hrubá stavba",
  "Zabydlování",
  "Do budoucna",
  "Neurčeno",
];

export const CONTACT_TYPES: { value: string; label: string; emoji: string }[] = [
  { value: "company", label: "Firma", emoji: "🏢" },
  { value: "craftsman", label: "Řemeslník", emoji: "🔧" },
  { value: "self", label: "Svépomoc", emoji: "🛠️" },
  { value: "family", label: "Rodina", emoji: "👨‍👩‍👧" },
  { value: "supplier", label: "Dodavatel", emoji: "📦" },
  { value: "architect", label: "Architekt", emoji: "📐" },
  { value: "office", label: "Úřad", emoji: "🏛️" },
];

export const PAYMENT_TYPES: { value: string; label: string; emoji: string }[] = [
  { value: "receipt", label: "Účtenka", emoji: "🧾" },
  { value: "invoice", label: "Faktura", emoji: "📄" },
  { value: "work", label: "Práce", emoji: "🔨" },
  { value: "material", label: "Materiál", emoji: "🧱" },
  { value: "person", label: "Osoba", emoji: "👤" },
  { value: "other", label: "Jiné", emoji: "📌" },
];

export const WORKER_TYPES: { value: string; label: string; emoji: string }[] = [
  { value: "company", label: "Firma", emoji: "🏢" },
  { value: "craftsman", label: "Řemeslník", emoji: "🔧" },
  { value: "self", label: "Svépomoc", emoji: "🛠️" },
  { value: "family", label: "Rodina", emoji: "👨‍👩‍👧" },
];

export function contactTypeLabel(type: string): { label: string; emoji: string } {
  return CONTACT_TYPES.find((c) => c.value === type) ?? { label: type, emoji: "•" };
}

export function paymentTypeLabel(type: string): { label: string; emoji: string } {
  return PAYMENT_TYPES.find((p) => p.value === type) ?? { label: type, emoji: "•" };
}

export function workerTypeLabel(type: string): { label: string; emoji: string } {
  return WORKER_TYPES.find((w) => w.value === type) ?? { label: type, emoji: "•" };
}
