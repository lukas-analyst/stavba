"use client";

import { Loader2, EyeOff, Info, Github, ExternalLink, ArrowLeft, Activity } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useProjects } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { useHiddenProjectsSync } from "@/hooks/use-hidden-projects";
import { StatsSection, type CurrentUser } from "@/components/tabs/admin-tab";
import { BRAND } from "@/i18n/brand";
import {
  APP_VERSION,
  GIT_COMMIT_HASH,
  GIT_COMMIT_DATE,
  GIT_BRANCH,
  VERSION_LABEL,
} from "@/generated/version";

// =====================================================================
// /auth/settings — global user settings
// ---------------------------------------------------------------------
// Sections:
//   1. Skryté projekty — toggle per-project visibility
//   2. Statistiky mé aktivity — KPIs + bar chart + top pages
//      (reuses StatsSection from admin-tab — shows user's own
//       analytics across all projects they have access to)
//   3. O aplikaci — version, GitHub link
// =====================================================================

const GITHUB_URL = "https://github.com/lukas-hanzlik/stavba";

export default function SettingsPage() {
  const hiddenProjectIds = useAppStore((s) => s.hiddenProjectIds);
  const toggleProjectHidden = useAppStore((s) => s.toggleProjectHidden);
  useHiddenProjectsSync();

  const { data: projects, isLoading: loadingProjects } = useProjects();
  const { data: session } = useSession();
  const t = useTranslations("auth.settings");
  const tc = useTranslations("auth.common");
  const format = useFormatter();

  // Fetch current user profile for StatsSection
  const { data: profile } = useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const res = await fetch("/api/users/profile");
      if (!res.ok) return null;
      return (await res.json()) as CurrentUser;
    },
    enabled: !!session,
    staleTime: 60_000,
  });

  // Locale-aware commit date formatting — uses the active next-intl locale
  // (was previously hardcoded `cs-CZ`). `useFormatter()` picks up the
  // locale from NextIntlClientProvider automatically.
  const commitDateLabel = GIT_COMMIT_DATE
    ? format.dateTime(new Date(GIT_COMMIT_DATE), {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight">
              {BRAND.shortName}<span className="text-primary">.</span>
            </span>
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("tagline")}
          </p>
        </div>

        <div className="space-y-6">
          {/* ====== Section 1: Skryté projekty ====== */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <EyeOff className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">{t("sections.hiddenProjects")}</h2>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              {t("hiddenProjects.description")}
            </p>

            {loadingProjects ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : projects && projects.length > 0 ? (
              <ul className="space-y-1.5">
                {projects.map((p) => {
                  const isHidden = hiddenProjectIds.includes(p.id);
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 rounded-lg border bg-surface-container-low p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium">
                            {p.name}
                          </span>
                          {p.starred && (
                            <Badge
                              variant="secondary"
                              className="shrink-0 text-[10px] bg-warning-soft text-warning-strong"
                            >
                              ★
                            </Badge>
                          )}
                        </div>
                        {p.address && (
                          <p className="truncate text-xs text-muted-foreground">
                            {p.address}
                          </p>
                        )}
                      </div>
                      <Switch
                        checked={isHidden}
                        onCheckedChange={() => toggleProjectHidden(p.id)}
                        aria-label={
                          isHidden
                            ? t("hiddenProjects.aria.show", { name: p.name })
                            : t("hiddenProjects.aria.hide", { name: p.name })
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-lg border bg-surface-container-low p-3 text-sm text-muted-foreground">
                {t("hiddenProjects.empty")}
              </p>
            )}

            <p className="mt-3 text-xs text-muted-foreground">
              {t("hiddenProjects.toggleHint")}
            </p>
          </div>

          {/* ====== Section 2: Statistiky mé aktivity ====== */}
          {profile && (
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <div className="p-6 pb-0">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">{t("sections.activity")}</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("activity.description")}
                </p>
              </div>
              <div className="p-6 pt-4">
                <StatsSection currentUser={profile} />
              </div>
            </div>
          )}

          {/* ====== Section 3: O aplikaci ====== */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Info className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">{t("sections.about")}</h2>
            </div>

            <p className="mb-4 text-sm text-muted-foreground">
              {t.rich("about.body", {
                brand: (chunks) => (
                  <strong className="text-foreground">{chunks}</strong>
                ),
              })}
            </p>

            <div className="space-y-1.5 rounded-lg border bg-surface-container-low p-3 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("about.version")}</span>
                <span className="font-mono font-medium">{APP_VERSION}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("about.commit")}</span>
                <span className="font-mono font-medium">{GIT_COMMIT_HASH}</span>
              </div>
              {commitDateLabel && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("about.buildDate")}</span>
                  <span className="tabular-nums">{commitDateLabel}</span>
                </div>
              )}
              {GIT_BRANCH && GIT_BRANCH !== "unknown" && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("about.branch")}</span>
                  <span className="font-mono">{GIT_BRANCH}</span>
                </div>
              )}
              <div className="flex justify-between gap-2 border-t border-outline-variant pt-1.5 mt-1.5">
                <span className="text-muted-foreground">{t("about.label")}</span>
                <span className="font-mono text-muted-foreground">
                  {VERSION_LABEL}
                </span>
              </div>
            </div>

            <Button
              asChild
              variant="outline"
              className="mt-4 w-full gap-2"
              size="lg"
            >
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="h-4 w-4" />
                {t("about.githubLink")}
                <ExternalLink className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
              </a>
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex flex-col items-center gap-3">
          <div className="flex w-full gap-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="flex-1 gap-2 text-muted-foreground"
            >
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
                {tc("backToHome")}
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="flex-1 gap-2 text-muted-foreground"
            >
              <Link href="/auth/profile">{t("accountProfileLink")}</Link>
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {tc("copyright", { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>
    </div>
  );
}
