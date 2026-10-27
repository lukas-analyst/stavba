import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";
import { locales, defaultLocale } from "./config";

// =====================================================================
// next-intl routing configuration
// ---------------------------------------------------------------------
// `as-needed` strategy:
//   - Default locale (cs) → NO prefix (URL stays `/`, `/p/slug`, etc.)
//   - Non-default locales (en, de, …) → prefix (`/en/`, `/de/`)
//
// This means Czech users (the majority) see clean URLs, while English
// visitors get `/en/...`. Bookmarks to the root path keep working
// because they resolve to the default locale.
//
// `localeDetection: true` enables Accept-Language based detection —
// a browser sending `Accept-Language: en-US,en;q=0.9` will be redirected
// to `/en/...` automatically on the first visit (cookie persists it).
// =====================================================================

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
  localeDetection: true,
});

// =====================================================================
// next-intl navigation — useRouter, usePathname, Link, redirect, etc.
// ---------------------------------------------------------------------
// These are locale-aware versions of next/navigation's hooks. When you
// call `router.replace("/auth/login", { locale: "cs" })`, next-intl
// automatically:
//   1. Sets the NEXT_LOCALE cookie to the target locale
//   2. Builds the correct URL (with or without prefix based on as-needed)
//   3. Preserves the current path
//
// Use these instead of `next/navigation`'s useRouter/usePathname in
// components that need locale-aware navigation (e.g. LanguageSwitcher).
// =====================================================================
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
