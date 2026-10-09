"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Menu,
  ChevronDown,
  Search,
  User,
  Star,
  Plus,
  Check,
} from "lucide-react";
import { useProjects } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

export function TopBar() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const setSelectedProjectId = useAppStore((s) => s.setSelectedProjectId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const { data: projects } = useProjects();
  const qc = useQueryClient();

  const [projectOpen, setProjectOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

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
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-1.5 border-b bg-background px-2 sm:px-3">
        {/* Hamburger — same position mobile + desktop */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? "Zavřít panel" : "Otevřít panel"}
          className="h-9 w-9 shrink-0"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Project dropdown */}
        <Popover open={projectOpen} onOpenChange={setProjectOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className="h-9 gap-1.5 px-2.5 text-sm font-semibold"
            >
              <span className="max-w-[120px] truncate sm:max-w-[180px]">
                {selectedProject ? selectedProject.name : "Vyberte projekt"}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
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
                    <div className="h-px bg-border" aria-hidden />
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

            {/* Add project */}
            <div className="border-t p-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
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

        {/* Search button — opens global search (⌘K) */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setGlobalSearchOpen(true)}
          aria-label="Hledat"
          className="h-9 w-9 shrink-0"
        >
          <Search className="h-4 w-4" />
        </Button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Budget summary — clickable to Přehled */}
        {selectedProject && planTotal > 0 && (
          <button
            onClick={() => setActiveTab("dashboard")}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs hover:bg-muted"
            title={`Čerpání: ${formatCzk(actualTotal)} z ${formatCzk(planTotal)}`}
          >
            <span className="hidden tabular-nums text-muted-foreground sm:inline">
              {formatCzk(actualTotal)} / {formatCzk(planTotal)}
            </span>
            <span className="tabular-nums font-semibold sm:hidden">
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

        {/* Auth placeholder — feature flag via constant */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label="Účet"
          title="Přihlášení (brzy)"
          onClick={() => toast.info("Přihlášení bude brzy dostupné")}
        >
          <User className="h-5 w-5" />
        </Button>
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

// ===== Project dropdown item =====
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
      className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/60"
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
        className="shrink-0 rounded p-0.5 hover:bg-muted"
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
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
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
