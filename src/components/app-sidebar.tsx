"use client";

import { Star, Plus, Home, Trash2, Loader2, Building2, Download, Upload, Search, X } from "lucide-react";
import { useProjects, useDeleteProject, useUpdateProject, useExportState, useImportState, useDashboard } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCzk } from "@/lib/format";
import { useMemo, useRef, useState } from "react";
import { ProjectDialog } from "@/components/project-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Aktivní", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  planning: { label: "Plánování", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  completed: { label: "Dokončeno", color: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300" },
  paused: { label: "Pozastaveno", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
};

export function AppSidebar() {
  const qc = useQueryClient();
  const { data: projects, isLoading } = useProjects();
  const deleteProject = useDeleteProject();
  const exportState = useExportState();
  const importState = useImportState();
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const setSelectedProject = useAppStore((s) => s.setSelectedProject);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleStar = async (projectId: string, starred: boolean) => {
    // optimistic: directly call API then refetch
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred }),
      });
      qc.invalidateQueries({ queryKey: ["projects"] });
    } catch {
      toast.error("Nepodařilo se upravit hvězdičku");
    }
  };

  const sortedProjects = useMemo(() => {
    const filtered = (projects ?? []).filter((p) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.address ?? "").toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
      );
    });
    return filtered.sort((a, b) => {
      if (a.starred !== b.starred) return a.starred ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [projects, search]);

  const projectToDelete = projects?.find((p) => p.id === deleteId);
  const selectedProject = projects?.find((p) => p.id === selectedProjectId);

  const handleImport = async (file: File) => {
    try {
      const result = await importState.mutateAsync(file);
      toast.success(
        `Import hotový: ${result.projects ?? 0} projektů, ${result.budgetItems ?? 0} položek, ${result.payments ?? 0} plateb`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import selhal");
    }
  };

  return (
    <aside className="flex w-80 flex-col border-r bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Home className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-base font-bold leading-tight">Stavba</h1>
          <p className="text-[11px] text-muted-foreground leading-tight">
            Rozpočet · Čas · Materiál
          </p>
        </div>
        <ThemeToggle />
      </div>

      {/* Projects search + list header */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hledat projekt…"
            className="h-8 pl-8 pr-7 text-xs"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Vyčistit hledání"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Projekty ({sortedProjects.length}
            {search && (projects?.length ?? 0) !== sortedProjects.length
              ? `/${projects?.length ?? 0}`
              : ""})
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Přidat
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sortedProjects.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            {search ? (
              <>
                Žádné projekty neodpovídají „{search}".
                <br />
                <button
                  onClick={() => setSearch("")}
                  className="mt-1 text-primary hover:underline"
                >
                  Zrušit hledání
                </button>
              </>
            ) : (
              <>
                Zatím žádné projekty.
                <br />
                Klikněte na „Přidat".
              </>
            )}
          </div>
        ) : (
          <ul className="space-y-1">
            {sortedProjects.map((p) => {
              const isActive = p.id === selectedProjectId;
              const status = STATUS_LABELS[p.status] ?? STATUS_LABELS.active;
              return (
                <li key={p.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedProject(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedProject(p.id);
                      }
                    }}
                    className={cn(
                      "group relative flex w-full cursor-pointer flex-col gap-1 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors",
                      isActive
                        ? "border-border bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                        : "hover:bg-sidebar-accent/60",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Building2
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          isActive ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold">
                            {p.name}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStar(p.id, !p.starred);
                            }}
                            className="rounded p-0.5 hover:bg-muted"
                            aria-label={p.starred ? "Odebrat hvězdičku" : "Ohvězdičkovat"}
                          >
                            <Star
                              className={cn(
                                "h-3.5 w-3.5 shrink-0 transition-colors",
                                p.starred
                                  ? "fill-amber-400 text-amber-400"
                                  : "text-muted-foreground/40 hover:text-amber-400",
                              )}
                            />
                          </button>
                        </div>
                        {p.address && (
                          <p className="truncate text-[11px] text-muted-foreground">
                            {p.address}
                          </p>
                        )}
                      </div>
                    </div>
                    {p.stats && (
                      <div className="mt-1.5 flex items-center justify-between pl-6">
                        <span className="text-[11px] text-muted-foreground">
                          {formatCzk(p.stats.actualTotal)} / {formatCzk(p.stats.planTotal)}
                        </span>
                        <Badge
                          variant="secondary"
                          className={cn("h-4 px-1.5 text-[10px]", status.color)}
                        >
                          {status.label}
                        </Badge>
                      </div>
                    )}
                    {/* Burn rate progress bar */}
                    {p.stats && p.stats.planTotal > 0 && (
                      <div className="mt-1 pl-6">
                        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              p.stats.burnRate > 100
                                ? "bg-rose-500"
                                : p.stats.burnRate > 80
                                  ? "bg-amber-500"
                                  : "bg-emerald-500",
                            )}
                            style={{ width: `${Math.min(p.stats.burnRate, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {/* Delete button (appears on hover) */}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteId(p.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          setDeleteId(p.id);
                        }
                      }}
                      className="absolute right-1.5 top-1.5 hidden h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:flex"
                      aria-label="Smazat projekt"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Mini-stats for the selected project */}
      {selectedProject && (selectedProject.stats || selectedProject._count) && (
        <MiniProjectStats projectId={selectedProject.id} />
      )}

      {/* Footer with Export/Import */}
      <div className="border-t px-3 py-3">
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 flex-1 text-xs"
            disabled={exportState.isPending || (projects?.length ?? 0) === 0}
            onClick={async () => {
              try {
                await exportState.mutateAsync();
                toast.success("Stav exportován");
              } catch {
                toast.error("Export selhal");
              }
            }}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 flex-1 text-xs"
            disabled={importState.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Import
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = "";
            }}
          />
        </div>
        <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Data uložena lokálně · připraveno pro PostgreSQL
        </p>
      </div>

      <ProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Smazat projekt?</AlertDialogTitle>
            <AlertDialogDescription>
              Opravdu chcete smazat projekt{" "}
              <strong>{projectToDelete?.name}</strong>? Tím se trvale odstraní
              všechny položky rozpočtu, platby, časové záznamy a kontakty
              náležející k tomuto projektu. Tuto akci nelze vrátit zpět.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteId) return;
                try {
                  await deleteProject.mutateAsync(deleteId);
                  if (deleteId === selectedProjectId) {
                    setSelectedProject(null);
                  }
                  setDeleteId(null);
                  toast.success("Projekt byl smazán");
                } catch {
                  toast.error("Nepodařilo se smazat projekt");
                }
              }}
            >
              Smazat projekt
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

// ===== Mini project stats widget for the sidebar =====
function MiniProjectStats({ projectId }: { projectId: string }) {
  const { data } = useDashboard(projectId);

  if (!data) {
    return (
      <div className="border-t px-3 py-3">
        <div className="h-20 animate-pulse rounded-md bg-muted/50" />
      </div>
    );
  }

  const { totals } = data;
  const burnTone =
    totals.burnRate > 100
      ? "text-rose-600 bg-rose-500"
      : totals.burnRate > 80
        ? "text-amber-600 bg-amber-500"
        : "text-emerald-600 bg-emerald-500";
  const burnClass = burnTone.split(" ")[1];
  const completionPct =
    totals.itemCount > 0 ? (totals.completedCount / totals.itemCount) * 100 : 0;

  return (
    <div className="border-t px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Souhrn projektu
        </span>
      </div>
      <div className="space-y-2 rounded-lg border bg-muted/30 p-2.5">
        {/* Burn rate */}
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Čerpání rozpočtu</span>
            <span className={cn("font-semibold", burnTone.split(" ")[0])}>
              {totals.burnRate.toFixed(0)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", burnClass)}
              style={{ width: `${Math.min(totals.burnRate, 100)}%` }}
            />
          </div>
        </div>
        {/* Completion */}
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Dokončeno</span>
            <span className="font-semibold text-foreground">
              {totals.completedCount}/{totals.itemCount}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-teal-500 transition-all"
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </div>
        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
          <div className="rounded bg-background px-2 py-1">
            <div className="text-muted-foreground">Zbývá</div>
            <div
              className={cn(
                "font-bold",
                totals.remaining < 0 ? "text-rose-600" : "text-emerald-600",
              )}
            >
              {formatCzk(totals.remaining)}
            </div>
          </div>
          <div className="rounded bg-background px-2 py-1">
            <div className="text-muted-foreground">Ušetřeno</div>
            <div className="font-bold text-emerald-600">
              {formatCzk(totals.savedTotal)}
            </div>
          </div>
          <div className="rounded bg-background px-2 py-1">
            <div className="text-muted-foreground">Hodin</div>
            <div className="font-bold text-violet-600">
              {new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 }).format(totals.hoursTotal)} h
            </div>
          </div>
          <div className="rounded bg-background px-2 py-1">
            <div className="text-muted-foreground">Plán dní</div>
            <div className="font-bold text-sky-600">
              {new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 }).format(totals.daysPlanned)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
