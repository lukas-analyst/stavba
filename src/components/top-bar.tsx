"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { signOut, useSession } from "next-auth/react";
import {
  Menu,
  ChevronDown,
  Search,
  User,
  Star,
  Plus,
  Check,
  Settings,
  Sun,
  Moon,
  LogOut,
  SlidersHorizontal,
} from "lucide-react";
import { useProjects } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { useScrollState } from "@/hooks/use-scroll-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { GlobalSearchDialog } from "@/components/global-search-dialog";
import { formatCzk, STATUS_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Short format for mobile budget summary: 37600 → "37k", 2858000 → "2,9M"
function formatShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

// Compute up to 2 initials from a name/email for the avatar fallback.
// "Lukáš Hanzlík" → "LH", "hanzlik@…" → "H".
function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    return parts[0][0]?.toUpperCase() ?? "?";
  }
  return (parts[0][0] ?? "").toUpperCase() + (parts[1][0] ?? "").toUpperCase();
}

export function TopBar() {
  const router = useRouter();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const setSelectedProjectId = useAppStore((s) => s.setSelectedProjectId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const { data: projects } = useProjects();
  const qc = useQueryClient();
  const isScrolled = useScrollState();
  const { theme, setTheme } = useTheme();

  // Fetch current user profile from NextAuth session.
  // The avatar dropdown shows initials + name + email from the session.
  // Falls back to the /api/users/profile endpoint (which itself falls
  // back to the default owner if no session — for backwards compat).
  const { data: session } = useSession();
  const currentUser = session?.user
    ? {
        id: (session.user as { id?: string }).id ?? "",
        name: session.user.name ?? null,
        email: session.user.email ?? "",
        image: session.user.image ?? null,
        createdAt: "",
      }
    : null;

  // If session isn't loaded yet, fall back to the profile endpoint
  // (which returns the default owner during dev / before auth).
  const { data: profileUser } = useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const res = await fetch("/api/users/profile");
      if (!res.ok) return null;
      return (await res.json()) as {
        id: string;
        name: string | null;
        email: string;
        image: string | null;
        createdAt: string;
      };
    },
    // Only fetch if we don't have a session yet
    enabled: !session,
    staleTime: 60_000,
  });

  // Use session user if available, otherwise the profile endpoint fallback
  const displayUser = currentUser ?? profileUser;

  // next-themes handles hydration internally; the dropdown menu content
  // only renders after a user click (inside a Radix portal), so we can
  // read `theme` directly without a mounted-guard.
  const isDark = theme === "dark";

  const [projectOpen, setProjectOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  // Listen for global shortcut events:
  // - "stavba:new-project" → dispatched by Cmd/Ctrl+N (use-keyboard-shortcuts).
  // - "stavba:open-search" → dispatched by Cmd/Ctrl+K (use-keyboard-shortcuts).
  // Both handlers are no-ops if the target dialog is already open.
  useEffect(() => {
    const openNewProject = () => setAddOpen(true);
    const openSearch = () => setGlobalSearchOpen(true);
    window.addEventListener("stavba:new-project", openNewProject);
    window.addEventListener("stavba:open-search", openSearch);
    return () => {
      window.removeEventListener("stavba:new-project", openNewProject);
      window.removeEventListener("stavba:open-search", openSearch);
    };
  }, []);

  const selectedProject = projects?.find((p) => p.id === selectedProjectId);

  const handleSelectProject = useCallback(
    (id: string) => {
      setSelectedProjectId(id);
      setProjectOpen(false);
    },
    [setSelectedProjectId],
  );

  // Toggle star on any project (direct API call + cache invalidation)
  const toggleStar = useCallback(
    async (projectId: string, starred: boolean) => {
      try {
        await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ starred }),
        });
        qc.invalidateQueries({ queryKey: ["projects"] });
      } catch {
        toast.error("Nepodařilo se upravit projekt");
      }
    },
    [qc],
  );

  // ===== Sign-out with audit log =====
  // We fire a non-blocking POST /api/auth/audit-log before calling
  // signOut(). If sendBeacon is available, it will survive the page
  // navigation triggered by signOut(); otherwise we fall back to fetch
  // with `keepalive: true`. Telemetry must never block sign-out.
  const handleSignOut = useCallback(() => {
    const payload = JSON.stringify({ action: "logout", success: true });
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        const queued = navigator.sendBeacon("/api/auth/audit-log", blob);
        if (queued) {
          signOut({ callbackUrl: "/auth/login" });
          return;
        }
      }
      void fetch("/api/auth/audit-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    } catch {
      // ignore
    }
    signOut({ callbackUrl: "/auth/login" });
  }, []);

  // Filtered project list
  const filtered = projects?.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.address ?? "").toLowerCase().includes(q)
    );
  });
  const starred = filtered?.filter((p) => p.starred) ?? [];
  const others = filtered?.filter((p) => !p.starred) ?? [];

  // Budget summary
  const actualTotal = selectedProject?.stats?.actualTotal ?? 0;
  const planTotal = selectedProject?.stats?.planTotal ?? 0;
  const burnRate = selectedProject?.stats?.burnRate ?? 0;

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 flex h-16 shrink-0 items-center gap-1.5 px-2 transition-all duration-200 sm:h-14 sm:px-3",
          // MD3 TopAppBar: always has border + subtle shadow for visual consistency
          // with the sidebar (both use tonal surface scale). When scrolled,
          // the tonal elevation increases slightly (surface-container-high)
          // to reinforce separation from scrolling content below.
          isScrolled
            ? "bg-surface-container-high border-b border-outline-variant shadow-md"
            : "bg-surface-container-low border-b border-outline-variant shadow-sm",
        )}
      >
        {/* Hamburger — larger touch target on mobile (44px → 36px on desktop) */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? "Zavřít panel" : "Otevřít panel"}
          className="h-11 w-11 shrink-0 state-layer-on-surface rounded-full sm:h-9 sm:w-9"
        >
          <Menu className="h-6 w-6 sm:h-5 sm:w-5" />
        </Button>

        {/* MD3 title hierarchy: Project name (title) + active tab (subtitle) */}
        <div className="flex min-w-0 flex-col">
          {/* Project dropdown trigger */}
          <Popover open={projectOpen} onOpenChange={setProjectOpen}>
            <PopoverTrigger asChild>
              <button
                className="flex h-9 items-center gap-1 rounded-full px-2 text-sm font-semibold leading-none state-layer-on-surface sm:h-7 sm:px-1.5"
              >
                <span className="max-w-[120px] truncate sm:max-w-[180px]">
                  {selectedProject ? selectedProject.name : "Vyberte projekt"}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground sm:h-3.5 sm:w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-80 p-0"
              align="start"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              {/* Search field */}
              <div className="border-b p-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Hledat projekt…"
                  className="h-8 text-sm"
                  autoFocus
                />
              </div>

              {/* Project list */}
              <div className="max-h-[50vh] overflow-y-auto scrollbar-thin">
                {starred.length > 0 && (
                  <>
                    {starred.map((p) => (
                      <ProjectDropdownItem
                        key={p.id}
                        project={p}
                        isSelected={p.id === selectedProjectId}
                        onSelect={handleSelectProject}
                        onToggleStar={(e) => {
                          e.stopPropagation();
                          toggleStar(p.id, !p.starred);
                        }}
                      />
                    ))}
                    {others.length > 0 && (
                      <div className="h-px bg-outline-variant" aria-hidden />
                    )}
                  </>
                )}
                {others.map((p) => (
                  <ProjectDropdownItem
                    key={p.id}
                    project={p}
                    isSelected={p.id === selectedProjectId}
                    onSelect={handleSelectProject}
                    onToggleStar={(e) => {
                      e.stopPropagation();
                      toggleStar(p.id, !p.starred);
                    }}
                  />
                ))}
                {filtered?.length === 0 && (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    Žádné projekty nenalezeny.
                  </div>
                )}
              </div>

              {/* Manage current project + Add project */}
              <div className="border-t p-2 space-y-1.5">
                {selectedProjectId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-1.5 rounded-full"
                    onClick={() => {
                      setActiveTab("management");
                      setProjectOpen(false);
                    }}
                  >
                    <Settings className="h-4 w-4" /> Spravovat projekt
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 rounded-full"
                  onClick={() => {
                    setAddOpen(true);
                    setProjectOpen(false);
                  }}
                >
                  <Plus className="h-4 w-4" /> Přidat projekt
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Project description subtitle (MD3 medium app bar pattern) */}
          {selectedProject && selectedProject.description && (
            <span className="hidden max-w-[200px] truncate px-1.5 type-label-sm leading-tight text-on-surface-variant sm:block">
              {selectedProject.description}
            </span>
          )}
        </div>

        {/* Spacer (left) — pushes search bar to center on desktop */}
        <div className="hidden flex-1 md:block" />

        {/* MD3 Search bar — centered on desktop, hidden on mobile (icon only) */}
        <button
          onClick={() => setGlobalSearchOpen(true)}
          aria-label="Hledat"
          className="hidden h-9 max-w-md flex-1 items-center gap-2 rounded-full border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface-variant/60 transition-colors hover:bg-surface-container-high md:flex"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="truncate">Hledat v projektu…</span>
        </button>

        {/* Mobile search icon — larger touch target (44px) */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setGlobalSearchOpen(true)}
          aria-label="Hledat"
          className="h-11 w-11 shrink-0 state-layer-on-surface rounded-full sm:h-9 sm:w-9 md:hidden"
        >
          <Search className="h-5 w-5 sm:h-4 sm:w-4" />
        </Button>

        {/* Spacer (right) — balances layout on desktop */}
        <div className="hidden flex-1 md:block" />

        {/* Budget summary — MD3 tonal chip, clickable to Přehled
            MOBILE OPTIMIZATION: On phones (< sm) the top bar is crowded
            (hamburger + project title + search icon + avatar), so the
            chip shows ONLY the burn-rate % with color coding. The full
            "actual / plan" breakdown lives on the Dashboard tab anyway.
            On sm+ screens the chip expands to show the actual/plan text. */}
        {selectedProject && planTotal > 0 && (
          <button
            onClick={() => setActiveTab("dashboard")}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-2 text-xs transition-colors state-layer-on-surface sm:px-3 sm:py-1.5",
              isScrolled
                ? "bg-surface-container-high"
                : "bg-surface-container",
            )}
            title={`Čerpání: ${formatCzk(actualTotal)} z ${formatCzk(planTotal)}`}
            aria-label={`Čerpání rozpočtu: ${burnRate.toFixed(0)} procent`}
          >
            {/* Full "actual / plan" text — md+ only (desktop) */}
            <span className="hidden tabular-nums text-on-surface-variant md:inline">
              {formatCzk(actualTotal)} / {formatCzk(planTotal)}
            </span>
            {/* Compact short format — sm→md only (tablet) */}
            <span className="hidden tabular-nums font-semibold sm:inline md:hidden">
              {formatShort(actualTotal)} / {formatShort(planTotal)}
            </span>
            <span
              className={cn(
                "tabular-nums font-bold",
                burnRate > 100
                  ? "text-danger"
                  : burnRate > 80
                    ? "text-warning"
                    : "text-success",
              )}
            >
              {burnRate.toFixed(0)}%
            </span>
          </button>
        )}

        {/* Account dropdown — avatar with initials + Preference + Odhlásit + theme toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-12 w-12 shrink-0 state-layer-on-surface rounded-full sm:h-9 sm:w-9"
              aria-label="Účet"
              title={displayUser?.name ?? displayUser?.email ?? "Účet"}
            >
              {displayUser?.image ? (
                <Avatar className="h-8 w-8 sm:h-6 sm:w-6">
                  <AvatarImage src={displayUser.image} alt={displayUser.name ?? displayUser.email} />
                  <AvatarFallback className="bg-secondary-container type-label-sm font-bold text-secondary-container-foreground">
                    <User className="h-6 w-6 sm:h-5 sm:w-5" />
                  </AvatarFallback>
                </Avatar>
              ) : (
                <User className="h-6 w-6 sm:h-5 sm:w-5" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className="w-[min(20rem,calc(100vw-1rem))] p-0 overflow-hidden rounded-2xl border-outline-variant"
          >
            {/* User info section */}
            <div className="flex items-center gap-3 bg-surface-container-low p-3">
              <Avatar className="h-11 w-11 shrink-0 border border-outline-variant">
                {displayUser?.image ? (
                  <AvatarImage src={displayUser.image} alt={displayUser.name ?? displayUser.email} />
                ) : null}
                <AvatarFallback className="bg-secondary-container type-label font-bold text-secondary-container-foreground">
                  {getInitials(displayUser?.name ?? displayUser?.email ?? "?")}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="type-body font-semibold truncate">
                  {displayUser?.name ?? "Načítání…"}
                </div>
                <div className="type-label text-on-surface-variant truncate">
                  {displayUser?.email ?? ""}
                </div>
              </div>
            </div>

            <DropdownMenuSeparator className="bg-outline-variant" />

            {/* Preference — open the Admin tab */}
            <DropdownMenuItem
              onSelect={() => setActiveTab("admin")}
              className="cursor-pointer gap-2.5 rounded-none px-3 py-2.5 type-body hover:bg-surface-container-high"
            >
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              Preference
            </DropdownMenuItem>

            {/* Profil — profile page (name, password, sessions) */}
            <DropdownMenuItem
              onSelect={() => router.push("/auth/profile")}
              className="cursor-pointer gap-2.5 rounded-none px-3 py-2.5 type-body hover:bg-surface-container-high"
            >
              <User className="h-4 w-4 text-primary" />
              Profil
            </DropdownMenuItem>

            {/* Odhlásit — functional sign-out via NextAuth */}
            <DropdownMenuItem
              onSelect={handleSignOut}
              className="cursor-pointer gap-2.5 rounded-none px-3 py-2.5 type-body hover:bg-surface-container-high"
            >
              <LogOut className="h-4 w-4 text-muted-foreground" />
              Odhlásit
            </DropdownMenuItem>

            <DropdownMenuSeparator className="bg-outline-variant" />

            {/* Theme toggle — moved from sidebar settings to here */}
            <DropdownMenuItem
              onSelect={() => setTheme(isDark ? "light" : "dark")}
              className="cursor-pointer gap-2.5 rounded-none px-3 py-2.5 type-body hover:bg-surface-container-high"
            >
              {isDark ? (
                <Sun className="h-4 w-4 text-warning" />
              ) : (
                <Moon className="h-4 w-4 text-info" />
              )}
              {isDark ? "Světlý motiv" : "Tmavý motiv"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Dialogs */}
      <NewProjectDialog open={addOpen} onOpenChange={setAddOpen} />
      <GlobalSearchDialog
        open={globalSearchOpen}
        onOpenChange={setGlobalSearchOpen}
      />
    </>
  );
}

