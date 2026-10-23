"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Wallet,
  Clock,
  CheckCircle2,
  Loader2,
  Lock,
  LogIn,
  ArrowRight,
  Eye,
  AlertTriangle,
} from "lucide-react";
import {
  formatCzk,
  formatNumber,
  PHASE_DOT_COLORS,
  STATUS_COLORS,
  normalizePhase,
  type PhaseId,
  type StatusId,
} from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { BRAND } from "@/i18n/brand";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// =====================================================================
// PublicProjectPage — read-only dashboard for a public project
// ---------------------------------------------------------------------
// Reachable at `/p/[slug]` without authentication (middleware lets
// `/p/*` through). The page fetches `/api/projects/[slug]/public`,
// which returns a SAFE subset of project data (no PII — no contacts,
// notes, audit log, vendor names, worker names, etc.).
//
// If the project isn't public (or doesn't exist), the API returns 404
// and we redirect to `/auth/login` with a toast explaining why.
//
// Authenticated visitors see a "Zažádat o přístup" button — clicking
// it creates a ProjectMember row with viewer role via
// `/api/projects/[slug]/request-access` so the project shows up in
// their sidebar.
//
// i18n: the `/p/[slug]/layout.tsx` wraps children in
// `<NextIntlClientProvider>` (via `PublicProviders`), so `useTranslations`
// works in this client component. Shared namespaces reused:
//   - `phases.*`        — phase labels (via tPhases)
//   - `statuses.*`      — status labels (via tStatuses)
//   - `auth.common.*`   — sign-in link label
// Page-specific text lives under `public.project.*`.
// =====================================================================

type PublicProject = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  description: string | null;
  status: string;
  currency: string;
  totalBudget: number;
  startDate: string | null;
  endDate: string | null;
};

type PublicTotals = {
  planTotal: number;
  actualTotal: number;
  remaining: number;
  burnRate: number;
  hoursTotal: number;
  daysPlanned: number;
  itemCount: number;
  requiredCount: number;
  completedCount: number;
};

type PublicPhase = {
  phase: string;
  plan: number;
  actual: number;
  hours: number;
  plannedHours: number;
  count: number;
  completedCount: number;
  inProgress: boolean;
  startingSoon: boolean;
};

type PublicResponse = {
  project: PublicProject;
  totals: PublicTotals;
  byPhase: PublicPhase[];
};

// Known status IDs — values stored as English IDs in the DB.
const KNOWN_STATUSES: readonly StatusId[] = ["active", "planning", "completed", "paused"];

function isKnownStatus(s: string): s is StatusId {
  return (KNOWN_STATUSES as readonly string[]).includes(s);
}

