"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Star,
  Pencil,
  LayoutDashboard,
  Table2,
  Receipt,
  Clock,
  Users,
  CalendarRange,
  CalendarClock,
  MapPin,
  FileText,
  History,
} from "lucide-react";
import { useAppStore, type TabId } from "@/lib/store";
import type { Project } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProjectDialog } from "@/components/project-dialog";
import { PrintReportDialog } from "@/components/print-report-dialog";
import { AuditLogDialog } from "@/components/audit-log-dialog";
import { DashboardTab } from "@/components/tabs/dashboard-tab";
import { BudgetTab } from "@/components/tabs/budget-tab";
import { PaymentsTab } from "@/components/tabs/payments-tab";
import { TimeTab } from "@/components/tabs/time-tab";
import { ContactsTab } from "@/components/tabs/contacts-tab";
import { TimelineTab } from "@/components/tabs/timeline-tab";
import { NotesTab } from "@/components/tabs/notes-tab";
import { formatDate, daysUntilLabel } from "@/lib/format";
import { useUpdateProject } from "@/lib/api";
import { toast } from "sonner";

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "dashboard", label: "Přehled", icon: LayoutDashboard },
  { id: "budget", label: "Rozpočet", icon: Table2 },
  { id: "payments", label: "Platby", icon: Receipt },
  { id: "time", label: "Čas", icon: Clock },
  { id: "contacts", label: "Kontakty", icon: Users },
  { id: "timeline", label: "Časová osa", icon: CalendarRange },
  { id: "notes", label: "Poznámky", icon: FileText },
];