// ===== Project dropdown item (MD3 menu item pattern) =====
function ProjectDropdownItem({
  project,
  isSelected,
  onSelect,
  onToggleStar,
}: {
  project: {
    id: string;
    name: string;
    address: string | null;
    starred: boolean;
    status: string;
    stats?: { actualTotal: number; planTotal: number; burnRate: number } | null;
  };
  isSelected: boolean;
  onSelect: (id: string) => void;
  onToggleStar: (e: React.MouseEvent) => void;
}) {
  const status = STATUS_LABELS[project.status] ?? STATUS_LABELS.active;

  return (
    <button
      onClick={() => onSelect(project.id)}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-container-high",
        isSelected && "bg-secondary/50",
      )}
    >
      {/* Star toggle */}
      <span
        role="button"
        tabIndex={0}
        onClick={onToggleStar}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleStar(e as unknown as React.MouseEvent);
          }
        }}
        className="shrink-0 rounded-full p-1 hover:bg-surface-container-high"
        aria-label={project.starred ? "Odebrat hvězdičku" : "Ohvězdičkovat"}
      >
        <Star
          className={cn(
            "h-3.5 w-3.5 transition-colors",
            project.starred
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/40 hover:text-amber-400",
          )}
        />
      </span>

      {/* Project info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{project.name}</span>
          {isSelected && (
            <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
          {project.address && (
            <span className="truncate">{project.address}</span>
          )}
          {project.stats && project.stats.planTotal > 0 && (
            <span className="tabular-nums">
              · {formatCzk(project.stats.actualTotal)} / {formatCzk(project.stats.planTotal)}
            </span>
          )}
        </div>
      </div>

      {/* Status badge */}
      <Badge
        variant="secondary"
        className={cn("shrink-0 text-[10px]", status.color)}
      >
        {status.label}
      </Badge>
    </button>
  );
}
