"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import {
  Briefcase,
  Wallet,
  TrendingDown,
  TrendingUp,
  ArrowUpDown,
  Building2,
  Activity,
} from "lucide-react";
import { useProjects } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyStateBox } from "@/components/empty-state-box";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatCzk,
  formatCurrency,
  formatPercent,
  STATUS_COLORS,
  type StatusId,
} from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

// =====================================================================
// PortfolioTab — cross-project overview
// ---------------------------------------------------------------------
// Renders aggregated KPIs across ALL projects the user can access:
//   • 4 hero KPI cards (projects count, total plan, total actual, total remaining)
//   • Sortable comparison table (per-project plan / actual / burn / status)
//   • Bar chart comparing plan vs actual per project (Recharts)
//
// Visible in the sidebar only when the user has 2+ projects
// (filter applied in `AppSidebar`). Account-level tab — renders regardless
// of whether a project is currently selected.
//
// Data source: `useProjects()` already returns per-project `stats`
// (planTotal, actualTotal, remaining, burnRate, hoursTotal, …) computed
// via a single GROUP BY query on the budget_items table.
// =====================================================================

type SortKey = "name" | "plan" | "actual" | "burn" | "remaining" | "status";

type SortDir = "asc" | "desc";

const SORT_COLUMNS: { key: SortKey; labelKey: string }[] = [
  { key: "name", labelKey: "table.column.project" },
  { key: "plan", labelKey: "table.column.plan" },
  { key: "actual", labelKey: "table.column.actual" },
  { key: "burn", labelKey: "table.column.burn" },
  { key: "remaining", labelKey: "table.column.remaining" },
  { key: "status", labelKey: "table.column.status" },
];

