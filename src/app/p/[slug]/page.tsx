"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
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
  STATUS_LABELS,
} from "@/lib/format";
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

export default function PublicProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
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
        toast.error("Nepodařilo se načíst data projektu.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Redirect to login with a toast if the project isn't public / doesn't exist.
  useEffect(() => {
    if (!notFound) return;
    toast.error("Projekt není veřejně dostupný");
    // Slight delay so the toast can render before the redirect.
    const t = setTimeout(() => {
      router.push("/auth/login");
    }, 400);
    return () => clearTimeout(t);
  }, [notFound, router]);

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
        throw new Error(err.error || "Nepodařilo se udělit přístup");
      }
      toast.success("Přístup udělen — přesouvám do projektu");
      // Navigate to the project in the authenticated app.
      router.push(`/?project=${slug}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nepodařilo se udělit přístup");
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
        <p className="text-lg font-medium">Projekt není veřejně dostupný</p>
        <p className="text-sm text-muted-foreground">Přesměrovávám na přihlášení…</p>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { project, totals, byPhase } = data;
  const statusInfo = STATUS_LABELS[project.status] ?? STATUS_LABELS.active;
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
            <Badge variant="secondary" className={cn("gap-1.5", statusInfo.color)}>
              <span className={cn("h-2 w-2 rounded-full", statusInfo.dot)} />
              {statusInfo.label}
            </Badge>
            <Badge variant="outline" className="gap-1.5">
              <Eye className="h-3 w-3" />
              Veřejný projekt — pouze pro čtení
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
                Zažádat o přístup
              </Button>
            ) : (
              <>
                <Button asChild className="gap-1.5 rounded-full">
                  <Link href={`/auth/login?callbackUrl=/p/${project.slug}`}>
                    <LogIn className="h-4 w-4" />
                    Přihlásit se
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
                  Zažádat o přístup
                </Button>
              </>
            )}
            {isAuthenticated && (
              <Button asChild variant="outline" className="gap-1.5 rounded-full">
                <Link href={`/?project=${project.slug}`}>
                  Otevřít v aplikaci
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
            label="Čerpání rozpočtu"
            value={`${burnRate.toFixed(0)}%`}
            subValue={`${formatCzk(totals.actualTotal)} / ${formatCzk(totals.planTotal)}`}
            accent={burnRate > 100 ? "danger" : burnRate > 80 ? "warning" : "success"}
            progress={burnRate}
            completed={isFullyDone}
          />
          <PublicKpiCard
            icon={Wallet}
            label="Zbývá rozpočtu"
            value={formatCzk(totals.remaining)}
            subValue={`z ${formatCzk(totals.planTotal)}`}
            accent="primary"
          />
          <PublicKpiCard
            icon={CheckCircle2}
            label="Hotovo položek"
            value={`${totals.completedCount}/${totals.itemCount}`}
            subValue={
              totals.itemCount > 0
                ? `${((totals.completedCount / totals.itemCount) * 100).toFixed(0)}% dokončeno`
                : "Žádné položky"
            }
            accent={isFullyDone ? "success" : "info"}
            progress={totals.itemCount > 0 ? (totals.completedCount / totals.itemCount) * 100 : 0}
            completed={isFullyDone}
          />
          <PublicKpiCard
            icon={Clock}
            label="Odpracováno hodin"
            value={formatNumber(totals.hoursTotal, " h")}
            subValue={`Plán: ${formatNumber(totals.daysPlanned, " dní")}`}
            accent="time"
          />
        </div>

        {/* === Phase table (read-only) === */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Fáze projektu
            </CardTitle>
            <CardDescription>
              Přehled rozpočtu dle fáze — pouze pro čtení
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
                  {byPhase.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        Žádné fáze k zobrazení.
                      </td>
                    </tr>
                  ) : (
                    byPhase.map((p) => {
                      const burn = p.plan > 0 ? (p.actual / p.plan) * 100 : 0;
                      const burnCls = burn > 100 ? "text-danger" : burn > 80 ? "text-warning" : "text-success";
                      const allDone = p.count > 0 && p.completedCount === p.count;
                      return (
                        <tr key={p.phase} className="border-b">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={cn("h-2.5 w-2.5 rounded-full", PHASE_DOT_COLORS[p.phase] ?? "bg-muted-foreground")} />
                              <span className="font-medium">{p.phase}</span>
                              {allDone && <CheckCircle2 className="h-4 w-4 text-success" />}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {p.completedCount}/{p.count}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatCzk(p.plan)}</td>
                          <td className={cn("px-4 py-3 text-right font-semibold tabular-nums", burn > 100 && "text-danger")}>
                            {formatCzk(p.actual)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatNumber(p.hours, " h")}</td>
                          <td className={cn("px-4 py-3 text-right font-semibold tabular-nums", burnCls)}>
                            {burn.toFixed(0)}%
                          </td>
                          <td className="px-4 py-3 text-center">
                            {allDone ? (
                              <Badge variant="secondary" className="bg-success-soft text-success-strong">Hotovo</Badge>
                            ) : p.inProgress ? (
                              <Badge variant="secondary" className="bg-info-soft text-info-strong">Probíhá</Badge>
                            ) : p.startingSoon ? (
                              <Badge variant="secondary" className="bg-warning-soft text-warning-strong">Brzy</Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-muted text-muted-foreground">Čeká</Badge>
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
          Toto je zjednodušené, pouze pro čtení zobrazení veřejného projektu. Pro úpravy a
          kompletní funkce se přihlaste nebo otevřete projekt v aplikaci.
        </p>
      </main>
    </div>
  );
}

// =====================================================================
// PublicHeader — minimal top bar (logo only, no nav)
// =====================================================================
function PublicHeader() {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight">
            Stavba<span className="text-primary">.</span>
          </span>
        </Link>
        <Badge variant="outline" className="gap-1.5 text-xs">
          <Eye className="h-3 w-3" />
          Veřejný pohled
        </Badge>
      </div>
    </header>
  );
}

// =====================================================================
// PublicKpiCard — read-only KPI card (simplified HeroKpiCard)
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
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subValue?: string;
  accent: AccentColor;
  progress?: number;
  completed?: boolean;
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
        {completed && (
          <div className="mt-2 flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Vše hotovo
          </div>
        )}
      </CardContent>
    </Card>
  );
}
