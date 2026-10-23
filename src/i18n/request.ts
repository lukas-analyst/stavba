import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import { defaultLocale } from "./config";

// =====================================================================
// Request-time configuration for next-intl
// ---------------------------------------------------------------------
// Loads the correct message bundle based on the locale resolved by
// the middleware (or the `[locale]` segment in App Router).
//
// If the requested locale is missing (e.g. a typo in URL or stale link),
// we fall back to the default locale's messages so the app never crashes
// with a missing-translation error — it just renders in Czech.
// =====================================================================

export default getRequestConfig(async ({ requestLocale }) => {
  // `requestLocale` comes from the [locale] segment OR the middleware.
  let locale = await requestLocale;

  // Validate against our supported locales; fall back to default.
  if (!locale || !hasLocale(routing.locales, locale)) {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
