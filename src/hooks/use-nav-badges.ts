"use client";

import { useDashboard } from "@/lib/api";
import type { DashboardData } from "@/lib/api-types";

// ============================================================
// useNavBadges — derive badge counts for sidebar navigation
// ------------------------------------------------------------
// Returns a map of badgeKey → number for the currently selected
// project. Values come from the dashboard API (already cached,
// staleTime 60s) so we don't add any extra network requests.
//
// Badge semantics:
//   required       → count of items marked "Nutné" (not yet completed)
//   overdue        → count of items past their dateTo (overdue alerts)
//   overdueUpcoming → overdue + upcoming (for timeline tab badge)
//   unscheduled    → items without any date assigned
//
// Returns 0 for all keys if no project is selected or data is loading.
// ============================================================

export type NavBadgeKey = "required" | "overdue" | "overdueUpcoming" | "unscheduled";

export type NavBadges = Record<NavBadgeKey, number>;

export function useNavBadges(projectId: string | null): NavBadges {
  const { data } = useDashboard(projectId);

  if (!data) {
    return {
      required: 0,
      overdue: 0,
      overdueUpcoming: 0,
      unscheduled: 0,
    };
  }

  return deriveBadges(data);
}

function deriveBadges(data: DashboardData): NavBadges {
  const required = data.totals.requiredCount ?? 0;
  const overdue = data.alerts.overdue.length;
  const upcoming = data.alerts.upcoming.length;
  const unscheduled = data.alerts.unscheduled.length;

  return {
    required,
    overdue,
    overdueUpcoming: overdue + upcoming,
    unscheduled,
  };
}
