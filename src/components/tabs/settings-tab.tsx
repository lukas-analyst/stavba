"use client";

import { Loader2, EyeOff, Info, Github, ExternalLink, Activity } from "lucide-react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { useHiddenProjectsSync } from "@/hooks/use-hidden-projects";
import { StatsSection, type CurrentUser } from "@/components/tabs/admin-tab";
import {
  APP_VERSION,
  GIT_COMMIT_HASH,
  GIT_COMMIT_DATE,
  GIT_BRANCH,
  VERSION_LABEL,
} from "@/generated/version";

// =====================================================================
// SettingsTab — global user settings (in-app tab, not standalone page)
// ---------------------------------------------------------------------
// Sections:
//   1. Skryté projekty — toggle per-project visibility
//   2. Statistiky mé aktivity — KPIs + bar chart + top pages
//   3. O aplikaci — version, GitHub link
// =====================================================================

const GITHUB_URL = "https://github.com/lukas-hanzlik/stavba";

export function SettingsTab() {
  const t = useTranslations("auth.settings");
  const format = useFormatter();
  const hiddenProjectIds = useAppStore((s) => s.hiddenProjectIds);
  const toggleProjectHidden = useAppStore((s) => s.toggleProjectHidden);
  useHiddenProjectsSync();

  const { data: projects, isLoading: loadingProjects } = useProjects();
  const { data: session } = useSession();

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
  // via `useFormatter()` (was previously hardcoded `cs-CZ`).
  const commitDateLabel = GIT_COMMIT_DATE
    ? format.dateTime(new Date(GIT_COMMIT_DATE), {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ====== Section 1: Skryté projekty ====== */}
      <Card className="bg-surface-container-low shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <EyeOff className="h-5 w-5 text-muted-foreground" />
            {t("sections.hiddenProjects")}
          </CardTitle>
          <CardDescription>
            {t("hiddenProjects.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                    className="flex items-center gap-3 rounded-lg border bg-card p-3"
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
            <p className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
              {t("hiddenProjects.empty")}
            </p>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            {t("hiddenProjects.toggleHint")}
          </p>
        </CardContent>
      </Card>

      {/* ====== Section 2: Statistiky mé aktivity ====== */}
      {profile ? (
        <Card className="bg-surface-container-low shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Activity className="h-5 w-5 text-primary" />
              {t("sections.activity")}
            </CardTitle>
            <CardDescription>
              {t("activity.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StatsSection currentUser={profile} />
          </CardContent>
        </Card>
      ) : (
        <Skeleton className="h-64" />
      )}

      {/* ====== Section 3: O aplikaci ====== */}
      <Card className="bg-surface-container-low shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Info className="h-5 w-5 text-muted-foreground" />
            {t("sections.about")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            {t.rich("about.body", {
              brand: (chunks) => (
                <strong className="text-foreground">{chunks}</strong>
              ),
            })}
          </p>

          <div className="space-y-1.5 rounded-lg border bg-card p-3 text-xs">
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
        </CardContent>
      </Card>
    </div>
  );
}
