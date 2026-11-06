"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Download,
  Upload,
  Copy,
  Trash2,
  AlertTriangle,
  History,
  FileDown,
  FileSpreadsheet,
  ChevronDown,
  Loader2,
} from "lucide-react";
import {
  useProjects,
  useBudgetItems,
  useProjectMembers,
  useUpdateProject,
  useExportState,
  useImportState,
  useExportCsv,
} from "@/lib/api";
import { computeUserRole, type ProjectRole } from "@/lib/roles";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PdfExportDialog } from "@/components/pdf-export-dialog";
import { ProjectInfoCard } from "./management/project-info-card";
import { PropertyMetadataCard } from "./management/property-metadata-card";
import { SharingSection } from "./management/sharing-section";
import { EnhancedAuditLog } from "./management/enhanced-audit-log";
import { DeleteProjectButton } from "./management/delete-project-button";

// ============================================================
// ProjectManagementTab — full project management page
// ------------------------------------------------------------
// Sub-components have been extracted into ./management/* to keep this
// file focused on layout + state wiring. See:
//   - management/project-info-card.tsx      (ProjectInfoCard)
//   - management/property-metadata-card.tsx (PropertyMetadataCard + PropertyMetadataItem + isValidUrl)
//   - management/sharing-section.tsx        (SharingSection)
//   - management/enhanced-audit-log.tsx    (EnhancedAuditLog + describeChange + formatTimestamp)
//   - management/delete-project-button.tsx (DeleteProjectButton)
//   - management/qr-code.tsx                (QrCode — used by SharingSection)
//   - management/types.ts                  (shared types: invitation status, audit entry, etc.)
// ============================================================

