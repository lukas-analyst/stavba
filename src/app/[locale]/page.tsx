"use client";

import { Suspense, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useProjects } from "@/lib/api";
import { useAppStore, type TabId } from "@/lib/store";
import { TopBar } from "@/components/top-bar";
import { AppSidebar } from "@/components/app-sidebar";
import { ContextualFab } from "@/components/contextual-fab";
import { ProjectDetail } from "@/components/project-detail";
import { EmptyState } from "@/components/empty-state";
import { SessionTimeoutWarning } from "@/components/session-timeout-warning";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipeToOpenSidebar } from "@/hooks/use-swipe-sidebar";
import { Loader2, X } from "lucide-react";

const VALID_TABS: ReadonlySet<TabId> = new Set<TabId>([
  "portfolio",
  "dashboard",
  "budget",
  "payments",
  "time",
  "contacts",
  "timeline",
  "notes",
  "management",
  "telemetry",
  "settings",
  "admin",
]);

// AdminTab is account-level (not project-scoped), so it can render even
// when no project is selected. We lazy-load it separately at the page
// level so the no-project branch doesn't have to go through EmptyState.
const AdminTab = dynamic(() => import("@/components/tabs/admin-tab").then((m) => m.AdminTab), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  ),
});
const SettingsTab = dynamic(() => import("@/components/tabs/settings-tab").then((m) => m.SettingsTab), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  ),
});
const PortfolioTab = dynamic(() => import("@/components/tabs/portfolio-tab").then((m) => m.PortfolioTab), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  ),
});

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-background">
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
  const setSelectedProjectId = useAppStore((s) => s.setSelectedProjectId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const hasInitializedRef = useRef(false);
  const isMobile = useIsMobile();

  useKeyboardShortcuts();
  useSwipeToOpenSidebar();

  // === Initialize sidebar state on mount ===
  // Desktop: open by default (or check localStorage)
  // Mobile: closed by default
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isMobile) {
      setSidebarOpen(false);
    } else {
      const stored = localStorage.getItem("stavba:sidebar-open");
      if (stored !== null) {
        setSidebarOpen(stored === "true");
      } else {
        setSidebarOpen(true);
      }
    }
  }, [isMobile, setSidebarOpen]);

  // Persist sidebar state to localStorage (desktop only)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isMobile) {
      localStorage.setItem("stavba:sidebar-open", String(sidebarOpen));
    }
  }, [sidebarOpen, isMobile]);

  // === URL → Store sync (one-time, on mount) ===
  useEffect(() => {
    const urlProject = searchParams.get("project");
    const urlTab = searchParams.get("tab");

    if (urlProject && projects) {
      const found = projects.find((p) => p.slug === urlProject || p.id === urlProject);
      if (found) {
        setSelectedProjectId(found.id);
      }
    }
    if (urlTab && VALID_TABS.has(urlTab as TabId)) {
      setActiveTab(urlTab as TabId);
    }
  }, [projects]);

  // === Browser back/forward (popstate) → Store sync ===
  // When the user presses the browser back button, the URL changes but
  // our store doesn't automatically update. This listener syncs the
  // store with the new URL so the correct tab/project is shown.
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const urlProject = params.get("project");
      const urlTab = params.get("tab");

      if (urlProject && projects) {
        const found = projects.find((p) => p.slug === urlProject || p.id === urlProject);
        if (found) {
          setSelectedProjectId(found.id);
        }
      }
      if (urlTab && VALID_TABS.has(urlTab as TabId)) {
        setActiveTab(urlTab as TabId);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [projects, setActiveTab, setSelectedProjectId]);

  // === Store → URL sync ===
  // Use router.push (not replace) so the browser back button works:
  // each tab/project change creates a new history entry, allowing the
  // user to go back to the previous tab instead of leaving the app.
  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      return;
    }
    const params = new URLSearchParams();
    if (selectedProjectId) {
      const project = projects?.find((p) => p.id === selectedProjectId);
      if (project) {
        params.set("project", project.slug);
      }
    }
    if (activeTab) params.set("tab", activeTab);
    const query = params.toString();
    const nextUrl = query ? `${pathname}?${query}` : pathname;
    router.push(nextUrl);
  }, [selectedProjectId, activeTab, pathname, router, projects]);

  // === Persist last selected project to localStorage (for new sessions) ===
  useEffect(() => {
    if (selectedProjectId && typeof window !== "undefined") {
      localStorage.setItem("stavba:lastProjectId", selectedProjectId);
    }
  }, [selectedProjectId]);

  // === Persist last active tab to localStorage (for new sessions) ===
  useEffect(() => {
    if (activeTab && typeof window !== "undefined") {
      localStorage.setItem("stavba:lastTab", activeTab);
    }
  }, [activeTab]);

  // Auto-select the starred/first project on initial load.
  // Order of precedence: URL param (handled above) → localStorage → starred → first.
  useEffect(() => {
    if (!selectedProjectId && projects && projects.length > 0) {
      // Try localStorage fallback for new sessions without URL param
      if (typeof window !== "undefined") {
        const lastProjectId = localStorage.getItem("stavba:lastProjectId");
        if (lastProjectId && projects.find((p) => p.id === lastProjectId)) {
          setSelectedProjectId(lastProjectId);
          const lastTab = localStorage.getItem("stavba:lastTab");
          if (lastTab && VALID_TABS.has(lastTab as TabId)) {
            setActiveTab(lastTab as TabId);
          }
          return;
        }
      }
      // Fallback: starred or first project
      const starred = projects.find((p) => p.starred);
      setSelectedProject(starred?.id ?? projects[0].id);
    }
  }, [projects, selectedProjectId, setSelectedProject, setSelectedProjectId, setActiveTab]);

  const selectedProject = projects?.find((p) => p.id === selectedProjectId);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      {/* Session timeout warning — emits a toast 5 min before JWT
          expiry; renders nothing visually. */}
      <SessionTimeoutWarning />

      {/* TopBar — sticky, full width, same on mobile + desktop */}
      <TopBar />

      {/* Main area: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* === Desktop sidebar (persistent, pushes content) === */}
        {sidebarOpen && !isMobile && (
          <aside className="hidden w-72 shrink-0 border-r md:block">
            <AppSidebar />
          </aside>
        )}

        {/* === Mobile sidebar (drawer overlay) === */}
        {sidebarOpen && isMobile && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
            {/* Drawer */}
            <aside className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r bg-background md:hidden">
              <AppSidebar />
              {/* Close button — 44px touch target on mobile (per MD3/Apple HIG) */}
              <button
                onClick={() => setSidebarOpen(false)}
                className="absolute right-2 top-3 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden"
                aria-label="Zavřít panel"
              >
                <X className="h-5 w-5" />
              </button>
            </aside>
          </>
        )}

        {/* === Main content === */}
        <main className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : activeTab === "admin" ? (
            // Admin tab is account-level — render it directly even when
            // no project is selected. When a project IS selected, we still
            // render AdminTab directly (rather than via ProjectDetail) so
            // account-level actions stay decoupled from project state.
            <AdminTab />
          ) : activeTab === "settings" ? (
            <SettingsTab />
          ) : activeTab === "portfolio" ? (
            // Portfolio tab is account-level (spans ALL projects the user
            // can access). Renders regardless of whether a project is
            // selected so the user can compare across projects even while
            // "inside" one of them.
            <PortfolioTab />
          ) : selectedProject ? (
            <ProjectDetail project={selectedProject} />
          ) : (
            <EmptyState />
          )}
        </main>
      </div>

      {/* Contextual FAB — mobile only, context-aware per active tab */}
      {selectedProject && <ContextualFab />}
    </div>
  );
}
