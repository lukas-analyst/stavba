"use client";

import { useCallback, useEffect, useState } from "react";
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
  Eye,
  Timer,
  Users,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Loader2,
  BarChart3,
  Clock,
  Gauge,
  Crown,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

// =====================================================================
// TelemetryTab — internal analytics dashboard
// ---------------------------------------------------------------------
// Displays aggregated telemetry data collected via /api/analytics.
// No third-party scripts, no cookies. All data lives in the app's own
// Postgres `analytics_events` table.
//
// Sections:
//   1. Přehled            — 4 KPI cards
//   2. Události podle typu     — bar chart (CSS bars)
//   3. Aktivita podle dní     — 30-day area chart (CSS bars)
//   4. Nejnavštěvovanější stránky — table (URL, views, avg time)
//   5. Přehled času        — 3 KPI cards (total/avg/longest)
//   6. Doba návštěvnosti   — horizontal bar chart of timeByPage
//   7. Aktivita uživatelů  — table of topUsersByEvents
//   8. Aktivita dle hodiny — 24-bar hourly chart (today)
//   9. Poslední události     — paginated table (timestamp, user, type, URL)
//      + filter row (user/page/project) above
// =====================================================================

type AnalyticsUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
};

type AnalyticsEntry = {
  id: string;
  userId: string;
  eventType: string;
  pageUrl: string | null;
  timeSpent: number | null;
  metadata: string | null;
  createdAt: string;
  user: AnalyticsUser | null;
};

type AnalyticsSummary = {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsByDay: Record<string, number>;
  uniqueUsers: number;
  totalPageViews: number;
  totalTimeSpent: number;
  avgTimePerPage: number;
  longestSession: number;
  topPages: Array<{ pageUrl: string; views: number; avgTimeSpent: number }>;
  timeByPage: Array<{ pageUrl: string; totalTime: number; views: number; avgTime: number }>;
  timeByUser: Array<{ userId: string; userName: string; totalTime: number; views: number }>;
  eventsByHour: Record<string, number>;
  topUsersByEvents: Array<{
    userId: string;
    userName: string;
    email: string | null;
    image: string | null;
    eventCount: number;
    lastActive: string | null;
  }>;
};

type AnalyticsProject = { id: string; name: string };
type AnalyticsUserOption = { id: string; name: string | null; email: string };

type AnalyticsResponse = {
  entries: AnalyticsEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  projects: AnalyticsProject[];
  users: AnalyticsUserOption[];
  pages: string[];
  summary: AnalyticsSummary;
};

// Human-readable Czech labels for common event types
const EVENT_TYPE_LABELS: Record<string, string> = {
  page_view: "Zobrazení stránky",
  add_payment: "Přidání platby",
  add_time_entry: "Přidání času",
  edit_time_entry: "Úprava času",
  edit_payment: "Úprava platby",
  delete_payment: "Smazání platby",
  add_contact: "Přidání kontaktu",
  add_note: "Přidání poznámky",
  edit_note: "Úprava poznámky",
  add_budget_item: "Přidání položky",
  edit_budget_item: "Úprava položky",
  download_data: "Stažení dat",
  login: "Přihlášení",
  logout: "Odhlášení",
  project_share: "Sdílení projektu",
};

// Map of event-type → tailwind text color (MD3 tonal palette)
const EVENT_TYPE_COLORS: Record<string, string> = {
  page_view: "bg-primary",
  add_payment: "bg-success",
  add_time_entry: "bg-info",
  edit_time_entry: "bg-info/80",
  edit_payment: "bg-warning",
  delete_payment: "bg-danger",
  add_contact: "bg-secondary",
  add_note: "bg-primary/80",
  edit_note: "bg-warning/80",
  add_budget_item: "bg-subsidy",
  edit_budget_item: "bg-subsidy/80",
  download_data: "bg-subsidy",
  login: "bg-success/80",
  logout: "bg-danger/80",
  project_share: "bg-info/80",
};

