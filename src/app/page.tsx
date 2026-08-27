"use client";

import { useEffect, useState } from "react";
import { useProjects } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { AppSidebar } from "@/components/app-sidebar";
import { ProjectDetail } from "@/components/project-detail";
import { EmptyState } from "@/components/empty-state";
import { GlobalSearchDialog } from "@/components/global-search-dialog";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { Loader2, PanelLeftClose, PanelLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Home() {
  const { data: projects, isLoading } = useProjects();
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const setSelectedProject = useAppStore((s) => s.setSelectedProject);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useKeyboardShortcuts();

  // Listen for sidebar toggle from keyboard shortcut
  useEffect(() => {
    const toggleHandler = () => setSidebarCollapsed((prev) => !prev);
    const searchHandler = () => setSearchOpen(true);
    window.addEventListener("stavba:toggle-sidebar", toggleHandler);
    window.addEventListener("stavba:global-search", searchHandler);
    return () => {
      window.removeEventListener("stavba:toggle-sidebar", toggleHandler);
      window.removeEventListener("stavba:global-search", searchHandler);
    };
  }, []);

  // Auto-select the starred/first project on initial load
  useEffect(() => {
    if (!selectedProjectId && projects && projects.length > 0) {
      const starred = projects.find((p) => p.starred);
      setSelectedProject(starred?.id ?? projects[0].id);
    }
  }, [projects, selectedProjectId, setSelectedProject]);

  const selectedProject = projects?.find((p) => p.id === selectedProjectId);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-muted/30">
      {/* Sidebar - collapsible on mobile and via Cmd+B */}
      <div
        className={cn(
          "shrink-0 transition-all duration-200",
          sidebarCollapsed ? "w-0 overflow-hidden" : "w-80",
        )}
      >
        <AppSidebar />
      </div>

      <main className="flex-1 overflow-y-auto">
        {/* Mobile sidebar toggle button (visible when collapsed) */}
        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="fixed left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-lg border bg-background shadow-sm hover:bg-muted"
            aria-label="Zobrazit panel"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}

        {/* Collapse button (visible when expanded, on desktop) */}
        {!sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="fixed left-[319px] top-1/2 z-30 hidden h-6 w-5 items-center justify-center rounded-r-md border border-l-0 bg-background shadow-sm hover:bg-muted md:flex"
            aria-label="Skrýt panel"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Global search button (fixed, top-right) */}
        <button
          onClick={() => setSearchOpen(true)}
          className="fixed right-4 top-4 z-30 flex items-center gap-2 rounded-lg border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur hover:bg-background hover:text-foreground"
          aria-label="Globální vyhledávání"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Hledat</span>
          <kbd className="hidden rounded border bg-muted px-1 py-0.5 text-[10px] sm:inline">
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
