"use client";

import { SessionProvider } from "next-auth/react";
import { NextIntlClientProvider } from "next-intl";
import type { Locale } from "@/i18n/config";

// =====================================================================
// PublicProviders — client-side providers for non-routed public pages
// ---------------------------------------------------------------------
// Used by `/p/[slug]/layout.tsx` and `/invite/[token]/layout.tsx`
// (pages that don't have a `[locale]` URL segment).
//
// Combines:
//   1. `NextIntlClientProvider` — for `useTranslations()` / `useLocale()`
//   2. `SessionProvider` — for `useSession()` (the public pages check
//      auth state to show "Zažádat o přístup" / "Otevřít v aplikaci")
//
// Both providers must be client components, so this wrapper carries the
// `"use client"` directive. The locale is detected server-side (via
// `detectLocaleFromRequest()`) and passed in as a prop.
// =====================================================================

export function PublicProviders({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Record<string, unknown>;
  children: React.ReactNode;
}) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SessionProvider>{children}</SessionProvider>
    </NextIntlClientProvider>
  );
}
