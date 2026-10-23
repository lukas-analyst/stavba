"use client";

import { NextIntlClientProvider } from "next-intl";
import { useSyncExternalStore, type ReactNode } from "react";
import { detectLocaleClient } from "@/i18n/client-detect";
import { defaultLocale, locales, type Locale } from "@/i18n/config";

// =====================================================================
// ErrorLocaleProvider — minimal NextIntlClientProvider for root error
// boundaries
// ---------------------------------------------------------------------
// `error.tsx` and `global-error.tsx` live at the ROOT of the App Router
// (NOT under a `[locale]` segment), and the root `layout.tsx` is a
// pass-through wrapper that does NOT set up `NextIntlClientProvider`.
//
// When an error is thrown inside the `[locale]` segment, the React error
// boundary renders `error.tsx` WITHOUT inheriting the parent
// `NextIntlClientProvider` (error boundaries intentionally reset the
// React context tree above the failing segment).
//
// This provider fixes that by:
//   1. Detecting the locale on the client (cookie > navigator.language > cs)
//   2. Bundling BOTH `cs.json` + `en.json` statically (no async loading —
//      we don't want to wait for a network request to show an error page)
//   3. Wrapping children in `NextIntlClientProvider` with the resolved
//      locale + messages so `useTranslations("errors")` works inside.
//
// Hydration safety: we use `useSyncExternalStore` so the server-rendered
// HTML and the first client render both use `defaultLocale` (matching),
// then React re-renders with the cookie-detected locale AFTER hydration
// completes — no hydration-mismatch warnings.
//
// Statically importing both message bundles adds a small (~50KB) cost
// to the error-boundary chunk, but that chunk is only loaded when an
// error actually occurs, so it doesn't affect first-page-load size.
// =====================================================================

// Statically import both message bundles so they're inlined into the
// error-boundary chunk (no async fetch needed during error render).
import csMessages from "@/messages/cs.json";
import enMessages from "@/messages/en.json";

const MESSAGES: Record<Locale, Record<string, unknown>> = {
  cs: csMessages,
  en: enMessages,
};

// `useSyncExternalStore` plumbing.
//
// `subscribe`: register a callback that fires when the locale might have
// changed. In practice, the locale only changes when the user toggles
// the language switcher (which triggers a full navigation), so the
// callback is rarely invoked — but we still need to honor the contract
// of `useSyncExternalStore`. We listen to `languagechange` as a best
// effort (the cookie itself has no change event).
function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("languagechange", callback);
  return () => window.removeEventListener("languagechange", callback);
}

// `getSnapshot`: read the current locale on the client (cookie >
// navigator.language > default). Called by React after hydration and
// whenever `subscribe` fires its callback.
function getSnapshot(): Locale {
  return detectLocaleClient();
}

// `getServerSnapshot`: must return the same value during SSR and the
// first client render (hydration). We always return `defaultLocale`
// here so the SSR HTML matches the client's first render. After
// hydration, React calls `getSnapshot` instead and re-renders with the
// actual detected locale.
function getServerSnapshot(): Locale {
  return defaultLocale;
}

export function ErrorLocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      {children}
    </NextIntlClientProvider>
  );
}

// Re-export for consumers that need to know which locales are bundled.
export { locales };
