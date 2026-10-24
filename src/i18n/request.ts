import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { headers, cookies } from "next/headers";
import { routing } from "./routing";
import { defaultLocale, normalizeLocale } from "./config";

// =====================================================================
// Request-time configuration for next-intl
// ---------------------------------------------------------------------
// Loads the correct message bundle based on the locale resolved by
// the middleware (or the `[locale]` segment in App Router).
//
// Locale resolution order:
//   1. `requestLocale` — set by next-intl middleware / [locale] segment
//      (always available for routes under `/[locale]/...`).
//   2. `NEXT_LOCALE` cookie — set by the language switcher (fallback for
//      routes that don't have a [locale] segment, e.g. `/api/*`).
//   3. `Accept-Language` header — browser preference (fallback for
//      routes that don't have a [locale] segment, e.g. `/api/*`).
//   4. `defaultLocale` (cs) — last resort.
//
// IMPORTANT: API routes (`/api/*`) are EXCLUDED from the intl middleware
// matcher (see `src/middleware.ts`). For these routes, `requestLocale`
// is undefined. We fall back to the `NEXT_LOCALE` cookie + `Accept-Language`
// header so that API error messages returned via `getTranslations()` are
// localized correctly based on the user's language preference.
//
// If the requested locale is missing (e.g. a typo in URL or stale link),
// we fall back to the default locale's messages so the app never crashes
// with a missing-translation error — it just renders in Czech.
// =====================================================================

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // For routes outside the i18n routing (e.g. /api/*), `requestLocale`
  // is undefined. Fall back to the NEXT_LOCALE cookie + Accept-Language
  // header so server-side `getTranslations()` calls in API routes pick
  // up the user's language preference.
  if (!locale || !hasLocale(routing.locales, locale)) {
    locale = await resolveLocaleFromRequest();
  }

  // Validate against our supported locales; fall back to default.
  if (!locale || !hasLocale(routing.locales, locale)) {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

// Resolve the locale from the `NEXT_LOCALE` cookie + `Accept-Language`
// header. Used as a fallback when `requestLocale` is unavailable (e.g.
// for `/api/*` routes that bypass the intl middleware).
async function resolveLocaleFromRequest(): Promise<string | undefined> {
  try {
    const cookieStore = await cookies();
    const headerList = await headers();

    // 1. NEXT_LOCALE cookie (set by the language switcher)
    const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
    if (cookieLocale) {
      const normalized = normalizeLocale(cookieLocale);
      if ((routing.locales as readonly string[]).includes(normalized)) {
        return normalized;
      }
    }

    // 2. Accept-Language header (sorted by q-value)
    const acceptLang = headerList.get("accept-language");
    if (acceptLang) {
      const entries = acceptLang
        .split(",")
        .map((part) => {
          const [loc, ...params] = part.trim().split(";");
          const qParam = params.find((p) => p.trim().startsWith("q="));
          const q = qParam ? parseFloat(qParam.split("=")[1]) : 1;
          return { locale: loc, q };
        })
        .filter((e) => e.locale.length > 0)
        .sort((a, b) => b.q - a.q);

      for (const entry of entries) {
        const normalized = normalizeLocale(entry.locale);
        if ((routing.locales as readonly string[]).includes(normalized)) {
          return normalized;
        }
      }
    }
  } catch {
    // Headers/cookies may be unavailable in some contexts. Fall through
    // to defaultLocale.
  }
  return undefined;
}
