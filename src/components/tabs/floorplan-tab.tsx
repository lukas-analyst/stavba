"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Ruler,
  Upload,
  Layers,
  Grid3x3,
  Building,
  RefreshCw,
  MoreVertical,
  Trash2,
  Copy,
  Pencil,
  Check,
  FileText,
} from "lucide-react";
import { useFloorplan, useImportFloorplan, useDeleteFloor, useDuplicateFloor, useUpdateElementGeometry } from "@/lib/floorplan/api";
import { FloorplanCanvas } from "@/components/tabs/floorplan/floorplan-canvas";
import { FloorplanImportDialog } from "@/components/tabs/floorplan/floorplan-import-dialog";
import { FloorplanLayerFilter } from "@/components/tabs/floorplan/floorplan-layer-filter";
import { FloorplanSidePanel } from "@/components/tabs/floorplan/floorplan-side-panel";
import { LAYER_META } from "@/lib/floorplan/layer-mapping";
import type { FloorplanViewType, FloorplanElement } from "@/lib/floorplan/types";
import { cn } from "@/lib/utils";

export function FloorplanTab({ projectId }: { projectId: string }) {
  const t = useTranslations("tabs.floorplan");

  const { data, isLoading, error, refetch } = useFloorplan(projectId);
  const importMutation = useImportFloorplan(projectId);
  const deleteFloorMutation = useDeleteFloor(projectId);
  const duplicateFloorMutation = useDuplicateFloor(projectId);
  const updateGeometryMutation = useUpdateElementGeometry(projectId);

  // UI state
  const [importOpen, setImportOpen] = useState(false);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"geometry" | "status">("geometry");
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(
    new Set(Object.entries(LAYER_META).filter(([, m]) => m.defaultVisible).map(([k]) => k)),
  );
  // Local element state for smooth drag/resize (updated immediately, synced to API on release)
  const [localElements, setLocalElements] = useState<Record<string, FloorplanElement>>({});

  // Separate floors by view type
  const planFloors = useMemo(
    () => data?.floors.filter((f) => f.viewType === "plan") ?? [],
    [data],
  );
  const elevationFloors = useMemo(
    () => data?.floors.filter((f) => f.viewType === "elevation") ?? [],
    [data],
  );

  // Selected floor
  const selectedFloor = useMemo(() => {
    if (selectedFloorId) {
      return data?.floors.find((f) => f.id === selectedFloorId) ?? null;
    }
    return planFloors[0] ?? null;
  }, [data, selectedFloorId, planFloors]);

  // Elements for selected floor (with local overrides for drag/resize)
  const floorElements = useMemo(() => {
    if (!selectedFloor) return [];
    const base = data?.elements.filter((e) => e.floorId === selectedFloor.id) ?? [];
    // Apply local overrides (from drag/resize)
    return base.map((e) => localElements[e.id] ?? e);
  }, [data, selectedFloor, localElements]);

  // Layer toggle
  const handleToggleLayer = useCallback((layer: string) => {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }, []);

  // Handle import
  const handleImport = useCallback(
    (file: File, floorName: string, viewType: FloorplanViewType) => {
      importMutation.mutate({ file, floorName, viewType }, {
        onSuccess: () => setImportOpen(false),
      });
    },
    [importMutation],
  );

  // Handle element move (drag) — update local state immediately, sync to API
  const handleElementMove = useCallback((elementId: string, x: number, y: number) => {
    setLocalElements((prev) => {
      const original = data?.elements.find((e) => e.id === elementId);
      if (!original) return prev;
      return { ...prev, [elementId]: { ...original, x, y } };
    });
  }, [data]);

  // Handle element resize — update local state immediately
  const handleElementResize = useCallback((elementId: string, x: number, y: number, width: number, height: number) => {
    setLocalElements((prev) => {
      const original = data?.elements.find((e) => e.id === elementId);
      if (!original) return prev;
      return { ...prev, [elementId]: { ...original, x, y, width, height } };
    });
  }, [data]);

  // Save changes (exit edit mode) — sync local state to API
  const handleSaveEdit = useCallback(() => {
    // Save all changed elements
    Object.entries(localElements).forEach(([id, el]) => {
      updateGeometryMutation.mutate({
        elementId: id,
        data: { x: el.x, y: el.y, width: el.width ?? undefined, height: el.height ?? undefined },
      });
    });
    setLocalElements({});
    setEditMode(false);
  }, [localElements, updateGeometryMutation]);

  // Delete floor handler
  const handleDeleteFloor = useCallback((floorId: string, floorName: string) => {
    if (confirm(t("manage.deleteConfirm", { name: floorName }))) {
      deleteFloorMutation.mutate({ floorId, confirm: true });
    }
  }, [deleteFloorMutation, t]);

  // Duplicate floor handler
  const handleDuplicateFloor = useCallback((floorId: string) => {
    duplicateFloorMutation.mutate({ floorId });
  }, [duplicateFloorMutation]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-12 w-full animate-pulse rounded-lg bg-muted/50" />
        <div className="h-[500px] w-full animate-pulse rounded-lg bg-muted/30" />
      </div>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <Card className="border-danger/30 bg-danger-soft/10">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="type-body text-danger">{t("error.loadFailed")}</p>
          <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" /> {t("button.retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (!data || data.floors.length === 0) {
    return (
      <div id="floorplan-root" className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="type-title-lg flex items-center gap-2">
              <Ruler className="h-4 w-4 text-primary" />
              {t("title")}
            </CardTitle>
            <CardDescription className="mt-1 type-body text-on-surface-variant">
              {t("description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high">
                <Upload className="h-7 w-7 text-on-surface-variant" />
              </div>
              <p className="type-body text-on-surface-variant max-w-md">
                {t("empty.description")}
              </p>
              <Button onClick={() => setImportOpen(true)} className="rounded-full gap-2">
                <Upload className="h-4 w-4" />
                {t("button.import")}
              </Button>
            </div>
          </CardContent>
        </Card>
        <FloorplanImportDialog open={importOpen} onOpenChange={setImportOpen} onImport={handleImport} isLoading={importMutation.isPending} />
      </div>
    );
  }

  const selectedElement = selectedElementId
    ? floorElements.find((e) => e.id === selectedElementId) ?? null
    : null;

  return (
    <div id="floorplan-root" className="space-y-4">
      {/* ===== Toolbar ===== */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          {/* Floor switcher — shadcn Select */}
          <Select
            value={selectedFloor?.id ?? ""}
            onValueChange={(v) => setSelectedFloorId(v || null)}
          >
            <SelectTrigger className="h-9 w-auto min-w-[160px] gap-2 type-body">
              <Building className="h-4 w-4 text-primary shrink-0" />
              <SelectValue placeholder={t("manage.selectFloor")} />
            </SelectTrigger>
            <SelectContent>
              {planFloors.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name} ({f._count?.elements ?? 0})
                </SelectItem>
              ))}
              {elevationFloors.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  {elevationFloors.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name} ({f._count?.elements ?? 0})
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>

          {/* Floor management dropdown */}
          {selectedFloor && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => handleDuplicateFloor(selectedFloor.id)}>
                  <Copy className="h-4 w-4 mr-2" />
                  {t("manage.duplicate")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleDeleteFloor(selectedFloor.id, selectedFloor.name)}
                  className="text-danger focus:text-danger"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t("manage.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Divider */}
          <div className="h-6 w-px bg-outline-variant" />

          {/* View mode toggle */}
          <div className="flex items-center gap-1 rounded-full border border-outline-variant p-0.5">
            <button
              onClick={() => setViewMode("geometry")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 type-label-sm transition-colors",
                viewMode === "geometry"
                  ? "bg-primary text-primary-foreground"
                  : "text-on-surface-variant hover:bg-surface-container-high",
              )}
            >
              <Grid3x3 className="h-3.5 w-3.5" />
              {t("mode.geometry")}
            </button>
            <button
              onClick={() => setViewMode("status")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 type-label-sm transition-colors",
                viewMode === "status"
                  ? "bg-primary text-primary-foreground"
                  : "text-on-surface-variant hover:bg-surface-container-high",
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              {t("mode.status")}
            </button>
          </div>

          {/* Layer filter */}
          <FloorplanLayerFilter visibleLayers={visibleLayers} onToggleLayer={handleToggleLayer} />

          {/* Right side actions */}
          <div className="ml-auto flex items-center gap-2">
            {/* Edit mode toggle */}
            {editMode ? (
              <Button size="sm" className="rounded-full gap-1.5" onClick={handleSaveEdit}>
                <Check className="h-3.5 w-3.5" />
                {t("button.save")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full gap-1.5"
                onClick={() => setEditMode(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                {t("button.edit")}
              </Button>
            )}

            {/* Import button */}
            <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" />
              {t("button.import")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ===== Main content: canvas + side panel (desktop side-by-side) ===== */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Canvas section */}
        <div className="flex-1 min-w-0 space-y-4">
          {selectedFloor && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="type-title flex items-center gap-2">
                  <Ruler className="h-4 w-4 text-primary" />
                  {selectedFloor.name} — {selectedFloor.viewType === "plan" ? t("label.plan") : t("label.elevation")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FloorplanCanvas
                  elements={floorElements}
                  visibleLayers={visibleLayers}
                  viewMode={viewMode}
                  selectedElementId={selectedElementId}
                  onSelectElement={setSelectedElementId}
                  onElementMove={handleElementMove}
                  onElementResize={handleElementResize}
                  editMode={editMode}
                  className="h-[500px]"
                />
              </CardContent>
            </Card>
          )}

          {/* Elevation section (if exists) */}
          {selectedFloor?.viewType === "plan" && elevationFloors.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="type-title flex items-center gap-2">
                  <Building className="h-4 w-4 text-info" />
                  {elevationFloors[0].name} — {t("label.elevation")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FloorplanCanvas
                  elements={data.elements.filter((e) => e.floorId === elevationFloors[0].id)}
                  visibleLayers={visibleLayers}
                  viewMode={viewMode}
                  selectedElementId={selectedElementId}
                  onSelectElement={setSelectedElementId}
                  className="h-[300px]"
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Side panel (desktop: sticky right column, mobile: below) */}
        {selectedElement && (
          <div className="lg:w-[340px] lg:shrink-0">
            <div className="lg:sticky lg:top-4">
              <FloorplanSidePanel
                element={selectedElement}
                projectId={projectId}
                onClose={() => setSelectedElementId(null)}
              />
            </div>
          </div>
        )}
      </div>

      {/* ===== DXF sources list ===== */}
      {data.sources.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="type-title flex items-center gap-2">
              <FileText className="h-4 w-4 text-on-surface-variant" />
              {t("manage.sourcesTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {data.sources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-2.5"
                >
                  <FileText className="h-4 w-4 text-on-surface-variant shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="type-body font-medium truncate">{source.fileName}</div>
                    <div className="type-label-sm text-on-surface-variant">
                      {(source.fileSize / 1024).toFixed(1)} KB · {source.entityCount} prvků · {new Date(source.importedAt).toLocaleDateString("cs-CZ")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <FloorplanImportDialog open={importOpen} onOpenChange={setImportOpen} onImport={handleImport} isLoading={importMutation.isPending} />
    </div>
  );
}