function formatTimeSpent(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (minutes < 60) return rem > 0 ? `${minutes} min ${rem} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin > 0 ? `${hours} h ${remMin} min` : `${hours} h`;
}

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

// Format a YYYY-MM-DD key as "DD.MM."
function formatDayKey(key: string): string {
  const parts = key.split("-");
  if (parts.length !== 3) return key;
  return `${parts[2]}.${parts[1]}.`;
}

// Map a page URL (here: a tab ID string) to a human-readable label
function formatPageLabel(url: string | null): string {
  if (!url) return "—";
  // Normalize: remove duplicate slashes, strip leading /
  const cleaned = url.replace(/\/+/g, "/").replace(/^\/+/, "");
  const labels: Record<string, string> = {
    dashboard: "Přehled",
    "dashboard-test": "Přehled",
    budget: "Rozpočet",
    payments: "Platby",
    time: "Čas",
    contacts: "Kontakty",
    timeline: "Časová osa",
    notes: "Poznámky",
    management: "Správa projektu",
    telemetry: "Telemetrie",
    admin: "Administrace",
  };
  return labels[cleaned] ?? cleaned;
}

// Look up the project name from the projects list (provided by API).
// Falls back to "—" if no projectId is found in metadata.
function lookupProjectName(
  metadata: string | null,
  projects: AnalyticsProject[],
): { name: string; id: string | null } {
  if (!metadata) return { name: "—", id: null };
  try {
    const parsed = JSON.parse(metadata);
    if (parsed && typeof parsed === "object" && typeof parsed.projectId === "string") {
      const found = projects.find((p) => p.id === parsed.projectId);
      return {
        name: found?.name ?? `Projekt ${parsed.projectId.slice(-8)}`,
        id: parsed.projectId,
      };
    }
    return { name: "—", id: null };
  } catch {
    return { name: "—", id: null };
  }
}

// "před X min / hod" relative time formatter (cs-CZ)
function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return "právě teď";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) {
    if (diffMin === 1) return "před minutou";
    if (diffMin < 5) return `před ${diffMin} minutami`;
    return `před ${diffMin} minutami`;
  }
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) {
    if (diffHr === 1) return "před hodinou";
    if (diffHr < 5) return `před ${diffHr} hodinami`;
    return `před ${diffHr} hodinami`;
  }
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return "včera";
  if (diffDay < 5) return `před ${diffDay} dny`;
  return `před ${diffDay} dny`;
}

export function TelemetryTab({ projectId: _projectId }: { projectId: string }) {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [userFilter, setUserFilter] = useState<string>("");
  const [pageFilter, setPageFilter] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState<string>("");

  const fetchData = useCallback(
    async (opts: {
      silent?: boolean;
      pageArg?: number;
      typeArg?: string;
      userArg?: string;
      pageUrlArg?: string;
      projectArg?: string;
    } = {}) => {
      const {
        silent = false,
        pageArg,
        typeArg,
        userArg,
        pageUrlArg,
        projectArg,
      } = opts;
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        const p = pageArg ?? page;
        const t = typeArg ?? typeFilter;
        const u = userArg ?? userFilter;
        const pg = pageUrlArg ?? pageFilter;
        const pj = projectArg ?? projectFilter;
        if (t) params.set("type", t);
        if (u) params.set("userId", u);
        if (pg) params.set("pageUrl", pg);
        if (pj) params.set("projectId", pj);
        params.set("page", String(p));
        params.set("pageSize", "20");
        const res = await fetch(`/api/analytics?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch analytics");
        const json: AnalyticsResponse = await res.json();
        setData(json);
      } catch {
        setError("Nepodařilo se načíst telemetrická data.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, typeFilter, userFilter, pageFilter, projectFilter],
  );

  // Initial fetch + refetch on filter/page change
  useEffect(() => {
    void fetchData({ silent: true });
  }, [page, typeFilter, userFilter, pageFilter, projectFilter, fetchData]);

  // Initial mount fetch (with skeleton)
  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleTypeFilterChange = (value: string) => {
    setTypeFilter(value);
    setPage(1);
  };

  const handleUserFilterChange = (value: string) => {
    // Select uses placeholder value "__all__" for "all users"
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

  const handleRefresh = () => {
    void fetchData({ silent: true });
  };

  if (loading && !data) {
    return <TelemetrySkeleton />;
  }

  if (error && !data) {
    return (
      <Card className="border-danger/30 bg-danger-soft/10">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="type-body text-danger">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full gap-1.5"
            onClick={() => void fetchData()}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Zkusit znovu
          </Button>
        </CardContent>
      </Card>
    );
  }

  const summary = data?.summary;
  // Filter out page_view events from the entries list — they are
  // high-volume and clutter the "Recent events" table. Users can still
  // see them by explicitly selecting "Zobrazení stránky" in the type filter.
  const entries = (data?.entries ?? []).filter(
    (e) => typeFilter || e.eventType !== "page_view",
  );
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const projects = data?.projects ?? [];
  const users = data?.users ?? [];
  const pages = data?.pages ?? [];

  // Sort event types by count (descending) for the bar chart
  // Filter out page_view — it's high-volume and drowns out other events
  const eventTypeRows = summary
    ? Object.entries(summary.eventsByType)
        .filter(([type]) => type !== "page_view")
        .sort((a, b) => b[1] - a[1])
    : [];
  const maxEventCount = eventTypeRows.length > 0 ? eventTypeRows[0][1] : 1;

  // Sort days ascending for the area chart
  const dayRows = summary
    ? Object.entries(summary.eventsByDay).sort((a, b) => a[0].localeCompare(b[0]))
    : [];
  const maxDayCount = dayRows.length > 0
    ? Math.max(...dayRows.map(([, n]) => n), 1)
    : 1;

  // Hourly chart data
  const hourEntries = summary
    ? Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        count: summary.eventsByHour[String(h)] ?? 0,
      }))
    : [];
  const maxHourCount = hourEntries.length > 0
    ? Math.max(...hourEntries.map((h) => h.count), 1)
    : 1;

  // Time-by-page chart data
  const timeByPageRows = summary?.timeByPage ?? [];
  const maxPageTime = timeByPageRows.length > 0
    ? Math.max(...timeByPageRows.map((p) => p.totalTime), 1)
    : 1;
  const totalPagesTime = timeByPageRows.reduce((acc, p) => acc + p.totalTime, 0);

  // Top users by events
  const topUsersRows = summary?.topUsersByEvents ?? [];

  // Available event types for the filter dropdown (from summary)
  const availableTypes = summary
    ? Object.keys(summary.eventsByType).sort()
    : [];

  return (
    <div id="telemetry-root" className="space-y-6">
      {/* ===== Header ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="type-title-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Telemetrie
          </h2>
          <p className="type-body text-on-surface-variant">
            Interní analytika uživatelských akcí.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full gap-1.5"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Obnovit
        </Button>
      </div>

      {/* ===== 1. Přehled — KPI cards ===== */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 lg:gap-4">
        <KpiCard
          id="kpi-events"
          label="Celkem událostí"
          value={summary?.totalEvents ?? 0}
          icon={<Activity className="h-4 w-4 text-primary" />}
          iconBg="bg-primary-container"
          accent="border-primary/30"
        />
        <KpiCard
          id="kpi-pageviews"
          label="Celkem zobrazení stránek"
          value={summary?.totalPageViews ?? 0}
          icon={<Eye className="h-4 w-4 text-info" />}
          iconBg="bg-info-soft"
          accent="border-info/30"
        />
        <KpiCard
          id="kpi-time"
          label="Celkem čas na stránkách"
          value={formatTimeSpent(summary?.totalTimeSpent ?? 0)}
          icon={<Timer className="h-4 w-4 text-warning" />}
          iconBg="bg-warning-soft"
          accent="border-warning/30"
        />
        <KpiCard
          id="kpi-users"
          label="Unikátní uživatelé"
          value={summary?.uniqueUsers ?? 0}
          icon={<Users className="h-4 w-4 text-success" />}
          iconBg="bg-success-soft"
          accent="border-success/30"
        />
      </div>

      {/* ===== 2. + 3. Charts row ===== */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Event types bar chart */}
        <Card id="telemetry-by-type" className="bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="type-title-lg flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Události podle typu
            </CardTitle>
            <CardDescription>
              Počet výskytů jednotlivých typů událostí
            </CardDescription>
          </CardHeader>
          <CardContent>
            {eventTypeRows.length === 0 ? (
              <p className="type-body text-on-surface-variant py-6 text-center">
                Žádná data.
              </p>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {eventTypeRows.map(([type, count]) => {
                  const pct = (count / maxEventCount) * 100;
                  const colorClass = EVENT_TYPE_COLORS[type] ?? "bg-primary";
                  const label = EVENT_TYPE_LABELS[type] ?? type;
                  return (
                    <div key={type} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="type-body font-medium truncate">
                          {label}
                        </span>
                        <span className="type-label text-on-surface-variant tabular-nums shrink-0">
                          {count}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            colorClass,
                          )}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity by day area chart */}
        <Card id="telemetry-by-day" className="bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="type-title-lg flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-info" />
              Aktivita podle dní
            </CardTitle>
            <CardDescription>Posledních 30 dní</CardDescription>
          </CardHeader>
          <CardContent>
            {dayRows.length === 0 ? (
              <p className="type-body text-on-surface-variant py-6 text-center">
                Žádná data.
              </p>
            ) : (
              <div className="flex h-48 gap-2">
                {/* Y-axis labels */}
                <div className="flex flex-col justify-between py-0 text-right type-label-sm text-on-surface-variant tabular-nums" style={{ width: "2rem" }}>
                  <span>{maxDayCount}</span>
                  <span>{Math.ceil(maxDayCount * 0.75)}</span>
                  <span>{Math.ceil(maxDayCount * 0.5)}</span>
                  <span>{Math.ceil(maxDayCount * 0.25)}</span>
                  <span>0</span>
                </div>
                {/* Grid + bars */}
                <div className="relative flex h-full flex-1 items-end gap-0.5">
                  {/* Horizontal grid lines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div key={i} className="border-t border-outline-variant/30" />
                    ))}
                  </div>
                  {dayRows.map(([day, count]) => {
                  const pct = (count / maxDayCount) * 100;
                  return (
                    <div
                      key={day}
                      className="group relative flex flex-1 h-full items-end justify-center z-10"
                      title={`${formatDayKey(day)}: ${count}`}
                    >
                      <div
                        className="w-full rounded-t-sm bg-info/70 transition-colors hover:bg-info"
                        style={{
                          height: `${pct}%`,
                          minHeight: count > 0 ? "3px" : "0",
                        }}
                      />
                      {/* Tooltip on hover */}
                      <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-surface-container-highest px-1.5 py-0.5 type-label-sm opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                        {count > 0 ? `${formatDayKey(day)}: ${count}` : ""}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between type-label-sm text-on-surface-variant">
              <span>{dayRows[0] ? formatDayKey(dayRows[0][0]) : ""}</span>
              <span>{dayRows[dayRows.length - 1] ? formatDayKey(dayRows[dayRows.length - 1][0]) : ""}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== 4. Top pages ===== */}
      <Card id="telemetry-top-pages" className="bg-card shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="type-title-lg flex items-center gap-2">
            <Eye className="h-4 w-4 text-info" />
            Nejnavštěvovanější stránky
          </CardTitle>
          <CardDescription>
            Počet zobrazení a průměrný čas strávený na každé stránce
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!summary || summary.topPages.length === 0 ? (
            <p className="type-body text-on-surface-variant py-6 text-center">
              Žádná data o zobrazeních stránek.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-outline-variant">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-outline-variant bg-surface-container-high">
                    <th className="type-overline text-on-surface-variant px-3 py-2 text-left">
                      Stránka
                    </th>
                    <th className="type-overline text-on-surface-variant px-3 py-2 text-right whitespace-nowrap">
                      Zobrazení
                    </th>
                    <th className="type-overline text-on-surface-variant px-3 py-2 text-right whitespace-nowrap">
                      Prům. čas
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.topPages.map((p) => (
                    <tr
                      key={p.pageUrl}
                      className="border-b border-outline-variant last:border-0 hover:bg-surface-container-high/60"
                    >
                      <td className="px-3 py-2">
                        <span className="type-body font-medium">
                          {formatPageLabel(p.pageUrl)}
                        </span>
                        <span className="type-label text-on-surface-variant ml-2">
                          {p.pageUrl}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right type-body tabular-nums">
                        {p.views}
                      </td>
                      <td className="px-3 py-2 text-right type-body tabular-nums">
                        {p.avgTimeSpent > 0 ? formatTimeSpent(p.avgTimeSpent) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== 5. Time overview — 3 KPI cards ===== */}
      <Card id="telemetry-time-overview" className="bg-card shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="type-title-lg flex items-center gap-2">
            <Clock className="h-4 w-4 text-warning" />
            Přehled času
          </CardTitle>
          <CardDescription>
            Souhrnné statistiky o čase stráveném v aplikaci
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TimeKpiCard
              label="Celková doba na stránkách"
              value={formatTimeSpent(summary?.totalTimeSpent ?? 0)}
              hint={`počet zobrazení: ${summary?.totalPageViews ?? 0}`}
              icon={<Clock className="h-4 w-4 text-warning" />}
              iconBg="bg-warning-soft"
              accent="border-warning/30"
            />
            <TimeKpiCard
              label="Průměrná doba na stránku"
              value={formatTimeSpent(summary?.avgTimePerPage ?? 0)}
              hint="průměr přes všechny page_view události"
              icon={<Gauge className="h-4 w-4 text-info" />}
              iconBg="bg-info-soft"
              accent="border-info/30"
            />
            <TimeKpiCard
              label="Nejdelší návštěva"
              value={formatTimeSpent(summary?.longestSession ?? 0)}
              hint="maximální timeSpent jedné session"
              icon={<Timer className="h-4 w-4 text-success" />}
              iconBg="bg-success-soft"
              accent="border-success/30"
            />
          </div>
        </CardContent>
      </Card>

      {/* ===== 6. Time on pages — horizontal bar chart ===== */}
      <Card id="telemetry-time-by-page" className="bg-card shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="type-title-lg flex items-center gap-2">
            <Clock className="h-4 w-4 text-info" />
            Doba návštěvnosti
          </CardTitle>
          <CardDescription>
            Celkový čas strávený na jednotlivých stránkách
            {totalPagesTime > 0 && (
              <span className="ml-1 text-on-surface-variant">
                · Celkem: <span className="font-medium text-on-surface">{formatTimeSpent(totalPagesTime)}</span>
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {timeByPageRows.length === 0 ? (
            <p className="type-body text-on-surface-variant py-6 text-center">
              Žádná data o čase na stránkách.
            </p>
          ) : (
            <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
              {timeByPageRows.map((p) => {
                const pct = (p.totalTime / maxPageTime) * 100;
                return (
                  <div key={p.pageUrl} className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="type-body font-medium">
                        {formatPageLabel(p.pageUrl)}
                        <span className="type-label text-on-surface-variant ml-2">
                          {p.pageUrl}
                        </span>
                      </span>
                      <span className="type-label text-on-surface-variant tabular-nums shrink-0">
                        <span className="font-medium text-on-surface">
                          {formatTimeSpent(p.totalTime)}
                        </span>
                        {" · "}
                        {p.views}× · prům. {formatTimeSpent(p.avgTime)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
                      <div
                        className="h-full rounded-full bg-info/80 transition-all"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== 7. User activity — top users by events ===== */}
      <Card id="telemetry-top-users" className="bg-card shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="type-title-lg flex items-center gap-2">
            <Users className="h-4 w-4 text-success" />
            Aktivita uživatelů
          </CardTitle>
          <CardDescription>
            Nejaktivnější uživatelé podle počtu akcí
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topUsersRows.length === 0 ? (
            <p className="type-body text-on-surface-variant py-6 text-center">
              Žádná data o aktivitě uživatelů.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-outline-variant">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-outline-variant bg-surface-container-high">
                    <th className="type-overline text-on-surface-variant px-3 py-2 text-left">
                      Uživatel
                    </th>
                    <th className="type-overline text-on-surface-variant px-3 py-2 text-right whitespace-nowrap">
                      Počet akcí
                    </th>
                    <th className="type-overline text-on-surface-variant px-3 py-2 text-right whitespace-nowrap">
                      Poslední aktivita
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topUsersRows.map((u, idx) => {
                    const initials =
                      u.userName
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((s) => s[0]?.toUpperCase() ?? "")
                        .join("") || "?";
                    const maxCount = topUsersRows[0]?.eventCount ?? 1;
                    const pct = (u.eventCount / maxCount) * 100;
                    return (
                      <tr
                        key={u.userId}
                        className="border-b border-outline-variant last:border-0 hover:bg-surface-container-high/60"
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {idx === 0 ? (
                              <span className="text-warning" title="Nejaktivnější">
                                <Crown className="h-3.5 w-3.5" />
                              </span>
                            ) : null}
                            <Avatar className="h-7 w-7 shrink-0">
                              {u.image ? (
                                <AvatarImage src={u.image} alt={u.userName} />
                              ) : null}
                              <AvatarFallback className="bg-secondary-container type-label-sm font-bold text-secondary-container-foreground">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="type-body font-medium truncate">
                                {u.userName}
                              </div>
                              {u.email && (
                                <div className="type-label text-on-surface-variant truncate">
                                  {u.email}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col items-end gap-1">
                            <span className="type-body font-semibold tabular-nums">
                              {u.eventCount}
                            </span>
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-container-high">
                              <div
                                className="h-full rounded-full bg-success/80"
                                style={{ width: `${Math.max(pct, 2)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="type-label text-on-surface-variant tabular-nums">
                            {formatRelativeTime(u.lastActive)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== 8. Hourly activity (today) — 24-bar chart ===== */}
      <Card id="telemetry-by-hour" className="bg-card shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="type-title-lg flex items-center gap-2">
            <Clock className="h-4 w-4 text-warning" />
            Aktivita dnes podle hodin
          </CardTitle>
          <CardDescription>
            Počet událostí v jednotlivých hodinách dnešního dne
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hourEntries.every((h) => h.count === 0) ? (
            <p className="type-body text-on-surface-variant py-6 text-center">
              Dnes zatím nebyla zaznamenána žádná aktivita.
            </p>
          ) : (
            <>
              <div className="flex h-40 gap-2">
                {/* Y-axis labels */}
                <div className="flex flex-col justify-between py-0 text-right type-label-sm text-on-surface-variant tabular-nums" style={{ width: "2rem" }}>
                  <span>{maxHourCount}</span>
                  <span>{Math.ceil(maxHourCount * 0.75)}</span>
                  <span>{Math.ceil(maxHourCount * 0.5)}</span>
                  <span>{Math.ceil(maxHourCount * 0.25)}</span>
                  <span>0</span>
                </div>
                {/* Grid + bars */}
                <div className="relative flex h-full flex-1 items-end gap-1">
                  {/* Horizontal grid lines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div key={i} className="border-t border-outline-variant/30" />
                    ))}
                  </div>
                  {hourEntries.map(({ hour, count }) => {
                  const pct = (count / maxHourCount) * 100;
                  return (
                    <div
                      key={hour}
                      className="group relative flex flex-1 h-full items-end justify-center z-10"
                      title={`${hour}:00 — ${count} událostí`}
                    >
                      <div
                        className={cn(
                          "w-full rounded-t-sm transition-colors",
                          count > 0
                            ? "bg-warning/80 hover:bg-warning"
                            : "bg-surface-container-high",
                        )}
                        style={{
                          height: `${pct}%`,
                          minHeight: count > 0 ? "3px" : "1px",
                        }}
                      />
                      <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-surface-container-highest px-1.5 py-0.5 type-label-sm opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                        {count > 0 ? `${hour}:00 — ${count}` : ""}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between type-label-sm text-on-surface-variant tabular-nums">
                <span>0</span>
                <span>6</span>
                <span>12</span>
                <span>18</span>
                <span>23</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ===== 9. Recent events — with filter row ===== */}
      <Card id="telemetry-recent" className="bg-card shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="type-title-lg flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Poslední události
              </CardTitle>
              <CardDescription>
                Posledních {Math.min(20, total)} z celkem {total} událostí
              </CardDescription>
            </div>
            {/* Type filter */}
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="telemetry-type-filter"
                className="type-label text-on-surface-variant"
              >
                Typ
              </label>
              <select
                id="telemetry-type-filter"
                value={typeFilter}
                onChange={(e) => handleTypeFilterChange(e.target.value)}
                className="h-8 rounded-full border border-outline-variant bg-card px-3 type-label hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Vše</option>
                {availableTypes.map((t) => (
                  <option key={t} value={t}>
                    {EVENT_TYPE_LABELS[t] ?? t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>

        {/* ===== Filter row (User / Page / Project) ===== */}
        <div className="border-t border-outline-variant bg-surface-container-low/50 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 type-label text-on-surface-variant">
              <Filter className="h-3.5 w-3.5" />
              Filtry:
            </div>
            {/* User filter */}
            <div className="flex items-center gap-1.5">
              <span className="type-label-sm text-on-surface-variant">Uživatel</span>
              <Select
                value={userFilter || "__all__"}
                onValueChange={handleUserFilterChange}
              >
                <SelectTrigger className="h-8 w-[180px] rounded-full type-label-sm">
                  <SelectValue placeholder="Všichni uživatelé" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Všichni uživatelé</SelectItem>
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
              <span className="type-label-sm text-on-surface-variant">Stránka</span>
              <Select
                value={pageFilter || "__all__"}
                onValueChange={handlePageFilterChange}
              >
                <SelectTrigger className="h-8 w-[160px] rounded-full type-label-sm">
                  <SelectValue placeholder="Všechny stránky" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Všechny stránky</SelectItem>
                  {pages.map((p) => (
                    <SelectItem key={p} value={p}>
                      {formatPageLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Project filter */}
            <div className="flex items-center gap-1.5">
              <span className="type-label-sm text-on-surface-variant">Projekt</span>
              <Select
                value={projectFilter || "__all__"}
                onValueChange={handleProjectFilterChange}
              >
                <SelectTrigger className="h-8 w-[200px] rounded-full type-label-sm">
                  <SelectValue placeholder="Všechny projekty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Všechny projekty</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Reset filters button — shown when any active */}
            {(userFilter || pageFilter || projectFilter) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-full gap-1.5 type-label-sm"
                onClick={() => {
                  setUserFilter("");
                  setPageFilter("");
                  setProjectFilter("");
                  setTypeFilter("");
                  setPage(1);
                }}
              >
                Zrušit filtry
              </Button>
            )}
          </div>
        </div>

        <CardContent>
          {entries.length === 0 ? (
            <p className="type-body text-on-surface-variant py-6 text-center">
              Žádné události pro vybraný filtr.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-outline-variant">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-outline-variant bg-surface-container-high">
                      <th className="type-overline text-on-surface-variant px-3 py-2 text-left whitespace-nowrap">
                        Datum
                      </th>
                      <th className="type-overline text-on-surface-variant px-3 py-2 text-left whitespace-nowrap">
                        Čas
                      </th>
                      <th className="type-overline text-on-surface-variant px-3 py-2 text-left">
                        Uživatel
                      </th>
                      <th className="type-overline text-on-surface-variant px-3 py-2 text-left">
                        Typ události
                      </th>
                      <th className="type-overline text-on-surface-variant px-3 py-2 text-left">
                        Stránka
                      </th>
                      <th className="type-overline text-on-surface-variant px-3 py-2 text-left">
                        Projekt
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => {
                      const { date, time } = formatEventTimestamp(entry.createdAt);
                      const userName =
                        entry.user?.name || entry.user?.email || "Neznámý";
                      const initials =
                        userName
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((s) => s[0]?.toUpperCase() ?? "")
                          .join("") || "?";
                      const project = lookupProjectName(entry.metadata, projects);
                      return (
                        <tr
                          key={entry.id}
                          className="border-b border-outline-variant last:border-0 hover:bg-surface-container-high/60"
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
                              {EVENT_TYPE_LABELS[entry.eventType] ?? entry.eventType}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <span className="type-body">
                              {formatPageLabel(entry.pageUrl)}
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
                              {project.name}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {total > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant pt-3">
                  <span className="type-label-sm text-on-surface-variant tabular-nums">
                    Zobrazeno {(page - 1) * 20 + 1}–
                    {Math.min(page * 20, total)} z {total}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full gap-1.5"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" /> Předchozí
                    </Button>
                    <span className="type-label-sm px-2 tabular-nums">
                      {page} / {totalPages}
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
                      Další <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// KpiCard — telemetry KPI display
// ============================================================
function KpiCard({
  id,
  label,
  value,
  icon,
  iconBg,
  accent,
}: {
  id?: string;
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg: string;
  accent: string;
}) {
  return (
    <Card
      id={id}
      className={cn("rounded-2xl bg-card shadow-sm", accent)}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="type-overline text-on-surface-variant">
          {label}
        </CardTitle>
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            iconBg,
          )}
        >
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="type-display tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// TimeKpiCard — secondary KPI card (time overview section)
// ============================================================
function TimeKpiCard({
  label,
  value,
  hint,
  icon,
  iconBg,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  iconBg: string;
  accent: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-surface-container-low p-4",
        accent,
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="type-overline text-on-surface-variant">{label}</span>
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            iconBg,
          )}
        >
          {icon}
        </div>
      </div>
      <div className="type-display tabular-nums">{value}</div>
      {hint && (
        <div className="mt-1 type-label-sm text-on-surface-variant">{hint}</div>
      )}
    </div>
  );
}

// ============================================================
// TelemetrySkeleton — loading state
// ============================================================
function TelemetrySkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 w-48" />
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 lg:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-32" />
      <Skeleton className="h-64" />
      <Skeleton className="h-64" />
      <Skeleton className="h-64" />
    </div>
  );
}
