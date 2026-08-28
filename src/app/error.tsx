"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

/**
 * Next.js route-level error boundary.
 *
 * Catches unexpected runtime errors thrown by page components (not by
 * API routes — those have their own try/catch). The user sees a clear,
 * friendly message instead of the default Next.js stack trace, and can
 * either retry the rendering of the route segment (`reset`) or jump
 * back to the home page.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error to dev tools so debugging is straightforward.
    console.error("Route error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
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
      </div>
      {error.digest && (
        <p className="text-[11px] text-muted-foreground/60">
          Kód chyby: {error.digest}
        </p>
      )}
    </div>
  );
}
