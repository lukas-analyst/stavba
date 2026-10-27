// =====================================================================
// i18n configuration — single source of truth for available locales
// =====================================================================

export const locales = ["cs", "en", "pl", "vi", "hu", "es", "it"] as const;
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
  pl: { name: "Polski", flag: "🇵🇱", bcp47: "pl-PL" },
  vi: { name: "Tiếng Việt", flag: "🇻🇳", bcp47: "vi-VN" },
  hu: { name: "Magyar", flag: "🇭🇺", bcp47: "hu-HU" },
  es: { name: "Español", flag: "🇪🇸", bcp47: "es-ES" },
  it: { name: "Italiano", flag: "🇮🇹", bcp47: "it-IT" },
};

export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) return defaultLocale;
  if ((locales as readonly string[]).includes(value)) return value as Locale;
  const prefix = value.split("-")[0].toLowerCase();
  if ((locales as readonly string[]).includes(prefix)) return prefix as Locale;
  return defaultLocale;
}