const STATUS_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  active: {
    label: "Aktivní",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  planning: {
    label: "Plánování",
    color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  completed: {
    label: "Dokončeno",
    color: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300",
    dot: "bg-zinc-400",
  },
  paused: {
    label: "Pozastaveno",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    dot: "bg-amber-500",
  },
};

export function ProjectDetail({ project }: { project: Project }) {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const [editOpen, setEditOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const updateProject = useUpdateProject(project.id);
  const qc = useQueryClient();

  const status = STATUS_LABELS[project.status] ?? STATUS_LABELS.active;
  const deadline = daysUntilLabel(project.endDate);
  const started = daysUntilLabel(project.startDate);

  const toggleStar = async () => {
    try {
      await updateProject.mutateAsync({ starred: !project.starred });
      toast.success(project.starred ? "Ohvězdičkování zrušeno" : "Projekt ohvězdičkován");
    } catch {
      toast.error("Nepodařilo se upravit projekt");
    }
  };

  const deadlineToneColor: Record<string, string> = {
    past: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900",
    today: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
    soon: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
    future: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900",
    none: "",
  };

  // === Prefetch on hover ===
  // When the user hovers a tab button, eagerly fetch the data for that tab
  // so the switch is instant. `prefetchQuery` is a no-op if the query is
  // already cached or in flight, so it's safe to call repeatedly.
  const prefetchTab = (tabId: TabId) => {
    const pid = project.id;
    switch (tabId) {
      case "dashboard":
        qc.prefetchQuery({
          queryKey: ["dashboard", pid],
          queryFn: async () => {
            const res = await fetch(`/api/projects/${pid}/dashboard`);
            if (!res.ok) throw new Error("Failed to load dashboard");
            return res.json();
          },
        });
        break;
      case "budget":
        qc.prefetchQuery({
          queryKey: ["budget", pid],
          queryFn: async () => {
            const res = await fetch(`/api/projects/${pid}/budget`);
            if (!res.ok) throw new Error("Failed to load budget");
            return res.json();
          },
        });
        break;
      case "payments":
        qc.prefetchQuery({
          queryKey: ["payments", pid],
          queryFn: async () => {
            const res = await fetch(`/api/projects/${pid}/payments`);
            if (!res.ok) throw new Error("Failed to load payments");
            return res.json();
          },
        });
        break;
      case "time":
        qc.prefetchQuery({
          queryKey: ["time", pid],
          queryFn: async () => {
            const res = await fetch(`/api/projects/${pid}/time`);
            if (!res.ok) throw new Error("Failed to load time entries");
            return res.json();
          },
        });
        break;
      case "contacts":
        qc.prefetchQuery({
          queryKey: ["contacts", pid],
          queryFn: async () => {
            const res = await fetch(`/api/projects/${pid}/contacts`);
            if (!res.ok) throw new Error("Failed to load contacts");
            return res.json();
          },
        });
        break;
      case "timeline":
        // Timeline tab uses the dashboard aggregate, so prefetch it.
        qc.prefetchQuery({
          queryKey: ["dashboard", pid],
          queryFn: async () => {
            const res = await fetch(`/api/projects/${pid}/dashboard`);
            if (!res.ok) throw new Error("Failed to load dashboard");
            return res.json();
          },
        });
        break;
      case "notes":
        // Notes tab reads from the projects list (already loaded globally).
        // No extra prefetch needed.
        break;
    }
  };

  // === Background prefetch when Dashboard loads ===
  // While the user is on the Dashboard, warm up the budget items and
  // payments queries in the background so the most likely next tab switches
  // (Budget / Payments) feel instant.
  useEffect(() => {
    if (activeTab !== "dashboard") return;
    const pid = project.id;
    qc.prefetchQuery({
      queryKey: ["budget", pid],
      queryFn: async () => {
        const res = await fetch(`/api/projects/${pid}/budget`);
        if (!res.ok) throw new Error("Failed to load budget");
        return res.json();
      },
    });
    qc.prefetchQuery({
      queryKey: ["payments", pid],
      queryFn: async () => {
        const res = await fetch(`/api/projects/${pid}/payments`);
        if (!res.ok) throw new Error("Failed to load payments");
        return res.json();
      },
    });
  }, [activeTab, project.id, qc]);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Project header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="px-4 pt-4 pb-0 md:px-6">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2 md:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight md:text-2xl">
                  {project.name}
                </h2>
                <button
                  onClick={toggleStar}
                  className="rounded-md p-1 hover:bg-muted"
                  aria-label="Ohvězdičkovat"
                >
                  <Star
                    className={cn(
                      "h-4 w-4 transition-colors",
                      project.starred
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/50 hover:text-amber-400",
                    )}
                  />
                </button>
                <Badge variant="secondary" className={cn("gap-1", status.color)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
                  {status.label}
                </Badge>
                {deadline.tone !== "none" && (
                  <Badge
                    variant="outline"
                    className={cn("gap-1 border", deadlineToneColor[deadline.tone])}
                  >
                    <CalendarClock className="h-3 w-3" />
                    {deadline.text}
                  </Badge>
                )}
              </div>

              {/* Subtitle: address */}
              {(project.address || project.description) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  {project.address && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {project.address}
                    </span>
                  )}
                  {project.description && (
                    <span className="text-xs text-muted-foreground/80 line-clamp-1">
                      {project.description}
                    </span>
                  )}
                </div>
              )}

              {/* Stats strip */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-2.5 text-xs md:gap-x-5 md:gap-y-2 md:pt-3">
                {project.startDate && (
                  <div className="flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Zahájení</span>
                    <strong className="font-semibold">{formatDate(project.startDate)}</strong>
                    {started.tone !== "none" && started.days! < 0 && (
                      <span className="text-muted-foreground/60">({started.text})</span>
                    )}
                  </div>
                )}
                {project.endDate && (
                  <div className="flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Dokončení</span>
                    <strong className="font-semibold">{formatDate(project.endDate)}</strong>
                  </div>
                )}
                {project._count && (
                  <>
                    <div className="flex items-center gap-1.5">
                      <Table2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <strong className="font-semibold">{project._count.budgetItems}</strong>
                      <span className="text-muted-foreground">položek</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <strong className="font-semibold">{project._count.contacts}</strong>
                      <span className="text-muted-foreground">kontaktů</span>
                    </div>
                  </>
                )}
                {project.stats && (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Čerpání</span>
                      <strong className={cn(
                        "font-semibold",
                        project.stats.burnRate > 100 ? "text-rose-600" : project.stats.burnRate > 80 ? "text-amber-600" : "text-emerald-600",
                      )}>
                        {project.stats.burnRate.toFixed(0)}%
                      </strong>
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            project.stats.burnRate > 100 ? "bg-rose-500" : project.stats.burnRate > 80 ? "bg-amber-500" : "bg-emerald-500",
                          )}
                          style={{ width: `${Math.min(project.stats.burnRate, 100)}%` }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5 md:gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAuditOpen(true)}
                className="no-print px-2 md:px-3"
                title="Historie změn"
              >
                <History className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReportOpen(true)}
                className="no-print px-2 md:px-3"
              >
                <FileText className="h-3.5 w-3.5" />
                <span className="ml-1.5 hidden md:inline">Report</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="px-2 md:px-3">
                <Pencil className="h-3.5 w-3.5" />
                <span className="ml-1.5 hidden md:inline">Upravit</span>
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <nav className="scrollbar-none mt-3 flex gap-1 overflow-x-auto border-b md:mt-4">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  onMouseEnter={() => prefetchTab(tab.id)}
                  onFocus={() => prefetchTab(tab.id)}
                  className={cn(
                    "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors md:gap-2 md:px-4",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {isActive && (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Tab content */}
      <div className="flex-1 px-4 py-4 md:px-6 md:py-6">
        {activeTab === "dashboard" && <DashboardTab projectId={project.id} />}
        {activeTab === "budget" && <BudgetTab projectId={project.id} />}
        {activeTab === "payments" && <PaymentsTab projectId={project.id} />}
        {activeTab === "time" && <TimeTab projectId={project.id} />}
        {activeTab === "contacts" && <ContactsTab projectId={project.id} />}
        {activeTab === "timeline" && <TimelineTab projectId={project.id} />}
        {activeTab === "notes" && <NotesTab projectId={project.id} />}
      </div>

      <ProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
      />
      <PrintReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        projectId={project.id}
        projectName={project.name}
      />
      <AuditLogDialog
        open={auditOpen}
        onOpenChange={setAuditOpen}
        projectId={project.id}
      />
    </div>
  );
}
