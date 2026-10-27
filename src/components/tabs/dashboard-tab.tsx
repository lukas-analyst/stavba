"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useDashboard, useSpendingTrend, useProjects } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Wallet,
  TrendingDown,
  TrendingUp,
  Clock,
  AlertTriangle,
  CalendarClock,
  Package,
  Receipt,
  Timer,
  CheckCircle2,
  Activity,
  Target,
  Filter,
  Users2,
  CalendarDays,
  ListChecks,
  Coins,
} from "lucide-react";
import {
  formatCzk,
  formatCurrency,
  formatNumber,
  formatDate,
  PHASE_COLORS,
  PHASE_DOT_COLORS,
  STATUS_COLORS,
  PHASE_ORDER,
} from "@/lib/format";
import { useLocale } from "next-intl";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  Pie,
  PieChart,
  Area,
  AreaChart,
  ComposedChart,
  Line,
} from "recharts";

// =====================================================================
// DashboardTestTab — enhanced dashboard v2 with:
//   - Hero KPI section with dynamic colors (green=done, red=over, etc.)
//   - Display-only charts (no cross-filtering)
//   - "Plán" section: timeline items sorted by start date (active/next week/
//     next month/next 3 months/later/unscheduled) + second list by end date
//   - "Poslední aktivita" split into Payments + Time entries
//   - Cashflow projection section
//   - "Práce dle kontaktu" section
//   - Dynamic chart colors (red when over budget, green when all done)
//   - Fixed spending trend chart
// All MD3-compliant.
// =====================================================================

type TimelineItem = {
  id: string;
  category: string;
  subcategory: string | null;
  element: string | null;
  phase: string;
  dateFrom: string | null;
  dateTo: string | null;
  planCost: number | null;
  actualCost: number;
  planDays: number | null;
  required: boolean;
  completed: boolean;
  rejected: boolean;
  parentId: string | null;
  parentSubcategory: string | null;
};

