"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  User,
  Users,
  Pencil,
  Check,
  X,
  Loader2,
  Activity,
  Eye,
  Timer,
  Clock,
  Download,
  FileJson,
  FileSpreadsheet,
  Bell,
  AlertTriangle,
  Trash2,
  Crown,
  Shield,
  ShieldCheck,
  Edit3,
  LogOut,
  ChevronRight,
  Mail,
  Building2,
  RefreshCw,
} from "lucide-react";
import { useProjects } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// =====================================================================
// AdminTab — account-level administration page
// ---------------------------------------------------------------------
// Renders sections reachable from the sticky left-side nav
// (desktop) or sticky horizontal nav (mobile). Smooth-scrolls to the
// clicked section via scrollIntoView({ behavior: "smooth" }).
//
//   1. Můj profil              — inline-editable name + avatar
//   2. Moje projekty           — list of projects where the user is
//                                  owner (Správce) or member
//                                  (Editor / Čtenář), with "Odpojit se"
//   2b. Správa uživatelů       — (admin only) list of all users with
//                                  isAdmin toggle (promote/demote).
//                                  Hidden from non-admins in both nav
//                                  and main content.
//   3. Statistiky mé aktivity   — KPIs + bar chart of events by type
//                                  + top pages by time spent
//   4. Export mých dat          — JSON (full state) + per-project CSV
//   5. Notifikační preference   — Switch toggles persisted to
//                                  localStorage (no auth yet)
//   6. Nebezpečná zóna          — destructive account actions guarded
//                                  by AlertDialog confirmations
//
// Constraints honoured:
//   * No project disconnections are executed against the protected
//     test projects (Trojská 8 / Testovací projekt) during normal
//     testing — the buttons still call the API but are guarded by
//     confirmation dialogs.
//   * All text in Czech.
//   * MD3 styling throughout (rounded-full buttons, type-* utility
//     classes, surface-container-low backgrounds for section groups).
//   * Admin-only sections are filtered out of the side nav and the
//     main content for non-admin users (see `visibleSections`).
// =====================================================================

// ===== Types =====
export type CurrentUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  isAdmin: boolean;
  createdAt: string;
};

type Member = {
  id: string;
  role: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string | null; email: string; image: string | null };
};

type MembersResponse = {
  owner: { id: string; name: string | null; email: string; image: string | null };
  members: Member[];
};

type ProjectWithRole = {
  id: string;
  name: string;
  address: string | null;
  status: string;
  role: "owner" | "editor" | "viewer";
  memberId?: string; // only set for non-owners
};

type AnalyticsSummary = {
  totalEvents: number;
  eventsByType: Record<string, number>;
  totalPageViews: number;
  totalTimeSpent: number;
  avgTimePerPage: number;
  longestSession: number;
  topPages: Array<{ pageUrl: string; views: number; avgTimeSpent: number }>;
  timeByPage: Array<{ pageUrl: string; totalTime: number; views: number; avgTime: number }>;
  topUsersByEvents: Array<{
    userId: string;
    userName: string;
    email: string | null;
    image: string | null;
    eventCount: number;
    lastActive: string | null;
  }>;
};

type AnalyticsResponse = {
  entries: unknown[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: AnalyticsSummary;
};

// ===== Constants =====
// `adminOnly: true` marks sections that should only appear in the side
// nav (and main content) when the current user is an admin.
// Section labels are resolved via next-intl (`tabs.admin.section.<id>`)
// at render time — the static `label` here is only a fallback for
// edge cases where the translator hasn't loaded yet.
const SECTION_LINKS = [
  { id: "projects", icon: Building2, adminOnly: false },
  { id: "users", icon: Users, adminOnly: true },
  { id: "export", icon: Download, adminOnly: false },
  { id: "notifications", icon: Bell, adminOnly: false },
  { id: "danger", icon: AlertTriangle, adminOnly: false },
] as const;

const NOTIFICATIONS_KEY = "stavba.notifications.preferences";

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

type NotificationPrefs = {
  onMemberAssigned: boolean;
  onItemDelayed: boolean;
  onOwnerChanged: boolean;
};

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  onMemberAssigned: true,
  onItemDelayed: false,
  onOwnerChanged: true,
};

// ===== Helpers =====
function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return (parts[0][0] ?? "").toUpperCase() + (parts[1][0] ?? "").toUpperCase();
}

