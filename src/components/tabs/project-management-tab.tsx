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
import QRCode from "qrcode";

// ============================================================
// ProjectManagementTab — full project management page
// ============================================================

export function ProjectManagementTab({ projectId }: { projectId: string }) {
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: budgetItems } = useBudgetItems(projectId);
  const updateProject = useUpdateProject(projectId);

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
      toast.success("Stav exportován");
    } catch {
      toast.error("Export selhal");
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importState.mutateAsync(file);
      toast.success("Stav importován");
    } catch {
      toast.error("Import selhal");
    }
    // Reset the input value so the same file can be selected again.
    e.target.value = "";
  };

  const handleCsv = async (type: "budget" | "payments" | "time" | "contacts") => {
    try {
      await exportCsv.mutateAsync(type);
      toast.success(`${type} exportován do CSV`);
    } catch {
      toast.error("CSV export selhal");
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
          name: `${project.name} (kopie)`,
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
      toast.success(`Projekt duplikován jako "${newProject.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nepodařilo se duplikovat projekt");
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
            Data a exporty
          </CardTitle>
          <CardDescription className="text-sm text-on-surface-variant">
            Úprava projektu, reporty a exporty dat do různých formátů
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
              Upravit projekt
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={openReport}
            >
              <FileText className="h-3.5 w-3.5" />
              Report PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={openAudit}
            >
              <History className="h-3.5 w-3.5" />
              Historie změn
            </Button>
          </div>

          {/* === Export dat ===
              JSON: kompletní stav aplikace (všechny projekty + data).
              CSV: per-section, aktuální projekt (budget / payments / time /
              contacts). Import JSON je owner/admin-only. */}
          <div className="space-y-2">
            <div className="type-label text-on-surface-variant">Export dat</div>
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
                Export JSON
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
                  Import JSON (owner only)
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
              CSV exporty (aktuální projekt)
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
                Rozpočet CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => handleCsv("payments")}
                disabled={exportCsv.isPending}
              >
                <FileText className="h-3.5 w-3.5" />
                Platby CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => handleCsv("time")}
                disabled={exportCsv.isPending}
              >
                <FileText className="h-3.5 w-3.5" />
                Čas CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => handleCsv("contacts")}
                disabled={exportCsv.isPending}
              >
                <FileText className="h-3.5 w-3.5" />
                Kontakty CSV
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
            Audit log — nedávné změny
          </CardTitle>
          <CardDescription className="text-sm text-on-surface-variant">Přehled nedávných akcí v projektu</CardDescription>
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
            Správa projektu
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
                <div className="type-body font-medium">Duplikovat projekt</div>
                <div className="type-label text-on-surface-variant">Vytvoří kopii s rozpočtem (bez plateb a času)</div>
              </div>
            </div>
            <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={handleDuplicate}>
              <Copy className="h-3.5 w-3.5" /> Duplikovat
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
                  <div className="type-body font-medium">Smazat projekt</div>
                  <div className="type-label text-on-surface-variant">Trvale smaže všechna data</div>
                </div>
              </div>
              <DeleteProjectButton projectId={projectId} projectName={project.name} />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="type-body font-medium">Smazat projekt</div>
                  <div className="text-xs text-muted-foreground">
                    {isAdmin
                      ? "Smazat projekt může pouze jeho správce"
                      : "Pouze správce projektu může smazat projekt"}
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
  const [startDate, setStartDate] = useState(project.startDate ? project.startDate.substring(0, 10) : "");
  const [endDate, setEndDate] = useState(project.endDate ? project.endDate.substring(0, 10) : "");

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
  const projectSyncKey = `${project.name}\u0000${project.description ?? ""}\u0000${project.address ?? ""}\u0000${project.status}\u0000${project.startDate ?? ""}\u0000${project.endDate ?? ""}`;
  const [lastSyncKey, setLastSyncKey] = useState(projectSyncKey);
  if (!editing && projectSyncKey !== lastSyncKey) {
    setLastSyncKey(projectSyncKey);
    setName(project.name);
    setDescription(project.description ?? "");
    setAddress(project.address ?? "");
    setStatus(project.status);
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
        startDate: startDate || null,
        endDate: endDate || null,
      });
      toast.success("Projekt upraven");
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nepodařilo se upravit projekt");
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
                <Badge variant="outline" className={cn("text-xs", statusInfo.color)}>{statusInfo.label}</Badge>
                <Badge variant="secondary" className="text-xs gap-1">
                  {userRole === "editor" ? (
                    <>
                      <Edit3 className="h-3 w-3" /> Editor
                    </>
                  ) : (
                    <>
                      <Eye className="h-3 w-3" /> {userRole === "admin" ? "Admin" : "Čtenář"}
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
            <span className="text-xs text-on-surface-variant/60 tabular-nums">Vytvořeno: {formatDate(project.createdAt)}</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Úpravu informací o projektu může provést pouze správce projektu
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
                  <Badge variant="outline" className={cn("text-xs", statusInfo.color)}>{statusInfo.label}</Badge>
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
                Uložit
              </Button>
              <Button variant="outline" size="sm" className="rounded-full" onClick={handleCancel}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="shrink-0 rounded-full gap-1.5" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Upravit
            </Button>
          )}
        </div>
      </CardHeader>
      {editing && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="mgmt-address" className="text-xs font-medium text-on-surface-variant">Adresa</Label>
              <Input id="mgmt-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="např. Praha - Troja" className="h-9 rounded-md border-outline-variant bg-surface-container-low" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mgmt-status" className="text-xs font-medium text-on-surface-variant">Stav</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="mgmt-status" className="h-9 rounded-md border-outline-variant bg-surface-container-low"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Plánování</SelectItem>
                  <SelectItem value="active">Aktivní</SelectItem>
                  <SelectItem value="paused">Pozastaveno</SelectItem>
                  <SelectItem value="completed">Dokončeno</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="mgmt-start" className="text-xs font-medium text-on-surface-variant">Datum zahájení</Label>
              <Input id="mgmt-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 rounded-md border-outline-variant bg-surface-container-low" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mgmt-end" className="text-xs font-medium text-on-surface-variant">Datum dokončení</Label>
              <Input id="mgmt-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 rounded-md border-outline-variant bg-surface-container-low" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="mgmt-desc" className="text-xs font-medium text-on-surface-variant">Popis</Label>
            <Textarea id="mgmt-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Krátký popis projektu…" rows={2} className="resize-y rounded-md border-outline-variant bg-surface-container-low" />
          </div>
        </CardContent>
      )}
      {!editing && (
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-4 text-xs text-on-surface-variant">
            {project.address && (<span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {project.address}</span>)}
            {project.startDate && (<span className="flex items-center gap-1 tabular-nums"><Calendar className="h-3 w-3" /> {formatDate(project.startDate)}{project.endDate && ` — ${formatDate(project.endDate)}`}</span>)}
            <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {project.currency}</span>
            <span className="text-xs text-on-surface-variant/60 tabular-nums">Vytvořeno: {formatDate(project.createdAt)}</span>
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
      toast.error("Odkazy musí být platné URL (http:// nebo https://).");
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
      toast.success("Informace o nemovitosti uloženy");
      setEditing(false);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Nepodařilo se uložit informace o nemovitosti",
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
              Informace o nemovitosti
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-on-surface-variant">
              Přesná adresa, energetické hodnocení a projektová dokumentace
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
                  Uložit
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
                <Pencil className="h-4 w-4" /> Upravit
              </Button>
            ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing && canEdit ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="mgmt-fulladdress" className="text-xs font-medium text-on-surface-variant">
                Přesná adresa
              </Label>
              <Input
                id="mgmt-fulladdress"
                value={fullAddress}
                onChange={(e) => setFullAddress(e.target.value)}
                placeholder="např. Pražská 12, 110 00 Praha 1"
                className="h-9 rounded-md border-outline-variant bg-surface-container-low"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="mgmt-floorarea" className="text-xs font-medium text-on-surface-variant">
                  Zastavěná plocha (m²)
                </Label>
                <Input
                  id="mgmt-floorarea"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={floorArea}
                  onChange={(e) => setFloorArea(e.target.value)}
                  placeholder="např. 120"
                  className="h-9 rounded-md border-outline-variant bg-surface-container-low"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mgmt-floors" className="text-xs font-medium text-on-surface-variant">
                  Počet podlaží
                </Label>
                <Input
                  id="mgmt-floors"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={floors}
                  onChange={(e) => setFloors(e.target.value)}
                  placeholder="např. 2"
                  className="h-9 rounded-md border-outline-variant bg-surface-container-low"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="mgmt-heatloss" className="text-xs font-medium text-on-surface-variant">
                  Tepelná ztráta (W/K)
                </Label>
                <Input
                  id="mgmt-heatloss"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={heatLoss}
                  onChange={(e) => setHeatLoss(e.target.value)}
                  placeholder="např. 85"
                  className="h-9 rounded-md border-outline-variant bg-surface-container-low"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mgmt-energy" className="text-xs font-medium text-on-surface-variant">
                  Energetický štítek
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
                Odkaz na architektonickou studii
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
                  Zadejte platnou URL (http:// nebo https://).
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="mgmt-docurl" className="text-xs font-medium text-on-surface-variant">
                Odkaz na projektovou dokumentaci
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
                  Zadejte platnou URL (http:// nebo https://).
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="mgmt-propnote" className="text-xs font-medium text-on-surface-variant">
                Poznámka
              </Label>
              <Textarea
                id="mgmt-propnote"
                value={propertyNote}
                onChange={(e) => setPropertyNote(e.target.value)}
                rows={3}
                placeholder="Volná poznámka k nemovitosti…"
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
              label="Přesná adresa"
              value={project.fullAddress}
            />
            <PropertyMetadataItem
              icon={Ruler}
              label="Zastavěná plocha"
              value={
                project.floorArea != null ? `${project.floorArea} m²` : null
              }
            />
            <PropertyMetadataItem
              icon={Layers}
              label="Počet podlaží"
              value={project.floors != null ? String(project.floors) : null}
            />
            <PropertyMetadataItem
              icon={Flame}
              label="Tepelná ztráta"
              value={project.heatLoss != null ? `${project.heatLoss} W/K` : null}
            />
            {/* Energetický štítek — badge A–G s MD3 soft barvou. */}
            <div className="space-y-2">
              <dt className="flex items-center gap-1 text-xs font-medium text-on-surface-variant">
                <Gauge className="h-3 w-3" /> Energetický štítek
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
              label="Architektonická studie"
              value={project.studyUrl}
              href={project.studyUrl}
            />
            <PropertyMetadataItem
              icon={FileText}
              label="Projektová dokumentace"
              value={project.documentationUrl}
              href={project.documentationUrl}
            />
            <div className="sm:col-span-2 space-y-2">
              <dt className="flex items-center gap-1 text-xs font-medium text-on-surface-variant">
                <StickyNote className="h-3 w-3" /> Poznámka
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
            <Lock className="h-3 w-3" /> Úpravu informací o nemovitosti může
            provést pouze správce projektu
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

// Status → human-readable label + badge color (MD3 sémantic tokens).
const INVITATION_STATUS_META: Record<
  InvitationRow["status"],
  { label: string; className: string }
> = {
  pending: {
    label: "Čeká",
    className: "bg-warning-soft text-warning-strong",
  },
  accepted: {
    label: "Přijato",
    className: "bg-success-soft text-success-strong",
  },
  rejected: {
    label: "Odmítnuto",
    className: "bg-muted text-muted-foreground",
  },
  revoked: {
    label: "Zrušeno",
    className: "bg-muted text-muted-foreground",
  },
  expired: {
    label: "Vypršelo",
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
        toast.success("Odkaz na projekt zkopírován do schránky");
      } else {
        toast.warning(
          "Projekt není veřejný — odkaz přesměruje na přihlášení",
        );
      }
      trackEvent("project_share", { action: "copy_link", role: "viewer", isPublic });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nepodařilo se zkopírovat odkaz");
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
              ? "Projekt je nyní veřejný — kdokoliv s odkazem ho může vidět"
              : "Projekt je nyní soukromý",
          );
          trackEvent("project_share", { action: "toggle_public", isPublic: next });
        },
        onError: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : "Nepodařilo se změnit viditelnost projektu");
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
      toast.warning("Tento uživatel je již členem projektu");
      setLastToastEmail(typedEmail);
    } else if (!isExistingMember && lastToastEmail && lastToastEmail !== typedEmail) {
      setLastToastEmail("");
    }
  }, [isExistingMember, typedEmail, lastToastEmail]);

  const handleAdd = async () => {
    if (!addEmail.trim()) return;
    if (isExistingMember) {
      toast.warning("Tento uživatel je již členem projektu");
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
        throw new Error(err.error || "Nepodařilo se odeslat pozvánku");
      }
      // Telemetry: project_share — invite
      trackEvent("project_share", {
        action: "invite",
        email: addEmail.trim(),
        role: addRole,
      });
      toast.success(`Pozvánka odeslána na ${addEmail.trim()}`);
      setAddEmail("");
      setLastToastEmail("");
      // Refresh the invitations list so the new pending row appears.
      fetchInvitations();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nepodařilo se odeslat pozvánku");
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
      toast.success(`Pozvánka pro ${email} zrušena`);
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
      toast.error(err instanceof Error ? err.message : "Nepodařilo se zrušit pozvánku");
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
      toast.success("Role upravena");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nepodařilo se upravit roli");
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
      toast.success(`Člen "${name}" odebrán`);
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
      toast.error(err instanceof Error ? err.message : "Nepodařilo se odebrat člena — člen byl obnoven");
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
      toast.success("Správce změněn");
      qc.invalidateQueries({ queryKey: ["projects"] });
      fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nepodařilo se změnit správce");
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
              Sdílení a přístupová práva
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-on-surface-variant">Správa veřejnosti, správce, členů a pozvánek projektu</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 rounded-full gap-1.5"
            onClick={handleShare}
            title="Zkopírovat odkaz na veřejný pohled"
            aria-label="Zkopírovat odkaz na veřejný pohled"
          >
            <Share2 className="h-3.5 w-3.5" />
            Sdílet
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ===== Public project toggle ===== */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-6">
          <div className="min-w-0">
            <p className="type-body font-medium">Veřejný projekt</p>
            <p className="type-label text-on-surface-variant">
              Kdokoliv s odkazem může vidět projekt (pouze pro čtení)
            </p>
          </div>
          <Switch
            checked={isPublic}
            onCheckedChange={handleTogglePublic}
            disabled={!canManage || updateProject.isPending}
            aria-label="Přepnout veřejnost projektu"
          />
        </div>
        {/* Editors see a "Pouze správce" hint explaining why the Switch
            is disabled. Owners / admins don't need this. */}
        {!canManage && (
          <div className="-mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Pouze správce může měnit veřejnost projektu
          </div>
        )}
        <div className="flex items-start gap-2 rounded-lg bg-info/5 p-2.5 text-xs text-on-surface-variant">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-info" />
          <span>
            Veřejný projekt: Kdokoliv s odkazem může vidět projekt (pouze pro čtení). Vypněte pro soukromí.
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
                <Badge variant="secondary" className={cn("type-label-sm", "bg-success-soft text-success-strong dark:bg-success-soft dark:text-success-strong")}>Správce</Badge>
              </div>
              <div className="type-label text-on-surface-variant truncate">{owner.email}</div>
            </div>
            {/* Change owner dropdown — owner / admin only. Editors
                cannot transfer ownership (the API also rejects this —
                `requireProjectAccess(id, "owner")` in the PATCH handler). */}
            {canManage && allUsers.length > 0 && (
              <Select onValueChange={handleChangeOwner}>
                <SelectTrigger className="h-8 w-auto rounded-full type-label-sm">
                  <span className="flex items-center gap-1"><ArrowRight className="h-3 w-3" /> Předat</span>
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
                        {m.role === "editor" ? "Editor" : "Čtenář"}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer"><Eye className="mr-1.5 inline h-3 w-3" /> Čtenář (pouze čtení)</SelectItem>
                        <SelectItem value="editor"><Edit3 className="mr-1.5 inline h-3 w-3" /> Editor (úpravy)</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary" className={cn("type-label-sm gap-1", m.role === "editor" ? "bg-info-soft text-info-strong dark:bg-info-soft dark:text-info-strong" : "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground")}>
                      {m.role === "editor" ? <Edit3 className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {m.role === "editor" ? "Editor" : "Čtenář"}
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
                      aria-label={isSelf && !canManage ? "Opustit projekt" : "Odebrat člena"}
                      title={isSelf && !canManage ? "Opustit projekt" : "Odebrat člena"}
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
          <p className="type-label text-on-surface-variant">Zatím nebyli přidáni žádní členové.</p>
        )}

        {/* ===== Pending invitations list ===== */}
        {(pendingInvitations.length > 0 || invitationsLoading) && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 type-label text-on-surface-variant">
              <Mail className="h-3.5 w-3.5" /> Čekající pozvánky
            </div>
            {invitationsLoading ? (
              <Skeleton className="h-12" />
            ) : (
              pendingInvitations.map((inv) => {
                const isRevoking = revokingIds.has(inv.id);
                const roleLabel = inv.role === "editor" ? "Editor" : "Čtenář";
                const isExpired = new Date(inv.expiresAt) < new Date();
                const statusMeta = isExpired
                  ? INVITATION_STATUS_META.expired
                  : INVITATION_STATUS_META[inv.status] ?? INVITATION_STATUS_META.pending;
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
                        Role: {roleLabel} · Platnost do: {formatDate(inv.expiresAt, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <Badge variant="secondary" className={cn("type-label-sm", statusMeta.className)}>
                      {statusMeta.label}
                    </Badge>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 rounded-full state-layer-on-surface text-muted-foreground hover:text-danger"
                        onClick={() => handleRevokeInvitation(inv.id, inv.inviteeEmail)}
                        disabled={isRevoking}
                        aria-label="Zrušit pozvánku"
                        title="Zrušit pozvánku"
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
              Historie pozvánek ({pastInvitations.length})
            </summary>
            <div className="mt-2 space-y-1.5">
              {pastInvitations.map((inv) => {
                const roleLabel = inv.role === "editor" ? "Editor" : "Čtenář";
                const statusMeta =
                  INVITATION_STATUS_META[inv.status] ?? INVITATION_STATUS_META.pending;
                return (
                  <div
                    key={inv.id}
                    className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-2.5 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{inv.inviteeEmail}</div>
                      <div className="type-label text-on-surface-variant truncate">
                        Role: {roleLabel} · Vytvořeno: {formatDate(inv.createdAt)}
                      </div>
                    </div>
                    <Badge variant="secondary" className={cn("type-label-sm", statusMeta.className)}>
                      {statusMeta.label}
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
            <UserPlus className="h-3.5 w-3.5" /> Pozvat e-mailem
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="e-mail@example.com"
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
                {addRole === "editor" ? "Editor" : "Čtenář"}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer"><Eye className="mr-1.5 inline h-3 w-3" /> Čtenář</SelectItem>
                <SelectItem value="editor"><Edit3 className="mr-1.5 inline h-3 w-3" /> Editor</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="rounded-full gap-1.5" onClick={handleAdd} disabled={!addEmail.trim() || adding || !canInvite}>
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              Pozvat e-mailem
            </Button>
          </div>
          {/* Hints */}
          {isExistingMember && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-warning">
              <AlertTriangle className="h-3 w-3" /> Tento uživatel je již členem projektu
            </div>
          )}
          {isNewUserHint && !isExistingMember && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-info">
              <Info className="h-3 w-3" /> Nový uživatel — pozvánka mu přijde na e-mail, po registraci získá přístup
            </div>
          )}
          {/* Editors can invite but only as viewer/editor — surface this
              so the role Select makes sense. Viewers see the standard
              "owner-only" lock hint (they never reach this tab through the
              sidebar, but the gate also covers direct deep-links). */}
          {userRole === "editor" && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-info">
              <Info className="h-3 w-3" /> Jako editor můžete přidávat pouze Čtenáře nebo Editory
            </div>
          )}
          {!canInvite && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" /> Pozvat nové uživatele může pouze správce projektu
            </div>
          )}
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-info/5 p-2.5 text-xs text-on-surface-variant">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-info" />
          <span>
            Pozvat e-mailem: Pozvaný uživatel získá přístup po přihlášení nebo registraci s daným e-mailem. Platnost pozvánky: 24 hodin.
          </span>
        </div>

        {/* ===== QR code — share via scan ===== */}
        <div className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
          <div className="mb-3 flex items-center gap-2">
            <QrCodeIcon className="h-4 w-4 text-primary" />
            <span className="type-body font-medium">QR kód projektu</span>
          </div>
          <p className="mb-3 type-label text-on-surface-variant">
            Naskenujte QR kód pro otevření projektu na mobilu.
          </p>
          <div className="flex flex-col items-center gap-3">
            <QrCode projectSlug={projectSlug} projectName={projectName} />
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-info/5 p-2.5 text-xs text-on-surface-variant">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-info" />
          <span>
            QR kód: Naskenujte pro otevření projektu na mobilu. Odkazuje na veřejný pohled projektu.
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
          <AlertDialogTitle>Opravdu odebrat člena?</AlertDialogTitle>
          <AlertDialogDescription>
            Opravdu chcete odebrat uživatele „{confirmRemove?.name}" z tohoto
            projektu? Ztratí přístup ke všem datům projektu. Tuto akci lze
            vrátit přidáním člena zpět.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Zrušit</AlertDialogCancel>
          <AlertDialogAction onClick={confirmRemoveMember}>
            Odebrat člena
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

const ACTION_LABELS: Record<string, string> = {
  create: "Vytvořeno",
  update: "Upraveno",
  delete: "Smazáno",
  export: "Exportováno",
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

const ENTITY_LABELS: Record<string, string> = {
  BudgetItem: "Položka rozpočtu",
  Payment: "Platba",
  TimeEntry: "Čas",
  Contact: "Kontakt",
  Project: "Projekt",
  Note: "Poznámka",
  ContactPerson: "Kontaktní osoba",
  ProjectMember: "Člen",
  Export: "Export",
};

// Generate a human-readable description of what happened
function describeChange(entry: AuditEntry): string {
  const entityLabel = entry.entityLabel || ENTITY_LABELS[entry.entityType] || entry.entityType;

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
          const roleLabel = role === "editor" ? "Editor" : role === "owner" ? "Správce" : "Čtenář";
          return `Přidán člen (${roleLabel}): ${email}`;
        }
        if (name) return `Vytvořeno: ${name}`;
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
          const roleLabel = role === "editor" ? "Editor" : role === "owner" ? "Správce" : "Čtenář";
          return `Odebrán člen (${roleLabel}): ${email}`;
        }
        const name = parsed.name ?? parsed.subcategory ?? parsed.workerName ?? parsed.author;
        if (name) return `Smazáno: ${name}`;
      }
    } catch {
      // Not JSON
    }
    return entry.oldValue.length < 200 ? entry.oldValue : entityLabel;
  }

  // Update — field-level change
  if (entry.action === "update" && entry.field) {
    const fieldLabel = FIELD_LABELS_UI[entry.field] ?? entry.field;
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
      return `${fieldLabel}: odstraněno (${getFieldValue(entry.field, entry.oldValue)})`;
    }
  }

  return entityLabel;
}

// Human-readable field labels for UI display
const FIELD_LABELS_UI: Record<string, string> = {
  required: "Povinnost",
  completed: "Hotovo",
  rejected: "Zavržení",
  starred: "Oblíbený",
  status: "Stav",
  role: "Role",
  phase: "Fáze",
  category: "Kategorie",
  subcategory: "Název",
  planCost: "Plán (Kč)",
  actualCost: "Skutečnost (Kč)",
  planDays: "Plán (dní)",
  flexibilityPercent: "Vůle (%)",
  dateFrom: "Datum od",
  dateTo: "Datum do",
  note: "Poznámka",
  name: "Jméno",
  email: "E-mail",
  phone: "Telefon",
  address: "Adresa",
  description: "Popis",
  currency: "Měna",
  ownerId: "Vlastník",
  contactId: "Kontakt",
  workerName: "Pracovník",
  workerType: "Typ pracovníka",
  workerCount: "Počet pracovníků",
  hours: "Hodiny",
  amount: "Částka",
  type: "Typ",
  vendor: "Firma",
  invoiceNumber: "Číslo faktury",
  vatRate: "Sazba DPH",
  vatAmount: "Částka DPH",
  website: "Web",
  company: "Firma",
  ico: "IČO",
  dic: "DIČ",
  rating: "Hodnocení",
  sortOrder: "Pořadí",
  text: "Text",
  author: "Autor",
  userEmail: "E-mail člena",
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
            Načítání...
          </span>
        )}
        {/* B1: Full-text search input with debounce (300ms) */}
        <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-on-surface-variant/50" />
          <Input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Hledat v audit logu…"
            className="h-9 rounded-md pl-8 pr-8 text-xs"
            aria-label="Hledat v audit logu"
          />
          {searchInput && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-on-surface-variant/60 hover:bg-surface-container-high hover:text-on-surface"
              aria-label="Vyčistit hledání"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Filter dropdowns + date range + page size + sort */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <div className="space-y-1">
          <Label className="text-xs font-medium text-on-surface-variant">Akce</Label>
          <Select value={actionFilter} onValueChange={handleActionFilterChange}>
            <SelectTrigger className="h-9 rounded-md text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Vše</SelectItem>
              <SelectItem value="create">Vytvořeno</SelectItem>
              <SelectItem value="update">Upraveno</SelectItem>
              <SelectItem value="delete">Smazáno</SelectItem>
              <SelectItem value="export">Exportováno</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-on-surface-variant">Entita</Label>
          <Select value={entityFilter} onValueChange={handleEntityFilterChange}>
            <SelectTrigger className="h-9 rounded-md text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Vše</SelectItem>
              <SelectItem value="BudgetItem">Položka rozpočtu</SelectItem>
              <SelectItem value="Payment">Platba</SelectItem>
              <SelectItem value="TimeEntry">Čas</SelectItem>
              <SelectItem value="Contact">Kontakt</SelectItem>
              <SelectItem value="Project">Projekt</SelectItem>
              <SelectItem value="ProjectMember">Člen</SelectItem>
              <SelectItem value="Note">Poznámka</SelectItem>
              <SelectItem value="Export">Export</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* B7: User filter — populated from the `users` array in the API response */}
        <div className="space-y-1">
          <Label className="text-xs font-medium text-on-surface-variant">Autor</Label>
          <Select value={userFilter} onValueChange={handleUserFilterChange}>
            <SelectTrigger className="h-9 rounded-md text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Vše</SelectItem>
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
          <Label className="text-xs font-medium text-on-surface-variant">Od</Label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => handleFromDateChange(e.target.value)}
            className="h-9 rounded-md text-xs"
            aria-label="Filtr od data"
          />
        </div>
        {/* B2: Date range — Do */}
        <div className="space-y-1">
          <Label className="text-xs font-medium text-on-surface-variant">Do</Label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => handleToDateChange(e.target.value)}
            className="h-9 rounded-md text-xs"
            aria-label="Filtr do data"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-on-surface-variant">Řazení</Label>
          <Select value={sortBy} onValueChange={handleSortChange}>
            <SelectTrigger className="h-9 rounded-md text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Nejnovější</SelectItem>
              <SelectItem value="asc">Nejstarší</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-on-surface-variant">Na stránku</Label>
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
          Žádné záznamy pro vybrané filtry.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-outline-variant">
          <table className="w-full">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="text-xs font-medium text-on-surface-variant uppercase tracking-wide px-3 py-2 text-left">Úkon</th>
                <th className="text-xs font-medium text-on-surface-variant uppercase tracking-wide px-3 py-2 text-left">Detail změny</th>
                <th className="text-xs font-medium text-on-surface-variant uppercase tracking-wide px-3 py-2 text-left">Autor</th>
                <th className="text-xs font-medium text-on-surface-variant uppercase tracking-wide px-3 py-2 text-left whitespace-nowrap">Datum</th>
                <th className="text-xs font-medium text-on-surface-variant uppercase tracking-wide px-3 py-2 text-left whitespace-nowrap">Čas</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const authorName = entry.user?.name || entry.user?.email || "Neznámý";
                const authorInitials =
                  authorName
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((s) => s[0]?.toUpperCase() ?? "")
                    .join("") || "?";
                const { date, time } = formatTimestamp(entry.createdAt);
                const description = describeChange(entry);
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
                          {ACTION_LABELS[entry.action] ?? entry.action}
                        </Badge>
                        <span className="text-xs text-on-surface-variant">
                          {ENTITY_LABELS[entry.entityType] ?? entry.entityType}
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
                              title={`Přejít na záložku ${ENTITY_LABELS[entry.entityType] ?? entry.entityType}`}
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
                              {FIELD_LABELS_UI[entry.field] ?? entry.field}:
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
            Zobrazeno {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} z {total}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="rounded-md gap-1.5"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Předchozí
            </Button>
            <span className="text-xs tabular-nums px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="rounded-md gap-1.5"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Další <ChevronRight className="h-3.5 w-3.5" />
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

  const handleDelete = async () => {
    if (confirmName !== projectName) {
      toast.error("Název projektu se neshoduje");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete project");
      }
      toast.success("Projekt smazán");
      window.location.href = "/";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nepodařilo se smazat projekt");
      setDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" className="rounded-full gap-1.5">
          <Trash2 className="h-3.5 w-3.5" /> Smazat
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Smazat projekt „{projectName}"?</AlertDialogTitle>
          <AlertDialogDescription>
            Tato akce je nevratná. Všechna data budou trvale smazána. Pro potvrzení napište název projektu:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={projectName} className="h-9" autoFocus />
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmName("")}>Zrušit</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={confirmName !== projectName || deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {deleting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Smazat projekt
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
        toast.error("Nepodařilo se vygenerovat QR kód");
      });
  }, [projectSlug]);

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Odkaz zkopírován do schránky");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Kopírování selhalo — zkopírujte odkaz ručně");
    }
  };

  const handleDownloadPng = () => {
    if (!dataUrl) {
      toast.error("QR kód ještě není vygenerován");
      return;
    }
    const safeName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "projekt";
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `qr-${safeName}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("QR kód stažen jako PNG");
  };

  return (
    <>
      {/* QR code canvas — fixed 200×200 with rounded border */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-3 shadow-sm">
        <canvas ref={canvasRef} className="block h-[200px] w-[200px]" aria-label={`QR kód pro projekt ${projectName}`} />
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
          {copied ? "Zkopírováno" : "Kopírovat odkaz"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full gap-1.5"
          onClick={handleDownloadPng}
          disabled={!dataUrl}
        >
          <Download className="h-3.5 w-3.5" />
          Stáhnout PNG
        </Button>
      </div>
    </>
  );
}