export default function PublicProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const t = useTranslations("public.project");
  const tPhases = useTranslations("phases");
  const tStatuses = useTranslations("statuses");
  const tAuthCommon = useTranslations("auth.common");
  const locale = useLocale() as Locale;
  const [slug, setSlug] = useState<string | null>(null);
  const [data, setData] = useState<PublicResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [requesting, setRequesting] = useState(false);

  // Unwrap params promise (Next.js 15+)
  useEffect(() => {
    params.then((p) => setSlug(p.slug));
  }, [params]);

  // Fetch public project data once we have the slug.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/projects/${slug}/public`)
      .then(async (res) => {
        if (cancelled) return null;
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json() as Promise<PublicResponse>;
      })
      .then((json) => {
        if (cancelled || !json) return;
        setData(json);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error(t("toasts.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, t]);

  // Redirect to login with a toast if the project isn't public / doesn't exist.
  useEffect(() => {
    if (!notFound) return;
    toast.error(t("toasts.notPublic"));
    // Slight delay so the toast can render before the redirect.
    const redirectTimer = setTimeout(() => {
      router.push("/auth/login");
    }, 400);
    return () => clearTimeout(redirectTimer);
  }, [notFound, router, t]);

  const handleRequestAccess = async () => {
    if (!slug) return;
    if (sessionStatus !== "authenticated") {
      router.push(`/auth/login?callbackUrl=/p/${slug}`);
      return;
    }
    setRequesting(true);
    try {
      const res = await fetch(`/api/projects/${slug}/request-access`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("toasts.accessFailed"));
      }
      toast.success(t("toasts.accessGranted"));
      // Navigate to the project in the authenticated app.
      router.push(`/?project=${slug}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toasts.accessFailed"));
    } finally {
      setRequesting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <Skeleton className="mb-6 h-20" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="mt-6 h-72" />
        </main>
      </div>
    );
  }

  if (notFound || !data) {
    // The redirect to /auth/login is fired in the effect above; render
    // a minimal placeholder while the navigation happens.
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <AlertTriangle className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium">{t("notFound.title")}</p>
        <p className="text-sm text-muted-foreground">{t("notFound.redirecting")}</p>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { project, totals, byPhase } = data;
  const statusId: StatusId = isKnownStatus(project.status) ? project.status : "active";
  const statusColors = STATUS_COLORS[statusId];
  const burnRate = totals.burnRate;
  const isFullyDone = totals.itemCount > 0 && totals.completedCount === totals.itemCount;
  const isAuthenticated = sessionStatus === "authenticated";

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {/* === Hero header === */}
        <div className="space-y-3 pb-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
            <Badge variant="secondary" className={cn("gap-1.5", statusColors.color)}>
              <span className={cn("h-2 w-2 rounded-full", statusColors.dot)} />
              {tStatuses(statusId)}
            </Badge>
            <Badge variant="outline" className="gap-1.5">
              <Eye className="h-3 w-3" />
              {t("header.publicBadge")}
            </Badge>
          </div>
          {project.description && (
            <p className="text-sm text-on-surface-variant">{project.description}</p>
          )}
          {project.address && (
            <p className="text-xs text-muted-foreground">{project.address}</p>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {isAuthenticated ? (
              <Button
                onClick={handleRequestAccess}
                disabled={requesting}
                className="gap-1.5 rounded-full"
              >
                {requesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                {t("actions.requestAccess")}
              </Button>
            ) : (
              <>
                <Button asChild className="gap-1.5 rounded-full">
                  <Link href={`/auth/login?callbackUrl=/p/${project.slug}`}>
                    <LogIn className="h-4 w-4" />
                    {tAuthCommon("signInLink")}
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRequestAccess}
                  disabled={requesting}
                  className="gap-1.5 rounded-full"
                >
                  {requesting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  {t("actions.requestAccess")}
                </Button>
              </>
            )}
            {isAuthenticated && (
              <Button asChild variant="outline" className="gap-1.5 rounded-full">
                <Link href={`/?project=${project.slug}`}>
                  {t("actions.openInApp")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* === KPI cards (read-only) === */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <PublicKpiCard
            icon={Wallet}
            label={t("kpi.burnRate")}
            value={`${burnRate.toFixed(0)}%`}
            subValue={`${formatCzk(totals.actualTotal, locale)} / ${formatCzk(totals.planTotal, locale)}`}
            accent={burnRate > 100 ? "danger" : burnRate > 80 ? "warning" : "success"}
            progress={burnRate}
            completed={isFullyDone}
            completedLabel={t("kpi.allCompleted")}
          />
          <PublicKpiCard
            icon={Wallet}
            label={t("kpi.remaining")}
            value={formatCzk(totals.remaining, locale)}
            subValue={t("kpi.remainingSub", { total: formatCzk(totals.planTotal, locale) })}
            accent="primary"
          />
          <PublicKpiCard
            icon={CheckCircle2}
            label={t("kpi.itemsCompleted")}
            value={`${totals.completedCount}/${totals.itemCount}`}
            subValue={
              totals.itemCount > 0
                ? t("kpi.completedPercent", { percent: ((totals.completedCount / totals.itemCount) * 100).toFixed(0) })
                : t("kpi.noItems")
            }
            accent={isFullyDone ? "success" : "info"}
            progress={totals.itemCount > 0 ? (totals.completedCount / totals.itemCount) * 100 : 0}
            completed={isFullyDone}
            completedLabel={t("kpi.allCompleted")}
          />
          <PublicKpiCard
            icon={Clock}
            label={t("kpi.hoursLogged")}
            value={formatNumber(totals.hoursTotal, " h", locale)}
            subValue={t("kpi.plannedHours", { hours: formatNumber(totals.daysPlanned, undefined, locale) })}
            accent="time"
          />
        </div>

        {/* === Phase table (read-only) === */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t("phases.title")}
            </CardTitle>
            <CardDescription>
              {t("phases.description")}
            </CardDescription>
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
                  {byPhase.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        {t("phases.empty")}
                      </td>
                    </tr>
                  ) : (
                    byPhase.map((p) => {
                      const burn = p.plan > 0 ? (p.actual / p.plan) * 100 : 0;
                      const burnCls = burn > 100 ? "text-danger" : burn > 80 ? "text-warning" : "text-success";
                      const allDone = p.count > 0 && p.completedCount === p.count;
                      const phaseId: PhaseId = normalizePhase(p.phase);
                      return (
                        <tr key={p.phase} className="border-b">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={cn("h-2.5 w-2.5 rounded-full", PHASE_DOT_COLORS[phaseId] ?? "bg-muted-foreground")} />
                              <span className="font-medium">{tPhases(phaseId)}</span>
                              {allDone && <CheckCircle2 className="h-4 w-4 text-success" />}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {p.completedCount}/{p.count}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatCzk(p.plan, locale)}</td>
                          <td className={cn("px-4 py-3 text-right font-semibold tabular-nums", burn > 100 && "text-danger")}>
                            {formatCzk(p.actual, locale)}
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
                              <Badge variant="secondary" className="bg-warning-soft text-warning-strong">{t("phases.status.soon")}</Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-muted text-muted-foreground">{t("phases.status.waiting")}</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Footer note */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t("footer")}
        </p>
      </main>
    </div>
  );
}

// =====================================================================
// PublicHeader — minimal top bar (logo only, no nav)
// =====================================================================
function PublicHeader() {
  const t = useTranslations("public.project");
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight">
            {BRAND.shortName}<span className="text-primary">.</span>
          </span>
        </Link>
        <Badge variant="outline" className="gap-1.5 text-xs">
          <Eye className="h-3 w-3" />
          {t("header.publicView")}
        </Badge>
      </div>
    </header>
  );
}

// =====================================================================
// PublicKpiCard — read-only KPI card (simplified HeroKpiCard)
// ---------------------------------------------------------------------
// Presentational, prop-driven (no `useTranslations` hook here).
// The caller localizes `label`, `subValue`, and `completedLabel`.
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

function PublicKpiCard({
  icon: Icon,
  label,
  value,
  subValue,
  accent,
  progress,
  completed,
  completedLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subValue?: string;
  accent: AccentColor;
  progress?: number;
  completed?: boolean;
  completedLabel?: string;
}) {
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
        {completed && completedLabel && (
          <div className="mt-2 flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {completedLabel}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