function formatTimeSpent(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (minutes < 60) return rem > 0 ? `${minutes} min ${rem} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin > 0 ? `${hours} h ${remMin} min` : `${hours} h`;
}

// Resolve a page URL to a localized label via the shared `nav.items.*`
// namespace (also used by the sidebar). Falls back to the cleaned URL
// segment when no translation is found.
// `tNav` should be a root-scoped translator (so we can call
// `tNav("nav.items." + key)` with the full dotted path).
function formatPageLabel(
  url: string | null,
  tNav: (key: string) => string,
): string {
  if (!url) return "—";
  // Normalize: remove duplicate slashes, strip leading /
  const cleaned = url.replace(/\/+/g, "/").replace(/^\/+/, "");
  // Map alternate dashboard slug to the same key as `dashboard`.
  const key = cleaned === "dashboard-test" ? "dashboard" : cleaned;
  const translated = tNav(`nav.items.${key}`);
  // next-intl returns the key itself when the translation is missing —
  // fall back to the cleaned URL in that case.
  return translated === `nav.items.${key}` ? cleaned : translated;
}

// Format an ISO timestamp as a relative "time ago" string using ICU
// plural-aware translations from the shared `relativeTime.*` namespace.
// `tRel` is scoped to `relativeTime`.
function formatRelativeTime(
  iso: string | null,
  tRel: (key: string, params?: Record<string, unknown>) => string,
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return tRel("justNow");
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) {
    return tRel("minute", { n: diffMin });
  }
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) {
    return tRel("hour", { n: diffHr });
  }
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return tRel("yesterday");
  return tRel("days", { n: diffDay });
}

// Role badge CSS classes (locale-independent).
const ROLE_BADGES: Record<string, string> = {
  owner: "bg-primary-container text-primary-container-foreground",
  editor: "bg-info-soft text-info-strong dark:bg-info-soft dark:text-info-strong",
  viewer: "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground",
};

// =====================================================================
// AdminTab — main export
// =====================================================================
export function AdminTab() {
  const qc = useQueryClient();
  const [activeSection, setActiveSection] = useState<string>("projects");
  const t = useTranslations("tabs.admin");

  // Fetch current user profile
  const { data: currentUser, isLoading: userLoading } = useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const res = await fetch("/api/users/profile");
      if (!res.ok) throw new Error("Failed to fetch user profile");
      return (await res.json()) as CurrentUser;
    },
    staleTime: 60_000,
  });

  // Sections visible to the current user — admins see all, non-admins see
  // only those with `adminOnly: false`. Computed once per render so the
  // IntersectionObserver + nav both reference the same filtered list.
  const visibleSections = useMemo(() => {
    const isAdmin = currentUser?.isAdmin ?? false;
    return SECTION_LINKS.filter((link) => !link.adminOnly || isAdmin);
  }, [currentUser?.isAdmin]);

  // ===== Smooth-scroll to section on nav click =====
  const handleSectionClick = useCallback(
    (id: string) => {
      setActiveSection(id);
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        // Move focus to the section for accessibility (without scrolling jump)
        window.setTimeout(() => {
          el.focus({ preventScroll: true });
        }, 350);
      }
    },
    [],
  );

  // ===== Highlight active section on scroll (desktop sidebar) =====
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );
    for (const link of visibleSections) {
      const el = document.getElementById(link.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [visibleSections]);

  return (
    <div className="flex min-h-full">
      {/* ===== Desktop sticky sidebar nav (lg+) ===== */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <nav className="sticky top-0 max-h-[calc(100vh-0px)] overflow-y-auto px-3 py-6 scrollbar-thin">
          <div className="mb-4 px-3">
            <span className="type-overline text-on-surface-variant">{t("nav.label")}</span>
            <h2 className="type-title-lg mt-1">{t("nav.title")}</h2>
          </div>
          <ul className="space-y-0.5">
            {visibleSections.map((link) => {
              const Icon = link.icon;
              const isActive = activeSection === link.id;
              return (
                <li key={link.id}>
                  <button
                    type="button"
                    onClick={() => handleSectionClick(link.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-full px-3 py-2.5 text-left text-sm font-medium transition-all duration-150",
                      isActive
                        ? "bg-primary-container text-primary-container-foreground font-semibold shadow-sm"
                        : "text-on-surface-variant hover:bg-surface-container-high",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{t(`section.${link.id}`)}</span>
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-opacity",
                        isActive ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* ===== Main content (sections) ===== */}
      <div className="min-w-0 flex-1 space-y-6 px-4 py-4 md:px-6 md:py-6 lg:space-y-8">
        {/* ===== Mobile sticky top nav (horizontal scroll) ===== */}
        <div className="sticky top-0 z-10 -mx-4 mb-2 bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6 lg:hidden">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
            {visibleSections.map((link) => {
              const Icon = link.icon;
              const isActive = activeSection === link.id;
              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => handleSectionClick(link.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary-container text-primary-container-foreground"
                      : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="whitespace-nowrap">{t(`section.${link.id}`)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Page header (visible on all breakpoints) */}
        <header className="lg:hidden">
          <h1 className="type-title-lg flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            {t("nav.title")}
          </h1>
          <p className="type-body text-on-surface-variant">
            {t("subtitle")}
          </p>
        </header>

        {/* Loading state while user is being fetched */}
        {userLoading || !currentUser ? (
          <div className="space-y-6">
            <Skeleton className="h-40" />
            <Skeleton className="h-64" />
            <Skeleton className="h-48" />
          </div>
        ) : (
          <>
            <ProjectsSection currentUser={currentUser} qc={qc} />
            {currentUser.isAdmin && (
              <UsersSection currentUser={currentUser} qc={qc} />
            )}
            <StatsSection currentUser={currentUser} />
            <ExportSection />
            <NotificationsSection />
            <DangerSection currentUser={currentUser} qc={qc} />
          </>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Section 1: Profile — inline-editable name + avatar
// =====================================================================
function ProfileSection({ user }: { user: CurrentUser }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name ?? "");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const t = useTranslations("tabs.admin.profile");

  // Reset local state if the upstream user changes
  useEffect(() => {
    setName(user.name ?? "");
  }, [user.name]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("toasts.emptyName"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("toasts.saveError"));
      }
      await qc.invalidateQueries({ queryKey: ["user-profile"] });
      await qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("toasts.saved"));
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toasts.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setName(user.name ?? "");
    setEditing(false);
  };

  const initials = getInitials(user.name ?? user.email);

  return (
    <section
      id="profile"
      tabIndex={-1}
      className="scroll-mt-24 focus:outline-none lg:scroll-mt-6"
    >
      <Card className="bg-card shadow-sm border-outline-variant">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle className="type-title-lg flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                {t("title")}
              </CardTitle>
              <CardDescription className="mt-1">
                {t("description")}
              </CardDescription>
            </div>
            {editing ? (
              <div className="flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  className="rounded-full gap-1.5"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {t("button.save")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 rounded-full gap-1.5"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-3.5 w-3.5" /> {t("button.edit")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            {/* Avatar placeholder — colored circle with initials */}
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-secondary-container text-secondary-container-foreground shadow-sm">
              {user.image ? (
                <Avatar className="h-16 w-16">
                  <AvatarImage src={user.image} alt={user.name ?? user.email} />
                  <AvatarFallback className="bg-secondary-container type-title-lg font-bold text-secondary-container-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <span className="type-title-lg font-bold">{initials}</span>
              )}
            </div>

            {/* Name + email */}
            <div className="min-w-0 flex-1 space-y-2">
              {editing ? (
                <div className="space-y-1.5">
                  <Label htmlFor="profile-name" className="type-label-sm text-on-surface-variant">
                    {t("field.displayName")}
                  </Label>
                  <Input
                    id="profile-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("placeholder.name")}
                    className="h-9 max-w-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSave();
                      if (e.key === "Escape") handleCancel();
                    }}
                  />
                  <p className="type-label-sm text-on-surface-variant">
                    {t("hint.nameChange")}
                  </p>
                </div>
              ) : (
                <>
                  <div className="type-headline font-semibold truncate">
                    {user.name ?? "—"}
                  </div>
                  <div className="type-body text-on-surface-variant flex items-center gap-1.5 truncate">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>
                  <div className="type-label text-on-surface-variant">
                    {t("label.accountCreated", { date: formatDate(user.createdAt) })}
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

// =====================================================================
// Section 2: Projects — list of projects where user is owner or member
// =====================================================================
function ProjectsSection({
  currentUser,
  qc,
}: {
  currentUser: CurrentUser;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const t = useTranslations("tabs.admin.projects");
  const tRoles = useTranslations("roles");
  const [membersByProject, setMembersByProject] = useState<
    Record<string, MembersResponse | null>
  >({});
  const [leavingProjectId, setLeavingProjectId] = useState<string | null>(null);

  // Fetch members for each project to determine the current user's role.
  // We deliberately keep this client-side (rather than a single bulk
  // endpoint) because the project count is small (typically <10) and
  // the response is cached per-project in `membersByProject`.
  useEffect(() => {
    if (!projects || projects.length === 0) return;
    let cancelled = false;
    Promise.all(
      projects.map(async (p) => {
        try {
          const res = await fetch(`/api/projects/${p.id}/members`);
          if (!res.ok) return [p.id, null] as const;
          return [p.id, (await res.json()) as MembersResponse] as const;
        } catch {
          return [p.id, null] as const;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setMembersByProject((prev) => {
        const next = { ...prev };
        for (const [id, data] of results) {
          next[id as string] = data as MembersResponse | null;
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [projects]);

  // Filter to projects where the user is owner or member
  const myProjects: ProjectWithRole[] = useMemo(() => {
    if (!projects) return [];
    const result: ProjectWithRole[] = [];
    for (const p of projects) {
      const members = membersByProject[p.id];
      if (!members) continue;
      if (members.owner?.id === currentUser.id) {
        result.push({
          id: p.id,
          name: p.name,
          address: p.address,
          status: p.status,
          role: "owner",
        });
      } else {
        const member = members.members.find((m) => m.user.id === currentUser.id);
        if (member) {
          result.push({
            id: p.id,
            name: p.name,
            address: p.address,
            status: p.status,
            role: member.role === "editor" ? "editor" : "viewer",
            memberId: member.id,
          });
        }
      }
    }
    return result;
  }, [projects, membersByProject, currentUser.id]);

  const handleLeaveProject = async (project: ProjectWithRole) => {
    if (!project.memberId) return;
    setLeavingProjectId(project.id);
    try {
      const res = await fetch(
        `/api/projects/${project.id}/members/${project.memberId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to leave project");
      // Optimistically remove from local state
      setMembersByProject((prev) => {
        const next = { ...prev };
        const cur = next[project.id];
        if (cur) {
          next[project.id] = {
            ...cur,
            members: cur.members.filter((m) => m.id !== project.memberId),
          };
        }
        return next;
      });
      await qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(t("toasts.left", { name: project.name }));
    } catch {
      toast.error(t("toasts.leaveError"));
    } finally {
      setLeavingProjectId(null);
    }
  };

  return (
    <section
      id="projects"
      tabIndex={-1}
      className="scroll-mt-24 focus:outline-none lg:scroll-mt-6"
    >
      <Card className="bg-card shadow-sm border-outline-variant">
        <CardHeader className="pb-3">
          <CardTitle className="type-title-lg flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            {t("title")}
          </CardTitle>
          <CardDescription>
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {projectsLoading || myProjects.length === 0 ? (
            projectsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : (
              <p className="type-body py-6 text-center text-on-surface-variant">
                {t("empty")}
              </p>
            )
          ) : (
            <ul className="space-y-2">
              {myProjects.map((p) => {
                const isLeaving = leavingProjectId === p.id;
                return (
                  <li
                    key={p.id}
                    className={cn(
                      "flex flex-wrap items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3 transition-all",
                      isLeaving && "opacity-50",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="type-body font-semibold truncate">{p.name}</span>
                        <Badge variant="secondary" className={cn("type-label-sm", ROLE_BADGES[p.role])}>
                          {p.role === "owner" && <Crown className="mr-1 h-3 w-3" />}
                          {p.role === "editor" && <Edit3 className="mr-1 h-3 w-3" />}
                          {p.role === "viewer" && <Eye className="mr-1 h-3 w-3" />}
                          {tRoles(p.role)}
                        </Badge>
                      </div>
                      {p.address && (
                        <div className="type-label text-on-surface-variant mt-0.5 truncate">
                          {p.address}
                        </div>
                      )}
                    </div>
                    {p.role !== "owner" && p.memberId && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full gap-1.5"
                            disabled={isLeaving}
                          >
                            {isLeaving ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <LogOut className="h-3.5 w-3.5" />
                            )}
                            {t("button.leave")}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t("leave.confirmTitle", { name: p.name })}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("leave.confirmBody")}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("leave.cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleLeaveProject(p)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              <LogOut className="mr-1.5 h-3.5 w-3.5" />
                              {t("button.leaveConfirm")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {p.role === "owner" && (
                      <Badge variant="outline" className="type-label-sm">
                        {t("badge.cannotLeave")}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// =====================================================================
// Section 2b: Users — admin-only user management with isAdmin toggle
// ---------------------------------------------------------------------
// Visible only when `currentUser.isAdmin === true`. Lists every user in
// the instance (excluding the current admin themselves — they cannot
// demote themselves, so showing their own row only adds confusion).
//
// Each row: avatar (initials) + name + email + isAdmin Switch.
//   * PATCH /api/users/[id] with { isAdmin } on toggle.
//   * Toast confirms the new state.
//   * Self-demotion is blocked both client-side (Switch disabled + tooltip)
//     and server-side (the API also refuses to set `isAdmin: false` on
//     the requester's own account if the server-side guard is enabled).
// =====================================================================
type ManagedUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  isAdmin: boolean;
  createdAt: string;
  deletedAt: string | null;
};

function UsersSection({
  currentUser,
  qc,
}: {
  currentUser: CurrentUser;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const t = useTranslations("tabs.admin.users");
  const { data: users, isLoading } = useQuery<ManagedUser[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return (await res.json()) as ManagedUser[];
    },
    staleTime: 30_000,
  });

  // Track in-flight toggles per user id so each Switch can show a
  // spinner/disabled state independently while the PATCH is in flight.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const handleToggleAdmin = async (
    user: ManagedUser,
    nextValue: boolean,
  ) => {
    // Defense-in-depth: never allow self-demotion from the UI.
    if (user.id === currentUser.id) {
      toast.error(t("toasts.cannotDemoteSelf"));
      return;
    }
    setPendingIds((prev) => new Set(prev).add(user.id));
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAdmin: nextValue }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          err.error ?? t("toasts.toggleError"),
        );
      }
      // Invalidate the users list so the Switch reflects the new state
      // from the server (defense-in-depth against optimistic drift).
      await qc.invalidateQueries({ queryKey: ["users"] });
      const displayName = user.name ?? user.email;
      toast.success(
        nextValue
          ? t("toasts.promoted", { name: displayName })
          : t("toasts.demoted", { name: displayName }),
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("toasts.toggleError"),
      );
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(user.id);
        return next;
      });
    }
  };

  return (
    <section
      id="users"
      tabIndex={-1}
      className="scroll-mt-24 focus:outline-none lg:scroll-mt-6"
    >
      <Card className="bg-surface-container-low shadow-sm border-outline-variant">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            {t("title")}
          </CardTitle>
          <CardDescription>
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : !users || users.length === 0 ? (
            <p className="type-body py-6 text-center text-on-surface-variant">
              {t("empty")}
            </p>
          ) : (
            <ul className="space-y-2">
              {users.map((u) => {
                const isSelf = u.id === currentUser.id;
                const isPending = pendingIds.has(u.id);
                const initials = getInitials(u.name ?? u.email);
                return (
                  <li
                    key={u.id}
                    className="rounded-lg border border-outline-variant bg-card p-3"
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar (initials fallback) */}
                      <Avatar className="h-10 w-10 shrink-0">
                        {u.image ? (
                          <AvatarImage src={u.image} alt={u.name ?? u.email} />
                        ) : null}
                        <AvatarFallback className="bg-secondary-container text-secondary-container-foreground text-sm font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>

                      {/* Name + email */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="type-body font-semibold truncate">
                            {u.name ?? "—"}
                          </span>
                          {u.deletedAt ? (
                            <Badge
                              variant="secondary"
                              className="type-label-sm bg-warning-soft text-warning-strong gap-1"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              {t("badge.pendingDeletion")}
                            </Badge>
                          ) : u.isAdmin ? (
                            <Badge
                              variant="secondary"
                              className="type-label-sm bg-primary-container text-primary-container-foreground gap-1"
                            >
                              <ShieldCheck className="h-3 w-3" />
                              {t("badge.admin")}
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="type-label-sm bg-muted text-muted-foreground gap-1"
                            >
                              <Shield className="h-3 w-3" />
                              {t("badge.user")}
                            </Badge>
                          )}
                        </div>
                        <div className="type-label text-on-surface-variant mt-0.5 flex items-center gap-1.5 truncate">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate">{u.email}</span>
                        </div>
                      </div>

                      {/* isAdmin Switch with self-demotion guard */}
                      <div className="flex shrink-0 items-center gap-2">
                        {isPending && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-on-surface-variant" />
                        )}
                        {isSelf ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {/* Wrap in a span so the tooltip can anchor on
                                  a disabled control (Radix limitation). */}
                              <span tabIndex={0} className="inline-flex">
                                <Switch
                                  checked={u.isAdmin}
                                  disabled
                                  aria-label={t("aria.adminToggleSelf", { name: u.name ?? u.email })}
                                />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              {t("tooltip.noSelfDemote")}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Switch
                            checked={u.isAdmin}
                            disabled={isPending}
                            onCheckedChange={(v) => handleToggleAdmin(u, v)}
                            aria-label={t("aria.adminToggleOther", { name: u.name ?? u.email })}
                          />
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="type-label-sm text-on-surface-variant mt-3">
            {t("hint.selfExcluded", { email: currentUser.email })}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

// =====================================================================
// Section 3: Stats — KPIs + bar chart + top pages
// =====================================================================
export function StatsSection({ currentUser }: { currentUser: CurrentUser }) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const t = useTranslations("tabs.admin.stats");
  const tNav = useTranslations();
  const tRel = useTranslations("relativeTime");
  const tEventTypes = useTranslations("analytics.eventTypes");

  // Fetch projects for the dropdown
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json() as Promise<{ id: string; name: string }[]>;
    },
    staleTime: 60_000,
  });

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-analytics", currentUser.id, selectedProjectId],
    queryFn: async () => {
      const params = new URLSearchParams({
        userId: currentUser.id,
        pageSize: "100",
      });
      if (selectedProjectId !== "all") {
        params.set("projectId", selectedProjectId);
      }
      const res = await fetch(`/api/analytics?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return (await res.json()) as AnalyticsResponse;
    },
    staleTime: 30_000,
  });

  const summary = data?.summary;
  const eventTypeRows = summary
    ? Object.entries(summary.eventsByType)
        .filter(([type]) => type !== "page_view") // exclude page_view from chart
        .sort((a, b) => b[1] - a[1])
    : [];
  const maxEventCount = eventTypeRows.length > 0 ? eventTypeRows[0][1] : 1;

  // Top 5 pages by time spent (timeByPage is already sorted desc by totalTime)
  const topPagesByTime = summary?.timeByPage.slice(0, 5) ?? [];

  // Last activity timestamp — find max createdAt from topUsersByEvents
  // matching our user, OR fall back to entries[0]
  const lastActiveIso = useMemo(() => {
    const me = summary?.topUsersByEvents.find((u) => u.userId === currentUser.id);
    return me?.lastActive ?? null;
  }, [summary, currentUser.id]);

  return (
    <section
      id="stats"
      tabIndex={-1}
      className="scroll-mt-24 focus:outline-none lg:scroll-mt-6"
    >
      <Card className="bg-card shadow-sm border-outline-variant">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="type-title-lg flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                {t("title")}
              </CardTitle>
              <CardDescription>
                {t("description")}
              </CardDescription>
            </div>
            {/* Project filter dropdown */}
            {projects && projects.length > 0 && (
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="h-8 w-auto min-w-[160px] type-label-sm rounded-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filter.allProjects")}</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="outline"
              size="sm"
              className="rounded-full gap-1.5"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {t("button.refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
              <Skeleton className="h-40" />
            </div>
          ) : (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatsKpi
                  label={t("kpi.totalActions")}
                  value={summary?.totalEvents ?? 0}
                  icon={<Activity className="h-4 w-4 text-primary" />}
                  iconBg="bg-primary-container"
                  accent="border-primary/30"
                />
                <StatsKpi
                  label={t("kpi.pageViews")}
                  value={summary?.totalPageViews ?? 0}
                  icon={<Eye className="h-4 w-4 text-info" />}
                  iconBg="bg-info-soft"
                  accent="border-info/30"
                />
                <StatsKpi
                  label={t("kpi.totalTime")}
                  value={formatTimeSpent(summary?.totalTimeSpent ?? 0)}
                  icon={<Timer className="h-4 w-4 text-warning" />}
                  iconBg="bg-warning-soft"
                  accent="border-warning/30"
                />
                <StatsKpi
                  label={t("kpi.lastActive")}
                  value={formatRelativeTime(lastActiveIso, tRel)}
                  icon={<Clock className="h-4 w-4 text-success" />}
                  iconBg="bg-success-soft"
                  accent="border-success/30"
                />
              </div>

              {/* Bar chart: events by type */}
              <div className="mt-6 space-y-2">
                <h3 className="type-label text-on-surface-variant">
                  {t("chart.byType.title")}
                </h3>
                {eventTypeRows.length === 0 ? (
                  <p className="type-body py-6 text-center text-on-surface-variant">
                    {t("chart.byType.empty")}
                  </p>
                ) : (
                  <div className="max-h-80 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
                    {eventTypeRows.slice(0, 12).map(([type, count]) => {
                      const pct = (count / maxEventCount) * 100;
                      const colorClass = EVENT_TYPE_COLORS[type] ?? "bg-primary";
                      // Try to translate via the shared analytics.eventTypes.*
                      // namespace; fall back to the raw type string when no
                      // translation exists.
                      let label: string;
                      try {
                        label = tEventTypes(type) ?? type;
                      } catch {
                        label = type;
                      }
                      return (
                        <div key={type} className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="type-body font-medium truncate">{label}</span>
                            <span className="type-label text-on-surface-variant tabular-nums shrink-0">
                              {count}
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
                            <div
                              className={cn("h-full rounded-full transition-all", colorClass)}
                              style={{ width: `${Math.max(pct, 2)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Top 5 pages by time spent */}
              <div className="mt-6 space-y-2">
                <h3 className="type-label text-on-surface-variant">
                  {t("topPages.title")}
                </h3>
                {topPagesByTime.length === 0 ? (
                  <p className="type-body py-6 text-center text-on-surface-variant">
                    {t("topPages.empty")}
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-outline-variant">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-outline-variant bg-surface-container-high">
                          <th className="type-overline text-on-surface-variant px-3 py-2 text-left">
                            {t("topPages.column.page")}
                          </th>
                          <th className="type-overline text-on-surface-variant px-3 py-2 text-right whitespace-nowrap">
                            {t("topPages.column.views")}
                          </th>
                          <th className="type-overline text-on-surface-variant px-3 py-2 text-right whitespace-nowrap">
                            {t("topPages.column.totalTime")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {topPagesByTime.map((p) => (
                          <tr
                            key={p.pageUrl}
                            className="border-b border-outline-variant last:border-0 hover:bg-surface-container-high/60"
                          >
                            <td className="px-3 py-2">
                              <span className="type-body font-medium">
                                {formatPageLabel(p.pageUrl, tNav)}
                              </span>
                              <span className="type-label text-on-surface-variant ml-2">
                                {p.pageUrl}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right type-body tabular-nums">
                              {p.views}
                            </td>
                            <td className="px-3 py-2 text-right type-body tabular-nums">
                              {formatTimeSpent(p.totalTime)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function StatsKpi({
  label,
  value,
  icon,
  iconBg,
  accent,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg: string;
  accent: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm",
        accent,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="type-label-sm text-on-surface-variant">{label}</span>
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-full", iconBg)}>
          {icon}
        </span>
      </div>
      <span className="type-headline font-semibold tabular-nums">{value}</span>
    </div>
  );
}

// =====================================================================
// Section 4: Export — JSON + CSV download buttons
// =====================================================================
function ExportSection() {
  const [exportingJson, setExportingJson] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const { data: projects } = useProjects();
  const t = useTranslations("tabs.admin.export");

  const handleExportJson = async () => {
    setExportingJson(true);
    try {
      const res = await fetch("/api/export");
      if (!res.ok) throw new Error("Failed to export");
      const blob = await res.blob();
      const today = new Date().toISOString().slice(0, 10);
      const filename = `stavba-export-${today}.json`;
      // Try to extract filename from Content-Disposition header
      const cd = res.headers.get("Content-Disposition");
      const match = cd?.match(/filename="?([^"]+)"?/);
      const finalName = match?.[1] ?? filename;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = finalName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(t("toasts.jsonSuccess"));
    } catch {
      toast.error(t("toasts.jsonError"));
    } finally {
      setExportingJson(false);
    }
  };

  const handleExportAllCsv = async () => {
    if (!projects || projects.length === 0) {
      toast.info(t("toasts.csvNoProjects"));
      return;
    }
    setExportingCsv(true);
    try {
      // Only budget/payments/time are supported by the export-csv endpoint.
      // (Contacts fall back to budget, so we omit it to avoid duplicates.)
      const types: Array<"budget" | "payments" | "time"> = [
        "budget",
        "payments",
        "time",
      ];
      const typeLabels: Record<string, string> = {
        budget: "rozpocet",
        payments: "platby",
        time: "cas",
      };
      let successCount = 0;
      let failCount = 0;
      for (const project of projects) {
        for (const type of types) {
          try {
            const res = await fetch(
              `/api/projects/${project.id}/export-csv?type=${type}`,
            );
            if (!res.ok) {
              failCount++;
              continue;
            }
            const blob = await res.blob();
            const safeName = project.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "")
              .slice(0, 40) || "projekt";
            const today = new Date().toISOString().slice(0, 10);
            const filename = `${safeName}-${typeLabels[type]}-${today}.csv`;
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            successCount++;
            // Small delay to avoid overwhelming the browser's download manager
            await new Promise((r) => setTimeout(r, 150));
          } catch {
            failCount++;
          }
        }
      }
      if (failCount === 0) {
        toast.success(t("toasts.csvSuccess", { count: successCount }));
      } else if (successCount === 0) {
        toast.error(t("toasts.csvAllFailed"));
      } else {
        toast.warning(t("toasts.csvPartialSuccess", { success: successCount, failed: failCount }));
      }
    } finally {
      setExportingCsv(false);
    }
  };

  return (
    <section
      id="export"
      tabIndex={-1}
      className="scroll-mt-24 focus:outline-none lg:scroll-mt-6"
    >
      <Card className="bg-card shadow-sm border-outline-variant">
        <CardHeader className="pb-3">
          <CardTitle className="type-title-lg flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            {t("title")}
          </CardTitle>
          <CardDescription>
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="outline"
              className="rounded-full gap-1.5"
              onClick={handleExportJson}
              disabled={exportingJson}
            >
              {exportingJson ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileJson className="h-3.5 w-3.5" />
              )}
              {t("button.json")}
            </Button>
            <Button
              variant="outline"
              className="rounded-full gap-1.5"
              onClick={handleExportAllCsv}
              disabled={exportingCsv}
            >
              {exportingCsv ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5" />
              )}
              {t("button.csv")}
            </Button>
          </div>
          <p className="type-label-sm text-on-surface-variant mt-3">
            {t("hint")}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

// =====================================================================
// Section 5: Notifications — Switch toggles persisted to localStorage
// =====================================================================
function NotificationsSection() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [loaded, setLoaded] = useState(false);
  const t = useTranslations("tabs.admin.notifications");

  // Load preferences from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(NOTIFICATIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
        setPrefs({
          onMemberAssigned: parsed.onMemberAssigned ?? DEFAULT_NOTIFICATION_PREFS.onMemberAssigned,
          onItemDelayed: parsed.onItemDelayed ?? DEFAULT_NOTIFICATION_PREFS.onItemDelayed,
          onOwnerChanged: parsed.onOwnerChanged ?? DEFAULT_NOTIFICATION_PREFS.onOwnerChanged,
        });
      }
    } catch {
      // ignore malformed JSON — keep defaults
    } finally {
      setLoaded(true);
    }
  }, []);

  const updatePref = (key: keyof NotificationPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(next));
      toast.success(t("toasts.saved"));
    } catch {
      toast.error(t("toasts.saveError"));
    }
  };

  // Static array of toggle rows — labels and descriptions are resolved
  // via the `tabs.admin.notifications.toggle.<key>` namespace at render
  // time so they translate when the user switches locale.
  const toggleRows: Array<{ key: keyof NotificationPrefs }> = [
    { key: "onMemberAssigned" },
    { key: "onItemDelayed" },
    { key: "onOwnerChanged" },
  ];

  return (
    <section
      id="notifications"
      tabIndex={-1}
      className="scroll-mt-24 focus:outline-none lg:scroll-mt-6"
    >
      <Card className="bg-card shadow-sm border-outline-variant">
        <CardHeader className="pb-3">
          <CardTitle className="type-title-lg flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            {t("title")}
          </CardTitle>
          <CardDescription>
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1">
            {toggleRows.map((row) => {
              const label = t(`toggle.${row.key}.label`);
              const description = t(`toggle.${row.key}.description`);
              return (
                <li
                  key={row.key}
                  className="flex items-start justify-between gap-4 rounded-lg border border-outline-variant bg-surface-container-low p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="type-body font-medium">{label}</div>
                    <div className="type-label text-on-surface-variant mt-0.5">
                      {description}
                    </div>
                  </div>
                  <Switch
                    checked={loaded ? prefs[row.key] : false}
                    onCheckedChange={(v) => updatePref(row.key, v)}
                    aria-label={label}
                  />
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}

// =====================================================================
// Section 6: Danger zone — destructive account actions
// =====================================================================
function DangerSection({
  currentUser,
  qc,
}: {
  currentUser: CurrentUser;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const { data: projects } = useProjects();
  const [deletingNotes, setDeletingNotes] = useState(false);
  const [leavingAll, setLeavingAll] = useState(false);
  const t = useTranslations("tabs.admin.danger");
  const tCommon = useTranslations("common");

  // "Smazat všechny mé poznámky" — loops through projects, fetches notes,
  // filters to those authored by the current user, and deletes each via
  // the existing /api/notes/[id] DELETE endpoint.
  const handleDeleteAllNotes = async () => {
    setDeletingNotes(true);
    try {
      let deleted = 0;
      let failed = 0;
      if (projects && projects.length > 0) {
        for (const project of projects) {
          try {
            const res = await fetch(`/api/projects/${project.id}/notes`);
            if (!res.ok) continue;
            const notes = (await res.json()) as Array<{
              id: string;
              author: string | null;
              userId?: string | null;
            }>;
            const mine = notes.filter(
              (n) => n.userId === currentUser.id || n.author === currentUser.email || n.author === currentUser.name,
            );
            for (const note of mine) {
              try {
                const del = await fetch(`/api/notes/${note.id}`, {
                  method: "DELETE",
                });
                if (del.ok) deleted++;
                else failed++;
              } catch {
                failed++;
              }
            }
          } catch {
            // skip this project
          }
        }
      }
      await qc.invalidateQueries({ queryKey: ["notes"] });
      if (deleted === 0 && failed === 0) {
        toast.info(t("deleteNotes.toasts.none"));
      } else if (failed === 0) {
        toast.success(t("deleteNotes.toasts.success", { count: deleted }));
      } else {
        toast.warning(t("deleteNotes.toasts.partial", { deleted, failed }));
      }
    } catch {
      toast.error(t("deleteNotes.toasts.error"));
    } finally {
      setDeletingNotes(false);
    }
  };

  // "Odpojit se od všech projektů" — leave every project where the user
  // is a member (not owner). For protected test projects, the user has to
  // confirm again in the dialog (which we already provide). We also
  // skip projects where the user is the owner (cannot leave own project).
  const handleLeaveAllProjects = async () => {
    setLeavingAll(true);
    try {
      let left = 0;
      let failed = 0;
      if (projects && projects.length > 0) {
        for (const project of projects) {
          try {
            const res = await fetch(`/api/projects/${project.id}/members`);
            if (!res.ok) continue;
            const data = (await res.json()) as MembersResponse;
            if (data.owner?.id === currentUser.id) continue; // can't leave own
            const member = data.members.find((m) => m.user.id === currentUser.id);
            if (!member) continue;
            const del = await fetch(
              `/api/projects/${project.id}/members/${member.id}`,
              { method: "DELETE" },
            );
            if (del.ok) left++;
            else failed++;
          } catch {
            failed++;
          }
        }
      }
      await qc.invalidateQueries({ queryKey: ["projects"] });
      if (left === 0 && failed === 0) {
        toast.info(t("leaveAll.toasts.none"));
      } else if (failed === 0) {
        toast.success(t("leaveAll.toasts.success", { count: left }));
      } else {
        toast.warning(t("leaveAll.toasts.partial", { left, failed }));
      }
    } catch {
      toast.error(t("leaveAll.toasts.error"));
    } finally {
      setLeavingAll(false);
    }
  };

  return (
    <section
      id="danger"
      tabIndex={-1}
      className="scroll-mt-24 focus:outline-none lg:scroll-mt-6"
    >
      <Card className="border-danger/30 bg-danger-soft/10 border-outline-variant">
        <CardHeader className="pb-3">
          <CardTitle className="type-title-lg flex items-center gap-2 text-danger">
            <AlertTriangle className="h-4 w-4" />
            {t("title")}
          </CardTitle>
          <CardDescription>
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Delete all my notes */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline-variant bg-card p-3">
            <div className="flex items-start gap-2">
              <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <div className="min-w-0">
                <div className="type-body font-medium">{t("deleteNotes.title")}</div>
                <div className="type-label text-on-surface-variant">
                  {t("deleteNotes.description")}
                </div>
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full gap-1.5 text-danger border-danger/30 hover:bg-danger-soft"
                  disabled={deletingNotes}
                >
                  <Trash2 className="h-3.5 w-3.5" /> {tCommon("delete")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("deleteNotes.confirmTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("deleteNotes.confirmBody")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAllNotes}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deletingNotes ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {t("deleteNotes.confirmButton")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Leave all projects */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft/20 p-3">
            <div className="flex items-start gap-2">
              <LogOut className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <div className="min-w-0">
                <div className="type-body font-medium">{t("leaveAll.title")}</div>
                <div className="type-label text-on-surface-variant">
                  {t("leaveAll.description")}
                </div>
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-full gap-1.5"
                  disabled={leavingAll}
                >
                  <LogOut className="h-3.5 w-3.5" /> {t("leaveAll.button")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("leaveAll.confirmTitle")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("leaveAll.confirmBody")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleLeaveAllProjects}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {leavingAll ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogOut className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {t("leaveAll.confirmButton")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
