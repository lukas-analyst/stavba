"use client";

import { useState, useMemo } from "react";
import { useDashboard, useSpendingTrend } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Wallet,
  TrendingDown,
  TrendingUp,
  Clock,
  AlertTriangle,
  CalendarClock,
  Package,
  ListChecks,
  Receipt,
  Timer,
  ArrowRight,
  CheckCircle2,
  Activity,
  Target,
  Filter,
  X,
  Sparkles,
} from "lucide-react";
import {
  formatCzk,
  formatNumber,
  formatDate,
  PHASE_COLORS,
  PHASE_DOT_COLORS,
  STATUS_LABELS,
  PHASE_ORDER,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import {
  PhaseChart,
  CategoryChart,
  SpendingTrendChart,
} from "@/components/charts/lazy-charts";
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
} from "recharts";

// =====================================================================
// DashboardTestTab — enhanced dashboard with:
//   - Hero KPI section (large prominent cards)
//   - Interactive cross-filtering (click phase/category → filter all views)
//   - Enhanced charts (plan vs actual bar, category pie, spending trend)
//   - Phase progress table with interactive rows
//   - Recent activity feed
//   - Alerts with severity-based styling
// All MD3-compliant (semantic tokens, type-* utility classes, surface layers).
// =====================================================================

export function DashboardTestTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useDashboard(projectId);
  const { data: trend } = useSpendingTrend(projectId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setBudgetFilter = useAppStore((s) => s.setBudgetFilter);

  // === Cross-filtering state ===
  // When user clicks a phase or category, all charts/tables filter to it.
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const goToBudget = (filter: Parameters<typeof setBudgetFilter>[0]) => {
    setBudgetFilter(filter);
    setActiveTab("budget");
  };

  const togglePhase = (phase: string) => {
    setSelectedPhase((prev) => (prev === phase ? null : phase));
    setSelectedCategory(null);
  };

  const toggleCategory = (category: string) => {
    setSelectedCategory((prev) => (prev === category ? null : category));
    setSelectedPhase(null);
  };

  const clearFilters = () => {
    setSelectedPhase(null);
    setSelectedCategory(null);
  };

  if (isLoading || !data) {
    return <DashboardTestSkeleton />;
  }

  const { project, totals, byPhase, byCategory, byContact, alerts, recent } = data;
  const burnRate = totals.burnRate;
  const burnColor =
    burnRate > 100 ? "text-danger" : burnRate > 80 ? "text-warning" : "text-success";

  const totalAlerts =
    alerts.inProgress.length +
    alerts.upcoming.length +
    alerts.overdue.length +
    alerts.overBudget.length +
    alerts.unscheduled.length;

  const hasFilters = selectedPhase || selectedCategory;

  // === Filtered data (cross-filtering) ===
  const filteredByPhase = selectedPhase
    ? byPhase.filter((p) => p.phase === selectedPhase)
    : byPhase;

  const filteredByCategory = selectedCategory
    ? byCategory.filter((c) => c.category === selectedCategory)
    : byCategory;

  // Pie chart data
  const pieData = (selectedCategory
    ? filteredByCategory
    : byCategory
  )
    .filter((c) => c.plan > 0)
    .map((c) => ({ name: c.category, value: c.plan }));

  // Bar chart data: plan vs actual by phase
  const phaseData = (selectedPhase ? filteredByPhase : byPhase)
    .map((p) => ({
      phase: p.phase,
      Plán: p.plan,
      Skutečnost: p.actual,
    }))
    .sort((a, b) => {
      const order = PHASE_ORDER;
      return order.indexOf(a.phase) - order.indexOf(b.phase);
    });

  // Category chart data (for interactive bar)
  const categoryBarData = byCategory
    .filter((c) => c.plan > 0 || c.actual > 0)
    .map((c) => ({
      category: c.category.length > 18 ? c.category.slice(0, 16) + "…" : c.category,
      fullName: c.category,
      Plán: c.plan,
      Skutečnost: c.actual,
    }))
    .sort((a, b) => b.Plán - a.Plán)
    .slice(0, 8);

  // Status info
  const statusInfo = STATUS_LABELS[project.status] ?? STATUS_LABELS.active;

  return (
    <div className="space-y-6">
      {/* === Hero Header === */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          <Badge variant="secondary" className={cn("gap-1.5", statusInfo.color)}>
            <span className={cn("h-2 w-2 rounded-full", statusInfo.dot)} />
            {statusInfo.label}
          </Badge>
          {hasFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="gap-1.5 rounded-full"
            >
              <X className="h-3.5 w-3.5" />
              Zrušit filtr{selectedPhase ? `: ${selectedPhase}` : selectedCategory ? `: ${selectedCategory}` : ""}
            </Button>
          )}
        </div>
        {project.description && (
          <p className="text-sm text-on-surface-variant">{project.description}</p>
        )}
        {project.address && (
          <p className="text-xs text-muted-foreground">{project.address}</p>
        )}
      </div>

      {/* === Hero KPI Cards (large, prominent) === */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <HeroKpiCard
          icon={Wallet}
          label="Čerpání rozpočtu"
          value={`${burnRate.toFixed(0)}%`}
          subValue={`${formatCzk(totals.actualTotal)} / ${formatCzk(totals.planTotal)}`}
          accent={burnRate > 100 ? "danger" : burnRate > 80 ? "warning" : "success"}
          progress={burnRate}
        />
        <HeroKpiCard
          icon={Wallet}
          label="Zbývá rozpočtu"
          value={formatCzk(totals.remaining)}
          subValue={`z ${formatCzk(totals.planTotal)}`}
          accent="primary"
        />
        <HeroKpiCard
          icon={Activity}
          label="Hotovo položek"
          value={`${totals.completedCount}/${totals.itemCount}`}
          subValue={
            totals.itemCount > 0
              ? `${((totals.completedCount / totals.itemCount) * 100).toFixed(0)}% dokončeno`
              : "Žádné položky"
          }
          accent="info"
          progress={totals.itemCount > 0 ? (totals.completedCount / totals.itemCount) * 100 : 0}
        />
        <HeroKpiCard
          icon={Clock}
          label="Odpracováno hodin"
          value={formatNumber(totals.hoursTotal, " h")}
          subValue={`Plán: ${formatNumber(totals.daysPlanned, " dní")}`}
          accent="time"
        />
      </div>

      {/* === Charts row === */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Phase chart — interactive (click bars to filter) */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Plán vs Skutečnost dle fáze
                </CardTitle>
                <CardDescription className="mt-1">
                  Klikněte na fázi pro filtrování
                  {selectedPhase && (
                    <Badge variant="secondary" className="ml-2 gap-1">
                      {selectedPhase}
                    </Badge>
                  )}
                </CardDescription>
              </div>
            </div>
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
                  />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: number) => formatCzk(v)}
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="Plán"
                    fill="var(--info)"
                    radius={[4, 4, 0, 0]}
                    onClick={(data: { phase?: string }) => data.phase && togglePhase(data.phase)}
                    cursor="pointer"
                    opacity={selectedPhase && selectedPhase !== phaseData[0]?.phase ? 0.4 : 1}
                  />
                  <Bar
                    dataKey="Skutečnost"
                    fill="var(--warning)"
                    radius={[4, 4, 0, 0]}
                    onClick={(data: { phase?: string }) => data.phase && togglePhase(data.phase)}
                    cursor="pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Category chart — interactive (click slices to filter) */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Rozpočet dle kategorie
            </CardTitle>
            <CardDescription className="mt-1">
              Klikněte na kategorii pro filtrování
              {selectedCategory && (
                <Badge variant="secondary" className="ml-2 gap-1">
                  {selectedCategory}
                </Badge>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={90}
                    innerRadius={45}
                    dataKey="value"
                    onClick={(data: { name?: string }) => data.name && toggleCategory(data.name)}
                    cursor="pointer"
                  >
                    {pieData.map((entry, idx) => (
                      <Cell
                        key={`cell-${idx}`}
                        fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}
                        opacity={selectedCategory && selectedCategory !== entry.name ? 0.3 : 1}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => formatCzk(v)}
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value) => value.length > 20 ? value.slice(0, 18) + "…" : value}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* === Spending Trend (full width) === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Trend čerpání rozpočtu
          </CardTitle>
          <CardDescription>Vývoj plánovaných a skutečných nákladů v čase</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            {trend && trend.length > 0 ? (
              <SpendingTrendChart data={trend} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Zatím nejsou k dispozici data o trendu čerpání.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* === Interactive Phase Table === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" />
            Fáze projektu — interaktivní tabulka
          </CardTitle>
          <CardDescription>
            Klikněte na řádek pro filtrování grafů a kategorií
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-surface-container-low">
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Fáze</th>
                  <th className="px-4 py-3 text-right font-medium text-on-surface-variant">Položky</th>
                  <th className="px-4 py-3 text-right font-medium text-on-surface-variant">Plán</th>
                  <th className="px-4 py-3 text-right font-medium text-on-surface-variant">Skutečnost</th>
                  <th className="px-4 py-3 text-right font-medium text-on-surface-variant">Hodiny</th>
                  <th className="px-4 py-3 text-right font-medium text-on-surface-variant">Čerpání</th>
                  <th className="px-4 py-3 text-center font-medium text-on-surface-variant">Stav</th>
                </tr>
              </thead>
              <tbody>
                {byPhase.map((p) => {
                  const burn = p.plan > 0 ? (p.actual / p.plan) * 100 : 0;
                  const burnCls = burn > 100 ? "text-danger" : burn > 80 ? "text-warning" : "text-success";
                  const isSelected = selectedPhase === p.phase;
                  return (
                    <tr
                      key={p.phase}
                      onClick={() => togglePhase(p.phase)}
                      className={cn(
                        "cursor-pointer border-b transition-colors hover:bg-surface-container-high",
                        isSelected && "bg-primary/5",
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn("h-2.5 w-2.5 rounded-full", PHASE_DOT_COLORS[p.phase] ?? "bg-muted-foreground")} />
                          <span className="font-medium">{p.phase}</span>
                          {isSelected && <X className="h-3 w-3 text-muted-foreground" />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {p.completedCount}/{p.count}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCzk(p.plan)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCzk(p.actual)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatNumber(p.hours, " h")}</td>
                      <td className={cn("px-4 py-3 text-right font-semibold tabular-nums", burnCls)}>
                        {burn.toFixed(0)}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        {p.inProgress ? (
                          <Badge variant="secondary" className="bg-info-soft text-info-strong">Probíhá</Badge>
                        ) : p.startingSoon ? (
                          <Badge variant="secondary" className="bg-warning-soft text-warning-strong">Brzy</Badge>
                        ) : p.completedCount === p.count && p.count > 0 ? (
                          <Badge variant="secondary" className="bg-success-soft text-success-strong">Hotovo</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-muted text-muted-foreground">Čeká</Badge>
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

      {/* === Alerts + Recent Activity === */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Upozornění
              {totalAlerts > 0 && (
                <Badge variant="secondary" className="bg-warning-soft text-warning-strong">
                  {totalAlerts}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Položky vyžadující pozornost</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {totalAlerts === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-success" />
                <p className="text-sm text-muted-foreground">Vše v pořádku, žádná upozornění.</p>
              </div>
            ) : (
              <>
                {alerts.overdue.length > 0 && (
                  <AlertGroup
                    title="Po termínu"
                    items={alerts.overdue}
                    severity="danger"
                    onNavigate={goToBudget}
                  />
                )}
                {alerts.overBudget.length > 0 && (
                  <AlertGroup
                    title="Přes rozpočet"
                    items={alerts.overBudget}
                    severity="danger"
                    onNavigate={goToBudget}
                  />
                )}
                {alerts.inProgress.length > 0 && (
                  <AlertGroup
                    title="Probíhající"
                    items={alerts.inProgress}
                    severity="info"
                    onNavigate={goToBudget}
                  />
                )}
                {alerts.upcoming.length > 0 && (
                  <AlertGroup
                    title="Brzy začíná"
                    items={alerts.upcoming}
                    severity="warning"
                    onNavigate={goToBudget}
                  />
                )}
                {alerts.unscheduled.length > 0 && (
                  <AlertGroup
                    title="Neplánováno"
                    items={alerts.unscheduled}
                    severity="muted"
                    onNavigate={goToBudget}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Poslední aktivita
            </CardTitle>
            <CardDescription>Nejnovější platby a časové záznamy</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {recent.payments.length === 0 && recent.timeEntries.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Activity className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Zatím žádná aktivita.</p>
              </div>
            ) : (
              <>
                {recent.payments.slice(0, 5).map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between rounded-lg bg-surface-container-low p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-warning/10">
                        <Receipt className="h-4 w-4 text-warning" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{payment.vendor || payment.description || "Platba"}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(payment.date)}</p>
                      </div>
                    </div>
                    <span className="font-semibold tabular-nums">{formatCzk(payment.amount)}</span>
                  </div>
                ))}
                {recent.timeEntries.slice(0, 5).map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-lg bg-surface-container-low p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-time/10">
                        <Clock className="h-4 w-4 text-time" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{entry.workerName || "Práce"}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(entry.date)}</p>
                      </div>
                    </div>
                    <span className="font-semibold tabular-nums">{formatNumber(entry.hours, " h")}</span>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* === Quick actions footer === */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setActiveTab("budget")} variant="outline" className="gap-2">
          <Package className="h-4 w-4" />
          Rozpočet
        </Button>
        <Button onClick={() => setActiveTab("payments")} variant="outline" className="gap-2">
          <Receipt className="h-4 w-4" />
          Platby
        </Button>
        <Button onClick={() => setActiveTab("time")} variant="outline" className="gap-2">
          <Clock className="h-4 w-4" />
          Čas
        </Button>
        <Button onClick={() => setActiveTab("timeline")} variant="outline" className="gap-2">
          <CalendarClock className="h-4 w-4" />
          Časová osa
        </Button>
      </div>
    </div>
  );
}

// =====================================================================
// HeroKpiCard — large prominent KPI card with progress bar
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
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subValue?: string;
  accent: AccentColor;
  progress?: number;
}) {
  return (
    <Card className="relative overflow-hidden">
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
      </CardContent>
    </Card>
  );
}

// =====================================================================
// AlertGroup — grouped alerts with severity-based styling
// =====================================================================

function AlertGroup({
  title,
  items,
  severity,
  onNavigate,
}: {
  title: string;
  items: Array<{
    id: string;
    category: string;
    subcategory: string | null;
    phase: string;
    planCost: number | null;
    actualCost: number;
    dateFrom: string | null;
    dateTo: string | null;
    completed: boolean;
    rejected: boolean;
    required: boolean;
  }>;
  severity: "danger" | "warning" | "info" | "muted";
  onNavigate: (filter: Parameters<ReturnType<typeof useAppStore.getState>["setBudgetFilter"]>[0]) => void;
}) {
  const severityStyles = {
    danger: "bg-danger/5 border-danger/20",
    warning: "bg-warning/5 border-warning/20",
    info: "bg-info/5 border-info/20",
    muted: "bg-muted/30 border-border",
  };
  const severityDot = {
    danger: "bg-danger",
    warning: "bg-warning",
    info: "bg-info",
    muted: "bg-muted-foreground",
  };

  return (
    <div className={cn("rounded-lg border p-3", severityStyles[severity])}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
        {title} ({items.length})
      </p>
      <div className="space-y-1.5">
        {items.slice(0, 5).map((item) => (
          <button
            key={item.id}
            onClick={() =>
              onNavigate({ type: "category", value: item.category })
            }
            className="flex w-full items-center gap-2 rounded-md p-1.5 text-left text-sm transition-colors hover:bg-surface-container-high"
          >
            <span className={cn("h-2 w-2 shrink-0 rounded-full", severityDot[severity])} />
            <span className="flex-1 truncate">
              <span className="font-medium">{item.subcategory || item.category}</span>
              <span className="ml-1.5 text-xs text-muted-foreground">{item.phase}</span>
            </span>
            {item.planCost && item.actualCost > item.planCost && (
              <span className="text-xs font-semibold text-danger tabular-nums">
                +{formatCzk(item.actualCost - item.planCost)}
              </span>
            )}
          </button>
        ))}
        {items.length > 5 && (
          <p className="pt-1 text-xs text-muted-foreground">
            + {items.length - 5} dalších…
          </p>
        )}
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
      <Skeleton className="h-80" />
      <Skeleton className="h-64" />
    </div>
  );
}

// =====================================================================
// Category pie chart colors (MD3-aligned palette)
// =====================================================================

const CATEGORY_COLORS = [
  "var(--primary)",
  "var(--info)",
  "var(--success)",
  "var(--warning)",
  "var(--danger)",
  "var(--time)",
  "var(--secondary)",
  "var(--muted-foreground)",
];
