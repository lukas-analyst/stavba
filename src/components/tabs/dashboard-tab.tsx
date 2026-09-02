"use client";

import {
  useDashboard,
  useSpendingTrend,
} from "@/lib/api";
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
  Users2,
  ListChecks,
  Receipt,
  Timer,
  ArrowRight,
  CircleAlert,
  PiggyBank,
  CheckCircle2,
  Activity,
} from "lucide-react";
import { formatCzk, formatNumber, formatDate, PHASE_COLORS, PHASE_DOT_COLORS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PIE_COLORS = ["#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#64748b", "#ec4899", "#84cc16"];

export function DashboardTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useDashboard(projectId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  if (isLoading || !data) {
    return <DashboardSkeleton />;
  }

  const { totals, byPhase, byCategory, alerts, recent } = data;
  const burnRate = totals.burnRate;
  const burnColor =
    burnRate > 100 ? "text-rose-600" : burnRate > 80 ? "text-amber-600" : "text-emerald-600";

  const totalAlerts =
    alerts.inProgress.length + alerts.upcoming.length + alerts.overdue.length + alerts.overBudget.length + alerts.unscheduled.length;

  // Pie chart data
  const pieData = byCategory
    .filter((c) => c.plan > 0)
    .map((c) => ({ name: c.category, value: c.plan }));

  // Bar chart data: plan vs actual by phase
  const phaseData = byPhase
    .map((p) => ({
      phase: p.phase,
      Plán: p.plan,
      Skutečnost: p.actual,
    }))
    .sort((a, b) => {
      const order = ["Příprava", "Demolice", "Hrubá stavba", "Zabydlování", "Do budoucna", "Neurčeno"];
      return order.indexOf(a.phase) - order.indexOf(b.phase);
    });

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-6 lg:gap-4">
        <Card className="border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-900/40 dark:from-emerald-950/30 dark:to-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Plán rozpočtu
            </CardTitle>
            <Wallet className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold tabular-nums md:text-2xl">{formatCzk(totals.planTotal)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {totals.itemCount} položek · {totals.requiredCount} nutných
            </p>
          </CardContent>
        </Card>

        <Card className="border-amber-200/60 bg-gradient-to-br from-amber-50 to-white dark:border-amber-900/40 dark:from-amber-950/30 dark:to-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Čerpání
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold tabular-nums md:text-2xl">{formatCzk(totals.actualTotal)}</div>
            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className={`font-semibold ${burnColor}`}>
                  {burnRate.toFixed(1)} %
                </span>
                <span className="text-muted-foreground">
                  z {formatCzk(totals.planTotal)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    burnRate > 100 ? "bg-rose-500" : burnRate > 80 ? "bg-amber-500" : "bg-emerald-500",
                  )}
                  style={{ width: `${Math.min(burnRate, 100)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={totals.remaining >= 0 ? "border-sky-200/60 bg-gradient-to-br from-sky-50 to-white dark:border-sky-900/40 dark:from-sky-950/30 dark:to-card" : "border-rose-200/60 bg-gradient-to-br from-rose-50 to-white dark:border-rose-900/40 dark:from-rose-950/30 dark:to-card"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Zbývá v rozpočtu
            </CardTitle>
            {totals.remaining >= 0 ? (
              <TrendingUp className="h-4 w-4 text-sky-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-rose-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-lg font-bold tabular-nums md:text-2xl ${totals.remaining < 0 ? "text-rose-600" : ""}`}>
              {formatCzk(totals.remaining)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Nejhorší scénář: {formatCzk(totals.worstCase)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-violet-200/60 bg-gradient-to-br from-violet-50 to-white dark:border-violet-900/40 dark:from-violet-950/30 dark:to-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Odpracováno
            </CardTitle>
            <Clock className="h-4 w-4 text-violet-600" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold tabular-nums md:text-2xl">{formatNumber(totals.hoursTotal, " h")}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Plán: {formatNumber(totals.daysPlanned, " dní")}
            </p>
          </CardContent>
        </Card>

        <Card className="border-emerald-300/60 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-800/40 dark:from-emerald-950/30 dark:to-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Ušetřeno
            </CardTitle>
            <PiggyBank className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold tabular-nums md:text-2xl text-emerald-600">
              {formatCzk(totals.savedTotal)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Od dokončených položek
            </p>
          </CardContent>
        </Card>

        <Card className="border-teal-200/60 bg-gradient-to-br from-teal-50 to-white dark:border-teal-900/40 dark:from-teal-950/30 dark:to-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Hotovo
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-teal-600" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold tabular-nums md:text-2xl">
              {totals.completedCount} / {totals.itemCount}
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-teal-500"
                style={{
                  width: `${totals.itemCount > 0 ? (totals.completedCount / totals.itemCount) * 100 : 0}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts banner */}
      {totalAlerts > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-2">
              <CircleAlert className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-base">Upozornění a akce ({totalAlerts})</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.inProgress.length > 0 && (
              <AlertGroup
                icon={<Activity className="h-4 w-4" />}
                title="Právě probíhá"
                color="text-sky-600"
                max={8}
                items={alerts.inProgress.map((it) => {
                  const hasHours = (it.actualHours || 0) > 0;
                  const hasCost = (it.actualCost || 0) > 0;
                  const parts: string[] = [];
                  if (hasCost) parts.push(formatCzk(it.actualCost));
                  if (it.planCost) parts.push(`z ${formatCzk(it.planCost)}`);
                  if (hasHours) parts.push(`${formatNumber(it.actualHours)} h`);
                  if (it.dateTo) parts.push(`termín ${formatDate(it.dateTo)}`);
                  return {
                    id: it.id,
                    primary: it.subcategory || it.category,
                    secondary: parts.join(" · "),
                  };
                })}
              />
            )}
            {alerts.upcoming.length > 0 && (
              <AlertGroup
                icon={<CalendarClock className="h-4 w-4" />}
                title="Blížící se termíny (do 30 dní)"
                color="text-sky-600"
                items={alerts.upcoming.map((it) => ({
                  id: it.id,
                  primary: it.subcategory || it.category,
                  secondary: `Začátek ${formatDate(it.dateFrom)} · ${formatCzk(it.planCost)}`,
                }))}
              />
            )}
            {alerts.overdue.length > 0 && (
              <AlertGroup
                icon={<AlertTriangle className="h-4 w-4" />}
                title="Zpožděné položky"
                color="text-rose-600"
                items={alerts.overdue.map((it) => ({
                  id: it.id,
                  primary: it.subcategory || it.category,
                  secondary: `Termín ${formatDate(it.dateTo)} · čerpáno ${formatCzk(it.actualCost)} / ${formatCzk(it.planCost)}`,
                }))}
              />
            )}
            {alerts.overBudget.length > 0 && (
              <AlertGroup
                icon={<TrendingDown className="h-4 w-4" />}
                title="Překročen rozpočet"
                color="text-rose-600"
                items={alerts.overBudget.map((it) => ({
                  id: it.id,
                  primary: it.subcategory || it.category,
                  secondary: `${formatCzk(it.actualCost)} z ${formatCzk(it.planCost)} (+${formatCzk((it.actualCost || 0) - (it.planCost || 0))})`,
                }))}
              />
            )}
            {alerts.unscheduled.length > 0 && (
              <AlertGroup
                icon={<CalendarClock className="h-4 w-4" />}
                title="Neplánované (bez termínu)"
                color="text-amber-600"
                items={alerts.unscheduled.map((it) => ({
                  id: it.id,
                  primary: it.subcategory || it.category,
                  secondary: `${formatCzk(it.planCost)} · ${it.phase}`,
                }))}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Budget Projection */}
      {totals.completedCount > 0 && (
        <Card className={cn(
          "border-l-4",
          totals.projectedOverrun > 0 ? "border-l-rose-500 border-rose-200/60" : "border-l-emerald-500 border-emerald-200/60",
        )}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className={cn("h-5 w-5", totals.projectedOverrun > 0 ? "text-rose-600" : "text-emerald-600")} />
                <CardTitle className="text-base">Predikce konečných nákladů</CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px]">
                na základě {totals.completedCount} dokončených
              </Badge>
            </div>
            <CardDescription>
              Odhad na základě průměrného překročení dokončených položek ({(totals.avgOverrunRatio * 100).toFixed(0)} % plánu)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Dosud čerpáno</div>
                <div className="text-lg font-bold tabular-nums">{formatCzk(totals.actualTotal)}</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Odhad zbytku</div>
                <div className="text-lg font-bold tabular-nums text-amber-600">
                  {formatCzk(totals.projectedFinal - totals.actualTotal)}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Odhad celkem</div>
                <div className={cn("text-lg font-bold tabular-nums", totals.projectedOverrun > 0 ? "text-rose-600" : "text-emerald-600")}>
                  {formatCzk(totals.projectedFinal)}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">vs. Plán</div>
                <div className={cn("text-lg font-bold tabular-nums", totals.projectedOverrun > 0 ? "text-rose-600" : "text-emerald-600")}>
                  {totals.projectedOverrun > 0 ? "+" : ""}
                  {formatCzk(totals.projectedOverrun)}
                </div>
              </div>
            </div>
            {/* Visual comparison bar */}
            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Plán → Odhad</span>
                <span className={cn("font-semibold", totals.projectedOverrun > 0 ? "text-rose-600" : "text-emerald-600")}>
                  {totals.planTotal > 0 ? ((totals.projectedFinal / totals.planTotal) * 100).toFixed(0) : 0} % plánu
                </span>
              </div>
              <div className="relative h-3 overflow-hidden rounded-full bg-muted">
                {/* Plan marker (100%) */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-foreground/40"
                  style={{ left: "100%", transform: "translateX(-50%)" }}
                  title={`Plán: ${formatCzk(totals.planTotal)}`}
                />
                {/* Actual + projected bar */}
                <div className="flex h-full">
                  <div
                    className="h-full bg-amber-400"
                    style={{ width: `${Math.min((totals.actualTotal / Math.max(totals.projectedFinal, 1)) * 100, 100)}%` }}
                  />
                  <div
                    className={cn("h-full", totals.projectedOverrun > 0 ? "bg-rose-400" : "bg-emerald-400")}
                    style={{ width: `${Math.min(((totals.projectedFinal - totals.actualTotal) / Math.max(totals.projectedFinal, 1)) * 100, 100)}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm bg-amber-400" /> Čerpáno
                </span>
                <span className="flex items-center gap-1">
                  <span className={cn("inline-block h-2 w-2 rounded-sm", totals.projectedOverrun > 0 ? "bg-rose-400" : "bg-emerald-400")} /> Odhad zbytku
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-px bg-foreground/40" /> Plán (100 %)
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Phase progress cards */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Postup podle fází</CardTitle>
          <CardDescription>Rozpad plánu a čerpání pro každou fázi stavby</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {byPhase.map((p) => {
              const burn = p.plan > 0 ? (p.actual / p.plan) * 100 : 0;
              const timeBurn = p.plannedHours > 0 ? (p.hours / p.plannedHours) * 100 : 0;
              const phaseColor = PHASE_COLORS[p.phase] ?? "";
              const dotColor = PHASE_DOT_COLORS[p.phase] ?? "bg-zinc-400";
              const hasOverrun = p.costOverrun > 0 || p.timeOverrun > 0;
              return (
                <div
                  key={p.phase}
                  className={cn(
                    "rounded-lg border bg-card p-3 transition-shadow hover:shadow-sm",
                    p.actual > p.worstCase && "border-rose-300 dark:border-rose-800",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", dotColor)} />
                      <span className="truncate text-xs font-semibold">{p.phase}</span>
                      {p.inProgress && (
                        <Badge
                          variant="outline"
                          className="h-4 shrink-0 gap-0.5 border-sky-200 bg-sky-50 px-1 text-[9px] text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300"
                          title="Fáze má rozpracované položky (skutečné náklady nebo hodiny), ale není ještě dokončena"
                        >
                          <Activity className="h-2.5 w-2.5" />
                          Probíhá
                        </Badge>
                      )}
                      {p.startingSoon && (
                        <Badge
                          variant="outline"
                          className="h-4 shrink-0 gap-0.5 border-amber-200 bg-amber-50 px-1 text-[9px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
                          title="Fáze má položku, která startuje v příštích 7 dnech"
                        >
                          <CalendarClock className="h-2.5 w-2.5" />
                          Začíná
                        </Badge>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {p.completedCount > 0 && (
                        <Badge variant="outline" className="h-4 px-1 text-[10px] text-emerald-700">
                          {p.completedCount}/{p.count} ✓
                        </Badge>
                      )}
                      <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                        {p.count}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {/* Financial progress */}
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-muted-foreground">Finance</span>
                      <span className="font-medium tabular-nums">
                        {formatCzk(p.actual)}{" "}
                        <span className="text-muted-foreground">/ {formatCzk(p.plan)}</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          burn > 100 ? "bg-rose-500" : burn > 80 ? "bg-amber-500" : "bg-emerald-500",
                        )}
                        style={{ width: `${Math.min(burn, 100)}%` }}
                      />
                    </div>
                    {/* Time progress */}
                    {p.plannedHours > 0 && (
                      <>
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="text-muted-foreground">Čas</span>
                          <span className="font-medium tabular-nums">
                            {formatNumber(p.hours, " h")}{" "}
                            <span className="text-muted-foreground">/ {formatNumber(p.plannedHours, " h")}</span>
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              timeBurn > 100 ? "bg-rose-500" : timeBurn > 80 ? "bg-amber-500" : "bg-violet-500",
                            )}
                            style={{ width: `${Math.min(timeBurn, 100)}%` }}
                          />
                        </div>
                      </>
                    )}
                    {/* Overrun indicators */}
                    <div className="flex items-center justify-between pt-0.5 text-[10px]">
                      <span className="text-muted-foreground">
                        {burn.toFixed(0)}% fin
                        {p.plannedHours > 0 && ` · ${timeBurn.toFixed(0)}% čas`}
                      </span>
                      {hasOverrun && (
                        <div className="flex gap-1.5">
                          {p.costOverrun > 0 && (
                            <span className="font-semibold text-rose-600 tabular-nums">
                              +{formatCzk(p.costOverrun)}
                            </span>
                          )}
                          {p.timeOverrun > 0 && (
                            <span className="font-semibold text-amber-600 tabular-nums">
                              +{formatNumber(p.timeOverrun, " h")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Spending trend (last 12 months) */}
      <SpendingTrendCard projectId={projectId} />

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rozpočet podle fáze</CardTitle>
            <CardDescription>Plán vs skutečnost pro každou fázi projektu</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={phaseData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="phase" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
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
                  <Bar dataKey="Plán" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Skutečnost" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rozpočet podle kategorie</CardTitle>
            <CardDescription>Podíl plánovaných nákladů na jednotlivých kategoriích</CardDescription>
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
                    innerRadius={40}
                    dataKey="value"
                    label={({ name, percent }) =>
                      percent && percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""
                    }
                    labelStyle={{ fontSize: 11 }}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
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
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick stats grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Položky rozpočtu</CardTitle>
            <ListChecks className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{totals.itemCount}</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {byPhase.map((p) => (
                <Badge
                  key={p.phase}
                  variant="outline"
                  className={`text-[10px] ${PHASE_COLORS[p.phase] ?? ""}`}
                >
                  {p.phase}: {p.count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Poslední platby</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-1.5">
            {recent.payments.length === 0 ? (
              <p className="text-xs text-muted-foreground">Zatím žádné platby</p>
            ) : (
              recent.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs">
                  <span className="truncate">
                    {p.budgetItem?.subcategory || p.budgetItem?.category}
                  </span>
                  <span className="ml-2 font-medium text-emerald-600">
                    {formatCzk(p.amount)}
                  </span>
                </div>
              ))
            )}
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 h-7 w-full justify-between px-2 text-xs"
              onClick={() => setActiveTab("payments")}
            >
              Zobrazit platby <ArrowRight className="h-3 w-3" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Poslední časové záznamy</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-1.5">
            {recent.timeEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">Zatím žádné záznamy</p>
            ) : (
              recent.timeEntries.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-xs">
                  <span className="truncate">
                    {t.workerName} · {t.budgetItem?.subcategory || t.budgetItem?.category}
                  </span>
                  <span className="ml-2 font-medium text-violet-600">
                    {formatNumber(t.hours, " h")}
                  </span>
                </div>
              ))
            )}
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 h-7 w-full justify-between px-2 text-xs"
              onClick={() => setActiveTab("time")}
            >
              Zobrazit čas <ArrowRight className="h-3 w-3" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Categories breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Náklady podle kategorie</CardTitle>
          <CardDescription>Detailní rozpad plánu a skutečnosti</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {byCategory.map((c) => {
              const burn = c.plan > 0 ? (c.actual / c.plan) * 100 : 0;
              const color =
                burn > 100 ? "bg-rose-500" : burn > 80 ? "bg-amber-500" : "bg-emerald-500";
              return (
                <div key={c.category} className="grid grid-cols-12 items-center gap-3">
                  <div className="col-span-3 truncate text-sm font-medium">
                    {c.category}
                  </div>
                  <div className="col-span-6">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${color}`}
                        style={{ width: `${Math.min(burn, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="col-span-3 text-right text-xs">
                    <span className="font-medium">{formatCzk(c.actual)}</span>
                    <span className="text-muted-foreground"> / {formatCzk(c.plan)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AlertGroup({
  icon,
  title,
  color,
  items,
  max = 4,
}: {
  icon: React.ReactNode;
  title: string;
  color: string;
  items: { id: string; primary: string; secondary: string }[];
  max?: number;
}) {
  const shown = items.slice(0, max);
  const remaining = items.length - shown.length;
  return (
    <div>
      <div className={`flex items-center gap-1.5 ${color}`}>
        {icon}
        <span className="text-xs font-semibold">{title}</span>
        <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
          {items.length}
        </Badge>
      </div>
      <ul className="mt-1.5 space-y-1 pl-5">
        {shown.map((it) => (
          <li key={it.id} className="text-xs">
            <span className="font-medium">{it.primary}</span>{" "}
            <span className="text-muted-foreground">— {it.secondary}</span>
          </li>
        ))}
        {remaining > 0 && (
          <li className="text-xs text-muted-foreground">
            … a dalších {remaining}
          </li>
        )}
      </ul>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
      <Skeleton className="h-40" />
    </div>
  );
}

// ===== Spending Trend Card (last 12 months) =====
function SpendingTrendCard({ projectId }: { projectId: string }) {
  const { data, isLoading } = useSpendingTrend(projectId);

  if (isLoading || !data) {
    return <Skeleton className="h-64" />;
  }

  const hasData = data.totals.paymentCount > 0 || data.totals.timeEntryCount > 0;
  const maxSpend = Math.max(...data.months.map((m) => m.spend), 1);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Trend výdajů a času</CardTitle>
            <CardDescription>Posledních 12 měsíců — měsíční utrácení a odpracované hodiny</CardDescription>
          </div>
          <div className="flex gap-4 text-right">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Celkem vydáno</div>
              <div className="text-sm font-bold tabular-nums text-amber-600">
                {formatCzk(data.totals.totalSpend)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Celkem hodin</div>
              <div className="text-sm font-bold tabular-nums text-violet-600">
                {formatNumber(data.totals.totalHours, " h")}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.months} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="hoursGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
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
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: number, name: string) => {
                    if (name === "Výdaje") return formatCzk(v);
                    return formatNumber(v, " h");
                  }}
                  contentStyle={{
                    backgroundColor: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ fontSize: 11, fontWeight: 600 }}
                />
                <Area
                  type="monotone"
                  dataKey="spend"
                  name="Výdaje"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fill="url(#spendGradient)"
                />
                <Area
                  type="monotone"
                  dataKey="hours"
                  name="Hodiny"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  fill="url(#hoursGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-56 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <TrendingDown className="h-8 w-8 opacity-40" />
            <p>Zatím žádné platby ani časové záznamy.</p>
            <p className="text-xs">Po přidání plateb a času se zde zobrazí trend za posledních 12 měsíců.</p>
          </div>
        )}
        {/* Mini monthly bars (always visible, even with 0 data) */}
        <div className="mt-3 flex items-end gap-1 border-t pt-3" style={{ height: "40px" }}>
          {data.months.map((m, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
              <div
                className="w-full rounded-sm bg-amber-400/70 transition-all hover:bg-amber-500"
                style={{
                  height: `${(m.spend / maxSpend) * 100}%`,
                  minHeight: m.spend > 0 ? "4px" : "0",
                }}
                title={`${m.label}: ${formatCzk(m.spend)}`}
              />
              <span className="text-[8px] text-muted-foreground">{m.label[0]}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
