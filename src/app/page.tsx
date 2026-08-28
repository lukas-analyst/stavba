"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useProjects } from "@/lib/api";
import { useAppStore, type TabId } from "@/lib/store";
import { AppSidebar } from "@/components/app-sidebar";
import { ProjectDetail } from "@/components/project-detail";
import { EmptyState } from "@/components/empty-state";
import { GlobalSearchDialog } from "@/components/global-search-dialog";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { Loader2, PanelLeftClose, PanelLeft, Search, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Valid tab ids — used to validate the `?tab=` URL param.
const VALID_TABS: ReadonlySet<TabId> = new Set<TabId>([
  "dashboard",
  "budget",
  "payments",
  "time",
  "contacts",
  "timeline",
  "notes",
]);

/**
 * Next.js 16 requires `useSearchParams()` to be wrapped in a Suspense
 * boundary so that static rendering can bail out gracefully. We split the
 * page into a thin wrapper that only provides the Suspense fallback and a
 * `HomeContent` component that does the real work.
 */
export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-muted/30">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const { data: projects, isLoading } = useProjects();
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const activeTab = useAppStore((s) => s.activeTab);
  const setSelectedProject = useAppStore((s) => s.setSelectedProject);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Guards the URL-write effect so it does not run before the initial
  // URL-read effect has had a chance to hydrate the store from query params.
  const hasInitializedRef = useRef(false);

  // Desktop: sidebar can be collapsed via the edge button or Cmd+B
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  // Mobile: sidebar is a drawer (overlay), closed by default
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useKeyboardShortcuts();

  // Listen for keyboard shortcuts
  useEffect(() => {
    const toggleHandler = () => {
      // On mobile, toggle the drawer; on desktop, toggle the collapse
      if (window.innerWidth < 768) {
        setMobileOpen((prev) => !prev);
      } else {
        setDesktopCollapsed((prev) => !prev);
      }
    };
    const searchHandler = () => setSearchOpen(true);
    window.addEventListener("stavba:toggle-sidebar", toggleHandler);
    window.addEventListener("stavba:global-search", searchHandler);
    return () => {
      window.removeEventListener("stavba:toggle-sidebar", toggleHandler);
      window.removeEventListener("stavba:global-search", searchHandler);
    };
  }, []);

  // === URL → Store sync (one-time, on mount) ===
  // Read `?project=` and `?tab=` from the URL and apply them to the store
  // so that shareable links land the user on the right project/tab.
  useEffect(() => {
    const urlProject = searchParams.get("project");
    const urlTab = searchParams.get("tab");

    if (urlProject) {
      setSelectedProject(urlProject);
    }
    // Validate the tab against the known list so a mistyped URL does not
    // leave the app in an undefined tab state.
    if (urlTab && VALID_TABS.has(urlTab as TabId)) {
      setActiveTab(urlTab as TabId);
    }
  }, []); // run once on mount — see comment above

  // === Store → URL sync (after the initial mount) ===
  // Whenever the selected project or active tab changes, mirror the change
  // into the URL using `router.replace` so we don't pollute the back-button
  // history on every interaction.
  useEffect(() => {
    // Skip the very first run — the URL is already authoritative at mount
    // time and writing back the (possibly auto-selected) defaults would
    // create a `?tab=dashboard` flicker.
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      return;
    }

    const params = new URLSearchParams();
    if (selectedProjectId) params.set("project", selectedProjectId);
    if (activeTab) params.set("tab", activeTab);

    const query = params.toString();
    const nextUrl = query ? `${pathname}?${query}` : pathname;
    router.replace(nextUrl);
  }, [selectedProjectId, activeTab, pathname, router]);

  // Close mobile drawer when a project is selected
  const handleSelectProject = (id: string) => {
    setSelectedProject(id);
    setMobileOpen(false);
  };

  // Auto-select the starred/first project on initial load
  // (only fires when no project is selected — e.g. when the URL had no
  // `?project=` param, preserving the original "auto-select" behaviour).
  useEffect(() => {
    if (!selectedProjectId && projects && projects.length > 0) {
      const starred = projects.find((p) => p.starred);
      setSelectedProject(starred?.id ?? projects[0].id);
    }
  }, [projects, selectedProjectId, setSelectedProject]);

  const selectedProject = projects?.find((p) => p.id === selectedProjectId);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-muted/30">
      {/* === Desktop sidebar (md and up) === */}
      <div
        className={cn(
          "hidden shrink-0 transition-all duration-200 md:block",
          desktopCollapsed ? "w-0 overflow-hidden" : "w-80",
        )}
      >
        <AppSidebar onSelectProject={handleSelectProject} />
      </div>

      {/* Desktop collapse button (edge of sidebar) */}
      {!desktopCollapsed && (
        <button
          onClick={() => setDesktopCollapsed(true)}
          className="fixed left-[319px] top-1/2 z-30 hidden h-6 w-5 items-center justify-center rounded-r-md border border-l-0 bg-background shadow-sm hover:bg-muted md:flex"
          aria-label="Skrýt panel"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      )}
      {desktopCollapsed && (
        <button
          onClick={() => setDesktopCollapsed(false)}
          className="fixed left-3 top-3 z-30 hidden h-9 w-9 items-center justify-center rounded-lg border bg-background shadow-sm hover:bg-muted md:flex"
          aria-label="Zobrazit panel"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      )}

      {/* === Mobile drawer (below md) === */}
      {/* Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] transform transition-transform duration-200 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="relative h-full">
          <AppSidebar onSelectProject={handleSelectProject} />
          {/* Close button inside drawer */}
          <button
            onClick={() => setMobileOpen(false)}
            className="absolute right-2 top-3 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden"
            aria-label="Zavřít panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        {/* Mobile top bar with hamburger + search */}
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background hover:bg-muted"
            aria-label="Otevřít menu"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex-1 truncate text-sm font-semibold">
            {selectedProject ? selectedProject.name : "Stavba"}
          </div>
          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background hover:bg-muted"
            aria-label="Hledat"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>

        {/* Desktop search button (fixed, top-right) */}
        <button
          onClick={() => setSearchOpen(true)}
          className="fixed right-4 top-4 z-30 hidden items-center gap-2 rounded-lg border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur hover:bg-background hover:text-foreground md:flex"
          aria-label="Globální vyhledávání"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Hledat</span>
          <kbd className="rounded border bg-muted px-1 py-0.5 text-[10px]">
            ⌘K
          </kbd>
        </button>

        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : selectedProject ? (
          <ProjectDetail project={selectedProject} />
        ) : (
          <EmptyState />
        )}
      </main>

      {/* Global search dialog */}
      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