export function DashboardTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useDashboard(projectId);
  const { data: trend } = useSpendingTrend(projectId);
  const { data: projects } = useProjects();
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setBudgetFilter = useAppStore((s) => s.setBudgetFilter);
  const t = useTranslations("tabs.dashboard");
  const tStatuses = useTranslations("statuses");
  const tPhases = useTranslations("phases");
  const locale = useLocale() as Locale;
  const projectCurrency = projects?.find((p) => p.id === projectId)?.currency ?? "CZK";

  const goToBudget = (filter: Parameters<typeof setBudgetFilter>[0]) => {
    setBudgetFilter(filter);
    setActiveTab("budget");
  };

  // === "Plán" section — compute buckets before early return ===
  const timeline = data?.timeline ?? [];
  const planItems = useMemo(() => {
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);
    const nextMonth = new Date(now);
    nextMonth.setMonth(now.getMonth() + 1);
    const next3Months = new Date(now);
    next3Months.setMonth(now.getMonth() + 3);

    const active = timeline.filter((t) => !t.rejected);

    const buckets = {
      activeNow: [] as TimelineItem[],
      nextWeek: [] as TimelineItem[],
      nextMonth: [] as TimelineItem[],
      next3Months: [] as TimelineItem[],
      later: [] as TimelineItem[],
      unscheduled: [] as TimelineItem[],
    };

    for (const item of active) {
      if (!item.dateFrom) {
        buckets.unscheduled.push(item);
        continue;
      }
      if (item.completed) continue;
      const start = new Date(item.dateFrom);
      if (start <= now) {
        buckets.activeNow.push(item);
      } else if (start <= nextWeek) {
        buckets.nextWeek.push(item);
      } else if (start <= nextMonth) {
        buckets.nextMonth.push(item);
      } else if (start <= next3Months) {
        buckets.next3Months.push(item);
      } else {
        buckets.later.push(item);
      }
    }

    const sortByDate = (a: TimelineItem, b: TimelineItem) => {
      const aDate = a.dateFrom ? new Date(a.dateFrom).getTime() : Infinity;
      const bDate = b.dateFrom ? new Date(b.dateFrom).getTime() : Infinity;
      return aDate - bDate;
    };

    buckets.activeNow.sort(sortByDate);
    buckets.nextWeek.sort(sortByDate);
    buckets.nextMonth.sort(sortByDate);
    buckets.next3Months.sort(sortByDate);
    buckets.later.sort(sortByDate);
    buckets.unscheduled.sort((a, b) =>
      (a.subcategory || a.category).localeCompare(b.subcategory || b.category),
    );

    return buckets;
  }, [timeline]);

  // === Second list: items sorted by end date ===
  const itemsByEndDate = useMemo(() => {
    return timeline
      .filter((t) => !t.rejected && !t.completed && t.dateTo)
      .sort((a, b) => {
        const aDate = a.dateTo ? new Date(a.dateTo).getTime() : Infinity;
        const bDate = b.dateTo ? new Date(b.dateTo).getTime() : Infinity;
        if (aDate === bDate) {
          return (a.subcategory || a.category).localeCompare(b.subcategory || b.category);
        }
        return aDate - bDate;
      })
      .slice(0, 15);
  }, [timeline]);

  if (isLoading || !data) {
    return <DashboardTestSkeleton />;
  }

  const { project, totals, byPhase, byCategory, byContact, alerts, recent } = data;
  const burnRate = totals.burnRate;

  // === Compute dynamic colors based on burn rate ===
  // Returns: "success" | "warning" | "danger"
  const getBurnAccent = (rate: number): AccentColor => {
    if (rate > 100) return "danger";
    if (rate > 80) return "warning";
    return "success";
  };

  const burnAccent = getBurnAccent(burnRate);

  // Pie chart data
  const pieData = byCategory
    .filter((c) => c.plan > 0 || c.actual > 0)
    .map((c) => ({
      name: c.category,
      value: c.plan,
      actual: c.actual,
    }));

  // Bar chart data: plan vs actual by phase
  const phaseData = byPhase
    .map((p) => ({
      phase: p.phase,
      plan: p.plan,
      actual: p.actual,
      completedCount: p.completedCount,
      count: p.count,
    }))
    .sort((a, b) => PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase));

  // Category bar chart data (plan vs actual)
  const categoryBarData = byCategory
    .filter((c) => c.plan > 0 || c.actual > 0)
    .map((c) => ({
      category: c.category.length > 18 ? c.category.slice(0, 16) + "…" : c.category,
      fullName: c.category,
      plan: c.plan,
      actual: c.actual,
      hours: c.hours,
      count: c.count,
    }))
    .sort((a, b) => b.plan - a.plan)
    .slice(0, 8);

  // Contact data for "Práce dle kontaktu"
  const contactData = byContact.filter((c) => c.plan > 0 || c.actual > 0 || c.count > 0);

  // Status info (label is localized via t; colors/dot stay locale-independent)
  const statusColors = STATUS_COLORS[project.status as keyof typeof STATUS_COLORS] ?? STATUS_COLORS.active;

  return (
    <div className="space-y-6">
      {/* === Hero Header === */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          <Badge variant="secondary" className={cn("gap-1.5", statusColors.color)}>
            <span className={cn("h-2 w-2 rounded-full", statusColors.dot)} />
            {tStatuses(project.status)}
          </Badge>
        </div>
        {project.description && (
          <p className="text-sm text-on-surface-variant">{project.description}</p>
        )}
        {project.address && (
          <p className="text-xs text-muted-foreground">{project.address}</p>
        )}
      </div>

      {/* === Hero KPI Cards === */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <HeroKpiCard
          icon={Wallet}
          label={t("kpi.burn.label")}
          value={`${burnRate.toFixed(0)}%`}
          subValue={t("kpi.burn.subValue", { actual: formatCurrency(totals.actualTotal, projectCurrency, locale), plan: formatCurrency(totals.planTotal, projectCurrency, locale) })}
          accent={burnAccent}
          progress={burnRate}
          completed={totals.itemCount > 0 && totals.completedCount === totals.itemCount}
        />
        <HeroKpiCard
          icon={Wallet}
          label={t("kpi.remaining.label")}
          value={formatCurrency(totals.remaining, projectCurrency, locale)}
          subValue={t("kpi.remaining.subValue", { planTotal: formatCurrency(totals.planTotal, projectCurrency, locale) })}
          accent="primary"
        />
        <HeroKpiCard
          icon={Activity}
          label={t("kpi.completedItems.label")}
          value={`${totals.completedCount}/${totals.itemCount}`}
          subValue={
            totals.itemCount > 0
              ? t("kpi.completedItems.subValue.done", { percent: ((totals.completedCount / totals.itemCount) * 100).toFixed(0) })
              : t("kpi.completedItems.subValue.empty")
          }
          accent={totals.itemCount > 0 && totals.completedCount === totals.itemCount ? "success" : "info"}
          progress={totals.itemCount > 0 ? (totals.completedCount / totals.itemCount) * 100 : 0}
          completed={totals.itemCount > 0 && totals.completedCount === totals.itemCount}
        />
        <HeroKpiCard
          icon={Clock}
          label={t("kpi.hours.label")}
          value={formatNumber(totals.hoursTotal, " h", locale)}
          subValue={t("kpi.hours.subValue", { days: totals.daysPlanned ?? 0 })}
          accent="time"
        />
      </div>

      {/* === Plán section — timeline items sorted by start date === */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: Plan by start date */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              {t("plan.byStart.title")}
            </CardTitle>
            <CardDescription>
              {t("plan.byStart.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[600px] overflow-y-auto">
            <PlanBucket
              title={t("plan.bucket.activeNow")}
              items={planItems.activeNow}
              accent="info"
              onNavigate={goToBudget}
            />
            <PlanBucket
              title={t("plan.bucket.nextWeek")}
              items={planItems.nextWeek}
              accent="warning"
              onNavigate={goToBudget}
            />
            <PlanBucket
              title={t("plan.bucket.nextMonth")}
              items={planItems.nextMonth}
              accent="success"
              onNavigate={goToBudget}
            />
            <PlanBucket
              title={t("plan.bucket.next3Months")}
              items={planItems.next3Months}
              accent="primary"
              onNavigate={goToBudget}
            />
            <PlanBucket
              title={t("plan.bucket.later")}
              items={planItems.later}
              accent="muted"
              onNavigate={goToBudget}
            />
            <PlanBucket
              title={t("plan.bucket.unscheduled")}
              items={planItems.unscheduled}
              accent="muted"
              onNavigate={goToBudget}
            />
          </CardContent>
        </Card>

        {/* Right: Plan by end date */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              {t("plan.byEnd.title")}
            </CardTitle>
            <CardDescription>
              {t("plan.byEnd.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
            {itemsByEndDate.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-success" />
                <p className="text-sm text-muted-foreground">
                  {t("plan.empty.upcoming")}
                </p>
              </div>
            ) : (
              itemsByEndDate.map((item) => {
                const endDate = item.dateTo ? new Date(item.dateTo) : null;
                const now = new Date();
                const isOverdue = endDate && endDate < now;
                const isTask = !!item.parentId;
                const name = isTask
                  ? (item.element || item.subcategory || item.category)
                  : (item.subcategory || item.category);
                return (
                  <button
                    key={item.id}
                    onClick={() => goToBudget({ type: "category", value: item.category })}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-surface-container-high",
                      isOverdue ? "border-danger/30 bg-danger/5" : "border-border bg-surface-container-low",
                    )}
                  >
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", PHASE_DOT_COLORS[item.phase] ?? "bg-muted-foreground")} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {isTask && <span className="text-muted-foreground/60">↳ </span>}
                        {name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isTask && item.parentSubcategory
                          ? `${item.parentSubcategory} · ${tPhases(item.phase)}`
                          : tPhases(item.phase)}
                        {item.planCost && ` · ${formatCurrency(item.planCost, projectCurrency, locale)}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "text-xs font-semibold tabular-nums",
                        isOverdue ? "text-danger" : "text-on-surface-variant",
                      )}>
                        {endDate ? formatDate(endDate.toISOString(), undefined, locale) : "—"}
                      </p>
                      {isOverdue && (
                        <p className="text-[10px] text-danger">{t("plan.tag.overdue")}</p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* === Cashflow Projection === */}
      <Card className={cn(
        "border-l-4",
        totals.projectedOverrun > 0 ? "border-l-danger" : "border-l-success",
      )}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            {t("cashflow.title")}
          </CardTitle>
          <CardDescription>
            {t("cashflow.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                {t("cashflow.projectedFinal")}
              </p>
              <p className={cn(
                "text-xl font-bold tabular-nums",
                totals.projectedOverrun > 0 ? "text-danger" : "text-success",
              )}>
                {formatCurrency(totals.projectedFinal, projectCurrency, locale)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                {t("cashflow.overrun")}
              </p>
              <p className={cn(
                "text-xl font-bold tabular-nums",
                totals.projectedOverrun > 0 ? "text-danger" : "text-success",
              )}>
                {totals.projectedOverrun > 0 ? "+" : ""}
                {formatCurrency(totals.projectedOverrun, projectCurrency, locale)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                {t("cashflow.percentOfPlan")}
              </p>
              <p className={cn(
                "text-xl font-bold tabular-nums",
                totals.projectedOverrun > 0 ? "text-danger" : "text-success",
              )}>
                {totals.planTotal > 0
                  ? ((totals.projectedFinal / totals.planTotal) * 100).toFixed(0)
                  : 0}{" "}
                %
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                {t("cashflow.remainingEstimate")}
              </p>
              <p className="text-xl font-bold tabular-nums">
                {formatCurrency(totals.projectedFinal - totals.actualTotal, projectCurrency, locale)}
              </p>
            </div>
          </div>
          {/* Progress bar: actual vs projected */}
          <div className="mt-4 space-y-1">
            <div className="flex justify-between text-xs text-on-surface-variant">
              <span>{t("cashflow.spent", { actual: formatCurrency(totals.actualTotal, projectCurrency, locale) })}</span>
              <span>{t("cashflow.estimate", { projected: formatCurrency(totals.projectedFinal, projectCurrency, locale) })}</span>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full",
                  totals.projectedOverrun > 0 ? "bg-danger" : "bg-success",
                )}
                style={{
                  width: `${Math.min((totals.actualTotal / Math.max(totals.projectedFinal, 1)) * 100, 100)}%`,
                }}
              />
              <div
                className={cn(
                  "h-full",
                  totals.projectedOverrun > 0 ? "bg-danger/40" : "bg-success/40",
                )}
                style={{
                  width: `${Math.min(((totals.projectedFinal - totals.actualTotal) / Math.max(totals.projectedFinal, 1)) * 100, 100)}%`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* === Charts row 1: Phase + Category === */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Phase chart — display-only */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              {t("chart.phase.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={phaseData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="phase"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={60}
                    tickFormatter={(v: string) => tPhases(v)}
                  />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: number, name: string) => {
                      const label = name === "plan" ? t("chart.series.plan") : t("chart.series.actual");
                      return [formatCurrency(v, projectCurrency, locale), label];
                    }}
                    labelFormatter={(_, payload) => {
                      const item = payload?.[0]?.payload as { phase?: string } | undefined;
                      return item?.phase ? tPhases(item.phase) : "";
                    }}
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => value === "plan" ? t("chart.series.plan") : t("chart.series.actual")} />
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
          </CardContent>
        </Card>

        {/* Category chart — display-only */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              {t("chart.category.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryBarData}
                  layout="vertical"
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    tick={{ fontSize: 10 }}
                    width={100}
                  />
                  <Tooltip
                    formatter={(v: number, name: string) => {
                      const label = name === "plan" ? t("chart.series.plan") : t("chart.series.actual");
                      return [formatCurrency(v, projectCurrency, locale), label];
                    }}
                    labelFormatter={(_, payload) => {
                      const item = payload?.[0]?.payload as { fullName?: string } | undefined;
                      return item?.fullName ?? "";
                    }}
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => value === "plan" ? t("chart.series.plan") : t("chart.series.actual")} />
                  <Bar
                    dataKey="plan"
                    name="plan"
                    fill="var(--info)"
                    radius={[0, 4, 4, 0]}
                  />
                  <Bar
                    dataKey="actual"
                    name="actual"
                    fill="var(--warning)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* === Spending Trend (fixed) === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            {t("chart.trend.title")}
          </CardTitle>
          <CardDescription>
            {t("chart.trend.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            {trend && trend.months && trend.months.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trend.months} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--warning)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--warning)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    interval={0}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="spend"
                    orientation="right"
                    tick={{ fontSize: 10, fill: "var(--warning)" }}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <YAxis
                    yAxisId="hours"
                    orientation="left"
                    tick={{ fontSize: 10, fill: "var(--time)" }}
                    tickFormatter={(v) => `${v.toFixed(0)}`}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(v: number, name: string) => {
                      if (name === "spend") return [formatCurrency(v, projectCurrency, locale), t("chart.series.spend")];
                      return [formatNumber(v, " h", locale), t("chart.series.hours")];
                    }}
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    labelStyle={{ fontSize: 11, fontWeight: 600 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => value === "spend" ? t("chart.series.spend") : t("chart.series.hours")} />
                  <Area
                    yAxisId="spend"
                    type="monotone"
                    dataKey="spend"
                    name="spend"
                    stroke="var(--warning)"
                    strokeWidth={2}
                    fill="url(#spendGradient)"
                  />
                  <Line
                    yAxisId="hours"
                    type="monotone"
                    dataKey="hours"
                    name="hours"
                    stroke="var(--time)"
                    strokeWidth={2}
                    dot={{ r: 2, fill: "var(--time)" }}
                    activeDot={{ r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t("chart.trend.empty")}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* === Práce dle kontaktu === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users2 className="h-5 w-5 text-primary" />
            {t("contacts.title")}
          </CardTitle>
          <CardDescription>
            {t("contacts.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {contactData.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Users2 className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("contacts.empty")}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {contactData.map((c) => {
                const burn = c.plan > 0 ? (c.actual / c.plan) * 100 : 0;
                const burnAccent = getBurnAccent(burn);
                return (
                  <div
                    key={c.contactId}
                    className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-surface-container-high"
                  >
                    <div className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                      ACCENT_BG[burnAccent],
                    )}>
                      <Users2 className={cn("h-5 w-5", ACCENT_TEXT[burnAccent])} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.role || t("contacts.noRole")} · {t("contacts.itemsCount", { count: c.count })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatCurrency(c.actual, projectCurrency, locale)}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {t("contacts.ofPlan", { plan: formatCurrency(c.plan, projectCurrency, locale) })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "text-sm font-bold tabular-nums",
                        ACCENT_TEXT[burnAccent],
                      )}>
                        {burn.toFixed(0)}%
                      </p>
                      {burn > 100 && (
                        <p className="text-[10px] text-danger">{t("contacts.overBudget")}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* === Phase Table (display-only) === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" />
            {t("phases.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-surface-container-low">
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">{t("phases.column.phase")}</th>
                  <th className="px-4 py-3 text-right font-medium text-on-surface-variant">{t("phases.column.items")}</th>
                  <th className="px-4 py-3 text-right font-medium text-on-surface-variant">{t("phases.column.plan")}</th>
                  <th className="px-4 py-3 text-right font-medium text-on-surface-variant">{t("phases.column.actual")}</th>
                  <th className="px-4 py-3 text-right font-medium text-on-surface-variant">{t("phases.column.hours")}</th>
                  <th className="px-4 py-3 text-right font-medium text-on-surface-variant">{t("phases.column.burn")}</th>
                  <th className="px-4 py-3 text-center font-medium text-on-surface-variant">{t("phases.column.status")}</th>
                </tr>
              </thead>
              <tbody>
                {byPhase.map((p) => {
                  const burn = p.plan > 0 ? (p.actual / p.plan) * 100 : 0;
                  const burnCls = burn > 100 ? "text-danger" : burn > 80 ? "text-warning" : "text-success";
                  const allDone = p.count > 0 && p.completedCount === p.count;
                  return (
                    <tr
                      key={p.phase}
                      className="border-b transition-colors hover:bg-surface-container-high"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn("h-2.5 w-2.5 rounded-full", PHASE_DOT_COLORS[p.phase] ?? "bg-muted-foreground")} />
                          <span className="font-medium">{tPhases(p.phase)}</span>
                          {allDone && <CheckCircle2 className="h-4 w-4 text-success" />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {p.completedCount}/{p.count}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(p.plan, projectCurrency, locale)}</td>
                      <td className={cn("px-4 py-3 text-right font-semibold tabular-nums", burn > 100 && "text-danger")}>
                        {formatCurrency(p.actual, projectCurrency, locale)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatNumber(p.hours, " h", locale)}</td>
                      <td className={cn("px-4 py-3 text-right font-semibold tabular-nums", burnCls)}>
                        {burn.toFixed(0)}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        {allDone ? (
                          <Badge variant="secondary" className="bg-success-soft text-success-strong">{t("phases.status.done")}</Badge>
                        ) : p.inProgress ? (
                          <Badge variant="secondary" className="bg-info-soft text-info-strong">{t("phases.status.inProgress")}</Badge>
                        ) : p.startingSoon ? (
                          <Badge variant="secondary" className="bg-warning-soft text-warning-strong">{t("phases.status.startingSoon")}</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-muted text-muted-foreground">{t("phases.status.waiting")}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* === Poslední aktivita — split into Payments + Time === */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Payments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-warning" />
              {t("recent.payments.title")}
            </CardTitle>
            <CardDescription>{t("recent.payments.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {recent.payments.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Receipt className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t("recent.payments.empty")}</p>
              </div>
            ) : (
              recent.payments.slice(0, 8).map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between rounded-lg bg-surface-container-low p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-warning/10">
                      <Receipt className="h-4 w-4 text-warning" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {payment.vendor || payment.description || t("recent.payments.fallback")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(payment.date, undefined, locale)}
                        {payment.budgetItem?.subcategory && ` · ${payment.budgetItem.subcategory}`}
                      </p>
                    </div>
                  </div>
                  <span className="font-semibold tabular-nums">{formatCurrency(payment.amount, projectCurrency, locale)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Time entries */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-time" />
              {t("recent.time.title")}
            </CardTitle>
            <CardDescription>{t("recent.time.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {recent.timeEntries.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Clock className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t("recent.time.empty")}</p>
              </div>
            ) : (
              recent.timeEntries.slice(0, 8).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg bg-surface-container-low p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-time/10">
                      <Clock className="h-4 w-4 text-time" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {entry.workerName || t("recent.time.fallback")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(entry.date, undefined, locale)}
                        {entry.budgetItem?.subcategory && ` · ${entry.budgetItem.subcategory}`}
                      </p>
                    </div>
                  </div>
                  <span className="font-semibold tabular-nums">{formatNumber(entry.hours, " h", locale)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =====================================================================
// HeroKpiCard — large prominent KPI card with progress bar + dynamic colors
// =====================================================================

type AccentColor = "primary" | "success" | "warning" | "danger" | "info" | "time";

const ACCENT_BG: Record<AccentColor, string> = {
  primary: "bg-primary/10",
  success: "bg-success/10",
  warning: "bg-warning/10",
  danger: "bg-danger/10",
  info: "bg-info/10",
  time: "bg-time/10",
};

const ACCENT_TEXT: Record<AccentColor, string> = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  time: "text-time",
};

const ACCENT_BAR: Record<AccentColor, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  time: "bg-time",
};

function HeroKpiCard({
  icon: Icon,
  label,
  value,
  subValue,
  accent,
  progress,
  completed,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subValue?: string;
  accent: AccentColor;
  progress?: number;
  completed?: boolean;
}) {
  const t = useTranslations("tabs.dashboard");
  return (
    <Card className={cn("relative overflow-hidden", completed && "border-success/30")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
              {label}
            </p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {subValue && (
              <p className="text-xs text-muted-foreground">{subValue}</p>
            )}
          </div>
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", ACCENT_BG[accent])}>
            <Icon className={cn("h-5 w-5", ACCENT_TEXT[accent])} />
          </div>
        </div>
        {progress !== undefined && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", ACCENT_BAR[accent])}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
        {completed && (
          <div className="mt-2 flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("kpi.completed.allDone")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// PlanBucket — a time-bucketed group of timeline items
// =====================================================================

function PlanBucket({
  title,
  items,
  accent,
  onNavigate,
}: {
  title: string;
  items: TimelineItem[];
  accent: AccentColor | "muted";
  onNavigate: (filter: Parameters<ReturnType<typeof useAppStore.getState>["setBudgetFilter"]>[0]) => void;
}) {
  const locale = useLocale() as Locale;
  if (items.length === 0) return null;

  const accentBg = accent === "muted" ? "bg-muted/50" : ACCENT_BG[accent as AccentColor];
  const accentText = accent === "muted" ? "text-muted-foreground" : ACCENT_TEXT[accent as AccentColor];

  return (
    <div className={cn("rounded-lg border p-2", accent === "muted" ? "border-border bg-muted/20" : "border-border")}>
      <div className="flex items-center gap-2 px-2 py-1">
        <span className={cn("h-2 w-2 rounded-full", accent === "muted" ? "bg-muted-foreground" : ACCENT_BAR[accent as AccentColor])} />
        <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
          {title}
        </p>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {items.length}
        </Badge>
      </div>
      <div className="mt-1 space-y-0.5">
        {items.map((item) => {
          const isTask = !!item.parentId;
          const name = isTask
            ? (item.element || item.subcategory || item.category)
            : (item.subcategory || item.category);
          return (
            <button
              key={item.id}
              onClick={() => onNavigate({ type: "category", value: item.category })}
              className="flex w-full items-center gap-2 rounded-md p-1.5 text-left text-sm transition-colors hover:bg-surface-container-high"
            >
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PHASE_DOT_COLORS[item.phase] ?? "bg-muted-foreground")} />
              <span className="flex-1 truncate">
                {isTask && <span className="text-muted-foreground/60">↳ </span>}
                <span className="font-medium">{name}</span>
                {isTask && item.parentSubcategory && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground/70">
                    ({item.parentSubcategory})
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {item.dateFrom ? formatDate(item.dateFrom, undefined, locale) : "—"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =====================================================================
// Skeleton
// =====================================================================

function DashboardTestSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-32" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}
