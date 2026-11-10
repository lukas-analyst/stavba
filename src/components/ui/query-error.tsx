"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

// =====================================================================
// QueryError — friendly inline error state for failed data fetches
// ---------------------------------------------------------------------
// Used by tabs when a TanStack Query returns `isError: true`. Shows
// a calm message + retry button. The retry calls `refetch()` on the
// query (passed as `onRetry`).
//
// Usage:
//   const { data, isLoading, isError, refetch } = useBudgetItems(id);
//   if (isError) return <QueryError onRetry={() => refetch()} />;
// =====================================================================

export function QueryError({
  onRetry,
  message,
}: {
  onRetry?: () => void;
  message?: string;
}) {
  const t = useTranslations("common");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive/60" />
      <p className="type-body text-muted-foreground max-w-sm">
        {message ?? t("loadError")}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="mr-2 h-3.5 w-3.5" />
          {t("retry")}
        </Button>
      )}
    </div>
  );
}
