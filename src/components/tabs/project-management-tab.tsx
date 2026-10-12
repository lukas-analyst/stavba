"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  Upload,
  FileSpreadsheet,
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
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";
import {
  useProjects,
  useUpdateProject,
  useBudgetItems,
  useExportState,
  useImportState,
  useExportCsv,
} from "@/lib/api";
import { formatDate, STATUS_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CollapsibleSection } from "@/components/ui/collapsible-section";

// ============================================================
// ProjectManagementTab — full project management page
// ============================================================

export function ProjectManagementTab({ projectId }: { projectId: string }) {
  const { data: projects, isLoading: projectsLoading } = useProjects();
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
      const labels: Record<typeof type, string> = {
        budget: "Rozpočet",
        payments: "Platby",
        time: "Čas",
        contacts: "Kontakty",
      };
      toast.success(`CSV — ${labels[type]} exportováno`);
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

      {/* ===== Sharing & Permissions ===== */}
      <SharingSection projectId={projectId} />

      {/* ===== Export & Import (split into Projekt + Data subsections) ===== */}
      <div className="space-y-4">
        <CollapsibleSection title="Projekt" defaultOpen>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full gap-1.5"
              onClick={handleExport}
              disabled={exportState.isPending}
            >
              {exportState.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Export stavu (JSON)
            </Button>
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
              <span
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 type-label hover:bg-surface-container-high",
                  importState.isPending && "pointer-events-none opacity-50",
                )}
              >
                {importState.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Import stavu (JSON)
              </span>
            </label>
          </div>
          <p className="type-label-sm text-on-surface-variant">
            Záloha kompletního stavu projektu (JSON) — lze importovat do jiného projektu.
          </p>
        </CollapsibleSection>

        <CollapsibleSection title="Data" defaultOpen>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full gap-1.5"
              onClick={() => handleCsv("budget")}
              disabled={exportCsv.isPending}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV — Rozpočet
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full gap-1.5"
              onClick={() => handleCsv("payments")}
              disabled={exportCsv.isPending}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV — Platby
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full gap-1.5"
              onClick={() => handleCsv("time")}
              disabled={exportCsv.isPending}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV — Čas
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full gap-1.5"
              onClick={() => handleCsv("contacts")}
              disabled={exportCsv.isPending}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV — Kontakty
            </Button>
          </div>
          <p className="type-label-sm text-on-surface-variant">
            Tabulkový export jednotlivých sekcí (CSV) pro analýzu v Excelu nebo Google Sheets.
          </p>
        </CollapsibleSection>
      </div>

      {/* ===== Enhanced Audit Log ===== */}
      <CollapsibleSection title="Audit log — nedávné změny" defaultOpen>
        <EnhancedAuditLog projectId={projectId} />
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
          <div className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-card p-3">
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
          <div className="flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft/20 p-3">
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-danger" />
              <div>
                <div className="type-body font-medium">Smazat projekt</div>
                <div className="type-label text-on-surface-variant">Trvale smaže všechna data</div>
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
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 max-w-md text-lg font-bold" autoFocus />
              ) : (
                <>
                  {project.name}
                  <Badge variant="outline" className={cn("type-label-sm", statusInfo.color)}>{statusInfo.label}</Badge>
                </>
              )}
            </CardTitle>
            {!editing && project.description && (
              <CardDescription className="mt-1 type-body">{project.description}</CardDescription>
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
                <SelectTrigger id="mgmt-status" className="h-9"><SelectValue /></SelectTrigger>
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
            {project.address && (<span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {project.address}</span>)}
            {project.startDate && (<span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(project.startDate)}{project.endDate && ` — ${formatDate(project.endDate)}`}</span>)}
            <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {project.currency}</span>
            <span className="type-label-sm text-on-surface-variant/60">Vytvořeno: {formatDate(project.createdAt)}</span>
          </div>
        </CardContent>
      )}
    </Card>
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