export function PortfolioTab() {
  const t = useTranslations("tabs.portfolio");
  const tStatuses = useTranslations("statuses");
  const locale = useLocale() as Locale;

  const { data: projects, isLoading } = useProjects();
  const setSelectedProject = useAppStore((s) => s.setSelectedProject);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const [sortKey, setSortKey] = useState<SortKey>("plan");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  // Aggregated totals — sum across all projects the user can access.
  const totals = useMemo(() => {
    const list = projects ?? [];
    const planTotal = list.reduce((s, p) => s + (p.stats?.planTotal ?? 0), 0);
    const actualTotal = list.reduce((s, p) => s + (p.stats?.actualTotal ?? 0), 0);
    const remaining = planTotal - actualTotal;
    const hoursTotal = list.reduce((s, p) => s + (p.stats?.hoursTotal ?? 0), 0);
    const itemCount = list.reduce((s, p) => s + (p.stats?.itemCount ?? 0), 0);
    const burnRate = planTotal > 0 ? (actualTotal / planTotal) * 100 : 0;
    return {
      projectCount: list.length,
      planTotal,
      actualTotal,
      remaining,
      hoursTotal,
      itemCount,
      burnRate,
    };
  }, [projects]);

  // Sorted project rows for the comparison table.
  const sortedProjects = useMemo(() => {
    const list = projects ?? [];
    const copy = [...list];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name, locale);
          break;
        case "plan":
          cmp = (a.stats?.planTotal ?? 0) - (b.stats?.planTotal ?? 0);
          break;
        case "actual":
          cmp = (a.stats?.actualTotal ?? 0) - (b.stats?.actualTotal ?? 0);
          break;
        case "burn":
          cmp = (a.stats?.burnRate ?? 0) - (b.stats?.burnRate ?? 0);
          break;
        case "remaining":
          cmp = (a.stats?.remaining ?? 0) - (b.stats?.remaining ?? 0);
          break;
        case "status":
          cmp = (a.status ?? "").localeCompare(b.status ?? "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [projects, sortKey, sortDir, locale]);

  // Chart data — top 10 projects by plan (avoids overcrowded axis labels).
  const chartData = useMemo(() => {
    const list = projects ?? [];
    return list
      .map((p) => {
        const plan = p.stats?.planTotal ?? 0;
        const actual = p.stats?.actualTotal ?? 0;
        // Shorten long names so axis labels stay readable. We keep the
        // full name as `fullName` for tooltips.
        const name =
          p.name.length > 16 ? `${p.name.slice(0, 14)}…` : p.name;
        return { name, fullName: p.name, plan, actual };
      })
      .sort((a, b) => b.plan - a.plan)
      .slice(0, 10);
  }, [projects]);

  const handleOpenProject = (projectId: string) => {
    setSelectedProject(projectId);
    setActiveTab("dashboard");
  };

  if (isLoading) {
    return <PortfolioSkeleton />;
  }

  // Empty states — keep the page usable when there's nothing to aggregate.
  if (!projects || projects.length === 0) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <PortfolioHeader />
        <EmptyStateBox
          icon={Briefcase}
          title={t("empty.noProjects.title")}
          description={t("empty.noProjects.description")}
        />
      </div>
    );
  }

  if (projects.length === 1) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <PortfolioHeader />
        <EmptyStateBox
          icon={Briefcase}
          title={t("empty.oneProject.title")}
          description={t("empty.oneProject.description")}
        />
      </div>
    );
  }

  // Overall burn accent — drives the KPI card color.
  const burnAccent = getBurnAccent(totals.burnRate);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PortfolioHeader />

      {/* === Hero KPI cards === */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <PortfolioKpiCard
          icon={Briefcase}
          label={t("kpi.projects.label")}
          value={String(totals.projectCount)}
          subValue={t("kpi.projects.subValue", { count: totals.itemCount })}
          accent="primary"
        />
        <PortfolioKpiCard
          icon={Wallet}
          label={t("kpi.plan.label")}
          value={formatCzk(totals.planTotal, locale)}
          subValue={t("kpi.plan.subValue")}
          accent="info"
        />
        <PortfolioKpiCard
          icon={TrendingDown}
          label={t("kpi.actual.label")}
          value={formatCzk(totals.actualTotal, locale)}
          subValue={t("kpi.actual.subValue", { percent: formatPercent(totals.burnRate, locale) })}
          accent={burnAccent}
        />
        <PortfolioKpiCard
          icon={TrendingUp}
          label={t("kpi.remaining.label")}
          value={formatCzk(totals.remaining, locale)}
          subValue={t("kpi.remaining.subValue")}
          accent={totals.remaining < 0 ? "danger" : "success"}
        />
      </div>

      {/* === Comparison table === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {t("table.title")}
          </CardTitle>
          <CardDescription>{t("table.description")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-thin">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow className="sticky top-0 z-10 bg-surface-container-high">
                  {SORT_COLUMNS.map((col) => (
                    <TableHead
                      key={col.key}
                      className={cn(
                        col.key === "name" ? "text-left" : "text-right",
                        "cursor-pointer select-none whitespace-nowrap",
                      )}
                      onClick={() => toggleSort(col.key)}
                      aria-sort={
                        sortKey === col.key
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      <span className="inline-flex items-center gap-1">
                        {t(col.labelKey)}
                        <ArrowUpDown
                          className={cn(
                            "h-3 w-3",
                            sortKey === col.key
                              ? "text-primary opacity-100"
                              : "text-muted-foreground/40 opacity-60",
                          )}
                        />
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProjects.map((p) => {
                  const plan = p.stats?.planTotal ?? 0;
                  const actual = p.stats?.actualTotal ?? 0;
                  const remaining = p.stats?.remaining ?? plan - actual;
                  const burn = p.stats?.burnRate ?? 0;
                  const accent = getBurnAccent(burn);
                  const statusKey =
                    (p.status as StatusId) in STATUS_COLORS
                      ? (p.status as StatusId)
                      : "active";
                  const statusColors = STATUS_COLORS[statusKey];
                  return (
                    <TableRow
                      key={p.id}
                      className="group cursor-pointer hover:bg-muted/30 cv-row"
                      onClick={() => handleOpenProject(p.id)}
                      title={t("aria.openProject")}
                    >
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span className="truncate">{p.name}</span>
                          {p.address && (
                            <span className="type-label text-muted-foreground truncate">
                              {p.address}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatCzk(plan, locale)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatCzk(actual, locale)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 type-label font-semibold",
                            BURN_ACCENT_CLASSES[accent],
                          )}
                        >
                          {formatPercent(burn, locale)}
                        </span>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums whitespace-nowrap",
                          remaining < 0 ? "text-danger" : "text-success",
                        )}
                      >
                        {formatCzk(remaining, locale)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={cn("gap-1.5", statusColors.color)}
                        >
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full",
                              statusColors.dot,
                            )}
                          />
                          {tStatuses(statusKey)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              {/* Totals footer row */}
              <tfoot>
                <tr className="border-t bg-surface-container-low sticky bottom-0 z-10">
                  <td className="p-3 font-semibold">
                    {t("table.row.total")}
                  </td>
                  <td className="p-3 text-right tabular-nums font-semibold">
                    {formatCzk(totals.planTotal, locale)}
                  </td>
                  <td className="p-3 text-right tabular-nums font-semibold">
                    {formatCzk(totals.actualTotal, locale)}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 type-label font-semibold",
                        BURN_ACCENT_CLASSES[burnAccent],
                      )}
                    >
                      {formatPercent(totals.burnRate, locale)}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "p-3 text-right tabular-nums font-semibold",
                      totals.remaining < 0 ? "text-danger" : "text-success",
                    )}
                  >
                    {formatCzk(totals.remaining, locale)}
                  </td>
                  <td className="p-3 text-right type-label text-muted-foreground">
                    {t("table.row.projectCount", { count: totals.projectCount })}
                  </td>
                </tr>
              </tfoot>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* === Bar chart: plan vs actual per project === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            {t("chart.title")}
          </CardTitle>
          <CardDescription>{t("chart.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.every((d) => d.plan === 0 && d.actual === 0) ? (
            <EmptyStateBox
              icon={Activity}
              title={t("chart.empty")}
              className="py-10"
            />
          ) : (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 40 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) =>
                      `${(v / 1000).toFixed(0)}k`
                    }
                  />
                  <Tooltip
                    formatter={(v: number, name: string) => {
                      const label = name === "plan" ? t("chart.series.plan") : t("chart.series.actual");
                      return [formatCurrency(v, "CZK", locale), label];
                    }}
                    labelFormatter={(_label: string, payload) => {
                      const item = payload?.[0];
                      if (!item) return "";
                      return (item.payload as { fullName?: string }).fullName ?? "";
                    }}
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value: string) =>
                      value === "plan"
                        ? t("chart.series.plan")
                        : t("chart.series.actual")
                    }
                  />
                  <Bar
                    dataKey="plan"
                    name="plan"
                    fill="var(--info)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="actual"
                    name="actual"
                    fill="var(--warning)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Header ----
