"use client";

// ============================================================
// PropertyMetadataCard — sekce „Informace o nemovitosti"
// ------------------------------------------------------------
// Extracted from `project-management-tab.tsx`. Behavior is unchanged.
//
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

import { useState, type ComponentType } from "react";
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
import {
  Building2,
  Pencil,
  Check,
  X,
  Loader2,
  ExternalLink,
  Ruler,
  Layers,
  Flame,
  Gauge,
  FileText,
  StickyNote,
  MapPin,
  Lock,
} from "lucide-react";
import { useUpdateProject, type Project } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { EditableProps } from "./types";

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
export function isValidUrl(value: string): boolean {
  if (!value) return true;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export type PropertyMetadataCardProps = EditableProps & {
  project: Project;
  updateProject: ReturnType<typeof useUpdateProject>;
};

export function PropertyMetadataCard({
  project,
  updateProject,
  readOnly = false,
}: PropertyMetadataCardProps) {
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
export type PropertyMetadataItemProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  href?: string | null;
};

export function PropertyMetadataItem({
  icon: Icon,
  label,
  value,
  href,
}: PropertyMetadataItemProps) {
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
