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

// =====================================================================
// AdminTab — account-level administration page
// ---------------------------------------------------------------------
// Renders six sections reachable from the sticky left-side nav
// (desktop) or sticky horizontal nav (mobile). Smooth-scrolls to the
// clicked section via scrollIntoView({ behavior: "smooth" }).
//
//   1. Můj profil              — inline-editable name + avatar
//   2. Moje projekty           — list of projects where the user is
//                                  owner (Správce) or member
//                                  (Editor / Čtenář), with "Odpojit se"
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
// =====================================================================

// ===== Types =====
type CurrentUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
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
const SECTION_LINKS = [
  { id: "profile", label: "Můj profil", icon: User },
  { id: "projects", label: "Moje projekty", icon: Building2 },
  { id: "stats", label: "Statistiky", icon: Activity },
  { id: "export", label: "Export", icon: Download },
  { id: "notifications", label: "Notifikace", icon: Bell },
  { id: "danger", label: "Nebezpečná zóna", icon: AlertTriangle },
] as const;

const NOTIFICATIONS_KEY = "stavba.notifications.preferences";

const EVENT_TYPE_LABELS: Record<string, string> = {
  page_view: "Zobrazení stránky",
  add_payment: "Přidání platby",
  add_time_entry: "Přidání času",
  edit_time_entry: "Úprava času",
  edit_payment: "Úprava platby",
  delete_payment: "Smazání platby",
  add_contact: "Přidání kontaktu",
  add_note: "Přidání poznámky",
  edit_note: "Úprava poznámky",
  add_budget_item: "Přidání položky",
  edit_budget_item: "Úprava položky",
  download_data: "Stažení dat",
  login: "Přihlášení",
  logout: "Odhlášení",
  project_share: "Sdílení projektu",
};

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

