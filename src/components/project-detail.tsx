"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore, type TabId } from "@/lib/store";
import type { Project } from "@/lib/api";
import { ProjectDialog } from "@/components/project-dialog";
import { PrintReportDialog } from "@/components/print-report-dialog";
import { AuditLogDialog } from "@/components/audit-log-dialog";
import { usePageViewTracking } from "@/hooks/use-analytics";

// ===== Code splitting per tab =====
// Each tab is loaded lazily (only when the user navigates to it).
// This reduces the initial JS bundle by ~200-400 KB (Budget tab alone is
// ~80KB, Payments ~70KB, Dashboard with charts ~150KB).
const DashboardTab = dynamic(() => import("@/components/tabs/dashboard-tab").then(m => m.DashboardTab), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const DashboardTestTab = dynamic(() => import("@/components/tabs/dashboard-test-tab").then(m => m.DashboardTestTab), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const BudgetTab = dynamic(() => import("@/components/tabs/budget-tab").then(m => m.DndBudgetTab), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const PaymentsTab = dynamic(() => import("@/components/tabs/payments-tab").then(m => m.PaymentsTab), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const TimeTab = dynamic(() => import("@/components/tabs/time-tab").then(m => m.TimeTab), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const ContactsTab = dynamic(() => import("@/components/tabs/contacts-tab").then(m => m.ContactsTab), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const TimelineTab = dynamic(() => import("@/components/tabs/timeline-tab").then(m => m.TimelineTab), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const NotesTab = dynamic(() => import("@/components/tabs/notes-tab").then(m => m.NotesTab), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const ProjectManagementTab = dynamic(() => import("@/components/tabs/project-management-tab").then(m => m.ProjectManagementTab), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const TelemetryTab = dynamic(() => import("@/components/tabs/telemetry-tab").then(m => m.TelemetryTab), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const AdminTab = dynamic(() => import("@/components/tabs/admin-tab").then(m => m.AdminTab), {
  ssr: false,
  loading: () => <TabSkeleton />,
});

function TabSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-9 w-full animate-pulse rounded-md bg-muted/50" />
      <div className="h-64 w-full animate-pulse rounded-md bg-muted/40" />
      <div className="h-9 w-2/3 animate-pulse rounded-md bg-muted/30" />
    </div>
  );
}

// ===== ProjectDetail — tab content container + dialogs =====
// The project header has been moved to the TopBar (project dropdown +
// budget summary). The tab navigation has been moved to the AppSidebar.
// This component renders only the active tab's content + manages the
// project edit/report/audit dialogs (triggered from Settings menu).
export function ProjectDetail({ project }: { project: Project }) {
  const activeTab = useAppStore((s) => s.activeTab);
  const [editOpen, setEditOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const qc = useQueryClient();

  // === Analytics: track page_view + timeSpent for the current tab ===
  // Each tab is treated as a "page" for analytics purposes. When the user
  // switches tabs, we record a new page_view with the tab name as pageUrl
  // and emit the timeSpent (in seconds) for the previous tab.
  usePageViewTracking(activeTab, project.id);

  // Listen for custom events from sidebar Settings menu
  useEffect(() => {
    const openAudit = () => setAuditOpen(true);
    const openReport = () => setReportOpen(true);
    const openEdit = () => setEditOpen(true);
    window.addEventListener("stavba:open-audit", openAudit);
    window.addEventListener("stavba:open-report", openReport);
    window.addEventListener("stavba:open-edit", openEdit);
    return () => {
      window.removeEventListener("stavba:open-audit", openAudit);
      window.removeEventListener("stavba:open-report", openReport);
      window.removeEventListener("stavba:open-edit", openEdit);
    };
  }, []);

  // === Prefetch on hover ===
  // When the user hovers a nav button in the sidebar, eagerly fetch the
  // data for that tab so the switch is instant.
  useEffect(() => {
    const prefetchTab = (tabId: TabId) => {
      const pid = project.id;
      switch (tabId) {
        case "dashboard":
        case "dashboard-test":
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
          qc.prefetchQuery({
            queryKey: ["dashboard", pid],
            queryFn: async () => {
              const res = await fetch(`/api/projects/${pid}/dashboard`);
              if (!res.ok) throw new Error("Failed to load dashboard");
              return res.json();
            },
          });
          break;
      }
    };

    // Listen for prefetch requests from sidebar
    const prefetchHandler = (e: Event) => {
      const tabId = (e as CustomEvent<TabId>).detail;
      prefetchTab(tabId);
    };
    window.addEventListener("stavba:prefetch-tab", prefetchHandler);
    return () => window.removeEventListener("stavba:prefetch-tab", prefetchHandler);
  }, [project.id, qc]);

  // === Background prefetch when Dashboard loads ===
  useEffect(() => {
    if (activeTab !== "dashboard" && activeTab !== "dashboard-test") return;
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
    <>
      {/* Tab content */}
      <div id="tab-content" className="flex-1 px-4 py-4 md:px-6 md:py-6">
        {activeTab === "dashboard" && <DashboardTab projectId={project.id} />}
        {activeTab === "dashboard-test" && <DashboardTestTab projectId={project.id} />}
        {activeTab === "budget" && <BudgetTab projectId={project.id} />}
        {activeTab === "payments" && <PaymentsTab projectId={project.id} />}
        {activeTab === "time" && <TimeTab projectId={project.id} />}
        {activeTab === "contacts" && <ContactsTab projectId={project.id} />}
        {activeTab === "timeline" && <TimelineTab projectId={project.id} />}
        {activeTab === "notes" && <NotesTab projectId={project.id} />}
        {activeTab === "management" && <ProjectManagementTab projectId={project.id} />}
        {activeTab === "telemetry" && <TelemetryTab projectId={project.id} />}
        {activeTab === "admin" && <AdminTab />}
      </div>

      {/* Dialogs — triggered from Settings menu in sidebar */}
      <ProjectDialog open={editOpen} onOpenChange={setEditOpen} project={project} />
      <PrintReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        projectId={project.id}
        projectName={project.name}
      />
      <AuditLogDialog open={auditOpen} onOpenChange={setAuditOpen} projectId={project.id} />
    </>
  );
}
