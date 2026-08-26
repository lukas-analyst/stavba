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

// Phase color mapping
export const PHASE_COLORS: Record<string, string> = {
  Příprava: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-200 dark:border-sky-800",
  Demolice: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-800",
  "Hrubá stavba": "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800",
  Zabydlování: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800",
  "Do budoucna": "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-200 dark:border-violet-800",
  Neurčeno: "bg-zinc-100 text-zinc-800 border-zinc-200 dark:bg-zinc-800/40 dark:text-zinc-200 dark:border-zinc-700",
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
