"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  RefreshCw,
  Inbox,
} from "lucide-react";

// =====================================================================
// RecentEventsTable — paginated "Poslední události" table
// ---------------------------------------------------------------------
// Self-contained component with its own state + fetch logic. Uses the
// dedicated /api/analytics/events endpoint (NOT the summary endpoint),
// so changing pages is fast and the pagination math is guaranteed
// consistent (total always matches the entries filter).
//
// Props:
//   - users, pages, projects, availableTypes: filter dropdown options
//     sourced from the summary endpoint (TelemetryTab passes them in)
//
// Filters (type / user / page / project) are owned by this component
// so users can filter the table independently of the summary cards.
// Changing any filter resets to page 1 and refetches.
// =====================================================================

// ---- Types ----
type EventUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
};

type EventEntry = {
  id: string;
  userId: string | null;
  eventType: string;
  pageUrl: string | null;
  timeSpent: number | null;
  metadata: string | null;
  createdAt: string;
  user: EventUser | null;
};

type EventsResponse = {
  entries: EventEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type FilterOption = { id: string; name: string | null; email: string };
type ProjectOption = { id: string; name: string };

type Props = {
  users: FilterOption[];
  pages: string[];
  projects: ProjectOption[];
  availableTypes: string[];
};

// ---- Constants ----
const PAGE_SIZE = 20;
const PAGE_LABEL_MAP: Record<string, string> = {
  "dashboard-test": "dashboard",
  dashboard: "dashboard",
  budget: "budget",
  payments: "payments",
  time: "time",
  contacts: "contacts",
  timeline: "timeline",
  notes: "notes",
  management: "management",
  telemetry: "telemetry",
  admin: "admin",
};

// ---- Helpers ----
function formatEventTimestamp(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: iso, time: "" };
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return {
    date: `${day}.${month}.${d.getFullYear()}`,
    time: `${hours}:${minutes}:${seconds}`,
  };
}