export function ProjectManagementTab({ projectId }: { projectId: string }) {
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: budgetItems } = useBudgetItems(projectId);
  const updateProject = useUpdateProject(projectId);
  const t = useTranslations("tabs.management");
  const tCommon = useTranslations("common");
  const [pdfExportOpen, setPdfExportOpen] = useState(false);

  // Role-based UI: fetch the current user (session) + project members so we
  // can resolve the user's role within this project. Admins/owners get the
  // full edit affordances; editors get a read-only info card + limited
  // member-adding (only viewer/editor roles); viewers never reach this tab
  // (the sidebar filters it out via `minRole: "editor"`).
  const { data: session } = useSession();
  const { data: membersData } = useProjectMembers(projectId);

  const project = useMemo(
    () => projects?.find((p) => p.id === projectId),
    [projects, projectId],
  );

  const userRole = useMemo<ProjectRole>(
    () =>
      computeUserRole({
        session,
        projectId,
        project,
        members: membersData?.members,
      }),
    [session, projectId, project, membersData],
  );

  // Convenience booleans derived from `userRole`. Used to gate specific UI
  // affordances without spreading role comparisons across every JSX branch.
  const isOwner = userRole === "owner";
  const isAdmin = userRole === "admin";
  const canEditProject = isOwner || isAdmin;
  // Admin can delete their OWN projects (they are the owner), but not
  // projects they only have admin access to. The API also enforces this
  // via `project.ownerId === user.id` check.
  const canDeleteProject = isOwner || (isAdmin && project?.ownerId === (session?.user as { id?: string })?.id);

  // Export / Import hooks — drive the "Data a exporty" card.
  // - useExportState() downloads the whole project state as JSON
  // - useImportState(file) restores it (owner/admin only)
  // - useExportCsv(projectId) downloads a per-section CSV (budget /
  //   payments / time / contacts). All three are react-query mutations
  //   already wired in `src/lib/api.ts`.
  const exportState = useExportState();
  const importState = useImportState();
  const exportCsv = useExportCsv(projectId);

  if (projectsLoading || !project) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  // === "Data a exporty" handlers ===
  // Trigger downloads via the mutation hooks. The mutation itself resolves
  // the blob + filename and triggers a browser download (see
  // `useExportState` / `useExportCsv` in `src/lib/api.ts`).
  const handleExport = async () => {
    try {
      await exportState.mutateAsync();
      toast.success(t("data.toasts.exportSuccess"));
    } catch {
      toast.error(t("data.toasts.exportError"));
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importState.mutateAsync(file);
      toast.success(t("data.toasts.importSuccess"));
    } catch {
      toast.error(t("data.toasts.importError"));
    }
    // Reset the input value so the same file can be selected again.
    e.target.value = "";
  };

  const handleCsv = async (type: "budget" | "payments" | "time" | "contacts") => {
    try {
      await exportCsv.mutateAsync(type);
      toast.success(t("data.toasts.csvSuccess", { type }));
    } catch {
      toast.error(t("data.toasts.csvError"));
    }
  };

  // === Dialog openers ===
  // PdfExportDialog is mounted inline below. ProjectDialog and AuditLogDialog
  // are dispatched via window events (refactor to Zustand is planned but
  // deferred). The redundant "Upravit projekt" and "Historie změn" buttons
  // have been removed — inline edit is in ProjectInfoCard, audit log is
  // rendered inline below.

  const handleDuplicate = async () => {
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${project.name}${t("danger.duplicate.suffix")}`,
          address: project.address,
          description: project.description,
          status: "planning",
          startDate: project.startDate,
          endDate: project.endDate,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to duplicate project");
      }
      const newProject = await res.json();
      if (budgetItems && budgetItems.length > 0) {
        await Promise.all(
          budgetItems.map((item) =>
            fetch(`/api/projects/${newProject.id}/budget`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                category: item.category,
                subcategory: item.subcategory,
                phase: item.phase,
                required: item.required,
                planCost: item.planCost,
                flexibilityPercent: item.flexibilityPercent,
                planDays: item.planDays,
              }),
            }),
          ),
        );
      }
      toast.success(t("danger.toasts.duplicateSuccess", { name: newProject.name }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("danger.toasts.duplicateError"));
    }
  };

  return (
    <>
    <div id="management-root" className="space-y-6">
      {/* ===== Project Info Card — inline editable for owner/admin,
          read-only display for editors ===== */}
      <ProjectInfoCard
        project={project}
        updateProject={updateProject}
        readOnly={!canEditProject}
        userRole={userRole}
      />

      {/* ===== Property Metadata Card — volitelná metadata
          o nemovitosti (adresa, energetika, dokumentace).
          Owner/admin může editovat inline; editor/viewer read-only. ===== */}
      <PropertyMetadataCard
        project={project}
        updateProject={updateProject}
        readOnly={!canEditProject}
      />

      {/* ===== Sharing & Permissions ===== */}
      <SharingSection
        projectId={projectId}
        projectSlug={project.slug}
        projectName={project.name}
        isPublic={project.isPublic}
        isOwner={isOwner}
        isAdmin={isAdmin}
        userRole={userRole}
        currentUserId={(session?.user as { id?: string } | undefined)?.id ?? null}
      />

      {/* ===== Data a exporty =====
          Centralizované akce pro správu dat projektu — report PDF,
          JSON/CSV exporty a (owner/admin) import JSON.
          Refaktorováno: 9 tlačítek → 2 viditelná + 1 dropdown menu.
          Redundantní „Upravit projekt" a „Historie změn" odstraněny
          (inline edit je v ProjectInfoCard, audit log je níže). */}
      <Card className="bg-surface-container-low shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 type-title-lg">
            <Download className="h-4 w-4 text-primary" />
            {t("data.title")}
          </CardTitle>
          <CardDescription className="mt-1 type-body text-on-surface-variant">
            {t("data.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* Export dropdown — replaces 6 buttons (PDF + JSON + 4× CSV) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="gap-2"
                  disabled={
                    exportState.isPending ||
                    exportCsv.isPending
                  }
                >
                  {exportState.isPending || exportCsv.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {t("data.export.button")}
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {/* Report PDF */}
                <DropdownMenuItem onClick={() => setPdfExportOpen(true)}>
                  <FileDown className="h-3.5 w-3.5" />
                  {t("button.exportPdf")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* JSON export */}
                <DropdownMenuItem onClick={handleExport}>
                  <Download className="h-3.5 w-3.5" />
                  {t("data.export.json")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* CSV exports */}
                <DropdownMenuItem onClick={() => handleCsv("budget")}>
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {t("data.csv.budget")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCsv("payments")}>
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {t("data.csv.payments")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCsv("time")}>
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {t("data.csv.time")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCsv("contacts")}>
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {t("data.csv.contacts")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Import JSON — owner / admin only, separate button for clarity */}
            {canEditProject && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={importState.isPending}
                onClick={() =>
                  document.getElementById("import-json-input")?.click()
                }
              >
                {importState.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {t("data.export.import")}
              </Button>
            )}

            {/* Hidden file input for JSON import */}
            <input
              id="import-json-input"
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImport}
            />
          </div>
        </CardContent>
      </Card>

      {/* ===== Enhanced Audit Log ===== */}
      <Card className="bg-surface-container-low shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 type-title-lg">
            <History className="h-4 w-4 text-primary" />
            {t("audit.title")}
          </CardTitle>
          <CardDescription className="mt-1 type-body text-on-surface-variant">{t("audit.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <EnhancedAuditLog projectId={projectId} />
        </CardContent>
      </Card>

      {/* ===== Danger Zone ===== */}
      <Card className="border-danger/20 bg-surface-container-low shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 type-title-lg text-danger">
            <AlertTriangle className="h-4 w-4" />
            {t("danger.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Duplicate — available to every role that can see this tab
              (editor / owner / admin). Creates a fresh project owned by
              the current user, copying the budget items. */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <div className="flex items-center gap-2">
              <Copy className="h-4 w-4 text-info" />
              <div>
                <div className="type-body font-medium">{t("danger.duplicate.title")}</div>
                <div className="type-label text-on-surface-variant">{t("danger.duplicate.description")}</div>
              </div>
            </div>
            <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={handleDuplicate}>
              <Copy className="h-3.5 w-3.5" /> {t("danger.duplicate.button")}
            </Button>
          </div>
          {/* Delete — owner only. Admins see everything but can't delete
              projects they don't own (defense-in-depth: API also enforces
              this via comparison of `project.ownerId === user.id`). Editors
              are intentionally shown a muted "owner-only" hint instead of
              a button so they understand why the action is unavailable. */}
          {canDeleteProject ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft/10 p-3">
              <div className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-danger" />
                <div>
                  <div className="type-body font-medium">{t("danger.delete.title")}</div>
                  <div className="type-label text-on-surface-variant">{t("danger.delete.description")}</div>
                </div>
              </div>
              <DeleteProjectButton projectId={projectId} projectName={project.name} />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="type-body font-medium">{t("danger.delete.title")}</div>
                  <div className="type-label text-muted-foreground">
                    {isAdmin
                      ? t("danger.delete.adminOnlyHint")
                      : t("danger.delete.editorHint")}
                  </div>
                </div>
              </div>
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
      {/* PDF Export Dialog */}
      {project && (
        <PdfExportDialog
          open={pdfExportOpen}
          onOpenChange={setPdfExportOpen}
          projectId={projectId}
          projectName={project.name}
        />
      )}
    </>
  );
}