function formatPageLabel(url: string | null): string {
  if (!url) return "—";
  // Normalize: remove duplicate slashes, strip leading /
  const cleaned = url.replace(/\/+/g, "/").replace(/^\/+/, "");
  const labels: Record<string, string> = {
    dashboard: "Přehled",
    "dashboard-test": "Přehled",
    budget: "Rozpočet",
    payments: "Platby",
    time: "Čas",
    contacts: "Kontakty",
    timeline: "Časová osa",
    notes: "Poznámky",
    management: "Správa projektu",
    telemetry: "Telemetrie",
    admin: "Administrace",
  };
  return labels[cleaned] ?? cleaned;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return "právě teď";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) {
    if (diffMin === 1) return "před minutou";
    if (diffMin < 5) return `před ${diffMin} minutami`;
    return `před ${diffMin} minutami`;
  }
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) {
    if (diffHr === 1) return "před hodinou";
    if (diffHr < 5) return `před ${diffHr} hodinami`;
    return `před ${diffHr} hodinami`;
  }
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return "včera";
  if (diffDay < 5) return `před ${diffDay} dny`;
  return `před ${diffDay} dny`;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Správce",
  editor: "Editor",
  viewer: "Čtenář",
};

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
  const [activeSection, setActiveSection] = useState<string>("profile");

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
    for (const link of SECTION_LINKS) {
      const el = document.getElementById(link.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex min-h-full">
      {/* ===== Desktop sticky sidebar nav (lg+) ===== */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <nav className="sticky top-0 max-h-[calc(100vh-0px)] overflow-y-auto px-3 py-6 scrollbar-thin">
          <div className="mb-4 px-3">
            <span className="type-overline text-on-surface-variant">Administrace</span>
            <h2 className="type-title-lg mt-1">Nastavení účtu</h2>
          </div>
          <ul className="space-y-0.5">
            {SECTION_LINKS.map((link) => {
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
                    <span className="flex-1 truncate">{link.label}</span>
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
            {SECTION_LINKS.map((link) => {
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
                  <span className="whitespace-nowrap">{link.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Page header (visible on all breakpoints) */}
        <header className="lg:hidden">
          <h1 className="type-title-lg flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Nastavení účtu
          </h1>
          <p className="type-body text-on-surface-variant">
            Profil, projekty, statistiky a preference.
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
            <ProfileSection user={currentUser} />
            <ProjectsSection currentUser={currentUser} qc={qc} />
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

  // Reset local state if the upstream user changes
  useEffect(() => {
    setName(user.name ?? "");
  }, [user.name]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Jméno nesmí být prázdné");
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
        throw new Error(err.error || "Nepodařilo se upravit profil");
      }
      await qc.invalidateQueries({ queryKey: ["user-profile"] });
      await qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Profil uložen");
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nepodařilo se upravit profil");
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
                Můj profil
              </CardTitle>
              <CardDescription className="mt-1">
                Zobrazované jméno a e-mail, které ostatní uživatelé vidí při sdílení projektů.
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
                  Uložit
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
                <Pencil className="h-3.5 w-3.5" /> Upravit
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
                    Zobrazované jméno
                  </Label>
                  <Input
                    id="profile-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="např. Lukáš Hanzlík"
                    className="h-9 max-w-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSave();
                      if (e.key === "Escape") handleCancel();
                    }}
                  />
                  <p className="type-label-sm text-on-surface-variant">
                    Změna se projeví ve všech projektech, kde jste členem.
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
                    Účet vytvořen: {formatDate(user.createdAt)}
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
      toast.success(`Odpojeno od projektu „${project.name}"`);
    } catch {
      toast.error("Nepodařilo se odpojit od projektu");
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
            Moje projekty
          </CardTitle>
          <CardDescription>
            Projekty, kde jste správcem nebo členem. Odpojit se můžete jen z projektů, kde nejste správce.
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
                Zatím nejste členem žádného projektu.
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
                          {ROLE_LABELS[p.role]}
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
                            Odpojit se
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Odpojit se od projektu „{p.name}"?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Ztratíte přístup ke všem datům projektu.
                              Tato akce je nevratná.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Zrušit</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleLeaveProject(p)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              <LogOut className="mr-1.5 h-3.5 w-3.5" />
                              Odpojit se
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {p.role === "owner" && (
                      <Badge variant="outline" className="type-label-sm">
                        Nelze opustit
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
// Section 3: Stats — KPIs + bar chart + top pages
// =====================================================================
function StatsSection({ currentUser }: { currentUser: CurrentUser }) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");

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
                Statistiky mé aktivity
              </CardTitle>
              <CardDescription>
                Přehled vašich akcí v aplikaci za celé období.
              </CardDescription>
            </div>
            {/* Project filter dropdown */}
            {projects && projects.length > 0 && (
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="h-8 w-auto min-w-[160px] type-label-sm rounded-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Všechny projekty</SelectItem>
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
              Obnovit
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
                  label="Celkem akcí"
                  value={summary?.totalEvents ?? 0}
                  icon={<Activity className="h-4 w-4 text-primary" />}
                  iconBg="bg-primary-container"
                  accent="border-primary/30"
                />
                <StatsKpi
                  label="Zobrazení stránek"
                  value={summary?.totalPageViews ?? 0}
                  icon={<Eye className="h-4 w-4 text-info" />}
                  iconBg="bg-info-soft"
                  accent="border-info/30"
                />
                <StatsKpi
                  label="Celkem čas na stránkách"
                  value={formatTimeSpent(summary?.totalTimeSpent ?? 0)}
                  icon={<Timer className="h-4 w-4 text-warning" />}
                  iconBg="bg-warning-soft"
                  accent="border-warning/30"
                />
                <StatsKpi
                  label="Poslední aktivita"
                  value={formatRelativeTime(lastActiveIso)}
                  icon={<Clock className="h-4 w-4 text-success" />}
                  iconBg="bg-success-soft"
                  accent="border-success/30"
                />
              </div>

              {/* Bar chart: events by type */}
              <div className="mt-6 space-y-2">
                <h3 className="type-label text-on-surface-variant">
                  Události podle typu
                </h3>
                {eventTypeRows.length === 0 ? (
                  <p className="type-body py-6 text-center text-on-surface-variant">
                    Zatím nebyla zaznamenána žádná aktivita.
                  </p>
                ) : (
                  <div className="max-h-80 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
                    {eventTypeRows.slice(0, 12).map(([type, count]) => {
                      const pct = (count / maxEventCount) * 100;
                      const colorClass = EVENT_TYPE_COLORS[type] ?? "bg-primary";
                      const label = EVENT_TYPE_LABELS[type] ?? type;
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
                  Moje nejaktivnější stránky
                </h3>
                {topPagesByTime.length === 0 ? (
                  <p className="type-body py-6 text-center text-on-surface-variant">
                    Žádná data o čase na stránkách.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-outline-variant">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-outline-variant bg-surface-container-high">
                          <th className="type-overline text-on-surface-variant px-3 py-2 text-left">
                            Stránka
                          </th>
                          <th className="type-overline text-on-surface-variant px-3 py-2 text-right whitespace-nowrap">
                            Zobrazení
                          </th>
                          <th className="type-overline text-on-surface-variant px-3 py-2 text-right whitespace-nowrap">
                            Celkem čas
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
                                {formatPageLabel(p.pageUrl)}
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
      toast.success("Data exportována");
    } catch {
      toast.error("Export selhal");
    } finally {
      setExportingJson(false);
    }
  };

  const handleExportAllCsv = async () => {
    if (!projects || projects.length === 0) {
      toast.info("Nejsou k dispozici žádné projekty pro export");
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
        toast.success(`Data exportována (${successCount} souborů)`);
      } else if (successCount === 0) {
        toast.error("CSV export selhal");
      } else {
        toast.warning(`Exportováno ${successCount} souborů, ${failCount} selhalo`);
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
            Export mých dat
          </CardTitle>
          <CardDescription>
            Stáhněte si všechna data aplikace ve formátu JSON nebo CSV pro zálohování a analýzu.
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
              Stáhnout všechna data (JSON)
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
              Stáhnout CSV všechny projekty
            </Button>
          </div>
          <p className="type-label-sm text-on-surface-variant mt-3">
            JSON obsahuje kompletní stav všech projektů (rozpočet, platby, čas, kontakty).
            CSV stáhne pro každý projekt 4 soubory (rozpočet, platby, čas, kontakty).
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
      toast.success("Preference uložena");
    } catch {
      toast.error("Nepodařilo se uložit preferenci");
    }
  };

  const toggleRows: Array<{
    key: keyof NotificationPrefs;
    label: string;
    description: string;
  }> = [
    {
      key: "onMemberAssigned",
      label: "E-mail při přiřazení člena",
      description: "Upozornění, když vás někdo přidá jako člena projektu.",
    },
    {
      key: "onItemDelayed",
      label: "E-mail při zpoždění položky",
      description: "Upozornění, když se položka rozpočtu dostane za plánovaný termín.",
    },
    {
      key: "onOwnerChanged",
      label: "E-mail při změně vlastníka",
      description: "Upozornění, když někdo změní správce projektu, jehož jste členem.",
    },
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
            Notifikační preference
          </CardTitle>
          <CardDescription>
            Dokud není aktivní Google Auth, ukládáme preference lokálně ve vašem prohlížeči.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1">
            {toggleRows.map((row) => (
              <li
                key={row.key}
                className="flex items-start justify-between gap-4 rounded-lg border border-outline-variant bg-surface-container-low p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="type-body font-medium">{row.label}</div>
                  <div className="type-label text-on-surface-variant mt-0.5">
                    {row.description}
                  </div>
                </div>
                <Switch
                  checked={loaded ? prefs[row.key] : false}
                  onCheckedChange={(v) => updatePref(row.key, v)}
                  aria-label={row.label}
                />
              </li>
            ))}
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
        toast.info("Žádné poznámky ke smazání");
      } else if (failed === 0) {
        toast.success(`Smazáno ${deleted} poznámek`);
      } else {
        toast.warning(`Smazáno ${deleted}, ${failed} selhalo`);
      }
    } catch {
      toast.error("Nepodařilo se smazat poznámky");
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
        toast.info("Nejste členem žádného projektu (kde můžete odejít)");
      } else if (failed === 0) {
        toast.success(`Odpojeno od ${left} projektů`);
      } else {
        toast.warning(`Odpojeno ${left}, ${failed} selhalo`);
      }
    } catch {
      toast.error("Nepodařilo se odpojit od projektů");
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
            Nebezpečná zóna
          </CardTitle>
          <CardDescription>
            Akce v této sekci jsou nevratné. Vyžadují explicitní potvrzení v dialogu.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Delete all my notes */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline-variant bg-card p-3">
            <div className="flex items-start gap-2">
              <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <div className="min-w-0">
                <div className="type-body font-medium">Smazat všechny mé poznámky</div>
                <div className="type-label text-on-surface-variant">
                  Trvale smaže všechny poznámky, které jste vytvořili napříč všemi projekty.
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
                  <Trash2 className="h-3.5 w-3.5" /> Smazat
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Smazat všechny mé poznámky?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tato akce je nevratná. Všechny poznámky, které jste vytvořili,
                    budou trvale smazány ze všech projektů.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Zrušit</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAllNotes}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deletingNotes ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Smazat všechny poznámky
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
                <div className="type-body font-medium">Odpojit se od všech projektů</div>
                <div className="type-label text-on-surface-variant">
                  Odpojí vás ze všech projektů, kde jste členem (ne vlastníkem).
                  Ztratíte přístup ke všem datům těchto projektů.
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
                  <LogOut className="h-3.5 w-3.5" /> Odpojit se od všech
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Odpojit se od všech projektů?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Ztratíte přístup ke všem datům projektů, kde jste členem.
                    Projekty, které spravujete, zůstanou nedotčeny.
                    Tato akce je nevratná.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Zrušit</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleLeaveAllProjects}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {leavingAll ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogOut className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Odpojit se od všech
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