function formatTimeSpent(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (minutes < 60) return rem > 0 ? `${minutes} min ${rem} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin > 0 ? `${hours} h ${remMin} min` : `${hours} h`;
}

function formatPageLabel(
  url: string | null,
  tNav: (key: string) => string,
): string {
  if (!url) return "—";
  const cleaned = url.replace(/\/+/g, "/").replace(/^\/+/, "");
  const navKey = PAGE_LABEL_MAP[cleaned];
  if (navKey) {
    try {
      return tNav(navKey);
    } catch {
      return cleaned;
    }
  }
  return cleaned;
}

function lookupProjectName(
  metadata: string | null,
  projects: ProjectOption[],
  tUnknownProject: (id: string) => string,
): string {
  if (!metadata) return "—";
  try {
    const parsed = JSON.parse(metadata);
    if (parsed && typeof parsed === "object" && typeof parsed.projectId === "string") {
      const found = projects.find((p) => p.id === parsed.projectId);
      return found?.name ?? tUnknownProject(parsed.projectId.slice(-8));
    }
    return "—";
  } catch {
    return "—";
  }
}

// ---- Skeleton ----
function RecentEventsSkeleton() {
  return (
    <Card id="telemetry-recent" className="bg-card shadow-sm">
      <CardHeader className="pb-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-1 h-4 w-72" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-9 w-full mb-3" />
        <Skeleton className="h-10 w-full mb-1" />
        <Skeleton className="h-10 w-full mb-1" />
        <Skeleton className="h-10 w-full mb-1" />
        <Skeleton className="h-10 w-full mb-1" />
        <Skeleton className="h-10 w-full mb-1" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

// ---- Main component ----
export function RecentEventsTable({
  users,
  pages,
  projects,
  availableTypes,
}: Props) {
  const t = useTranslations("tabs.telemetry");
  const tNav = useTranslations("nav.items");
  const tEventTypes = useTranslations("analytics.eventTypes");

  // Pagination state
  const [page, setPage] = useState(1);
  const [data, setData] = useState<EventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state — owned by this component (independent of summary filters)
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [userFilter, setUserFilter] = useState<string>("");
  const [pageFilter, setPageFilter] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState<string>("");

  const fetchEvents = useCallback(
    async (opts: { silent?: boolean; pageArg?: number } = {}) => {
      const { silent = false, pageArg } = opts;
      const p = pageArg ?? page;
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (typeFilter) params.set("type", typeFilter);
        if (userFilter) params.set("userId", userFilter);
        if (pageFilter) params.set("pageUrl", pageFilter);
        if (projectFilter) params.set("projectId", projectFilter);
        params.set("page", String(p));
        params.set("pageSize", String(PAGE_SIZE));
        const url = `/api/analytics/events?${params.toString()}`;
        // DEBUG (temporary): log the exact request + response so we can
        // diagnose the "only 3 entries" issue from the browser console.
        // Remove this console.info after the bug is fixed.
        console.info("[RecentEventsTable] fetch:", {
          url,
          filters: { typeFilter, userFilter, pageFilter, projectFilter },
          page: p,
        });
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch events");
        const json: EventsResponse = await res.json();
        console.info("[RecentEventsTable] response:", {
          entriesCount: json.entries?.length,
          total: json.total,
          totalPages: json.totalPages,
          firstEntry: json.entries?.[0]
            ? {
                eventType: json.entries[0].eventType,
                createdAt: json.entries[0].createdAt,
                user: json.entries[0].user?.email,
              }
            : null,
        });
        setData(json);
      } catch {
        setError(t("error.loadFailed"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, typeFilter, userFilter, pageFilter, projectFilter, t],
  );

  // Fetch on every filter/page change. We do NOT include `data` in the
  // dependency list (that would cause a loop: fetch → setData → data
  // changes → useEffect re-fires → ...). Instead we use a ref to track
  // whether this is the very first load (controls skeleton vs silent
  // refresh behavior) — refs don't trigger re-renders.
  const isFirstLoadRef = useRef(true);
  useEffect(() => {
    const isFirst = isFirstLoadRef.current;
    if (isFirst) {
      isFirstLoadRef.current = false;
    }
    void fetchEvents({ silent: !isFirst });
    // NOTE: `fetchEvents` is a useCallback whose deps include the filter
    // state values, so it changes identity when filters change — which
    // correctly triggers a refetch here. We intentionally do NOT add
    // `data` (would loop) or `isFirstLoadRef` (refs are stable).
  }, [page, typeFilter, userFilter, pageFilter, projectFilter, fetchEvents]);

  // Filter change handlers — reset to page 1
  const handleTypeFilterChange = (value: string) => {
    setTypeFilter(value);
    setPage(1);
  };
  const handleUserFilterChange = (value: string) => {
    setUserFilter(value === "__all__" ? "" : value);
    setPage(1);
  };
  const handlePageFilterChange = (value: string) => {
    setPageFilter(value === "__all__" ? "" : value);
    setPage(1);
  };
  const handleProjectFilterChange = (value: string) => {
    setProjectFilter(value === "__all__" ? "" : value);
    setPage(1);
  };
  const handleResetFilters = () => {
    setTypeFilter("");
    setUserFilter("");
    setPageFilter("");
    setProjectFilter("");
    setPage(1);
  };

  const hasActiveFilters =
    Boolean(typeFilter) ||
    Boolean(userFilter) ||
    Boolean(pageFilter) ||
    Boolean(projectFilter);

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  // Initial loading (no data yet)
  if (loading && !data) {
    return <RecentEventsSkeleton />;
  }

  // Error (no data)
  if (error && !data) {
    return (
      <Card id="telemetry-recent" className="border-danger/30 bg-danger-soft/10">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="type-body text-danger">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full gap-1.5"
            onClick={() => void fetchEvents()}
          >
            <RefreshCw className="h-3.5 w-3.5" /> {t("button.retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="telemetry-recent" className="bg-card shadow-sm">
      {/* ===== Header: title + type filter ===== */}
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="type-title-lg flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              {t("recent.title")}
            </CardTitle>
            <CardDescription>
              {t("recent.description", {
                shown: Math.min(PAGE_SIZE, total),
                total,
              })}
            </CardDescription>
          </div>
          {/* Type filter */}
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="telemetry-type-filter"
              className="type-label text-on-surface-variant"
            >
              {t("filter.type")}
            </label>
            <select
              id="telemetry-type-filter"
              value={typeFilter}
              onChange={(e) => handleTypeFilterChange(e.target.value)}
              className="h-8 rounded-full border border-outline-variant bg-card px-3 type-label hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">{t("filter.all")}</option>
              {availableTypes.map((eventType) => {
                let label;
                try {
                  label = tEventTypes(eventType);
                } catch {
                  label = eventType;
                }
                return (
                  <option key={eventType} value={eventType}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </CardHeader>

      {/* ===== Filter row (User / Page / Project) ===== */}
      <div className="border-t border-outline-variant bg-surface-container-low/50 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 type-label text-on-surface-variant">
            <Filter className="h-3.5 w-3.5" />
            {t("filter.label")}
          </div>
          {/* User filter */}
          <div className="flex items-center gap-1.5">
            <span className="type-label-sm text-on-surface-variant">
              {t("filter.user")}
            </span>
            <Select
              value={userFilter || "__all__"}
              onValueChange={handleUserFilterChange}
            >
              <SelectTrigger className="h-8 w-[180px] rounded-full type-label-sm">
                <SelectValue placeholder={t("filter.allUsers")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("filter.allUsers")}</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Page filter */}
          <div className="flex items-center gap-1.5">
            <span className="type-label-sm text-on-surface-variant">
              {t("filter.page")}
            </span>
            <Select
              value={pageFilter || "__all__"}
              onValueChange={handlePageFilterChange}
            >
              <SelectTrigger className="h-8 w-[160px] rounded-full type-label-sm">
                <SelectValue placeholder={t("filter.allPages")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("filter.allPages")}</SelectItem>
                {pages.map((p) => (
                  <SelectItem key={p} value={p}>
                    {formatPageLabel(p, tNav)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Project filter */}
          <div className="flex items-center gap-1.5">
            <span className="type-label-sm text-on-surface-variant">
              {t("filter.project")}
            </span>
            <Select
              value={projectFilter || "__all__"}
              onValueChange={handleProjectFilterChange}
            >
              <SelectTrigger className="h-8 w-[200px] rounded-full type-label-sm">
                <SelectValue placeholder={t("filter.allProjects")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("filter.allProjects")}</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Reset filters */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full gap-1.5 type-label-sm"
              onClick={handleResetFilters}
            >
              {t("filter.button.reset")}
            </Button>
          )}
          {/* Refresh button */}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-8 rounded-full gap-1.5 type-label-sm"
            onClick={() => void fetchEvents({ silent: true })}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {t("button.refresh")}
          </Button>
        </div>
      </div>

      {/* ===== Table ===== */}
      <CardContent>
        {entries.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high">
              <Inbox className="h-6 w-6 text-on-surface-variant" />
            </div>
            <p className="type-body text-on-surface-variant">
              {hasActiveFilters ? t("recent.emptyFiltered") : t("recent.empty")}
            </p>
          </div>
        ) : (
          <>
            {/* Silent refresh indicator (top progress bar) */}
            {refreshing && (
              <div className="mb-2 h-0.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-outline-variant">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-outline-variant bg-surface-container-high">
                    <th className="type-overline text-on-surface-variant px-3 py-2 text-left whitespace-nowrap">
                      {t("recent.column.date")}
                    </th>
                    <th className="type-overline text-on-surface-variant px-3 py-2 text-left whitespace-nowrap">
                      {t("recent.column.time")}
                    </th>
                    <th className="type-overline text-on-surface-variant px-3 py-2 text-left">
                      {t("recent.column.user")}
                    </th>
                    <th className="type-overline text-on-surface-variant px-3 py-2 text-left">
                      {t("recent.column.eventType")}
                    </th>
                    <th className="type-overline text-on-surface-variant px-3 py-2 text-left">
                      {t("recent.column.page")}
                    </th>
                    <th className="type-overline text-on-surface-variant px-3 py-2 text-left">
                      {t("recent.column.project")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const { date, time } = formatEventTimestamp(
                      entry.createdAt,
                    );
                    const userName =
                      entry.user?.name ||
                      entry.user?.email ||
                      t("recent.unknownUser");
                    const initials =
                      userName
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((s) => s[0]?.toUpperCase() ?? "")
                        .join("") || "?";
                    const projectName = lookupProjectName(
                      entry.metadata,
                      projects,
                      (id) => t("recent.unknownProject", { id }),
                    );
                    let eventTypeLabel: string;
                    try {
                      eventTypeLabel = tEventTypes(entry.eventType);
                    } catch {
                      eventTypeLabel = entry.eventType;
                    }
                    return (
                      <tr
                        key={entry.id}
                        className="border-b border-outline-variant last:border-0 hover:bg-surface-container-high/60 transition-colors"
                      >
                        <td className="px-3 py-2 type-label text-on-surface-variant tabular-nums whitespace-nowrap">
                          {date}
                        </td>
                        <td className="px-3 py-2 type-label text-on-surface-variant tabular-nums whitespace-nowrap">
                          {time}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <Avatar className="h-6 w-6 shrink-0">
                              {entry.user?.image ? (
                                <AvatarImage
                                  src={entry.user.image}
                                  alt={userName}
                                />
                              ) : null}
                              <AvatarFallback className="bg-secondary-container text-[9px] font-bold text-secondary-container-foreground">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <span className="type-label text-on-surface-variant truncate">
                              {userName}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            variant="secondary"
                            className="type-label-sm rounded-full"
                          >
                            {eventTypeLabel}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <span className="type-body">
                            {formatPageLabel(entry.pageUrl, tNav)}
                          </span>
                          {entry.timeSpent !== null &&
                            entry.timeSpent > 0 && (
                              <span className="type-label text-on-surface-variant ml-2">
                                · {formatTimeSpent(entry.timeSpent)}
                              </span>
                            )}
                        </td>
                        <td className="px-3 py-2">
                          <span className="type-label text-on-surface-variant">
                            {projectName}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ===== Pagination ===== */}
            {total > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant pt-3 mt-3">
                <span className="type-label-sm text-on-surface-variant tabular-nums">
                  {t("pagination.summary", {
                    from: (page - 1) * PAGE_SIZE + 1,
                    to: Math.min(page * PAGE_SIZE, total),
                    total,
                  })}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full gap-1.5"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> {t("pagination.prev")}
                  </Button>
                  <span className="type-label-sm px-2 tabular-nums">
                    {t("pagination.pageOf", { page, totalPages })}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full gap-1.5"
                    onClick={() =>
                      setPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={page >= totalPages}
                  >
                    {t("pagination.next")} <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
