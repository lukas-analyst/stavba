"use client";

import { useEffect, useState } from "react";
import { useProjects } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { AppSidebar } from "@/components/app-sidebar";
import { ProjectDetail } from "@/components/project-detail";
import { EmptyState } from "@/components/empty-state";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { Loader2, PanelLeftClose, PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Home() {
  const { data: projects, isLoading } = useProjects();
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const setSelectedProject = useAppStore((s) => s.setSelectedProject);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useKeyboardShortcuts();

  // Listen for sidebar toggle from keyboard shortcut
  useEffect(() => {
    const handler = () => setSidebarCollapsed((prev) => !prev);
    window.addEventListener("stavba:toggle-sidebar", handler);
    return () => window.removeEventListener("stavba:toggle-sidebar", handler);
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
  );
}
