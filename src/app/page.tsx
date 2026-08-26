"use client";

import { useEffect } from "react";
import { useProjects } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { AppSidebar } from "@/components/app-sidebar";
import { ProjectDetail } from "@/components/project-detail";
import { EmptyState } from "@/components/empty-state";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { data: projects, isLoading } = useProjects();
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const setSelectedProject = useAppStore((s) => s.setSelectedProject);

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
      <AppSidebar />
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
  );
}
