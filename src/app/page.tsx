"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useProjects } from "@/lib/api";
import { useAppStore, type TabId } from "@/lib/store";
import { TopBar } from "@/components/top-bar";
import { AppSidebar } from "@/components/app-sidebar";
import { ProjectDetail } from "@/components/project-detail";
import { EmptyState } from "@/components/empty-state";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useIsMobile } from "@/hooks/use-mobile";
import { Loader2, X } from "lucide-react";

const VALID_TABS: ReadonlySet<TabId> = new Set<TabId>([
  "dashboard",
  "budget",
  "payments",
  "time",
  "contacts",
  "timeline",
  "notes",
]);

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

  // === Store → URL sync ===
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
    router.replace(nextUrl);
  }, [selectedProjectId, activeTab, pathname, router, projects]);

  // Auto-select the starred/first project on initial load
  useEffect(() => {
    if (!selectedProjectId && projects && projects.length > 0) {
      const starred = projects.find((p) => p.starred);
      setSelectedProject(starred?.id ?? projects[0].id);
    }
  }, [projects, selectedProjectId, setSelectedProject]);

  const selectedProject = projects?.find((p) => p.id === selectedProjectId);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-muted/30">
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
              {/* Close button */}
              <button
                onClick={() => setSidebarOpen(false)}
                className="absolute right-2 top-3 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden"
                aria-label="Zavřít panel"
              >
                <X className="h-4 w-4" />
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
          ) : selectedProject ? (
            <ProjectDetail project={selectedProject} />
          ) : (
            <EmptyState />
          )}
        </main>
      </div>
    </div>
  );
}
