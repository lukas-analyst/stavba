import { headers, cookies } from "next/headers";
import { locales, defaultLocale, normalizeLocale, type Locale } from "./config";

// =====================================================================
// Server-side locale detection (for non-routed pages)
// ---------------------------------------------------------------------
// Public pages (`/p/[slug]`, `/invite/[token]`) intentionally do NOT
// have a `[locale]` URL segment because their URLs are shared (QR codes,
// e-mail links). Instead, they detect the locale from:
//
//   1. `NEXT_LOCALE` cookie (set by the language switcher)
//   2. `Accept-Language` header (browser preference)
//   3. `defaultLocale` (cs)
//
// This helper runs on the server (it reads headers/cookies) and returns
// the best-matching Locale. Used by the public page layouts to wrap
// themselves in `<NextIntlClientProvider locale={detectedLocale}>`.
//
// IMPORTANT: this does NOT redirect — it just resolves the locale so the
// page renders in the right language. The URL stays clean.
// =====================================================================

export async function detectLocaleFromRequest(): Promise<Locale> {
  const cookieStore = await cookies();
  const headerList = await headers();

  // 1. Cookie (highest priority — user's explicit choice)
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  if (cookieLocale) {
    const normalized = normalizeLocale(cookieLocale);
    if (normalized !== defaultLocale || (locales as readonly string[]).includes(normalized)) {
      return normalized;
    }
  }

  // 2. Accept-Language header
  const acceptLang = headerList.get("accept-language");
  if (acceptLang) {
    const parsed = parseAcceptLanguage(acceptLang);
    for (const entry of parsed) {
      const normalized = normalizeLocale(entry.locale);
      if ((locales as readonly string[]).includes(normalized)) {
        return normalized;
      }
    }
  }

  // 3. Fallback
  return defaultLocale;
}

// Parse an Accept-Language header into a sorted list of { locale, q }.
// Example: "cs-CZ,cs;q=0.9,en-US;q=0.8,en;q=0.7" →
//   [{ locale: "cs-CZ", q: 1 }, { locale: "cs", q: 0.9 }, …]
function parseAcceptLanguage(header: string): { locale: string; q: number }[] {
  return header
    .split(",")
    .map((part) => {
      const [locale, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? parseFloat(qParam.split("=")[1]) : 1;
      return { locale, q };
    })
    .filter((entry) => entry.locale.length > 0)
    .sort((a, b) => b.q - a.q);
}
