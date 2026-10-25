"use client";

import { useState, useEffect, useCallback, useRef, useMemo, type ComponentType } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencySelect } from "@/components/ui/currency-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  MapPin,
  Calendar,
  Building2,
  Download,
  Copy,
  Trash2,
  AlertTriangle,
  Pencil,
  Check,
  X,
  Loader2,
  Crown,
  Eye,
  Edit3,
  UserPlus,
  Shield,
  Share2,
  History,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Info,
  Search,
  QrCode as QrCodeIcon,
  Link2,
  Lock,
  Mail,
  ExternalLink,
  Ruler,
  Layers,
  Flame,
  Gauge,
  FileText,
  StickyNote,
} from "lucide-react";
import {
  useProjects,
  useUpdateProject,
  useBudgetItems,
  useProjectMembers,
  useExportState,
  useImportState,
  useExportCsv,
} from "@/lib/api";
import { computeUserRole, type ProjectRole } from "@/lib/roles";
import { formatDate, STATUS_LABELS } from "@/lib/format";
import { getFieldValue } from "@/lib/audit-fields";
import { cn } from "@/lib/utils";
import { useAppStore, type TabId } from "@/lib/store";
import { useAnalytics } from "@/hooks/use-analytics";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";

// ============================================================
// ProjectManagementTab — full project management page
// ============================================================

export function ProjectManagementTab({ projectId }: { projectId: string }) {
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: budgetItems } = useBudgetItems(projectId);
  const updateProject = useUpdateProject(projectId);
  const t = useTranslations("tabs.management");
  const tCommon = useTranslations("common");

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
  // These are dispatch-only — the dialogs themselves are mounted in
  // `ProjectDetail` (`src/components/project-detail.tsx`), which listens
  // for `stavba:open-*` window events. We re-dispatch from here so the
  // buttons live next to the rest of the project management actions.
  const openEdit = () => window.dispatchEvent(new Event("stavba:open-edit"));
  const openReport = () => window.dispatchEvent(new Event("stavba:open-report"));
  const openAudit = () => window.dispatchEvent(new Event("stavba:open-audit"));

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
          Centralizované akce pro správu dat projektu — úprava projektu,
          report PDF, audit log, plus JSON/CSV exporty a (owner/admin)
          import JSON zpět do aplikace.
          - Akce "Upravit projekt" / "Report PDF" / "Historie změn"
            dispatchují window event, který naslouchá `ProjectDetail`
            (tam jsou namontované `ProjectDialog`, `PrintReportDialog`,
            `AuditLogDialog`).
          - Import JSON je omezen na owner/admin (matches the API
            endpoint `POST /api/import`, který vyžaduje admin session). */}
      <Card className="bg-surface-container-low shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Download className="h-4 w-4 text-primary" />
            {t("data.title")}
          </CardTitle>
          <CardDescription className="text-sm text-on-surface-variant">
            {t("data.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* === Projektové akce ===
              Tři hlavní akce dostupné z dřívějšího Settings menu v
              sidebaru — nyní sdružené tady pro lepší dostupnost. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={openEdit}
              disabled={!canEditProject}
            >
              <Pencil className="h-3.5 w-3.5" />
              {t("button.editProject")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={openReport}
            >
              <FileText className="h-3.5 w-3.5" />
              {t("button.reportPdf")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={openAudit}
            >
              <History className="h-3.5 w-3.5" />
              {t("button.auditHistory")}
            </Button>
          </div>

          {/* === Export dat ===
              JSON: kompletní stav aplikace (všechny projekty + data).
              CSV: per-section, aktuální projekt (budget / payments / time /
              contacts). Import JSON je owner/admin-only. */}
          <div className="space-y-2">
            <div className="type-label text-on-surface-variant">{t("data.export.label")}</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleExport}
                disabled={exportState.isPending}
              >
                {exportState.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {t("data.export.json")}
              </Button>
              {/* Import JSON — owner / admin only.
                  API (`POST /api/import`) requires admin session; we
                  mirror that gate on the client to avoid surfacing a
                  button that always 403s. */}
              {canEditProject && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={importState.isPending}
                  onClick={() => document.getElementById("import-json-input")?.click()}
                >
                  {importState.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5 rotate-180" />
                  )}
                  {t("data.export.import")}
                </Button>
              )}
              {/* Skrytý file input — klik na tlačítko nad otevře
                  nativní dialog výběru souboru. */}
              <input
                id="import-json-input"
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleImport}
              />
            </div>
          </div>

          {/* === CSV exporty per-section === */}
          <div className="space-y-2">
            <div className="type-label text-on-surface-variant">
              {t("data.csv.label")}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => handleCsv("budget")}
                disabled={exportCsv.isPending}
              >
                <FileText className="h-3.5 w-3.5" />
                {t("data.csv.budget")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => handleCsv("payments")}
                disabled={exportCsv.isPending}
              >
                <FileText className="h-3.5 w-3.5" />
                {t("data.csv.payments")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => handleCsv("time")}
                disabled={exportCsv.isPending}
              >
                <FileText className="h-3.5 w-3.5" />
                {t("data.csv.time")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => handleCsv("contacts")}
                disabled={exportCsv.isPending}
              >
                <FileText className="h-3.5 w-3.5" />
                {t("data.csv.contacts")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== Enhanced Audit Log ===== */}
      <Card className="bg-surface-container-low shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <History className="h-4 w-4 text-primary" />
            {t("audit.title")}
          </CardTitle>
          <CardDescription className="text-sm text-on-surface-variant">{t("audit.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <EnhancedAuditLog projectId={projectId} />
        </CardContent>
      </Card>

      {/* ===== Danger Zone ===== */}
      <Card className="border-danger/20 bg-surface-container-low shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold text-danger">
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
                  <div className="text-xs text-muted-foreground">
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
  );
}

