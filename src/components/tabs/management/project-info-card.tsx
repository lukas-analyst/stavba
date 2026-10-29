"use client";

// ============================================================
// ProjectInfoCard — inline-editable project info card
// ------------------------------------------------------------
// Extracted from `project-management-tab.tsx` to keep each sub-
// component in its own file. Behavior is unchanged: owner/admin
// gets inline-editable fields, editors/viewers get a read-only
// text-only display with role + status badges.
//
// `readOnly=true` (editors) renders a fully text-only display:
//   - no inline edit toggle
//   - no inputs for name / description / address / status / dates
//   - metadata badges (address, dates, currency) still shown
// This matches the role spec: editors can SEE the project info but
// cannot modify it — they only get read-only access to the basic info.
// ============================================================

import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencySelect } from "@/components/ui/currency-select";
import {
  MapPin,
  Calendar,
  Building2,
  Pencil,
  Check,
  X,
  Loader2,
  Eye,
  Edit3,
  Lock,
} from "lucide-react";
import { useUpdateProject, type Project } from "@/lib/api";
import { formatDate, STATUS_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { EditableProps, RoleAwareProps } from "./types";

export type ProjectInfoCardProps = EditableProps &
  RoleAwareProps & {
    project: Project;
    updateProject: ReturnType<typeof useUpdateProject>;
  };

export function ProjectInfoCard({
  project,
  updateProject,
  readOnly = false,
  userRole,
}: ProjectInfoCardProps) {
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
              <CardTitle className="flex flex-wrap items-center gap-2 type-title-lg font-semibold">
                {project.name}
                <Badge variant="outline" className={cn("type-label", statusInfo.color)}>{statusLabel}</Badge>
                <Badge variant="secondary" className="type-label gap-1">
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
                <CardDescription className="mt-1 type-body text-on-surface-variant">{project.description}</CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-4 type-label text-on-surface-variant">
            {project.address && (<span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {project.address}</span>)}
            {project.startDate && (<span className="flex items-center gap-1 tabular-nums"><Calendar className="h-3 w-3" /> {formatDate(project.startDate)}{project.endDate && ` — ${formatDate(project.endDate)}`}</span>)}
            <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {project.currency}</span>
            <span className="type-label text-on-surface-variant/60 tabular-nums">{t("created", { date: formatDate(project.createdAt) })}</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 type-label text-muted-foreground">
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
            <CardTitle className="flex items-center gap-2 type-title-lg font-semibold">
              {editing ? (
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 max-w-md type-title-lg font-bold" autoFocus />
              ) : (
                <>
                  {project.name}
                  <Badge variant="outline" className={cn("type-label", statusInfo.color)}>{statusLabel}</Badge>
                </>
              )}
            </CardTitle>
            {!editing && project.description && (
              <CardDescription className="mt-1 type-body text-on-surface-variant">{project.description}</CardDescription>
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
              <Label htmlFor="mgmt-address" className="type-label font-medium text-on-surface-variant">{t("label.address")}</Label>
              <Input id="mgmt-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("placeholder.address")} className="h-9 rounded-md border-outline-variant bg-surface-container-low" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mgmt-status" className="type-label font-medium text-on-surface-variant">{t("label.status")}</Label>
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
              <Label htmlFor="mgmt-currency" className="type-label font-medium text-on-surface-variant">{tCurrency("projectCurrency")}</Label>
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
              <Label htmlFor="mgmt-start" className="type-label font-medium text-on-surface-variant">{t("label.startDate")}</Label>
              <Input id="mgmt-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 rounded-md border-outline-variant bg-surface-container-low" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mgmt-end" className="type-label font-medium text-on-surface-variant">{t("label.endDate")}</Label>
              <Input id="mgmt-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 rounded-md border-outline-variant bg-surface-container-low" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="mgmt-desc" className="type-label font-medium text-on-surface-variant">{t("label.description")}</Label>
            <Textarea id="mgmt-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("placeholder.description")} rows={2} className="resize-y rounded-md border-outline-variant bg-surface-container-low" />
          </div>
        </CardContent>
      )}
      {!editing && (
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-4 type-label text-on-surface-variant">
            {project.address && (<span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {project.address}</span>)}
            {project.startDate && (<span className="flex items-center gap-1 tabular-nums"><Calendar className="h-3 w-3" /> {formatDate(project.startDate)}{project.endDate && ` — ${formatDate(project.endDate)}`}</span>)}
            <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {project.currency}</span>
            <span className="type-label text-on-surface-variant/60 tabular-nums">{t("created", { date: formatDate(project.createdAt) })}</span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
