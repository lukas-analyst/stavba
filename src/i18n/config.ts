// =====================================================================
// i18n configuration — single source of truth for available locales
// ---------------------------------------------------------------------
// Adding a new language is a 3-step process:
//   1. Add the locale code to `locales` below.
//   2. Create `src/messages/<code>.json` with the translations.
//   3. (optional) Add a flag emoji to `LOCALE_FLAGS`.
//
// Locale detection order (in middleware):
//   1. URL prefix (`/en/...` for non-default locales)
//   2. `NEXT_LOCALE` cookie (set by the language switcher)
//   3. `Accept-Language` header (browser preference)
//   4. `defaultLocale` (cs)
//
// Default locale (`cs`) does NOT get a URL prefix (`as-needed` strategy):
//   /p/slug       → cs (default, no prefix)
//   /en/p/slug    → en
//   /de/p/slug    → de (once added)
// =====================================================================

export const locales = ["cs", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "cs";

// Locale metadata for the language switcher + `<html lang>` attribute.
// `name` is the endonym (native name shown in the dropdown).
// `flag` is the emoji flag shown next to the name.
export const LOCALE_META: Record<
  Locale,
  { name: string; flag: string; bcp47: string }
> = {
  cs: { name: "Čeština", flag: "🇨🇿", bcp47: "cs-CZ" },
  en: { name: "English", flag: "🇬🇧", bcp47: "en-GB" },
};

// Helper: coerce an unknown string to a valid Locale, falling back to
// the default. Used by middleware and server-side locale detection.
export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) return defaultLocale;
  // Exact match (e.g. "cs", "en")
  if ((locales as readonly string[]).includes(value)) return value as Locale;
  // BCP-47 prefix match (e.g. "cs-CZ" → "cs", "en-US" → "en")
  const prefix = value.split("-")[0].toLowerCase();
  if ((locales as readonly string[]).includes(prefix)) return prefix as Locale;
  return defaultLocale;
}
