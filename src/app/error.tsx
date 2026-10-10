"use client";

import { useEffect, useState } from "react";
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
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    // Surface the error to dev tools so debugging is straightforward.
    console.error("Route error boundary caught:", error);
  }, [error]);

  const handleCopy = async () => {
    const report = [
      `Stavba — chybový report`,
      `Čas: ${new Date().toISOString()}`,
      error.digest ? `Kód chyby: ${error.digest}` : null,
      ``,
      `Zpráva: ${error.message || "(bez zprávy)"}`,
      ``,
      `Stack trace:`,
      error.stack || "(není k dispozici)",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      toast.success("Chyba zkopírována do schránky");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Nepodařilo se zkopírovat chyru");
    }
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive animate-in zoom-in-50 duration-300">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Něco se pokazilo
        </h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Aplikace narazila na neočekávanou chybu a nemůže pokračovat. Zkuste
          akci opakovat. Pokud chyba přetrvává, načtěte stránku znovu nebo se
          vraťte na hlavní stránku.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset} variant="default">
          <RotateCcw className="mr-2 h-4 w-4" />
          Zkusit znovu
        </Button>
        <Button
          onClick={() => {
            window.location.href = "/";
          }}
          variant="outline"
        >
          <Home className="mr-2 h-4 w-4" />
          Domů
        </Button>
        <Button onClick={handleCopy} variant="ghost" size="sm">
          {copied ? (
            <>
              <Check className="mr-2 h-4 w-4 text-success" />
              Zkopírováno
            </>
          ) : (
            <>
              <Copy className="mr-2 h-4 w-4" />
              Kopírovat chybu
            </>
          )}
        </Button>
      </div>

      {/* Progressive disclosure — technical details hidden by default */}
      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="w-full max-w-2xl">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="mx-auto">
            <Bug className="mr-2 h-3.5 w-3.5" />
            Technické detaily
            <ChevronDown
              className={`ml-2 h-3.5 w-3.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <div className="rounded-lg border bg-muted/30 p-4 text-left">
            {error.digest && (
              <div className="mb-2 flex items-center gap-2 text-xs">
                <span className="font-medium text-muted-foreground">Kód chyby:</span>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                  {error.digest}
                </code>
              </div>
            )}
            <div className="mb-2">
              <span className="text-xs font-medium text-muted-foreground">Zpráva:</span>
              <p className="mt-1 break-words font-mono text-xs text-foreground">
                {error.message || "(bez zprávy)"}
              </p>
            </div>
            {error.stack && (
              <div className="mt-3">
                <span className="text-xs font-medium text-muted-foreground">
                  Stack trace:
                </span>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/50 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
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
