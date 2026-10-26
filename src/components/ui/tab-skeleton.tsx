import { Skeleton } from "@/components/ui/skeleton";

// ============================================================
// TabSkeleton — standard loading skeleton for tab content.
// ------------------------------------------------------------
// Used by Budget, Payments, Time, Contacts tabs.
// Renders a filter bar skeleton + a table (or card grid) skeleton.
//
// Variants:
//   - "table" (default): toolbar + bordered table with header + N rows
//   - "card": toolbar + responsive card grid (used by Contacts tab)
// ============================================================

export function TabSkeleton({
  rows = 6,
  variant = "table",
}: {
  rows?: number;
  variant?: "table" | "card";
}) {
  return (
    <div className="space-y-3 p-4 md:p-6">
      {/* Toolbar skeleton */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-64 rounded-full" />
        <Skeleton className="h-9 w-32 rounded-full" />
        <Skeleton className="h-9 w-40 rounded-full" />
      </div>

      {variant === "table" ? (
        // Table skeleton — header row + N data rows
        <div className="overflow-hidden rounded-lg border border-outline-variant">
          <Skeleton className="h-10 w-full rounded-none" />
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-12 w-full rounded-none border-t border-outline-variant"
            />
          ))}
        </div>
      ) : (
        // Card grid skeleton — used by Contacts tab
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      )}
    </div>
  );
}
