// =====================================================================
// Client-side locale detection (for non-routed client boundaries)
// ---------------------------------------------------------------------
// `error.tsx` and `global-error.tsx` MUST be client components
// ("use client") and they live at the ROOT level (`src/app/`), NOT under
// a `[locale]` segment. Because the root `layout.tsx` is a pass-through
// (no `NextIntlClientProvider`), these error boundaries can't rely on
// `useTranslations()` having been set up by a parent layout.
//
// This helper resolves the user's locale on the client, using the same
// priority order as the server-side `detectLocaleFromRequest()`:
//
//   1. `NEXT_LOCALE` cookie (set by the language switcher)
//   2. `navigator.language` / `navigator.languages` (browser preference)
//   3. `defaultLocale` (cs)
//
// IMPORTANT: this function is synchronous so it can be called from a
// `useState` initializer without triggering hydration warnings. It is
// safe to call during SSR (returns `defaultLocale` when `document` /
// `navigator` are undefined).
// =====================================================================

import { defaultLocale, normalizeLocale, type Locale } from "./config";

export function detectLocaleClient(): Locale {
  // SSR / non-browser env — return default until the client takes over.
  if (typeof document === "undefined" || typeof navigator === "undefined") {
    return defaultLocale;
  }

  // 1. Cookie (highest priority — user's explicit choice via language switcher)
  const cookieMatch = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("NEXT_LOCALE="));
  if (cookieMatch) {
    const raw = decodeURIComponent(cookieMatch.split("=").slice(1).join("="));
    return normalizeLocale(raw);
  }

  // 2. navigator.language (browser preference)
  const navLangs = [navigator.language, ...(navigator.languages ?? [])];
  for (const lang of navLangs) {
    if (!lang) continue;
    const normalized = normalizeLocale(lang);
    // normalizeLocale falls back to default; only accept if it actually matched.
    if (normalized !== defaultLocale || lang.toLowerCase().startsWith("cs")) {
      return normalized;
    }
  }

  // 3. Fallback
  return defaultLocale;
}