// ============================================================
// ProjectInfoCard — inline editable project info
// ------------------------------------------------------------
// `readOnly=true` (editors) renders a fully text-only display:
//   - no inline edit toggle
//   - no inputs for name / description / address / status / dates
//   - metadata badges (address, dates, currency) still shown
// This matches the role spec: editors can SEE the project info but
// cannot modify it — they only get read-only access to the basic info.
// ============================================================
function ProjectInfoCard({
  project,
  updateProject,
  readOnly = false,
  userRole,
}: {
  project: NonNullable<ReturnType<typeof useProjects>["data"]>[number];
  updateProject: ReturnType<typeof useUpdateProject>;
  readOnly?: boolean;
  userRole: ProjectRole;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [address, setAddress] = useState(project.address ?? "");
  const [status, setStatus] = useState(project.status);
  const [currency, setCurrency] = useState(project.currency ?? "CZK");
  const [startDate, setStartDate] = useState(project.startDate ? project.startDate.substring(0, 10) : "");
  const [endDate, setEndDate] = useState(project.endDate ? project.endDate.substring(0, 10) : "");
  const t = useTranslations("tabs.management.info");
  const tStatuses = useTranslations("statuses");
  const tCommon = useTranslations("common");
  const tCurrency = useTranslations("currency");

  // B26: Keep the local form state in sync with the React Query cache.
  // `useState(project.name)` initializes once on mount and would
  // otherwise stay stale whenever another component updates the project
  // (or after our own save mutation invalidates the cache).
  //
  // We intentionally skip syncing while the user is actively editing so
  // their in-progress input isn't clobbered.
  //
  // Implementation: React's "storing information from previous renders"
  // pattern — calling setState during render (gated on a prop change)
  // lets React immediately re-render before painting. This is the
  // recommended alternative to `useEffect(() => setState(...), [deps])`
  // which triggers a cascading render and is flagged by ESLint's
  // `react-hooks/set-state-in-effect` rule.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const projectSyncKey = `${project.name}\u0000${project.description ?? ""}\u0000${project.address ?? ""}\u0000${project.status}\u0000${project.currency ?? "CZK"}\u0000${project.startDate ?? ""}\u0000${project.endDate ?? ""}`;
  const [lastSyncKey, setLastSyncKey] = useState(projectSyncKey);
  if (!editing && projectSyncKey !== lastSyncKey) {
    setLastSyncKey(projectSyncKey);
    setName(project.name);
    setDescription(project.description ?? "");
    setAddress(project.address ?? "");
    setStatus(project.status);
    setCurrency(project.currency ?? "CZK");
    setStartDate(project.startDate ? project.startDate.substring(0, 10) : "");
    setEndDate(project.endDate ? project.endDate.substring(0, 10) : "");
  }

  const handleSave = async () => {
    try {
      await updateProject.mutateAsync({
        name: name.trim() || project.name,
        description: description.trim() || null,
        address: address.trim() || null,
        status,
        currency,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      toast.success(t("toasts.saveSuccess"));
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.saveError"));
    }
  };

  const handleCancel = () => {
    setName(project.name);
    setDescription(project.description ?? "");
    setAddress(project.address ?? "");
    setStatus(project.status);
    setStartDate(project.startDate ? project.startDate.substring(0, 10) : "");
    setEndDate(project.endDate ? project.endDate.substring(0, 10) : "");
    setEditing(false);
  };

  const statusInfo = STATUS_LABELS[project.status] ?? STATUS_LABELS.active;
  const statusLabel = tStatuses(project.status);

  // Read-only mode (editor): no edit toggle, no inputs — pure text display.
  // The role badge (Editor badge) makes it obvious why edit affordances
  // are hidden.
  if (readOnly) {
    return (
      <Card className="bg-surface-container-low shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                {project.name}
                <Badge variant="outline" className={cn("text-xs", statusInfo.color)}>{statusLabel}</Badge>
                <Badge variant="secondary" className="text-xs gap-1">
                  {userRole === "editor" ? (
                    <>
                      <Edit3 className="h-3 w-3" /> {t("roleBadge.editor")}
                    </>
                  ) : (
                    <>
                      <Eye className="h-3 w-3" /> {userRole === "admin" ? t("roleBadge.admin") : t("roleBadge.viewer")}
                    </>
                  )}
                </Badge>
              </CardTitle>
              {project.description && (
                <CardDescription className="mt-1 text-sm text-on-surface-variant">{project.description}</CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-4 text-xs text-on-surface-variant">
            {project.address && (<span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {project.address}</span>)}
            {project.startDate && (<span className="flex items-center gap-1 tabular-nums"><Calendar className="h-3 w-3" /> {formatDate(project.startDate)}{project.endDate && ` — ${formatDate(project.endDate)}`}</span>)}
            <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {project.currency}</span>
            <span className="text-xs text-on-surface-variant/60 tabular-nums">{t("created", { date: formatDate(project.createdAt) })}</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> {t("lockHint")}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-surface-container-low shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              {editing ? (
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 max-w-md text-lg font-bold" autoFocus />
              ) : (
                <>
                  {project.name}
                  <Badge variant="outline" className={cn("text-xs", statusInfo.color)}>{statusLabel}</Badge>
                </>
              )}
            </CardTitle>
            {!editing && project.description && (
              <CardDescription className="mt-1 text-sm text-on-surface-variant">{project.description}</CardDescription>
            )}
          </div>
          {editing ? (
            <div className="flex shrink-0 gap-1">
              <Button size="sm" className="rounded-full gap-1.5" onClick={handleSave} disabled={updateProject.isPending}>
                {updateProject.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {tCommon("save")}
              </Button>
              <Button variant="outline" size="sm" className="rounded-full" onClick={handleCancel}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="shrink-0 rounded-full gap-1.5" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> {tCommon("edit")}
            </Button>
          )}
        </div>
      </CardHeader>
      {editing && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="mgmt-address" className="text-xs font-medium text-on-surface-variant">{t("label.address")}</Label>
              <Input id="mgmt-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("placeholder.address")} className="h-9 rounded-md border-outline-variant bg-surface-container-low" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mgmt-status" className="text-xs font-medium text-on-surface-variant">{t("label.status")}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="mgmt-status" className="h-9 rounded-md border-outline-variant bg-surface-container-low"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">{tStatuses("planning")}</SelectItem>
                  <SelectItem value="active">{tStatuses("active")}</SelectItem>
                  <SelectItem value="paused">{tStatuses("paused")}</SelectItem>
                  <SelectItem value="completed">{tStatuses("completed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="mgmt-currency" className="text-xs font-medium text-on-surface-variant">{tCurrency("projectCurrency")}</Label>
              <CurrencySelect
                id="mgmt-currency"
                value={currency}
                onChange={setCurrency}
                defaultCurrency={currency}
                className="h-9 rounded-md border-outline-variant bg-surface-container-low"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="mgmt-start" className="text-xs font-medium text-on-surface-variant">{t("label.startDate")}</Label>
              <Input id="mgmt-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 rounded-md border-outline-variant bg-surface-container-low" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mgmt-end" className="text-xs font-medium text-on-surface-variant">{t("label.endDate")}</Label>
              <Input id="mgmt-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 rounded-md border-outline-variant bg-surface-container-low" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="mgmt-desc" className="text-xs font-medium text-on-surface-variant">{t("label.description")}</Label>
            <Textarea id="mgmt-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("placeholder.description")} rows={2} className="resize-y rounded-md border-outline-variant bg-surface-container-low" />
          </div>
        </CardContent>
      )}
      {!editing && (
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-4 text-xs text-on-surface-variant">
            {project.address && (<span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {project.address}</span>)}
            {project.startDate && (<span className="flex items-center gap-1 tabular-nums"><Calendar className="h-3 w-3" /> {formatDate(project.startDate)}{project.endDate && ` — ${formatDate(project.endDate)}`}</span>)}
            <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {project.currency}</span>
            <span className="text-xs text-on-surface-variant/60 tabular-nums">{t("created", { date: formatDate(project.createdAt) })}</span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ============================================================
// PropertyMetadataCard — sekce „Informace o nemovitosti"
// ------------------------------------------------------------
// Volitelná metadata o nemovitosti (Task ID: project-metadata):
//   - Přesná adresa (číslo popisné, ulice, město, PSČ)
//   - Zastavěná plocha (m²), počet podlaží
//   - Tepelná ztráta domu (W/K) — pro energetické hodnocení
//   - Energetický štítek (A–G)
//   - Odkazy na architektonickou studii a projektovou dokumentaci
//   - Volná poznámka k nemovitosti
//
// Owner a Admin mohou pole upravovat (inline edit toggle stejně jako
// v ProjectInfoCard). Editor a Viewer vidí data read-only; úpravu jim
// nepovoluje ani frontend, ani backend (PATCH /api/projects/[id] vyžaduje
// `owner` roli).
//
// URL pole (studyUrl, documentationUrl):
//   - V edit módu se renderují s ikonou ExternalLink vpravo v inputu.
//   - Klient-side validace formátu (http:// nebo https://) — pokud URL
//     není platné, zobrazí se červený rámeček + chybová hláška pod inputem
//     a uložení je zablokováno.
//   - V read-only módu se platné URL renderují jako klikací odkazy
//     (target=_blank, rel=noopener).
// ============================================================

// Energy rating (A–G) — barva badge podle energetické třídy (zelená = A,
// červená = G). Používáno v read-only zobrazení `energyRating`.
const ENERGY_RATING_COLORS: Record<string, string> = {
  A: "bg-success-soft text-success-strong",
  B: "bg-success-soft/80 text-success-strong",
  C: "bg-info-soft text-info-strong",
  D: "bg-warning-soft text-warning-strong",
  E: "bg-warning-soft/80 text-warning-strong",
  F: "bg-danger-soft/80 text-danger-strong",
  G: "bg-danger-soft text-danger-strong",
};

// Validate a URL string — accepts empty (treated as valid) and full
// http(s) URLs. Returns false for everything else (including bare
// domains like "example.com" without protocol).
function isValidUrl(value: string): boolean {
  if (!value) return true;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function PropertyMetadataCard({
  project,
  updateProject,
  readOnly = false,
}: {
  project: NonNullable<ReturnType<typeof useProjects>["data"]>[number];
  updateProject: ReturnType<typeof useUpdateProject>;
  readOnly?: boolean;
}) {
  // canEdit = owner nebo admin (readOnly=true znamená editor/viewer).
  const canEdit = !readOnly;

  const [editing, setEditing] = useState(false);
  const [fullAddress, setFullAddress] = useState(project.fullAddress ?? "");
  const [floorArea, setFloorArea] = useState(
    project.floorArea != null ? String(project.floorArea) : "",
  );
  const [floors, setFloors] = useState(
    project.floors != null ? String(project.floors) : "",
  );
  const [heatLoss, setHeatLoss] = useState(
    project.heatLoss != null ? String(project.heatLoss) : "",
  );
  const [energyRating, setEnergyRating] = useState(project.energyRating ?? "");
  const [studyUrl, setStudyUrl] = useState(project.studyUrl ?? "");
  const [documentationUrl, setDocumentationUrl] = useState(
    project.documentationUrl ?? "",
  );
  const [propertyNote, setPropertyNote] = useState(project.propertyNote ?? "");
  const t = useTranslations("tabs.management.property");
  const tCommon = useTranslations("common");

  // B26: drž local form state v synchronizaci s React Query cacheí. Viz
  // komentář v ProjectInfoCard výše — stejný pattern (uložení informací z
  // předchozího renderu). Pokud uživatel edituje, nesyncujeme.
  const syncKey = [
    project.fullAddress ?? "",
    project.floorArea ?? "",
    project.floors ?? "",
    project.heatLoss ?? "",
    project.energyRating ?? "",
    project.studyUrl ?? "",
    project.documentationUrl ?? "",
    project.propertyNote ?? "",
  ].join("\u0000");
  const [lastSyncKey, setLastSyncKey] = useState(syncKey);
  if (!editing && syncKey !== lastSyncKey) {
    setLastSyncKey(syncKey);
    setFullAddress(project.fullAddress ?? "");
    setFloorArea(project.floorArea != null ? String(project.floorArea) : "");
    setFloors(project.floors != null ? String(project.floors) : "");
    setHeatLoss(project.heatLoss != null ? String(project.heatLoss) : "");
    setEnergyRating(project.energyRating ?? "");
    setStudyUrl(project.studyUrl ?? "");
    setDocumentationUrl(project.documentationUrl ?? "");
    setPropertyNote(project.propertyNote ?? "");
  }

  const studyUrlValid = isValidUrl(studyUrl.trim());
  const docUrlValid = isValidUrl(documentationUrl.trim());

  const handleSave = async () => {
    if (!studyUrlValid || !docUrlValid) {
      toast.error(t("toasts.urlError"));
      return;
    }
    try {
      await updateProject.mutateAsync({
        fullAddress: fullAddress.trim() || null,
        studyUrl: studyUrl.trim() || null,
        documentationUrl: documentationUrl.trim() || null,
        heatLoss: heatLoss === "" ? null : Number(heatLoss),
        energyRating: energyRating || null,
        floorArea: floorArea === "" ? null : Number(floorArea),
        floors: floors === "" ? null : Number(floors),
        propertyNote: propertyNote.trim() || null,
      });
      toast.success(t("toasts.saveSuccess"));
      setEditing(false);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("toasts.saveError"),
      );
    }
  };

  const handleCancel = () => {
    setFullAddress(project.fullAddress ?? "");
    setFloorArea(project.floorArea != null ? String(project.floorArea) : "");
    setFloors(project.floors != null ? String(project.floors) : "");
    setHeatLoss(project.heatLoss != null ? String(project.heatLoss) : "");
    setEnergyRating(project.energyRating ?? "");
    setStudyUrl(project.studyUrl ?? "");
    setDocumentationUrl(project.documentationUrl ?? "");
    setPropertyNote(project.propertyNote ?? "");
    setEditing(false);
  };

  const energyBadgeClass = energyRating
    ? ENERGY_RATING_COLORS[energyRating.toUpperCase()] ??
      "bg-muted text-muted-foreground"
    : "bg-muted text-muted-foreground";

  return (
    <Card className="bg-surface-container-low shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Building2 className="h-4 w-4 text-primary" />
              {t("title")}
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-on-surface-variant">
              {t("description")}
            </CardDescription>
          </div>
          {canEdit &&
            (editing ? (
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  className="rounded-full gap-1.5"
                  onClick={handleSave}
                  disabled={updateProject.isPending}
                >
                  {updateProject.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {tCommon("save")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={handleCancel}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 rounded-md gap-1.5"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-4 w-4" /> {tCommon("edit")}
              </Button>
            ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing && canEdit ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="mgmt-fulladdress" className="text-xs font-medium text-on-surface-variant">
                {t("label.fullAddress")}
              </Label>
              <Input
                id="mgmt-fulladdress"
                value={fullAddress}
                onChange={(e) => setFullAddress(e.target.value)}
                placeholder={t("placeholder.fullAddress")}
                className="h-9 rounded-md border-outline-variant bg-surface-container-low"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="mgmt-floorarea" className="text-xs font-medium text-on-surface-variant">
                  {t("label.floorArea")}
                </Label>
                <Input
                  id="mgmt-floorarea"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={floorArea}
                  onChange={(e) => setFloorArea(e.target.value)}
                  placeholder={t("placeholder.floorArea")}
                  className="h-9 rounded-md border-outline-variant bg-surface-container-low"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mgmt-floors" className="text-xs font-medium text-on-surface-variant">
                  {t("label.floors")}
                </Label>
                <Input
                  id="mgmt-floors"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={floors}
                  onChange={(e) => setFloors(e.target.value)}
                  placeholder={t("placeholder.floors")}
                  className="h-9 rounded-md border-outline-variant bg-surface-container-low"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="mgmt-heatloss" className="text-xs font-medium text-on-surface-variant">
                  {t("label.heatLoss")}
                </Label>
                <Input
                  id="mgmt-heatloss"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={heatLoss}
                  onChange={(e) => setHeatLoss(e.target.value)}
                  placeholder={t("placeholder.heatLoss")}
                  className="h-9 rounded-md border-outline-variant bg-surface-container-low"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mgmt-energy" className="text-xs font-medium text-on-surface-variant">
                  {t("label.energyRating")}
                </Label>
                <Select value={energyRating} onValueChange={setEnergyRating}>
                  <SelectTrigger id="mgmt-energy" className="h-9 rounded-md border-outline-variant bg-surface-container-low">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A</SelectItem>
                    <SelectItem value="B">B</SelectItem>
                    <SelectItem value="C">C</SelectItem>
                    <SelectItem value="D">D</SelectItem>
                    <SelectItem value="E">E</SelectItem>
                    <SelectItem value="F">F</SelectItem>
                    <SelectItem value="G">G</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="mgmt-studyurl" className="text-xs font-medium text-on-surface-variant">
                {t("label.studyUrl")}
              </Label>
              <div className="relative">
                <Input
                  id="mgmt-studyurl"
                  type="url"
                  value={studyUrl}
                  onChange={(e) => setStudyUrl(e.target.value)}
                  placeholder="https://…"
                  className={cn("h-9 rounded-md border-outline-variant bg-surface-container-low pr-9", !studyUrlValid && "border-danger")}
                />
                <ExternalLink className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
              {!studyUrlValid && (
                <p className="text-xs text-danger">
                  {t("error.url")}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="mgmt-docurl" className="text-xs font-medium text-on-surface-variant">
                {t("label.documentationUrl")}
              </Label>
              <div className="relative">
                <Input
                  id="mgmt-docurl"
                  type="url"
                  value={documentationUrl}
                  onChange={(e) => setDocumentationUrl(e.target.value)}
                  placeholder="https://…"
                  className={cn("h-9 rounded-md border-outline-variant bg-surface-container-low pr-9", !docUrlValid && "border-danger")}
                />
                <ExternalLink className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
              {!docUrlValid && (
                <p className="text-xs text-danger">
                  {t("error.url")}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="mgmt-propnote" className="text-xs font-medium text-on-surface-variant">
                {t("label.note")}
              </Label>
              <Textarea
                id="mgmt-propnote"
                value={propertyNote}
                onChange={(e) => setPropertyNote(e.target.value)}
                rows={3}
                placeholder={t("placeholder.note")}
                className="resize-y rounded-md border-outline-variant bg-surface-container-low"
              />
            </div>
          </>
        ) : (
          // Read-only view — used when `readOnly` (editor/viewer) nebo
          // když owner/admin zrovna needituje. Všechna pole se zobrazí
          // v gridu s ikonou a popiskem; chybějící hodnoty jako „—".
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <PropertyMetadataItem
              icon={MapPin}
              label={t("readOnly.fullAddress")}
              value={project.fullAddress}
            />
            <PropertyMetadataItem
              icon={Ruler}
              label={t("readOnly.floorArea")}
              value={
                project.floorArea != null
                  ? t("readOnly.floorAreaValue", { value: project.floorArea })
                  : null
              }
            />
            <PropertyMetadataItem
              icon={Layers}
              label={t("readOnly.floors")}
              value={project.floors != null ? String(project.floors) : null}
            />
            <PropertyMetadataItem
              icon={Flame}
              label={t("readOnly.heatLoss")}
              value={
                project.heatLoss != null
                  ? t("readOnly.heatLossValue", { value: project.heatLoss })
                  : null
              }
            />
            {/* Energetický štítek — badge A–G s MD3 soft barvou. */}
            <div className="space-y-2">
              <dt className="flex items-center gap-1 text-xs font-medium text-on-surface-variant">
                <Gauge className="h-3 w-3" /> {t("readOnly.energyRating")}
              </dt>
              <dd>
                {project.energyRating ? (
                  <Badge
                    variant="secondary"
                    className={cn("text-xs font-semibold", energyBadgeClass)}
                  >
                    {project.energyRating}
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </dd>
            </div>
            <PropertyMetadataItem
              icon={FileText}
              label={t("readOnly.studyUrl")}
              value={project.studyUrl}
              href={project.studyUrl}
            />
            <PropertyMetadataItem
              icon={FileText}
              label={t("readOnly.documentationUrl")}
              value={project.documentationUrl}
              href={project.documentationUrl}
            />
            <div className="sm:col-span-2 space-y-2">
              <dt className="flex items-center gap-1 text-xs font-medium text-on-surface-variant">
                <StickyNote className="h-3 w-3" /> {t("readOnly.note")}
              </dt>
              <dd className="text-sm whitespace-pre-wrap">
                {project.propertyNote || (
                  <span className="text-muted-foreground">—</span>
                )}
              </dd>
            </div>
          </dl>
        )}
        {!canEdit && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> {t("lockHint")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Pomocná komponenta pro read-only řádek v PropertyMetadataCard.
// `href` (volitelné) renderuje hodnotu jako klikací odkaz (target=_blank)
// s ikonou ExternalLink — používáno pro URL pole (studyUrl, documentationUrl).
function PropertyMetadataItem({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  href?: string | null;
}) {
  return (
    <div className="space-y-2">
      <dt className="flex items-center gap-1 text-xs font-medium text-on-surface-variant">
        <Icon className="h-3 w-3" /> {label}
      </dt>
      <dd className="text-sm font-medium">
        {value ? (
          href && isValidUrl(href) ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <span className="truncate">{value}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </a>
          ) : (
            <span className="whitespace-pre-wrap break-words">{value}</span>
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </dd>
    </div>
  );
}

// ============================================================
// SharingSection — project members + owner management
// ------------------------------------------------------------
// - Avatar with image (Google auth ready) + initials fallback
// - "Správce" badge instead of "Vlastník"
// - "Čtenář" role label instead of "Prohlížeč"
// - Email autocomplete via datalist (existing users)
// - Detect existing member (warning ring + toast)
// - Detect unknown email (info hint)
// - Optimistic removal with brief loading state on the row
// ============================================================
type Member = {
  id: string;
  role: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string | null; email: string; image: string | null };
};

type MembersResponse = {
  owner: { id: string; name: string | null; email: string; image: string | null };
  members: Member[];
};

// Invitation row returned by GET /api/projects/[id]/invitations.
// Pending invitations can be revoked by the owner; accepted/rejected/
// expired/revoked ones are kept for history.
type InvitationRow = {
  id: string;
  inviteeEmail: string;
  role: string;
  status: "pending" | "accepted" | "rejected" | "revoked" | "expired";
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
  invitedBy: { id: string; name: string | null; email: string };
};

// Status → badge color (MD3 sémantic tokens). Labels are now looked up via
// `t("invitationStatus." + status)` at render time (locales: cs / en).
const INVITATION_STATUS_META: Record<
  InvitationRow["status"],
  { className: string }
> = {
  pending: {
    className: "bg-warning-soft text-warning-strong",
  },
  accepted: {
    className: "bg-success-soft text-success-strong",
  },
  rejected: {
    className: "bg-muted text-muted-foreground",
  },
  revoked: {
    className: "bg-muted text-muted-foreground",
  },
  expired: {
    className: "bg-danger-soft text-danger-strong",
  },
};

function SharingSection({
  projectId,
  projectSlug,
  projectName,
  isPublic,
  isOwner,
  isAdmin,
  userRole,
  currentUserId,
}: {
  projectId: string;
  projectSlug: string;
  projectName: string;
  isPublic: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  userRole: ProjectRole;
  currentUserId: string | null;
}) {
  // `canManage` covers everything an owner can do EXCEPT delete (delete is
  // gated separately in the parent component, owner-only). Editors get a
  // narrower set of permissions: they can invite new members (as viewer /
  // editor only — no owner option) and share the link, but cannot toggle
  // public visibility, change the project owner, revoke invitations, or
  // change existing members' roles.
  const canManage = isOwner || isAdmin;
  const canInvite = canManage || userRole === "editor";
  const t = useTranslations("tabs.management.sharing");
  const tCommon = useTranslations("common");
  const [data, setData] = useState<MembersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("viewer");
  const [adding, setAdding] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  // Confirmation dialog state for member removal. Set when the user clicks
  // the "Odebrat člena" / "Opustit projekt" button — the actual removal
  // (optimistic update + DELETE call + rollback) only fires after the user
  // confirms in the AlertDialog rendered at the bottom of the section.
  const [confirmRemove, setConfirmRemove] = useState<{
    memberId: string;
    name: string;
  } | null>(null);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [lastToastEmail, setLastToastEmail] = useState<string>("");
  // Pending invitations list (ProjectInvitation rows that haven't been
  // accepted/rejected yet). Fetched separately from members.
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(true);
  const [revokingIds, setRevokingIds] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  // SharingSection has its own analytics scope (its own projectId) so we
  // instantiate useAnalytics here to fire `project_share` telemetry events.
  const { trackEvent } = useAnalytics(projectId);
  // Re-use the parent ProjectManagementTab's updateProject mutation so the
  // isPublic toggle optimistically updates the project cache (sidebar,
  // project list, etc.) the same way the inline-edit ProjectInfoCard does.
  const updateProject = useUpdateProject(projectId);

  // Copy the public shareable link (`/p/<slug>`) to the clipboard.
  // Anyone with this link can view a public project read-only. If the
  // project is private, the link still resolves but the page redirects
  // to /auth/login — warn the user about that case.
  const handleShare = async () => {
    try {
      const url = `${window.location.origin}/p/${projectSlug}`;
      await navigator.clipboard.writeText(url);
      if (isPublic) {
        toast.success(t("toasts.shareLinkCopied"));
      } else {
        toast.warning(t("toasts.shareLinkPrivate"));
      }
      trackEvent("project_share", { action: "copy_link", role: "viewer", isPublic });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.shareLinkError"));
    }
  };

  // Toggle project public visibility. Uses optimistic update via
  // useUpdateProject mutation (which invalidates projects list, etc.).
  const handleTogglePublic = (next: boolean) => {
    updateProject.mutate(
      { isPublic: next },
      {
        onSuccess: () => {
          toast.success(
            next
              ? t("toasts.madePublic")
              : t("toasts.madePrivate"),
          );
          trackEvent("project_share", { action: "toggle_public", isPublic: next });
        },
        onError: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : t("toasts.publicToggleError"));
        },
      },
    );
  };

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Fetch pending invitations for the project (separate endpoint —
  // invitations for users who haven't yet accepted / registered).
  const fetchInvitations = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/invitations`);
      if (res.ok) {
        const json = await res.json();
        setInvitations(json.invitations ?? []);
      }
    } catch {
      // ignore
    } finally {
      setInvitationsLoading(false);
    }
  }, [projectId]);

  // Fetch members + all users + invitations on mount
  useEffect(() => {
    fetchMembers();
    fetchInvitations();
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((users) => setAllUsers(users))
      .catch(() => setAllUsers([]));
  }, [fetchMembers, fetchInvitations]);

  // Detect typed email matches (existing member or owner)
  const typedEmail = addEmail.trim().toLowerCase();
  const matchedMember =
    typedEmail && data?.members.find((m) => m.user.email.toLowerCase() === typedEmail);
  const matchedOwner =
    typedEmail && data?.owner?.email?.toLowerCase() === typedEmail;
  const isExistingMember = !!(matchedMember || matchedOwner);
  const isKnownUser =
    typedEmail && allUsers.some((u) => u.email.toLowerCase() === typedEmail);
  const hasAt = typedEmail.includes("@");
  const isNewUserHint = hasAt && !isExistingMember && !isKnownUser && typedEmail.length > 3;

  // Show toast once when email matches existing member
  useEffect(() => {
    if (isExistingMember && lastToastEmail !== typedEmail) {
      toast.warning(t("toasts.alreadyMember"));
      setLastToastEmail(typedEmail);
    } else if (!isExistingMember && lastToastEmail && lastToastEmail !== typedEmail) {
      setLastToastEmail("");
    }
  }, [isExistingMember, typedEmail, lastToastEmail, t]);

  const handleAdd = async () => {
    if (!addEmail.trim()) return;
    if (isExistingMember) {
      toast.warning(t("toasts.alreadyMember"));
      return;
    }
    setAdding(true);
    try {
      // Always create a ProjectInvitation (the dedicated /invitations
      // endpoint sends the e-mail and creates a 24h-expiry invitation
      // even if the invitee is already a registered user — for a
      // registered user the invitation is auto-accepted on their next
      // sign-in, or they can accept via the /invite/[token] page).
      const res = await fetch(`/api/projects/${projectId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail.trim(), role: addRole }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("toasts.inviteError"));
      }
      // Telemetry: project_share — invite
      trackEvent("project_share", {
        action: "invite",
        email: addEmail.trim(),
        role: addRole,
      });
      toast.success(t("toasts.inviteSent", { email: addEmail.trim() }));
      setAddEmail("");
      setLastToastEmail("");
      // Refresh the invitations list so the new pending row appears.
      fetchInvitations();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toasts.inviteError"));
    } finally {
      setAdding(false);
    }
  };

  // Revoke a pending invitation. Owner-only action — the API endpoint
  // enforces ownership, so we don't need to check isOwner here.
  const handleRevokeInvitation = async (invitationId: string, email: string) => {
    setRevokingIds((prev) => {
      const next = new Set(prev);
      next.add(invitationId);
      return next;
    });
    // Optimistically remove from local state after brief delay
    const removeTimer = setTimeout(() => {
      setInvitations((cur) => cur.filter((inv) => inv.id !== invitationId));
    }, 220);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/invitations/${invitationId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      clearTimeout(removeTimer);
      setInvitations((cur) => cur.filter((inv) => inv.id !== invitationId));
      trackEvent("project_share", {
        action: "revoke_invitation",
        email,
      });
      toast.success(t("toasts.inviteRevoked", { email }));
    } catch (err) {
      clearTimeout(removeTimer);
      // Restore the invitation at its original position
      const restore = invitations.find((inv) => inv.id === invitationId);
      if (restore) {
        setInvitations((cur) => {
          if (cur.some((inv) => inv.id === invitationId)) return cur;
          return [...cur, restore];
        });
      } else {
        fetchInvitations();
      }
      toast.error(err instanceof Error ? err.message : t("toasts.inviteRevokeError"));
    } finally {
      setRevokingIds((prev) => {
        const next = new Set(prev);
        next.delete(invitationId);
        return next;
      });
    }
  };

  const handleRoleChange = async (memberId: string, role: string) => {
    // Look up old role + email BEFORE optimistic update for telemetry
    const member = data?.members.find((m) => m.id === memberId);
    const oldRole = member?.role;
    const memberEmail = member?.user.email;
    // Optimistic role update
    const prev = data;
    setData((cur) =>
      cur
        ? { ...cur, members: cur.members.map((m) => (m.id === memberId ? { ...m, role } : m)) }
        : cur,
    );
    try {
      const res = await fetch(`/api/projects/${projectId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      // Telemetry: project_share — role_change
      trackEvent("project_share", {
        action: "role_change",
        email: memberEmail ?? null,
        oldRole: oldRole ?? null,
        newRole: role,
      });
      toast.success(t("toasts.roleChanged"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.roleChangeError"));
      setData(prev); // restore previous state
    }
  };

  // Open the confirmation dialog. The actual removal happens in
  // `confirmRemoveMember` after the user confirms. We deliberately
  // separate the trigger from the action so the AlertDialog can show
  // the member's name (and the user has a chance to cancel before any
  // network / state mutation).
  const handleRemove = (memberId: string, name: string) => {
    setConfirmRemove({ memberId, name });
  };

  // Perform the actual member removal — called from the AlertDialog's
  // "Odebrat člena" action button. Reuses the original optimistic-update
  // logic (brief loading state on the row → optimistic remove → API
  // DELETE → confirm / rollback on error).
  const confirmRemoveMember = async () => {
    if (!confirmRemove) return;
    const { memberId, name } = confirmRemove;
    // Close the dialog immediately so the user sees feedback on the row.
    setConfirmRemove(null);

    const memberToRestore = data?.members.find((m) => m.id === memberId);
    const memberEmail = memberToRestore?.user.email;
    // Brief loading state on the specific row
    setRemovingIds((prev) => {
      const next = new Set(prev);
      next.add(memberId);
      return next;
    });
    // Optimistically remove from local state after brief delay
    const removeTimer = setTimeout(() => {
      setData((cur) =>
        cur ? { ...cur, members: cur.members.filter((m) => m.id !== memberId) } : cur,
      );
    }, 220);

    try {
      const res = await fetch(`/api/projects/${projectId}/members/${memberId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      clearTimeout(removeTimer);
      // Ensure removed from state immediately on success
      setData((cur) =>
        cur ? { ...cur, members: cur.members.filter((m) => m.id !== memberId) } : cur,
      );
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(memberId);
        return next;
      });
      // Telemetry: project_share — remove
      trackEvent("project_share", {
        action: "remove",
        email: memberEmail ?? null,
      });
      toast.success(t("toasts.memberRemoved", { name }));
    } catch (err) {
      clearTimeout(removeTimer);
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(memberId);
        return next;
      });
      // Restore the member at original position
      if (memberToRestore) {
        setData((cur) => {
          if (!cur) return cur;
          if (cur.members.some((m) => m.id === memberId)) return cur;
          return { ...cur, members: [...cur.members, memberToRestore] };
        });
      } else {
        fetchMembers();
      }
      toast.error(err instanceof Error ? err.message : t("toasts.memberRemoveError"));
    }
  };

  const handleChangeOwner = async (newOwnerId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: newOwnerId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to change owner");
      }
      toast.success(t("toasts.ownerChanged"));
      qc.invalidateQueries({ queryKey: ["projects"] });
      fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.ownerChangeError"));
    }
  };

  if (loading) return <Skeleton className="h-48" />;

  const owner = data?.owner;
  const members = data?.members ?? [];
  const pendingInvitations = invitations.filter((inv) => inv.status === "pending");
  const pastInvitations = invitations.filter((inv) => inv.status !== "pending");

  return (
    <>
    <Card className="bg-surface-container-low shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Shield className="h-4 w-4 text-primary" />
              {t("title")}
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-on-surface-variant">{t("description")}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 rounded-full gap-1.5"
            onClick={handleShare}
            title={t("button.shareTitle")}
            aria-label={t("button.shareTitle")}
          >
            <Share2 className="h-3.5 w-3.5" />
            {t("button.share")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ===== Public project toggle ===== */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-6">
          <div className="min-w-0">
            <p className="type-body font-medium">{t("toggle.publicProject.label")}</p>
            <p className="type-label text-on-surface-variant">
              {t("toggle.publicProject.description")}
            </p>
          </div>
          <Switch
            checked={isPublic}
            onCheckedChange={handleTogglePublic}
            disabled={!canManage || updateProject.isPending}
            aria-label={t("aria.publicToggle")}
          />
        </div>
        {/* Editors see a "Pouze správce" hint explaining why the Switch
            is disabled. Owners / admins don't need this. */}
        {!canManage && (
          <div className="-mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> {t("lockHint")}
          </div>
        )}
        <div className="flex items-start gap-2 rounded-lg bg-info/5 p-2.5 text-xs text-on-surface-variant">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-info" />
          <span>
            {t("publicInfo")}
          </span>
        </div>

        {/* ===== Owner ===== */}
        {owner && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-surface-container-low p-3">
            <Avatar className="h-10 w-10 shrink-0 border border-primary/30">
              {owner.image ? (
                <AvatarImage src={owner.image} alt={owner.name || owner.email} />
              ) : null}
              <AvatarFallback className="bg-secondary-container type-label-sm font-bold text-secondary-container-foreground">
                <Crown className="h-5 w-5 text-primary" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="type-body font-semibold">{owner.name || owner.email}</span>
                <Badge variant="secondary" className={cn("type-label-sm", "bg-success-soft text-success-strong dark:bg-success-soft dark:text-success-strong")}>{t("badge.owner")}</Badge>
              </div>
              <div className="type-label text-on-surface-variant truncate">{owner.email}</div>
            </div>
            {/* Change owner dropdown — owner / admin only. Editors
                cannot transfer ownership (the API also rejects this —
                `requireProjectAccess(id, "owner")` in the PATCH handler). */}
            {canManage && allUsers.length > 0 && (
              <Select onValueChange={handleChangeOwner}>
                <SelectTrigger className="h-8 w-auto rounded-full type-label-sm">
                  <span className="flex items-center gap-1"><ArrowRight className="h-3 w-3" /> {t("button.transferOwnership")}</span>
                </SelectTrigger>
                <SelectContent>
                  {allUsers
                    .filter((u) => u.id !== owner.id)
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name || u.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* ===== Members list ===== */}
        {members.length > 0 ? (
          <div className="space-y-1.5">
            {members.map((m) => {
              const isRemoving = removingIds.has(m.id);
              const isMatched = matchedMember?.id === m.id;
              // Owner / admin can change roles + remove any member.
              // Editors cannot change roles (the role Select is hidden for
              // them) — the API also rejects PATCH calls from non-owners.
              // A non-managing user can only remove THEMSELF (self-leave).
              const canManageMember = canManage;
              const isSelf = currentUserId === m.user.id;
              const canRemove = canManage || isSelf;
              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border bg-surface-container-low p-3 transition-all",
                    isMatched
                      ? "border-warning ring-2 ring-warning/30"
                      : "border-outline-variant",
                    isRemoving && "opacity-50",
                  )}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    {m.user.image ? (
                      <AvatarImage src={m.user.image} alt={m.user.name || m.user.email} />
                    ) : null}
                    <AvatarFallback className="bg-secondary-container type-label-sm font-bold text-secondary-container-foreground">
                      {(m.user.name || m.user.email)[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="type-body font-medium truncate">{m.user.name || m.user.email}</div>
                    <div className="type-label text-on-surface-variant truncate">{m.user.email}</div>
                  </div>
                  {/* Role selector — owner / admin only */}
                  {canManageMember ? (
                    <Select value={m.role} onValueChange={(v) => handleRoleChange(m.id, v)}>
                      <SelectTrigger className="h-7 w-auto rounded-full type-label-sm gap-1">
                        {m.role === "editor" ? <Edit3 className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        {m.role === "editor" ? t("role.editor") : t("role.viewer")}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer"><Eye className="mr-1.5 inline h-3 w-3" /> {t("roleSelect.viewer")}</SelectItem>
                        <SelectItem value="editor"><Edit3 className="mr-1.5 inline h-3 w-3" /> {t("roleSelect.editor")}</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary" className={cn("type-label-sm gap-1", m.role === "editor" ? "bg-info-soft text-info-strong dark:bg-info-soft dark:text-info-strong" : "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground")}>
                      {m.role === "editor" ? <Edit3 className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {m.role === "editor" ? t("role.editor") : t("role.viewer")}
                    </Badge>
                  )}
                  {/* Remove — owner / admin (anyone) or self (self-leave) */}
                  {canRemove && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 rounded-full state-layer-on-surface text-muted-foreground hover:text-danger"
                      onClick={() => handleRemove(m.id, m.user.name || m.user.email)}
                      disabled={isRemoving}
                      aria-label={isSelf && !canManage ? t("aria.leaveProject") : t("aria.removeMember")}
                      title={isSelf && !canManage ? t("aria.leaveProject") : t("aria.removeMember")}
                    >
                      {isRemoving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="type-label text-on-surface-variant">{t("empty.members")}</p>
        )}

        {/* ===== Pending invitations list ===== */}
        {(pendingInvitations.length > 0 || invitationsLoading) && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 type-label text-on-surface-variant">
              <Mail className="h-3.5 w-3.5" /> {t("pending.title")}
            </div>
            {invitationsLoading ? (
              <Skeleton className="h-12" />
            ) : (
              pendingInvitations.map((inv) => {
                const isRevoking = revokingIds.has(inv.id);
                const roleLabel = inv.role === "editor" ? t("role.editor") : t("role.viewer");
                const isExpired = new Date(inv.expiresAt) < new Date();
                const statusKey: InvitationRow["status"] = isExpired ? "expired" : inv.status;
                const statusMeta = INVITATION_STATUS_META[statusKey] ?? INVITATION_STATUS_META.pending;
                const statusLabel = t(`invitationStatus.${statusKey}`);
                return (
                  <div
                    key={inv.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border bg-surface-container-low p-3 transition-all",
                      isRevoking && "opacity-50",
                      "border-outline-variant",
                    )}
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="bg-secondary-container type-label-sm font-bold text-secondary-container-foreground">
                        <Mail className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="type-body font-medium truncate">{inv.inviteeEmail}</div>
                      <div className="type-label text-on-surface-variant truncate">
                        {t("pending.role", { role: roleLabel, date: formatDate(inv.expiresAt, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) })}
                      </div>
                    </div>
                    <Badge variant="secondary" className={cn("type-label-sm", statusMeta.className)}>
                      {statusLabel}
                    </Badge>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 rounded-full state-layer-on-surface text-muted-foreground hover:text-danger"
                        onClick={() => handleRevokeInvitation(inv.id, inv.inviteeEmail)}
                        disabled={isRevoking}
                        aria-label={t("aria.revokeInvitation")}
                        title={t("aria.revokeInvitation")}
                      >
                        {isRevoking ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ===== Past invitations (collapsed history) ===== */}
        {pastInvitations.length > 0 && (
          <details className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <summary className="cursor-pointer type-label text-on-surface-variant select-none">
              {t("invitationHistory.title", { count: pastInvitations.length })}
            </summary>
            <div className="mt-2 space-y-1.5">
              {pastInvitations.map((inv) => {
                const roleLabel = inv.role === "editor" ? t("role.editor") : t("role.viewer");
                const statusMeta =
                  INVITATION_STATUS_META[inv.status] ?? INVITATION_STATUS_META.pending;
                const statusLabel = t(`invitationStatus.${inv.status}`);
                return (
                  <div
                    key={inv.id}
                    className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-2.5 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{inv.inviteeEmail}</div>
                      <div className="type-label text-on-surface-variant truncate">
                        {t("invitationHistory.role", { role: roleLabel, date: formatDate(inv.createdAt) })}
                      </div>
                    </div>
                    <Badge variant="secondary" className={cn("type-label-sm", statusMeta.className)}>
                      {statusLabel}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </details>
        )}

        {/* ===== Invite form (Pozvat e-mailem) ===== */}
        <div className="rounded-lg border border-dashed border-outline-variant p-3">
          <div className="mb-2 flex items-center gap-1.5 type-label text-on-surface-variant">
            <UserPlus className="h-3.5 w-3.5" /> {t("inviteForm.title")}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder={t("inviteForm.placeholderEmail")}
              type="email"
              list="users-datalist"
              className={cn(
                "h-8 flex-1 min-w-[200px] type-body",
                isExistingMember && "border-warning ring-2 ring-warning/30",
                isNewUserHint && "border-info/50",
              )}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <datalist id="users-datalist">
              {allUsers.map((u) => (
                <option key={u.id} value={u.email}>
                  {u.name || u.email}
                </option>
              ))}
            </datalist>
            <Select value={addRole} onValueChange={setAddRole}>
              <SelectTrigger className="h-8 w-auto rounded-full type-label-sm gap-1">
                {addRole === "editor" ? <Edit3 className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {addRole === "editor" ? t("role.editor") : t("role.viewer")}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer"><Eye className="mr-1.5 inline h-3 w-3" /> {t("role.viewer")}</SelectItem>
                <SelectItem value="editor"><Edit3 className="mr-1.5 inline h-3 w-3" /> {t("role.editor")}</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="rounded-full gap-1.5" onClick={handleAdd} disabled={!addEmail.trim() || adding || !canInvite}>
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              {t("inviteForm.button")}
            </Button>
          </div>
          {/* Hints */}
          {isExistingMember && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-warning">
              <AlertTriangle className="h-3 w-3" /> {t("inviteForm.hint.existingMember")}
            </div>
          )}
          {isNewUserHint && !isExistingMember && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-info">
              <Info className="h-3 w-3" /> {t("inviteForm.hint.newUser")}
            </div>
          )}
          {/* Editors can invite but only as viewer/editor — surface this
              so the role Select makes sense. Viewers see the standard
              "owner-only" lock hint (they never reach this tab through the
              sidebar, but the gate also covers direct deep-links). */}
          {userRole === "editor" && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-info">
              <Info className="h-3 w-3" /> {t("inviteForm.hint.editor")}
            </div>
          )}
          {!canInvite && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" /> {t("inviteForm.hint.noInvite")}
            </div>
          )}
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-info/5 p-2.5 text-xs text-on-surface-variant">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-info" />
          <span>
            {t("inviteForm.info")}
          </span>
        </div>

        {/* ===== QR code — share via scan ===== */}
        <div className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
          <div className="mb-3 flex items-center gap-2">
            <QrCodeIcon className="h-4 w-4 text-primary" />
            <span className="type-body font-medium">{t("qr.title")}</span>
          </div>
          <p className="mb-3 type-label text-on-surface-variant">
            {t("qr.description")}
          </p>
          <div className="flex flex-col items-center gap-3">
            <QrCode projectSlug={projectSlug} projectName={projectName} />
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-info/5 p-2.5 text-xs text-on-surface-variant">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-info" />
          <span>
            {t("qr.info")}
          </span>
        </div>
      </CardContent>
    </Card>

    {/* ===== Confirmation dialog for member removal =====
        Triggered from the row "Odebrat člena" / "Opustit projekt"
        button via `setConfirmRemove({ memberId, name })`. The actual
        removal is performed in `confirmRemoveMember` (called from
        AlertDialogAction). Cancel just clears the state. */}
    <AlertDialog
      open={!!confirmRemove}
      onOpenChange={(open) => !open && setConfirmRemove(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmRemove.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("confirmRemove.body", { name: confirmRemove?.name ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("confirmRemove.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={confirmRemoveMember}>
            {t("confirmRemove.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
}

// ============================================================
// EnhancedAuditLog — server-side pagination + live polling
// ------------------------------------------------------------
// - Fetches ONLY the current page from API:
//   GET /api/projects/[id]/audit?action=&entity=&page=&pageSize=&sort=
// - Response shape: { entries, total, page, pageSize, totalPages }
// - Real-time polling every 5s while section is expanded
//   (controlled by `isExpanded` state, toggled via Live button).
// - Filters / sort / page-size / page changes trigger API refetch.
// - Export CSV button → /api/projects/[id]/audit/export (new tab).
// - entityLabel (human-readable name) shown alongside the
//   entityType translation.
// ============================================================
type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string; image: string | null } | null;
};

// Action labels are now looked up via `t("auditLog.actions." + action)`.
const ACTION_LABELS: Record<string, true> = {
  create: true,
  update: true,
  delete: true,
  export: true,
};

// MD3 soft color tokens per action — `bg-*-soft text-*-strong` ensures the
// audit-log action badge stays consistent with other MD3 badges (energy
// rating, invitation status) across the codebase.
const ACTION_COLORS: Record<string, string> = {
  create: "bg-success-soft text-success-strong",
  update: "bg-info-soft text-info-strong",
  delete: "bg-danger-soft text-danger-strong",
  export: "bg-info-soft text-info-strong",
};

// Entity labels are now looked up via `t("auditLog.entities." + entityType)`.
const ENTITY_LABELS: Record<string, true> = {
  BudgetItem: true,
  Payment: true,
  TimeEntry: true,
  Contact: true,
  Project: true,
  Note: true,
  ContactPerson: true,
  ProjectMember: true,
  Export: true,
};

// Generate a human-readable description of what happened.
// `helpers` provides locale-aware lookups: the audit-log translator (scoped
// to `tabs.management.auditLog.describe`), the role translator (scoped to
// `roles`), plus helpers that translate field/entity labels (with a
// graceful fallback to the raw key if not in the message bundle).
function describeChange(
  entry: AuditEntry,
  helpers: {
    tDescribe: (key: string, params?: Record<string, string | number>) => string;
    tRoles: (key: string) => string;
    fieldLabel: (field: string) => string;
    entityLabel: (entityType: string) => string;
  },
): string {
  const entityLabel = entry.entityLabel || helpers.entityLabel(entry.entityType);

  // Create — newValue contains a summary string like "Přidán člen (Čtenář): email@..."
  // But older entries may have raw JSON — try to parse and extract readable info
  if (entry.action === "create" && entry.newValue) {
    // Check if it's a human-readable summary (starts with known prefix)
    if (
      entry.newValue.startsWith("Přidán") ||
      entry.newValue.startsWith("Vytvořen") ||
      entry.newValue.startsWith("Odebrán") ||
      entry.newValue.startsWith("Smazán")
    ) {
      return entry.newValue.length < 200 ? entry.newValue : entityLabel;
    }
    // Try parsing as JSON (older format)
    try {
      const parsed = JSON.parse(entry.newValue);
      if (typeof parsed === "object" && parsed !== null) {
        // Extract key info for create entries
        const email = parsed.userEmail ?? parsed.email;
        const role = parsed.role;
        const name = parsed.name ?? parsed.subcategory ?? parsed.workerName ?? parsed.author;
        if (email && role) {
          const roleKey = ["owner", "editor", "viewer", "admin"].includes(role) ? role : "viewer";
          const roleLabel = helpers.tRoles(roleKey);
          return helpers.tDescribe("memberAdded", { role: roleLabel, email });
        }
        if (name) return helpers.tDescribe("created", { name });
        // Generic: show first 3 fields
        const keys = Object.keys(parsed).filter((k) => k !== "userId" && k !== "id").slice(0, 3);
        return keys.map((k) => `${k}: ${parsed[k]}`).join(", ") || entityLabel;
      }
    } catch {
      // Not JSON, use as-is
    }
    return entry.newValue.length < 200 ? entry.newValue : entityLabel;
  }

  // Delete — oldValue contains a summary string like "Odebrán člen (Editor): email@..."
  if (entry.action === "delete" && entry.oldValue) {
    if (
      entry.oldValue.startsWith("Přidán") ||
      entry.oldValue.startsWith("Vytvořen") ||
      entry.oldValue.startsWith("Odebrán") ||
      entry.oldValue.startsWith("Smazán")
    ) {
      return entry.oldValue.length < 200 ? entry.oldValue : entityLabel;
    }
    // Try parsing as JSON (older format)
    try {
      const parsed = JSON.parse(entry.oldValue);
      if (typeof parsed === "object" && parsed !== null) {
        const email = parsed.userEmail ?? parsed.email;
        const role = parsed.role;
        if (email && role) {
          const roleKey = ["owner", "editor", "viewer", "admin"].includes(role) ? role : "viewer";
          const roleLabel = helpers.tRoles(roleKey);
          return helpers.tDescribe("memberRemoved", { role: roleLabel, email });
        }
        const name = parsed.name ?? parsed.subcategory ?? parsed.workerName ?? parsed.author;
        if (name) return helpers.tDescribe("deleted", { name });
      }
    } catch {
      // Not JSON
    }
    return entry.oldValue.length < 200 ? entry.oldValue : entityLabel;
  }

  // Update — field-level change
  if (entry.action === "update" && entry.field) {
    const fieldLabel = helpers.fieldLabel(entry.field);
    // B28: DB stores raw values; translate to human-readable here.
    if (entry.oldValue && entry.newValue) {
      return `${fieldLabel}: ${getFieldValue(entry.field, entry.oldValue)} → ${getFieldValue(entry.field, entry.newValue)}`;
    }
    // userEmail field — show as "E-mail člena: xxx@..." (newValue only, no oldValue)
    if (entry.field === "userEmail" && entry.newValue) {
      return `${fieldLabel}: ${entry.newValue}`;
    }
    if (entry.newValue) {
      return `${fieldLabel}: ${getFieldValue(entry.field, entry.newValue)}`;
    }
    if (entry.oldValue) {
      return helpers.tDescribe("fieldRemoved", {
        field: fieldLabel,
        value: getFieldValue(entry.field, entry.oldValue),
      });
    }
  }

  return entityLabel;
}

// Human-readable field labels are now looked up via
// `t("auditLog.fields." + field)` at render time. This const is kept as a
// known-field set so callers can fall back gracefully when a field is
// missing from the message bundle (e.g. legacy DB fields).
const FIELD_LABELS_UI: Record<string, true> = {
  required: true,
  completed: true,
  rejected: true,
  starred: true,
  status: true,
  role: true,
  phase: true,
  category: true,
  subcategory: true,
  planCost: true,
  actualCost: true,
  planDays: true,
  flexibilityPercent: true,
  dateFrom: true,
  dateTo: true,
  note: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  description: true,
  currency: true,
  ownerId: true,
  contactId: true,
  workerName: true,
  workerType: true,
  workerCount: true,
  hours: true,
  amount: true,
  type: true,
  vendor: true,
  invoiceNumber: true,
  vatRate: true,
  vatAmount: true,
  website: true,
  company: true,
  ico: true,
  dic: true,
  rating: true,
  sortOrder: true,
  text: true,
  author: true,
  userEmail: true,
};

function formatTimestamp(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: iso, time: "" };
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return {
    date: `${day}.${month}.${d.getFullYear()}`,
    time: `${hours}:${minutes}`,
  };
}

// C6: Map audit entity types → app tab IDs (for deep-link navigation
// when the user clicks on an entity label in the audit table).
const ENTITY_TAB_MAP: Record<string, TabId> = {
  BudgetItem: "budget",
  Payment: "payments",
  TimeEntry: "time",
  Contact: "contacts",
  Note: "notes",
};

function EnhancedAuditLog({ projectId }: { projectId: string }) {
  // C6: deep-link to other tabs
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const t = useTranslations("tabs.management.auditLog");
  const tCommon = useTranslations("common");
  const tRoles = useTranslations("roles");
  // Helpers for describeChange + diff-viewer render — pass through the
  // translator (scoped to `tabs.management.auditLog`) so labels are
  // looked up from the message bundle. Falls back to the raw key when
  // the entity/action/field isn't in the bundle (e.g. legacy DB rows).
  const entityLabel = (entityType: string): string => {
    if (ENTITY_LABELS[entityType]) return t(`entities.${entityType}`);
    return entityType;
  };
  const actionLabel = (action: string): string => {
    if (ACTION_LABELS[action]) return t(`actions.${action}`);
    return action;
  };
  const fieldLabel = (field: string): string => {
    if (FIELD_LABELS_UI[field]) return t(`fields.${field}`);
    return field;
  };
  const describeHelpers = {
    tDescribe: (key: string, params?: Record<string, string | number>) =>
      t(`describe.${key}`, params),
    tRoles,
    fieldLabel,
    entityLabel,
  };
  // Server-side pagination state
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  // Loading / polling states
  // `loading` is DERIVED from comparing the current filter/page key
  // against the last successfully fetched key. This avoids calling
  // setLoading(true) synchronously inside the effect body (which
  // trips the react-hooks/set-state-in-effect rule and causes
  // cascading renders). The skeleton shows whenever the current
  // filter/page state hasn't been fetched yet.
  const [loadedKey, setLoadedKey] = useState<string>("");
  const [polling, setPolling] = useState(false);
  // Filters / sort
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("desc");
  // B1: full-text search (raw input + debounced query)
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  // B2: date range
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  // B7: users that have audit entries (populated from API response)
  const [users, setUsers] = useState<
    Array<{ id: string; name: string | null; email: string; image: string | null }>
  >([]);

  // Derive loading from the current vs. last-fetched filter/page key.
  const currentKey = `${projectId}|${actionFilter}|${entityFilter}|${userFilter}|${searchQuery}|${fromDate}|${toDate}|${page}|${pageSize}|${sortBy}`;
  const loading = loadedKey !== currentKey;

  // B1: Debounced search input — 300ms after the last keystroke,
  // commits the value to `searchQuery` (which is part of the fetch
  // dependency) and resets the page to 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Main fetch — runs on mount and whenever filters/page/sort change.
  // The skeleton shows while `loading` is true (i.e. until the first
  // fetch for the current key completes).
  useEffect(() => {
    let cancelled = false;
    const fetchKey = currentKey;
    const params = new URLSearchParams();
    if (actionFilter !== "all") params.set("action", actionFilter);
    if (entityFilter !== "all") params.set("entity", entityFilter);
    if (userFilter !== "all") params.set("userId", userFilter);
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("sort", sortBy);
    fetch(`/api/projects/${projectId}/audit?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data && Array.isArray(data.entries)) {
          setEntries(data.entries as AuditEntry[]);
          setTotal(typeof data.total === "number" ? data.total : 0);
          setTotalPages(typeof data.totalPages === "number" ? data.totalPages : 1);
          if (Array.isArray(data.users)) setUsers(data.users);
        } else {
          setEntries([]);
          setTotal(0);
          setTotalPages(1);
        }
        setLoadedKey(fetchKey);
      })
      .catch(() => {
        if (cancelled) return;
        setEntries([]);
        setTotal(0);
        setTotalPages(1);
        setLoadedKey(fetchKey);
      });
    return () => {
      cancelled = true;
    };
  }, [
    projectId,
    page,
    pageSize,
    actionFilter,
    entityFilter,
    userFilter,
    searchQuery,
    fromDate,
    toDate,
    sortBy,
    currentKey,
  ]);

  // Real-time polling — every 5s, always active (no toggle).
  // Uses a subtle "Načítání..." indicator (does not flip the skeleton).
  useEffect(() => {
    const fetchAudit = () => {
      setPolling(true);
      const params = new URLSearchParams();
      if (actionFilter !== "all") params.set("action", actionFilter);
      if (entityFilter !== "all") params.set("entity", entityFilter);
      if (userFilter !== "all") params.set("userId", userFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("sort", sortBy);
      fetch(`/api/projects/${projectId}/audit?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.entries)) {
            setEntries(data.entries as AuditEntry[]);
            setTotal(typeof data.total === "number" ? data.total : 0);
            setTotalPages(typeof data.totalPages === "number" ? data.totalPages : 1);
            if (Array.isArray(data.users)) setUsers(data.users);
          }
          setPolling(false);
        })
        .catch(() => setPolling(false));
    };
    const interval = setInterval(fetchAudit, 5000);
    return () => clearInterval(interval);
  }, [
    page,
    pageSize,
    actionFilter,
    entityFilter,
    userFilter,
    searchQuery,
    fromDate,
    toDate,
    sortBy,
    projectId,
  ]);

  // Reset page to 1 when filters/sort/page-size change — done via
  // wrapper handlers to avoid setState-in-effect lint error.
  const handleActionFilterChange = (v: string) => {
    setActionFilter(v);
    setPage(1);
  };
  const handleEntityFilterChange = (v: string) => {
    setEntityFilter(v);
    setPage(1);
  };
  const handleUserFilterChange = (v: string) => {
    setUserFilter(v);
    setPage(1);
  };
  const handleSortChange = (v: string) => {
    setSortBy(v);
    setPage(1);
  };
  const handlePageSizeChange = (v: string) => {
    setPageSize(Number(v));
    setPage(1);
  };
  const handleFromDateChange = (v: string) => {
    setFromDate(v);
    setPage(1);
  };
  const handleToDateChange = (v: string) => {
    setToDate(v);
    setPage(1);
  };
  const handleClearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* ===== Filter section — grouped card ===== */}
      <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 space-y-3">
      {/* Row 1: Polling indicator + search input */}
      <div className="flex flex-wrap items-center gap-2">
        {polling && (
          <span className="flex items-center gap-1 text-xs text-on-surface-variant">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("polling")}
          </span>
        )}
        {/* B1: Full-text search input with debounce (300ms) */}
        <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-on-surface-variant/50" />
          <Input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("search.placeholder")}
            className="h-9 rounded-md pl-8 pr-8 text-xs"
            aria-label={t("search.aria")}
          />
          {searchInput && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-on-surface-variant/60 hover:bg-surface-container-high hover:text-on-surface"
              aria-label={t("search.clearAria")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Filter dropdowns + date range + page size + sort */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <div className="space-y-1">
          <Label className="text-xs font-medium text-on-surface-variant">{t("filter.action")}</Label>
          <Select value={actionFilter} onValueChange={handleActionFilterChange}>
            <SelectTrigger className="h-9 rounded-md text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tCommon("all")}</SelectItem>
              <SelectItem value="create">{t("action.create")}</SelectItem>
              <SelectItem value="update">{t("action.update")}</SelectItem>
              <SelectItem value="delete">{t("action.delete")}</SelectItem>
              <SelectItem value="export">{t("action.export")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-on-surface-variant">{t("filter.entity")}</Label>
          <Select value={entityFilter} onValueChange={handleEntityFilterChange}>
            <SelectTrigger className="h-9 rounded-md text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tCommon("all")}</SelectItem>
              <SelectItem value="BudgetItem">{t("entities.BudgetItem")}</SelectItem>
              <SelectItem value="Payment">{t("entities.Payment")}</SelectItem>
              <SelectItem value="TimeEntry">{t("entities.TimeEntry")}</SelectItem>
              <SelectItem value="Contact">{t("entities.Contact")}</SelectItem>
              <SelectItem value="Project">{t("entities.Project")}</SelectItem>
              <SelectItem value="ProjectMember">{t("entities.ProjectMember")}</SelectItem>
              <SelectItem value="Note">{t("entities.Note")}</SelectItem>
              <SelectItem value="Export">{t("entities.Export")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* B7: User filter — populated from the `users` array in the API response */}
        <div className="space-y-1">
          <Label className="text-xs font-medium text-on-surface-variant">{t("filter.user")}</Label>
          <Select value={userFilter} onValueChange={handleUserFilterChange}>
            <SelectTrigger className="h-9 rounded-md text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tCommon("all")}</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* B2: Date range — Od */}
        <div className="space-y-1">
          <Label className="text-xs font-medium text-on-surface-variant">{t("filter.from")}</Label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => handleFromDateChange(e.target.value)}
            className="h-9 rounded-md text-xs"
            aria-label={t("filter.fromAria")}
          />
        </div>
        {/* B2: Date range — Do */}
        <div className="space-y-1">
          <Label className="text-xs font-medium text-on-surface-variant">{t("filter.to")}</Label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => handleToDateChange(e.target.value)}
            className="h-9 rounded-md text-xs"
            aria-label={t("filter.toAria")}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-on-surface-variant">{t("filter.sort")}</Label>
          <Select value={sortBy} onValueChange={handleSortChange}>
            <SelectTrigger className="h-9 rounded-md text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">{t("sort.desc")}</SelectItem>
              <SelectItem value="asc">{t("sort.asc")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-on-surface-variant">{t("filter.pageSize")}</Label>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="h-9 rounded-md text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      </div>

      {/* Entries */}
      {loading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-on-surface-variant">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-outline-variant">
          <table className="w-full">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="text-xs font-medium text-on-surface-variant uppercase tracking-wide px-3 py-2 text-left">{t("column.action")}</th>
                <th className="text-xs font-medium text-on-surface-variant uppercase tracking-wide px-3 py-2 text-left">{t("column.detail")}</th>
                <th className="text-xs font-medium text-on-surface-variant uppercase tracking-wide px-3 py-2 text-left">{t("column.author")}</th>
                <th className="text-xs font-medium text-on-surface-variant uppercase tracking-wide px-3 py-2 text-left whitespace-nowrap">{t("column.date")}</th>
                <th className="text-xs font-medium text-on-surface-variant uppercase tracking-wide px-3 py-2 text-left whitespace-nowrap">{t("column.time")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const authorName = entry.user?.name || entry.user?.email || t("author.unknown");
                const authorInitials =
                  authorName
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((s) => s[0]?.toUpperCase() ?? "")
                    .join("") || "?";
                const { date, time } = formatTimestamp(entry.createdAt);
                const description = describeChange(entry, describeHelpers);
                // B4: diff-viewer branch — for update entries where
                // both oldValue and newValue exist (with a field label).
                const hasDiff =
                  entry.action === "update" &&
                  !!entry.field &&
                  !!entry.oldValue &&
                  !!entry.newValue;
                // C6: deep-link target tab (if any)
                const entityTab = ENTITY_TAB_MAP[entry.entityType];
                return (
                  <tr key={entry.id} className="border-b border-outline-variant last:border-0 text-sm hover:bg-surface-container-high">
                    {/* Úkon — action badge + entity type label */}
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col gap-1">
                        <Badge
                          variant="secondary"
                          className={cn("text-xs font-semibold w-fit", ACTION_COLORS[entry.action] ?? "bg-muted text-muted-foreground")}
                        >
                          {actionLabel(entry.action)}
                        </Badge>
                        <span className="text-xs text-on-surface-variant">
                          {entityLabel(entry.entityType)}
                        </span>
                      </div>
                    </td>
                    {/* Detail změny — human-readable description */}
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col gap-1">
                        {/* C6: Entity label — clickable deep-link when there's a tab mapping */}
                        {entry.entityLabel && (
                          entityTab ? (
                            <button
                              type="button"
                              onClick={() => setActiveTab(entityTab)}
                              className="text-sm text-left font-medium text-primary hover:underline"
                              title={t("tooltip.goToTab", { name: entityLabel(entry.entityType) })}
                            >
                              {entry.entityLabel}
                            </button>
                          ) : (
                            <span className="text-sm font-medium">{entry.entityLabel}</span>
                          )
                        )}
                        {/* B4: Diff viewer for update entries with both old & new values */}
                        {hasDiff && entry.field ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-on-surface-variant/70">
                              {fieldLabel(entry.field)}:
                            </span>
                            <span className="text-sm text-danger/70 line-through">
                              {/* B28: DB stores raw values; translate via getFieldValue. */}
                              {getFieldValue(entry.field, entry.oldValue)}
                            </span>
                            <ArrowRight className="h-3 w-3 text-on-surface-variant/40" />
                            <span className="text-sm text-success/80">
                              {getFieldValue(entry.field, entry.newValue)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-on-surface-variant">{description}</span>
                        )}
                      </div>
                    </td>
                    {/* Autor — avatar + name */}
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1.5">
                        <Avatar className="h-7 w-7 shrink-0">
                          {entry.user?.image ? (
                            <AvatarImage src={entry.user.image} alt={authorName} />
                          ) : null}
                          <AvatarFallback className="bg-secondary-container text-[9px] font-bold text-secondary-container-foreground">
                            {authorInitials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium truncate">{authorName}</span>
                      </div>
                    </td>
                    {/* Datum */}
                    <td className="px-3 py-2 align-top text-xs text-on-surface-variant tabular-nums whitespace-nowrap">{date}</td>
                    {/* Čas */}
                    <td className="px-3 py-2 align-top text-xs text-on-surface-variant tabular-nums whitespace-nowrap">{time}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant pt-3">
          <div className="text-xs text-on-surface-variant tabular-nums">
            {t("pagination.summary", {
              from: (page - 1) * pageSize + 1,
              to: Math.min(page * pageSize, total),
              total,
            })}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="rounded-md gap-1.5"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> {t("pagination.prev")}
            </Button>
            <span className="text-xs tabular-nums px-2">
              {t("pagination.pageOf", { page, totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="rounded-md gap-1.5"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              {t("pagination.next")} <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// DeleteProjectButton — with confirmation dialog
// ============================================================
function DeleteProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const t = useTranslations("tabs.management.deleteProject");

  const handleDelete = async () => {
    if (confirmName !== projectName) {
      toast.error(t("toasts.nameMismatch"));
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("toasts.error"));
      }
      toast.success(t("toasts.success"));
      window.location.href = "/";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.error"));
      setDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" className="rounded-full gap-1.5">
          <Trash2 className="h-3.5 w-3.5" /> {t("button")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmTitle", { name: projectName })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("confirmBody")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={projectName} className="h-9" autoFocus />
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmName("")}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={confirmName !== projectName || deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {deleting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t("confirmButton")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================
// QrCode — shareable QR code for the project's public URL
// ------------------------------------------------------------
// Generates a QR code as a data URL using the `qrcode` library.
// The QR encodes `${origin}/p/${projectSlug}` so scanning it opens
// the public read-only project view (or redirects to /auth/login
// if the project isn't public). Provides "Kopírovat odkaz" (copy
// URL) and "Stáhnout PNG" (download QR as PNG) action buttons.
// ============================================================
function QrCode({ projectSlug, projectName }: { projectSlug: string; projectName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState<string>("");
  const [shareUrl, setShareUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const t = useTranslations("tabs.management.sharing.qr");

  // Generate QR code on mount / when projectSlug changes.
  // We compute the share URL inside the effect (not in render) because
  // `window.location.origin` is only available client-side and we don't
  // want SSR/client hydration mismatch. All setState calls happen inside
  // the async `.then()` callback to avoid the "synchronous setState in
  // effect" anti-pattern.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const origin = window.location.origin;
    const url = `${origin}/p/${projectSlug}`;
    if (!canvasRef.current) {
      // Still set the URL so the "Kopírovat odkaz" button works.
      Promise.resolve().then(() => setShareUrl(url));
      return;
    }
    QRCode.toCanvas(canvasRef.current, url, {
      width: 200,
      margin: 2,
      color: {
        dark: "#0a0a0a",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    })
      .then(() => {
        setShareUrl(url);
        // Also capture the data URL for the download button
        if (canvasRef.current) {
          setDataUrl(canvasRef.current.toDataURL("image/png"));
        }
      })
      .catch((err: unknown) => {
        console.error("QR generation failed:", err);
        toast.error(t("toasts.generateError"));
      });
  }, [projectSlug, t]);

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success(t("toasts.copySuccess"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("toasts.copyError"));
    }
  };

  const handleDownloadPng = () => {
    if (!dataUrl) {
      toast.error(t("toasts.qrNotReady"));
      return;
    }
    const safeName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "project";
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `qr-${safeName}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(t("toasts.downloadSuccess"));
  };

  return (
    <>
      {/* QR code canvas — fixed 200×200 with rounded border */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-3 shadow-sm">
        <canvas ref={canvasRef} className="block h-[200px] w-[200px]" aria-label={t("aria", { name: projectName })} />
      </div>

      {/* Display the share URL (truncated) */}
      <div className="type-label-sm flex items-center gap-1.5 text-on-surface-variant">
        <Link2 className="h-3 w-3" />
        <span className="truncate max-w-[280px]">{shareUrl}</span>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full gap-1.5"
          onClick={handleCopyLink}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? t("button.copyLinkCopied") : t("button.copyLink")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full gap-1.5"
          onClick={handleDownloadPng}
          disabled={!dataUrl}
        >
          <Download className="h-3.5 w-3.5" />
          {t("button.downloadPng")}
        </Button>
      </div>
    </>
  );
}