function PortfolioHeader() {
  const t = useTranslations("tabs.portfolio");
  return (
    <div className="space-y-1">
      <h1 className="type-display tracking-tight">{t("title")}</h1>
      <p className="type-body text-on-surface-variant">{t("subtitle")}</p>
    </div>
  );
}

// ---- KPI Card ----
type Accent = "primary" | "info" | "success" | "warning" | "danger";

const ACCENT_ICON_CLASSES: Record<Accent, string> = {
  primary: "bg-primary/10 text-primary",
  info: "bg-info-soft text-info-strong",
  success: "bg-success-soft text-success-strong",
  warning: "bg-warning-soft text-warning-strong",
  danger: "bg-danger-soft text-danger-strong",
};

function PortfolioKpiCard({
  icon: Icon,
  label,
  value,
  subValue,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subValue?: string;
  accent: Accent;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-start gap-3 p-4">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            ACCENT_ICON_CLASSES[accent],
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="type-overline text-muted-foreground">
            {label}
          </p>
          <p className="truncate type-headline tabular-nums">{value}</p>
          {subValue && (
            <p className="type-label text-muted-foreground truncate">{subValue}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Burn accent helper — same thresholds as Dashboard tab.
type BurnAccent = "success" | "warning" | "danger";

function getBurnAccent(rate: number): BurnAccent {
  if (rate > 100) return "danger";
  if (rate > 80) return "warning";
  return "success";
}

const BURN_ACCENT_CLASSES: Record<BurnAccent, string> = {
  success: "bg-success-soft text-success-strong",
  warning: "bg-warning-soft text-warning-strong",
  danger: "bg-danger-soft text-danger-strong",
};

// ---- Skeleton ----
function PortfolioSkeleton() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
