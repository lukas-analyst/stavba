"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { reportError } from "@/lib/error-reporting";
import { ErrorLocaleProvider } from "@/components/error-locale-provider";

/**
 * Global Error Boundary — catches errors thrown by the root `layout.tsx`
 * itself (when even the locale layout can't render).
 *
 * Per Next.js App Router rules, this component MUST render `<html>` and
 * `<body>` itself because it replaces the entire document tree (the
 * root layout is skipped when this boundary activates).
 *
 * i18n: This file lives at the ROOT of the App Router (NOT under a
 * `[locale]` segment), and the root `layout.tsx` is a pass-through
 * (no `NextIntlClientProvider`). We wrap the body content in
 * `<ErrorLocaleProvider>` which detects the locale from the
 * `NEXT_LOCALE` cookie + `navigator.language` on the client.
 *
 * Inline styles are used (instead of Tailwind) because `globals.css`
 * is imported by the root layout — which is bypassed here. We can't
 * rely on Tailwind classes being available in this fallback tree.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <ErrorLocaleProvider>
          <GlobalErrorContent error={error} reset={reset} />
        </ErrorLocaleProvider>
      </body>
    </html>
  );
}

function GlobalErrorContent({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("errors.global");

  useEffect(() => {
    reportError(error, { source: "global-error-boundary" });
  }, [error]);

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h2>{t("title")}</h2>
      <p>{t("description")}</p>
      <button onClick={() => reset()}>{t("tryAgain")}</button>
    </div>
  );
}