function SharingSection({ projectId }: { projectId: string }) {
  const [data, setData] = useState<MembersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("viewer");
  const [adding, setAdding] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [allUsers, setAllUsers] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [lastToastEmail, setLastToastEmail] = useState<string>("");
  const qc = useQueryClient();

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

  // Fetch members + all users on mount
  useEffect(() => {
    fetchMembers();
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((users) => setAllUsers(users))
      .catch(() => setAllUsers([]));
  }, [fetchMembers]);

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
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail.trim(), role: addRole }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Nepodařilo se přidat člena");
      }
      toast.success(`Přidán člen: ${addEmail.trim()}`);
      setAddEmail("");
      setLastToastEmail("");
      fetchMembers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nepodařilo se přidat člena");
    } finally {
      setAdding(false);
    }
  };

  const handleRoleChange = async (memberId: string, role: string) => {
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
      if (!res.ok) throw new Error("Failed");
      toast.success("Role upravena");
    } catch {
      toast.error("Nepodařilo se upravit roli");
      setData(prev); // restore previous state
    }
  };

  const handleRemove = async (memberId: string, name: string) => {
    const memberToRestore = data?.members.find((m) => m.id === memberId);
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
      if (!res.ok) throw new Error("Failed");
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
      toast.success(`Člen "${name}" odebrán`);
    } catch {
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
      toast.error("Nepodařilo se odebrat člena — člen byl obnoven");
    }
  };

  const handleChangeOwner = async (newOwnerId: string) => {
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: newOwnerId }),
      });
      toast.success("Správce změněn");
      qc.invalidateQueries({ queryKey: ["projects"] });
      fetchMembers();
    } catch {
      toast.error("Nepodařilo se změnit správce");
    }
  };

  if (loading) return <Skeleton className="h-48" />;

  const owner = data?.owner;
  const members = data?.members ?? [];

  return (
    <Card className="bg-card shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 type-title-lg">
          <Shield className="h-4 w-4 text-primary" />
          Sdílení a přístupová práva
        </CardTitle>
        <CardDescription>Správa správce a členů projektu</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Owner */}
        {owner && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
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
                <Badge variant="secondary" className="type-label-sm">Správce</Badge>
              </div>
              <div className="type-label text-on-surface-variant truncate">{owner.email}</div>
            </div>
            {/* Change owner dropdown */}
            {allUsers.length > 0 && (
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

        {/* Members list */}
        {members.length > 0 ? (
          <div className="space-y-1.5">
            {members.map((m) => {
              const isRemoving = removingIds.has(m.id);
              const isMatched = matchedMember?.id === m.id;
              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border bg-surface-container-low p-2.5 transition-all",
                    isMatched
                      ? "border-warning ring-2 ring-warning/30"
                      : "border-outline-variant",
                    isRemoving && "opacity-50",
                  )}
                >
                  <Avatar className="h-8 w-8 shrink-0">
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
                  {/* Role selector */}
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
                  {/* Remove */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 rounded-full state-layer-on-surface text-muted-foreground hover:text-danger"
                    onClick={() => handleRemove(m.id, m.user.name || m.user.email)}
                    disabled={isRemoving}
                    aria-label="Odebrat člena"
                  >
                    {isRemoving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="type-label text-on-surface-variant">Zatím nebyli přidáni žádní členové.</p>
        )}

        {/* Add member */}
        <div className="rounded-lg border border-dashed border-outline-variant p-3">
          <div className="mb-2 flex items-center gap-1.5 type-label text-on-surface-variant">
            <UserPlus className="h-3.5 w-3.5" /> Přidat člena
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="email@uzivatel.cz"
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
            <Button size="sm" className="rounded-full gap-1.5" onClick={handleAdd} disabled={!addEmail.trim() || adding}>
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              Přidat
            </Button>
          </div>
          {/* Hints */}
          {isExistingMember && (
            <div className="mt-2 flex items-center gap-1.5 type-label-sm text-warning">
              <AlertTriangle className="h-3 w-3" /> Tento uživatel je již členem projektu
            </div>
          )}
          {isNewUserHint && !isExistingMember && (
            <div className="mt-2 flex items-center gap-1.5 type-label-sm text-info">
              <Info className="h-3 w-3" /> Nový uživatel bude vytvořen při přidání
            </div>
          )}
          {allUsers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="type-label-sm text-on-surface-variant">Rychlý výběr:</span>
              {allUsers.slice(0, 5).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setAddEmail(u.email)}
                  className="rounded-full border border-outline-variant px-2 py-0.5 type-label-sm hover:bg-surface-container-high"
                >
                  {u.email}
                </button>
              ))}
              {allUsers.length > 5 && (
                <span className="type-label-sm text-on-surface-variant">+{allUsers.length - 5} dalších</span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// EnhancedAuditLog — with author + filters + pagination
// ------------------------------------------------------------
// - Client-side filtering + sorting + pagination of fetched
//   entries (limit=500 from API).
// - Filter by action (Vše/Vytvořeno/Upraveno/Smazáno) and
//   by entity type (Vše/Položka rozpočtu/Platba/Čas/Kontakt/
//   Projekt/Člen).
// - Sort: by date (Nejnovější/Nejstarší), by action, by entity.
// - Page size: 10/50/100, with Previous/Next + page number.
// - Author avatar (image or initials) + name + action label
//   + entity label + field-level change details (old → new).
// ============================================================
type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
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
};

const ACTION_COLORS: Record<string, string> = {
  create: "text-success",
  update: "text-info",
  delete: "text-danger",
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
};

function EnhancedAuditLog({ projectId }: { projectId: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterEntity, setFilterEntity] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date-desc");
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState<number>(1);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/audit?limit=500`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return;
        setEntries(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setEntries([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Reset page to 1 when filters/sort/page-size change — done via
  // wrapper handlers to avoid setState-in-effect lint error.
  const handleFilterActionChange = (v: string) => {
    setFilterAction(v);
    setPage(1);
  };
  const handleFilterEntityChange = (v: string) => {
    setFilterEntity(v);
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

  // Filter + sort (memoized)
  const processed = useMemo(() => {
    let result = entries;
    if (filterAction !== "all") {
      result = result.filter((e) => e.action === filterAction);
    }
    if (filterEntity !== "all") {
      result = result.filter((e) => e.entityType === filterEntity);
    }
    const sorted = [...result];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "date-desc":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "date-asc":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "action":
          return (ACTION_LABELS[a.action] ?? a.action).localeCompare(
            ACTION_LABELS[b.action] ?? b.action,
          );
        case "entity":
          return (ENTITY_LABELS[a.entityType] ?? a.entityType).localeCompare(
            ENTITY_LABELS[b.entityType] ?? b.entityType,
          );
        default:
          return 0;
      }
    });
    return sorted;
  }, [entries, filterAction, filterEntity, sortBy]);

  // Pagination math
  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const paginated = processed.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const formatValue = (val: string | null): string => {
    if (val === null) return "—";
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed === "object" && parsed !== null) {
        const keys = Object.keys(parsed).slice(0, 3);
        return keys.map((k) => `${k}: ${parsed[k]}`).join(", ");
      }
      return String(parsed);
    } catch {
      return val.length > 80 ? val.slice(0, 80) + "…" : val;
    }
  };

  return (
    <div className="space-y-3">
      {/* Filter controls */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="type-label-sm text-on-surface-variant">Akce</Label>
          <Select value={filterAction} onValueChange={handleFilterActionChange}>
            <SelectTrigger className="h-8 type-label-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Vše</SelectItem>
              <SelectItem value="create">Vytvořeno</SelectItem>
              <SelectItem value="update">Upraveno</SelectItem>
              <SelectItem value="delete">Smazáno</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="type-label-sm text-on-surface-variant">Typ entity</Label>
          <Select value={filterEntity} onValueChange={handleFilterEntityChange}>
            <SelectTrigger className="h-8 type-label-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Vše</SelectItem>
              <SelectItem value="BudgetItem">Položka rozpočtu</SelectItem>
              <SelectItem value="Payment">Platba</SelectItem>
              <SelectItem value="TimeEntry">Čas</SelectItem>
              <SelectItem value="Contact">Kontakt</SelectItem>
              <SelectItem value="Project">Projekt</SelectItem>
              <SelectItem value="ProjectMember">Člen</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="type-label-sm text-on-surface-variant">Řazení</Label>
          <Select value={sortBy} onValueChange={handleSortChange}>
            <SelectTrigger className="h-8 type-label-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="date-desc">Nejnovější</SelectItem>
              <SelectItem value="date-asc">Nejstarší</SelectItem>
              <SelectItem value="action">Akce</SelectItem>
              <SelectItem value="entity">Entita</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="type-label-sm text-on-surface-variant">Položek na stránku</Label>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="h-8 type-label-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Entries */}
      {loading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : paginated.length === 0 ? (
        <p className="py-6 text-center type-label text-on-surface-variant">
          Žádné zaznamenané změny pro vybrané filtry.
        </p>
      ) : (
        <div className="max-h-[600px] space-y-1.5 overflow-y-auto pr-1">
          {paginated.map((entry) => {
            const authorName = entry.user?.name || entry.user?.email || "Neznámý";
            const authorInitials =
              authorName
                .split(/\s+/)
                .slice(0, 2)
                .map((s) => s[0]?.toUpperCase() ?? "")
                .join("") || "?";
            return (
              <div
                key={entry.id}
                className="flex items-start gap-3 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5"
              >
                {/* Author avatar */}
                <Avatar className="h-8 w-8 shrink-0">
                  {entry.user?.image ? (
                    <AvatarImage src={entry.user.image} alt={authorName} />
                  ) : null}
                  <AvatarFallback className="bg-secondary-container type-label-sm font-bold text-secondary-container-foreground">
                    {authorInitials}
                  </AvatarFallback>
                </Avatar>
                {/* Change details */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "type-label-sm font-semibold",
                        ACTION_COLORS[entry.action] ?? "text-muted-foreground",
                      )}
                    >
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </span>
                    <span className="type-label text-on-surface-variant">
                      {ENTITY_LABELS[entry.entityType] ?? entry.entityType}
                    </span>
                    <span className="type-label-sm text-on-surface-variant">·</span>
                    <span className="type-label text-on-surface-variant truncate">{authorName}</span>
                  </div>
                  {/* Field-level change details */}
                  {entry.field && (
                    <div className="mt-1 flex flex-wrap items-center gap-1 type-label-sm">
                      <span className="rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant">
                        {entry.field}
                      </span>
                      {entry.oldValue !== null && (
                        <>
                          <span className="text-danger/70 line-through">{formatValue(entry.oldValue)}</span>
                          <ArrowRight className="h-3 w-3 text-on-surface-variant/40" />
                        </>
                      )}
                      {entry.newValue !== null && (
                        <span className="text-success/80">{formatValue(entry.newValue)}</span>
                      )}
                    </div>
                  )}
                </div>
                {/* Timestamp */}
                <span className="shrink-0 type-label-sm text-on-surface-variant tabular-nums">
                  {formatDate(entry.createdAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && processed.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant pt-3">
          <div className="type-label-sm text-on-surface-variant tabular-nums">
            Zobrazeno {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, processed.length)} z {processed.length}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full gap-1.5"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Předchozí
            </Button>
            <span className="type-label-sm tabular-nums px-2">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full gap-1.5"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
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
