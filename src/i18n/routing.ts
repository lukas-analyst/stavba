import { defineRouting } from "next-intl/routing";
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
