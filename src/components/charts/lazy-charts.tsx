"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// =====================================================================
// Lazy-loaded chart components
// ---------------------------------------------------------------------
// Recharts is ~200KB and only used in the Dashboard tab. By splitting
// the charts into separate components that are loaded with next/dynamic,
// the initial bundle is ~200KB smaller. The charts load on-demand when
// the user navigates to the Dashboard tab.
// =====================================================================

// Fallback skeleton shown while the chart chunk is downloading.
function ChartSkeleton() {
  return (
    <div className="flex h-72 items-center justify-center" aria-hidden>
      <Skeleton className="h-full w-full rounded-lg" />
    </div>
  );
}

// Phase chart (Bar) — plan vs actual by phase
export const PhaseChart = dynamic(
  () => import("./phase-chart").then((m) => m.PhaseChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  },
);

// Category chart (Pie) — plan distribution by category
export const CategoryChart = dynamic(
  () => import("./category-chart").then((m) => m.CategoryChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  },
);

// Spending trend chart (Area) — monthly spend + hours
export const SpendingTrendChart = dynamic(
  () => import("./spending-trend-chart").then((m) => m.SpendingTrendChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  },
);
