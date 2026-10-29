"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertTriangle,
  RotateCcw,
  Home,
  Copy,
  Check,
  ChevronDown,
  Bug,
} from "lucide-react";
import { toast } from "sonner";
import { reportError } from "@/lib/error-reporting";
import { ErrorLocaleProvider } from "@/components/error-locale-provider";

/**
 * Next.js route-level error boundary.
 *
 * Catches unexpected runtime errors thrown by page components (not by
 * API routes — those have their own try/catch). The user sees a clear,
 * friendly message instead of the default Next.js stack trace, and can
 * either retry the rendering of the route segment (`reset`), jump back
 * to the home page, or copy the error details to share with support.
 *
 * Design goals:
 *   1. Calm, non-alarming tone — the user didn't break anything.
 *   2. Progressive disclosure — friendly message first, technical
 *      details (message + stack + digest) collapsed behind a toggle
 *      so power users / developers can inspect without overwhelming
 *      non-technical users.
 *   3. Copy-to-clipboard for easy error reporting.
 *
 * i18n: This file lives at the ROOT of the App Router (NOT under a
 * `[locale]` segment), so the parent `[locale]/layout.tsx`'s
 * `NextIntlClientProvider` is NOT available here (error boundaries
 * reset the React context tree above the failing segment). We wrap
 * the inner content in `<ErrorLocaleProvider>` which detects the
 * locale from the `NEXT_LOCALE` cookie + `navigator.language` on the
 * client and bundles both `cs.json` + `en.json` statically so the
 * error page renders in the user's chosen language without any
 * network round-trip.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorLocaleProvider>
      <ErrorContent error={error} reset={reset} />
    </ErrorLocaleProvider>
  );
}

function ErrorContent({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  const [copied, setCopied] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    // Surface the error to dev tools so debugging is straightforward.
    console.error("Route error boundary caught:", error);
    // Report to error reporting pipeline (console + optional webhook).
    reportError(error, { digest: error.digest, source: "route-error-boundary" });
  }, [error]);

  const handleCopy = async () => {
    const report = [
      t("report.subject"),
      t("report.time", { time: new Date().toISOString() }),
      error.digest ? t("report.code", { code: error.digest }) : null,
      ``,
      t("report.message", { message: error.message || t("noMessage") }),
      ``,
      t("report.stackHeader"),
      error.stack || t("noStack"),
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      toast.success(t("copySuccessToast"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("copyFailedToast"));
    }
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive animate-in zoom-in-50 duration-300">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <div className="space-y-2">
        <h1 className="type-display tracking-tight">{t("title")}</h1>
        <p className="mx-auto max-w-md type-body text-muted-foreground">
          {t("description")}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset} variant="default">
          <RotateCcw className="mr-2 h-4 w-4" />
          {t("tryAgain")}
        </Button>
        <Button
          onClick={() => {
            window.location.href = "/";
          }}
          variant="outline"
        >
          <Home className="mr-2 h-4 w-4" />
          {t("home")}
        </Button>
        <Button onClick={handleCopy} variant="ghost" size="sm">
          {copied ? (
            <>
              <Check className="mr-2 h-4 w-4 text-success" />
              {t("copied")}
            </>
          ) : (
            <>
              <Copy className="mr-2 h-4 w-4" />
              {t("copyError")}
            </>
          )}
        </Button>
      </div>

      {/* Progressive disclosure — technical details hidden by default */}
      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="w-full max-w-2xl">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="mx-auto">
            <Bug className="mr-2 h-3.5 w-3.5" />
            {t("technicalDetails")}
            <ChevronDown
              className={`ml-2 h-3.5 w-3.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <div className="rounded-lg border bg-muted/30 p-4 text-left">
            {error.digest && (
              <div className="mb-2 flex items-center gap-2 type-label">
                <span className="font-medium text-muted-foreground">{t("errorCode")}</span>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono type-label">
                  {error.digest}
                </code>
              </div>
            )}
            <div className="mb-2">
              <span className="type-label font-medium text-muted-foreground">{t("message")}</span>
              <p className="mt-1 break-words font-mono type-body text-foreground">
                {error.message || t("noMessage")}
              </p>
            </div>
            {error.stack && (
              <div className="mt-3">
                <span className="type-label font-medium text-muted-foreground">
                  {t("stackTrace")}
                </span>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/50 p-2 font-mono type-label-sm leading-relaxed text-muted-foreground">
                  {error.stack}
                </pre>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
