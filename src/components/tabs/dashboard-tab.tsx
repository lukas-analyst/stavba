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
// Charts are lazy-loaded via next/dynamic — reduces initial bundle by ~200KB.
// See src/components/charts/lazy-charts.tsx
import { PhaseChart, CategoryChart, SpendingTrendChart } from "@/components/charts/lazy-charts";

export function DashboardTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useDashboard(projectId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setBudgetFilter = useAppStore((s) => s.setBudgetFilter);

  const goToBudget = (filter: Parameters<typeof setBudgetFilter>[0]) => {
    setBudgetFilter(filter);
    setActiveTab("budget");
  };

  if (isLoading || !data) {
    return <DashboardSkeleton />;
  }

  const { totals, byPhase, byCategory, alerts, recent } = data;
  const burnRate = totals.burnRate;
  const burnColor =
    burnRate > 100 ? "text-danger" : burnRate > 80 ? "text-warning" : "text-success";

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
    <div id="dashboard-root" className="space-y-6">
      {/* KPI cards */}
      <div id="kpi-cards" className={cn("grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-6 lg:gap-4")}>
        <Card id="kpi-plan" className="rounded-2xl border-success/40 bg-gradient-to-br from-success-soft to-white shadow-sm dark:border-success/30 dark:from-success-soft dark:to-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Plán rozpočtu
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success-soft">
              <Wallet className="h-4 w-4 text-success" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold tabular-nums md:text-2xl">{formatCzk(totals.planTotal)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {totals.itemCount} položek · {totals.requiredCount} nutných
            </p>
          </CardContent>
        </Card>

        <Card id="kpi-burn" className="rounded-2xl border-warning/40 bg-gradient-to-br from-warning-soft to-white shadow-sm dark:border-warning-strong/40 dark:from-warning-soft dark:to-card hover-lift cursor-pointer" onClick={() => setActiveTab("payments")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Čerpání
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning-soft">
              <TrendingDown className="h-4 w-4 text-warning" />
            </div>
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
                    burnRate > 100 ? "bg-danger" : burnRate > 80 ? "bg-warning" : "bg-success",
                  )}
                  style={{ width: `${Math.min(burnRate, 100)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card id="kpi-remaining" className={cn("rounded-2xl shadow-sm hover-lift cursor-pointer", totals.remaining >= 0 ? "border-info/40 bg-gradient-to-br from-info-soft to-white dark:border-info-strong/40 dark:from-info-soft dark:to-card" : "border-danger/40 bg-gradient-to-br from-danger-soft to-white dark:border-danger-strong/40 dark:from-danger-soft dark:to-card")} onClick={() => goToBudget({ type: "active" })}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Zbývá v rozpočtu
            </CardTitle>
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", totals.remaining >= 0 ? "bg-info-soft" : "bg-danger-soft")}>
              {totals.remaining >= 0 ? (
                <TrendingUp className="h-4 w-4 text-info" />
              ) : (
                <TrendingDown className="h-4 w-4 text-danger" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-lg font-bold tabular-nums md:text-2xl ${totals.remaining < 0 ? "text-danger" : ""}`}>
              {formatCzk(totals.remaining)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Nejhorší scénář: {formatCzk(totals.worstCase)}
            </p>
          </CardContent>
        </Card>

        <Card id="kpi-hours" className="rounded-2xl border-time/40 bg-gradient-to-br from-time-soft to-white shadow-sm dark:border-time/30 dark:from-time-soft dark:to-card hover-lift cursor-pointer" onClick={() => setActiveTab("time")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Odpracováno
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-time-soft">
              <Clock className="h-4 w-4 text-time" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold tabular-nums md:text-2xl">{formatNumber(totals.hoursTotal, " h")}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Plán: {formatNumber(totals.daysPlanned, " dní")}
            </p>
          </CardContent>
        </Card>

        <Card id="kpi-saved" className="rounded-2xl border-success/50 bg-gradient-to-br from-success-soft to-white shadow-sm dark:border-success-strong/40 dark:from-success-soft dark:to-card hover-lift cursor-pointer" onClick={() => goToBudget({ type: "saved" })}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Ušetřeno
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success-soft">
              <PiggyBank className="h-4 w-4 text-success" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold tabular-nums md:text-2xl text-success">
              {formatCzk(totals.savedTotal)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Od dokončených položek
            </p>
          </CardContent>
        </Card>

        <Card id="kpi-completed" className="rounded-2xl border-subsidy/40 bg-gradient-to-br from-subsidy-soft to-white shadow-sm dark:border-subsidy-strong/40 dark:from-subsidy-soft dark:to-card hover-lift cursor-pointer" onClick={() => goToBudget({ type: "completion", value: "done" })}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Hotovo
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-subsidy-soft">
              <CheckCircle2 className="h-4 w-4 text-subsidy" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold tabular-nums md:text-2xl">
              {totals.completedCount} / {totals.itemCount}
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-subsidy"
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
      <div>
        <Card className="border-warning/30 bg-warning-soft/50 dark:border-warning-strong/40 dark:bg-warning-soft/60 hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-2">
              <CircleAlert className="h-5 w-5 text-warning" />
              <CardTitle className="text-base">Upozornění a akce ({totalAlerts})</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.inProgress.length > 0 && (
              <AlertGroup
                icon={<Activity className="h-4 w-4" />}
                title="Právě probíhá"
                color="text-info"
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
                color="text-info"
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
                color="text-danger"
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
                color="text-danger"
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
                color="text-warning"
                items={alerts.unscheduled.map((it) => ({
                  id: it.id,
                  primary: it.subcategory || it.category,
                  secondary: `${formatCzk(it.planCost)} · ${it.phase}`,
                }))}
              />
            )}
          </CardContent>
        </Card>
        </div>
      )}

      {/* Budget Projection */}
      {totals.completedCount > 0 && (
      <div>
        <Card className={cn(
          "border-l-4 hover-lift",
          totals.projectedOverrun > 0 ? "border-l-rose-500 border-danger/40" : "border-l-emerald-500 border-success/40",
        )}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className={cn("h-5 w-5", totals.projectedOverrun > 0 ? "text-danger" : "text-success")} />
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
                <div className="text-lg font-bold tabular-nums text-warning">
                  {formatCzk(totals.projectedFinal - totals.actualTotal)}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Odhad celkem</div>
                <div className={cn("text-lg font-bold tabular-nums", totals.projectedOverrun > 0 ? "text-danger" : "text-success")}>
                  {formatCzk(totals.projectedFinal)}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">vs. Plán</div>
                <div className={cn("text-lg font-bold tabular-nums", totals.projectedOverrun > 0 ? "text-danger" : "text-success")}>
                  {totals.projectedOverrun > 0 ? "+" : ""}
                  {formatCzk(totals.projectedOverrun)}
                </div>
              </div>
            </div>
            {/* Visual comparison bar */}
            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Plán → Odhad</span>
                <span className={cn("font-semibold", totals.projectedOverrun > 0 ? "text-danger" : "text-success")}>
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
                    className="h-full bg-warning"
                    style={{ width: `${Math.min((totals.actualTotal / Math.max(totals.projectedFinal, 1)) * 100, 100)}%` }}
                  />
                  <div
                    className={cn("h-full", totals.projectedOverrun > 0 ? "bg-danger" : "bg-success")}
                    style={{ width: `${Math.min(((totals.projectedFinal - totals.actualTotal) / Math.max(totals.projectedFinal, 1)) * 100, 100)}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm bg-warning" /> Čerpáno
                </span>
                <span className="flex items-center gap-1">
                  <span className={cn("inline-block h-2 w-2 rounded-sm", totals.projectedOverrun > 0 ? "bg-danger" : "bg-success")} /> Odhad zbytku
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-px bg-foreground/40" /> Plán (100 %)
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      )}

      {/* Phase progress cards */}
      <div>
      <Card className="hover-lift">
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
                    p.actual > p.worstCase && "border-danger/50 dark:border-danger-strong",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", dotColor)} />
                      <span className="truncate text-xs font-semibold">{p.phase}</span>
                      {p.inProgress && (
                        <Badge
                          variant="outline"
                          className="h-4 shrink-0 gap-0.5 border-info/30 bg-info-soft/50 px-1 text-[9px] text-info-strong dark:border-info-strong dark:bg-info-soft/70 dark:text-info-strong"
                          title="Fáze má rozpracované položky (skutečné náklady nebo hodiny), ale není ještě dokončena"
                        >
                          <Activity className="h-2.5 w-2.5" />
                          Probíhá
                        </Badge>
                      )}
                      {p.startingSoon && (
                        <Badge
                          variant="outline"
                          className="h-4 shrink-0 gap-0.5 border-warning/30 bg-warning-soft/50 px-1 text-[9px] text-warning-strong dark:border-warning-strong dark:bg-warning-soft/70 dark:text-warning-strong"
                          title="Fáze má položku, která startuje v příštích 7 dnech"
                        >
                          <CalendarClock className="h-2.5 w-2.5" />
                          Začíná
                        </Badge>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {p.completedCount > 0 && (
                        <Badge variant="outline" className="h-4 px-1 text-[10px] text-success-strong">
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
                          burn > 100 ? "bg-danger" : burn > 80 ? "bg-warning" : "bg-success",
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
                              timeBurn > 100 ? "bg-danger" : timeBurn > 80 ? "bg-warning" : "bg-time",
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
                            <span className="font-semibold text-danger tabular-nums">
                              +{formatCzk(p.costOverrun)}
                            </span>
                          )}
                          {p.timeOverrun > 0 && (
                            <span className="font-semibold text-warning tabular-nums">
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
      </div>

      {/* Spending trend (last 12 months) */}
      <div>
      <SpendingTrendCard projectId={projectId} />
      </div>

      {/* ===== DASH+: Cashflow projekce + Heatmapa fáze ===== */}
      <div className={cn("grid grid-cols-1 gap-4 lg:grid-cols-3")}>
        {/* Cashflow projekce */}
        <Card id="dash-cashflow" className="hover-lift lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-info" />
              Cashflow projekce
            </CardTitle>
            <CardDescription>
              Odhadovaný finální rozpočet vs. plán a nejhorší scénář
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Hlavní číslo */}
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Projekce konce
                </div>
                <div className={cn(
                  "text-2xl font-bold tabular-nums",
                  totals.projectedOverrun > 0 ? "text-danger" : "text-success",
                )}>
                  {formatCzk(totals.projectedFinal)}
                </div>
                {totals.projectedOverrun > 0 ? (
                  <div className="text-xs text-danger">
                    +{formatCzk(totals.projectedOverrun)} nad rozpočet
                  </div>
                ) : (
                  <div className="text-xs text-success">
                    V rozpočtu (+{formatCzk(-totals.projectedOverrun)} rezerva)
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Prům. přesah položky
                </div>
                <div className={cn(
                  "text-lg font-semibold tabular-nums",
                  totals.avgOverrunRatio > 1.1 ? "text-danger" : totals.avgOverrunRatio > 1 ? "text-warning" : "text-success",
                )}>
                  {((totals.avgOverrunRatio - 1) * 100).toFixed(0)}%
                </div>
                <div className="text-[10px] text-muted-foreground">
                  nad plán dle dokončených
                </div>
              </div>
            </div>

            {/* Vizualizace: plán → projekce → nejhorší scénář */}
            <div className="space-y-2">
              {[
                { label: "Plán", value: totals.planTotal, color: "bg-info", text: "text-info" },
                { label: "Projekce", value: totals.projectedFinal, color: totals.projectedOverrun > 0 ? "bg-danger" : "bg-success", text: totals.projectedOverrun > 0 ? "text-danger" : "text-success" },
                { label: "Nejhorší", value: totals.worstCase, color: "bg-warning", text: "text-warning" },
              ].map((row) => {
                const maxVal = Math.max(totals.planTotal, totals.projectedFinal, totals.worstCase, 1);
                const pct = (row.value / maxVal) * 100;
                return (
                  <div key={row.label} className="flex items-center gap-3">
                    <div className="w-16 text-xs text-muted-foreground">{row.label}</div>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
                      <div
                        className={cn("h-full rounded transition-all", row.color)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className={cn("w-24 text-right text-xs font-semibold tabular-nums", row.text)}>
                      {formatCzk(row.value)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Zbývající rezerva / překročení */}
            <div className={cn(
              "flex items-center justify-between rounded-lg border p-3",
              totals.worstCaseRemaining < 0
                ? "border-danger/30 bg-danger-soft/30"
                : "border-success/30 bg-success-soft/30",
            )}>
              <div className="flex items-center gap-2">
                <PiggyBank className={cn("h-4 w-4", totals.worstCaseRemaining < 0 ? "text-danger" : "text-success")} />
                <span className="text-xs font-medium">
                  {totals.worstCaseRemaining < 0
                    ? "Překročení při nejhorším scénáři"
                    : "Rezerva při nejhorším scénáři"}
                </span>
              </div>
              <span className={cn(
                "text-sm font-bold tabular-nums",
                totals.worstCaseRemaining < 0 ? "text-danger" : "text-success",
              )}>
                {formatCzk(Math.abs(totals.worstCaseRemaining))}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Heatmapa čerpání dle fáze */}
        <Card id="dash-phase-heatmap" className="hover-lift">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-warning" />
              Čerpání dle fáze
            </CardTitle>
            <CardDescription>
              Plán vs. skutečnost + stav dokončení
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {byPhase
                .slice()
                .sort((a, b) => {
                  const order = ["Příprava", "Demolice", "Hrubá stavba", "Zabydlování", "Do budoucna", "Neurčeno"];
                  return order.indexOf(a.phase) - order.indexOf(b.phase);
                })
                .map((p) => {
                  const burnPct = p.plan > 0 ? (p.actual / p.plan) * 100 : 0;
                  const completionPct = p.count > 0 ? (p.completedCount / p.count) * 100 : 0;
                  const intensity = Math.min(burnPct / 100, 1);
                  // Heat color: green (low burn) → yellow → red (high burn)
                  const heatColor =
                    intensity > 0.8 ? "bg-danger"
                    : intensity > 0.5 ? "bg-warning"
                    : intensity > 0.1 ? "bg-success"
                    : "bg-muted";
                  return (
                    <div key={p.phase} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{p.phase}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {p.count} položek
                        </span>
                      </div>
                      {/* Heat bar */}
                      <div className="flex items-center gap-2">
                        <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn("h-full rounded-full transition-all", heatColor)}
                            style={{ width: `${Math.min(burnPct, 100)}%` }}
                            title={`${formatCzk(p.actual)} z ${formatCzk(p.plan)} (${burnPct.toFixed(0)}%)`}
                          />
                        </div>
                        <span className={cn(
                          "w-12 text-right text-[11px] font-semibold tabular-nums",
                          burnPct > 100 ? "text-danger" : burnPct > 80 ? "text-warning" : "text-muted-foreground",
                        )}>
                          {burnPct.toFixed(0)}%
                        </span>
                      </div>
                      {/* Completion bar (thinner, below) */}
                      {p.count > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/50">
                            <div
                              className="h-full rounded-full bg-subsidy transition-all"
                              style={{ width: `${completionPct}%` }}
                              title={`${p.completedCount}/${p.count} dokončeno (${completionPct.toFixed(0)}%)`}
                            />
                          </div>
                          <span className="w-12 text-right text-[10px] text-muted-foreground tabular-nums">
                            {p.completedCount}/{p.count}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className={cn("grid grid-cols-1 gap-4 lg:grid-cols-2 ")}>
        <Card className="hover-lift">
          <CardHeader>
            <CardTitle className="text-base">Rozpočet podle fáze</CardTitle>
            <CardDescription>Plán vs skutečnost pro každou fázi projektu</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <PhaseChart data={phaseData} />
            </div>
          </CardContent>
        </Card>

        <Card className="hover-lift">
          <CardHeader>
            <CardTitle className="text-base">Rozpočet podle kategorie</CardTitle>
            <CardDescription>Podíl plánovaných nákladů na jednotlivých kategoriích</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <CategoryChart data={pieData} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick stats grid */}
      <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-3 ")}>
        <Card className="hover-lift">
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

        <Card className="hover-lift">
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
                  <span className="ml-2 font-medium text-success">
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

        <Card className="hover-lift">
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
                  <span className="ml-2 font-medium text-time">
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
      <div>
      <Card className="hover-lift">
        <CardHeader>
          <CardTitle className="text-base">Náklady podle kategorie</CardTitle>
          <CardDescription>Detailní rozpad plánu a skutečnosti</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {byCategory.map((c) => {
              const burn = c.plan > 0 ? (c.actual / c.plan) * 100 : 0;
              const color =
                burn > 100 ? "bg-danger" : burn > 80 ? "bg-warning" : "bg-success";
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
    <Card className="hover-lift">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Trend výdajů a času</CardTitle>
            <CardDescription>Posledních 12 měsíců — měsíční utrácení a odpracované hodiny</CardDescription>
          </div>
          <div className="flex gap-4 text-right">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Celkem vydáno</div>
              <div className="text-sm font-bold tabular-nums text-warning">
                {formatCzk(data.totals.totalSpend)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Celkem hodin</div>
              <div className="text-sm font-bold tabular-nums text-time">
                {formatNumber(data.totals.totalHours, " h")}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="h-56">
            <SpendingTrendChart data={data.months} />
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
                className="w-full rounded-sm bg-warning/70 transition-all hover:bg-warning"
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
