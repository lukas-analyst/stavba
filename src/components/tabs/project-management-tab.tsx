"use client";

import { useState, useCallback } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  MapPin,
  Calendar,
  Wallet,
  Users,
  Table2,
  Receipt,
  Clock,
  Download,
  Upload,
  FileSpreadsheet,
  Copy,
  Trash2,
  History,
  AlertTriangle,
  Settings,
  Star,
  Pencil,
  Check,
  X,
  Loader2,
} from "lucide-react";
import {
  useProjects,
  useUpdateProject,
  useDashboard,
  useContacts,
  useBudgetItems,
  useExportState,
  useImportState,
  useExportCsv,
} from "@/lib/api";
import { formatCzk, formatDate, STATUS_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
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

// ============================================================
// ProjectManagementTab — full project management page
// ------------------------------------------------------------
// Accessible from TopBar project dropdown ("Spravovat projekt").
// Contains: project info (inline edit), quick stats, category/phase
// overview, contacts summary, export/import, audit log, danger zone.
// ============================================================

export function ProjectManagementTab({ projectId }: { projectId: string }) {
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: dashboard, isLoading: dashLoading } = useDashboard(projectId);
  const { data: contacts } = useContacts(projectId);
  const { data: budgetItems } = useBudgetItems(projectId);
  const updateProject = useUpdateProject(projectId);
  const exportState = useExportState();
  const importState = useImportState();
  const exportCsv = useExportCsv(projectId);

  const project = projects?.find((p) => p.id === projectId);

  if (projectsLoading || !project) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const totals = dashboard?.totals;
  const stats = project.stats;

  // ===== Handlers =====
  const handleExport = async () => {
    try {
      await exportState.mutateAsync();
      toast.success("Stav exportován");
    } catch {
      toast.error("Export selhal");
    }
  };

  const handleCsv = async (type: "budget" | "payments" | "time" | "contacts") => {
    try {
      await exportCsv.mutateAsync(type);
      toast.success(`CSV — ${type} exportováno`);
    } catch {
      toast.error("CSV export selhal");
    }
  };

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
      if (!res.ok) throw new Error("Failed to duplicate project");
      const newProject = await res.json();
      // Copy budget items
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
    } catch {
      toast.error("Nepodařilo se duplikovat projekt");
    }
  };

  return (
    <div id="management-root" className="space-y-6">
      {/* ===== Project Info Card (inline editable) ===== */}
      <ProjectInfoCard project={project} updateProject={updateProject} />

      {/* ===== Quick Stats Grid ===== */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <StatCard
          icon={<Wallet className="h-4 w-4 text-success" />}
          label="Plán rozpočtu"
          value={stats ? formatCzk(stats.planTotal) : "—"}
          subtitle={stats ? `${stats.itemCount} položek` : ""}
          tone="success"
          loading={projectsLoading}
        />
        <StatCard
          icon={<Receipt className="h-4 w-4 text-warning" />}
          label="Čerpání"
          value={stats ? formatCzk(stats.actualTotal) : "—"}
          subtitle={stats ? `${stats.burnRate.toFixed(0)}%` : ""}
          tone="warning"
          loading={projectsLoading}
        />
        <StatCard
          icon={<Wallet className="h-4 w-4 text-info" />}
          label="Zbývá"
          value={stats ? formatCzk(stats.remaining) : "—"}
          subtitle=""
          tone="info"
          loading={projectsLoading}
        />
        <StatCard
          icon={<Clock className="h-4 w-4 text-time" />}
          label="Hodiny"
          value={stats ? `${stats.hoursTotal} h` : "—"}
          subtitle={stats ? `${stats.daysPlanned} dní plán` : ""}
          tone="time"
          loading={projectsLoading}
        />
        <StatCard
          icon={<Users className="h-4 w-4 text-primary" />}
          label="Kontakty"
          value={String(contacts?.length ?? 0)}
          subtitle={project._count?.contacts ? `${project._count.contacts} celkem` : ""}
          tone="primary"
          loading={false}
        />
        <StatCard
          icon={<Table2 className="h-4 w-4 text-subsidy" />}
          label="Položky"
          value={String(budgetItems?.length ?? 0)}
          subtitle={stats ? `${stats.requiredCount} nutných` : ""}
          tone="subsidy"
          loading={false}
        />
      </div>

      {/* ===== Category & Phase Overview ===== */}
      {dashboard && (
        <Card className="bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="type-title-lg">Přehled fází</CardTitle>
            <CardDescription>Plán vs. skutečnost a stav dokončení</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dashboard.byPhase.map((p) => {
                const burnPct = p.plan > 0 ? (p.actual / p.plan) * 100 : 0;
                const completionPct = p.count > 0 ? (p.completedCount / p.count) * 100 : 0;
                return (
                  <div key={p.phase} className="space-y-1">
                    <div className="flex items-center justify-between type-body">
                      <span className="font-medium">{p.phase}</span>
                      <span className="type-label text-on-surface-variant tabular-nums">
                        {p.count} položek · {formatCzk(p.actual)} / {formatCzk(p.plan)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container-high">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            burnPct > 100 ? "bg-danger" : burnPct > 80 ? "bg-warning" : "bg-success",
                          )}
                          style={{ width: `${Math.min(burnPct, 100)}%` }}
                        />
                      </div>
                      <span className="w-24 text-right type-label-sm text-on-surface-variant tabular-nums">
                        {p.completedCount}/{p.count} ({completionPct.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Contacts Summary ===== */}
      {contacts && contacts.length > 0 && (
        <Card className="bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="type-title-lg">Kontakty projektu</CardTitle>
            <CardDescription>{contacts.length} kontaktů přiřazeno k projektu</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary-container type-label-sm font-bold text-secondary-container-foreground">
                    {c.name[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate type-body font-medium">{c.name}</div>
                    <div className="truncate type-label text-on-surface-variant">
                      {c.role || c.type}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Export & Import ===== */}
      <CollapsibleSection title="Export a Import dat" defaultOpen>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={handleExport} disabled={exportState.isPending}>
              {exportState.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Export stavu (JSON)
            </Button>
            <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => handleCsv("budget")} disabled={exportCsv.isPending}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV — Rozpočet
            </Button>
            <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => handleCsv("payments")} disabled={exportCsv.isPending}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV — Platby
            </Button>
            <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => handleCsv("time")} disabled={exportCsv.isPending}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV — Čas
            </Button>
            <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => handleCsv("contacts")} disabled={exportCsv.isPending}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV — Kontakty
            </Button>
          </div>
          <ImportButton importState={importState} />
        </div>
      </CollapsibleSection>

      {/* ===== Audit Log ===== */}
      <CollapsibleSection title="Audit log — nedávné změny">
        <AuditSummary projectId={projectId} />
      </CollapsibleSection>

      {/* ===== Danger Zone ===== */}
      <Card className="border-danger/30 bg-danger-soft/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 type-title-lg text-danger">
            <AlertTriangle className="h-4 w-4" />
            Správa projektu
          </CardTitle>
          <CardDescription>Duplikovat nebo smazat projekt — akce nelze vrátit zpět</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Duplicate */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-card p-3">
            <div className="flex items-center gap-2">
              <Copy className="h-4 w-4 text-info" />
              <div>
                <div className="type-body font-medium">Duplikovat projekt</div>
                <div className="type-label text-on-surface-variant">
                  Vytvoří kopii s rozpočtem (bez plateb a času)
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={handleDuplicate}>
              <Copy className="h-3.5 w-3.5" /> Duplikovat
            </Button>
          </div>

          {/* Delete */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft/20 p-3">
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-danger" />
              <div>
                <div className="type-body font-medium">Smazat projekt</div>
                <div className="type-label text-on-surface-variant">
                  Trvale smaže projekt, rozpočet, platby, čas, kontakty a poznámky
                </div>
              </div>
            </div>
            <DeleteProjectButton projectId={projectId} projectName={project.name} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// ProjectInfoCard — inline editable project info
// ============================================================
function ProjectInfoCard({
  project,
  updateProject,
}: {
  project: NonNullable<ReturnType<typeof useProjects>["data"]>[number];
  updateProject: ReturnType<typeof useUpdateProject>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [address, setAddress] = useState(project.address ?? "");
  const [status, setStatus] = useState(project.status);
  const [startDate, setStartDate] = useState(project.startDate ? project.startDate.substring(0, 10) : "");
  const [endDate, setEndDate] = useState(project.endDate ? project.endDate.substring(0, 10) : "");

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
    } catch {
      toast.error("Nepodařilo se upravit projekt");
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

  return (
    <Card className="bg-card shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 type-headline">
              {editing ? (
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-8 max-w-md text-lg font-bold"
                  autoFocus
                />
              ) : (
                <>
                  {project.name}
                  <Badge variant="outline" className={cn("type-label-sm", statusInfo.color)}>
                    {statusInfo.label}
                  </Badge>
                  {project.starred && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
                </>
              )}
            </CardTitle>
            {!editing && project.description && (
              <CardDescription className="mt-1 type-body">
                {project.description}
              </CardDescription>
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
              <Label htmlFor="mgmt-address" className="type-label-sm">Adresa</Label>
              <Input id="mgmt-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="např. Praha - Troja" className="h-9" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mgmt-status" className="type-label-sm">Stav</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="mgmt-status" className="h-9">
                  <SelectValue />
                </SelectTrigger>
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
              <Label htmlFor="mgmt-start" className="type-label-sm">Datum zahájení</Label>
              <Input id="mgmt-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mgmt-end" className="type-label-sm">Datum dokončení</Label>
              <Input id="mgmt-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="mgmt-desc" className="type-label-sm">Popis</Label>
            <Textarea id="mgmt-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Krátký popis projektu…" rows={2} className="resize-y" />
          </div>
        </CardContent>
      )}
      {!editing && (
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-4 type-label text-on-surface-variant">
            {project.address && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {project.address}
              </span>
            )}
            {project.startDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {formatDate(project.startDate)}
                {project.endDate && ` — ${formatDate(project.endDate)}`}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3" /> {project.currency}
            </span>
            <span className="type-label-sm text-on-surface-variant/60">
              Vytvořeno: {formatDate(project.createdAt)}
            </span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ============================================================
// StatCard — compact stat card for quick stats grid
// ============================================================
function StatCard({
  icon,
  label,
  value,
  subtitle,
  tone,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
  tone: "success" | "warning" | "info" | "time" | "primary" | "subsidy";
  loading: boolean;
}) {
  const toneBg: Record<string, string> = {
    success: "bg-success-soft",
    warning: "bg-warning-soft",
    info: "bg-info-soft",
    time: "bg-time-soft",
    primary: "bg-primary/10",
    subsidy: "bg-subsidy-soft",
  };
  return (
    <Card className={cn("bg-card shadow-sm", `border-${tone}/30`)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="type-overline text-on-surface-variant">{label}</CardTitle>
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", toneBg[tone])}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-6 w-20" />
        ) : (
          <div className="type-display tabular-nums">{value}</div>
        )}
        {subtitle && <p className="mt-0.5 type-label text-on-surface-variant">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

// ============================================================
// ImportButton — hidden file input for JSON import
// ============================================================
function ImportButton({ importState }: { importState: ReturnType<typeof useImportState> }) {
  return (
    <label className="inline-flex">
      <input
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            await importState.mutateAsync(file);
            toast.success("Stav importován");
          } catch {
            toast.error("Import selhal");
          }
          e.target.value = "";
        }}
      />
      <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 type-label hover:bg-surface-container-high">
        <Upload className="h-3.5 w-3.5" /> Import stavu (JSON)
      </span>
    </label>
  );
}

// ============================================================
// AuditSummary — recent changes
// ============================================================
function AuditSummary({ projectId }: { projectId: string }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch audit log on mount
  useState(() => {
    fetch(`/api/projects/${projectId}/audit?limit=10`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        setEntries(data);
        setLoading(false);
      })
      .catch(() => {
        setEntries([]);
        setLoading(false);
      });
  });

  if (loading) return <Skeleton className="h-20" />;
  if (!entries || entries.length === 0) {
    return <p className="type-label text-on-surface-variant">Žádné zaznamenané změny.</p>;
  }

  return (
    <div className="space-y-1.5">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-1.5">
          <History className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="type-body font-medium">{entry.action}</span>
          <span className="type-label text-on-surface-variant">{entry.entityType}</span>
          <span className="ml-auto type-label-sm text-on-surface-variant tabular-nums">
            {formatDate(entry.createdAt)}
          </span>
        </div>
      ))}
    </div>
  );
}

type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
};

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
      if (!res.ok) throw new Error("Failed to delete project");
      toast.success("Projekt smazán");
      window.location.href = "/";
    } catch {
      toast.error("Nepodařilo se smazat projekt");
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
            Tato akce je nevratná. Všechna data (rozpočet, platby, čas, kontakty, poznámky)
            budou trvale smazána. Pro potvrzení napište název projektu:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          placeholder={projectName}
          className="h-9"
          autoFocus
        />
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmName("")}>Zrušit</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={confirmName !== projectName || deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Smazat projekt
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
