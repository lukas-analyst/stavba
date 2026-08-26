"use client";

import { useState } from "react";
import {
  Star,
  Pencil,
  LayoutDashboard,
  Table2,
  Receipt,
  Clock,
  Users,
  CalendarRange,
} from "lucide-react";
import { useAppStore, type TabId } from "@/lib/store";
import type { Project } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProjectDialog } from "@/components/project-dialog";
import { DashboardTab } from "@/components/tabs/dashboard-tab";
import { BudgetTab } from "@/components/tabs/budget-tab";
import { PaymentsTab } from "@/components/tabs/payments-tab";
import { TimeTab } from "@/components/tabs/time-tab";
import { ContactsTab } from "@/components/tabs/contacts-tab";
import { TimelineTab } from "@/components/tabs/timeline-tab";
import { formatDate } from "@/lib/format";
import { useUpdateProject } from "@/lib/api";
import { toast } from "sonner";

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "dashboard", label: "Přehled", icon: LayoutDashboard },
  { id: "budget", label: "Rozpočet", icon: Table2 },
  { id: "payments", label: "Platby", icon: Receipt },
  { id: "time", label: "Čas", icon: Clock },
  { id: "contacts", label: "Kontakty", icon: Users },
  { id: "timeline", label: "Časová osa", icon: CalendarRange },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Aktivní", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  planning: { label: "Plánování", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  completed: { label: "Dokončeno", color: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300" },
  paused: { label: "Pozastaveno", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
};

export function ProjectDetail({ project }: { project: Project }) {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const [editOpen, setEditOpen] = useState(false);
  const updateProject = useUpdateProject(project.id);

  const status = STATUS_LABELS[project.status] ?? STATUS_LABELS.active;

  const toggleStar = async () => {
    try {
      await updateProject.mutateAsync({ starred: !project.starred });
      toast.success(project.starred ? "Ohvězdičkování zrušeno" : "Projekt ohvězdičkován");
    } catch {
      toast.error("Nepodařilo se upravit projekt");
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* Project header */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-2xl font-bold tracking-tight">
                  {project.name}
                </h2>
                <button
                  onClick={toggleStar}
                  className="rounded-md p-1 hover:bg-muted"
                  aria-label="Ohvězdičkovat"
                >
                  <Star
                    className={cn(
                      "h-5 w-5 transition-colors",
                      project.starred
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground",
                    )}
                  />
                </button>
                <Badge variant="secondary" className={status.color}>
                  {status.label}
                </Badge>
              </div>
              {project.address && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {project.address}
                </p>
              )}
              {project.description && (
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  {project.description}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {project.startDate && (
                  <span>
                    Zahájení:{" "}
                    <strong className="text-foreground">
                      {formatDate(project.startDate)}
                    </strong>
                  </span>
                )}
                {project.endDate && (
                  <span>
                    Dokončení:{" "}
                    <strong className="text-foreground">
                      {formatDate(project.endDate)}
                    </strong>
                  </span>
                )}
                {project._count && (
                  <span>
                    {project._count.budgetItems} položek ·{" "}
                    {project._count.contacts} kontaktů
                  </span>
                )}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Upravit
            </Button>
          </div>

          {/* Tabs */}
          <nav className="mt-4 flex gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Tab content */}
      <div className="flex-1 px-6 py-6">
        {activeTab === "dashboard" && <DashboardTab projectId={project.id} />}
        {activeTab === "budget" && <BudgetTab projectId={project.id} />}
        {activeTab === "payments" && <PaymentsTab projectId={project.id} />}
        {activeTab === "time" && <TimeTab projectId={project.id} />}
        {activeTab === "contacts" && <ContactsTab projectId={project.id} />}
        {activeTab === "timeline" && <TimelineTab projectId={project.id} />}
      </div>

      <ProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
      />
    </div>
  );
}
