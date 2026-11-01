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
  Ruler,
  Upload,
  Layers,
  Grid3x3,
  Building,
  Construction,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useFloorplan, useImportFloorplan } from "@/lib/floorplan/api";
import { FloorplanCanvas } from "@/components/tabs/floorplan/floorplan-canvas";
import { FloorplanImportDialog } from "@/components/tabs/floorplan/floorplan-import-dialog";
import { FloorplanLayerFilter } from "@/components/tabs/floorplan/floorplan-layer-filter";
import { LAYER_META } from "@/lib/floorplan/layer-mapping";
import type { FloorplanViewType } from "@/lib/floorplan/types";
import { cn } from "@/lib/utils";

export function FloorplanTab({ projectId }: { projectId: string }) {
  const t = useTranslations("tabs.floorplan");

  // Fetch floorplan data
  const { data, isLoading, error, refetch } = useFloorplan(projectId);
  const importMutation = useImportFloorplan(projectId);

  // UI state
  const [importOpen, setImportOpen] = useState(false);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"geometry" | "status">("geometry");
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(
    new Set(Object.entries(LAYER_META).filter(([, m]) => m.defaultVisible).map(([k]) => k)),
  );

  // Separate floors by view type
  const planFloors = useMemo(
    () => data?.floors.filter((f) => f.viewType === "plan") ?? [],
    [data],
  );
  const elevationFloors = useMemo(
    () => data?.floors.filter((f) => f.viewType === "elevation") ?? [],
    [data],
  );

  // Selected floor — default to first plan floor
  const selectedFloor = useMemo(() => {
    if (selectedFloorId) {
      return data?.floors.find((f) => f.id === selectedFloorId) ?? null;
    }
    return planFloors[0] ?? null;
  }, [data, selectedFloorId, planFloors]);

  // Elements for selected floor
  const floorElements = useMemo(() => {
    if (!selectedFloor) return [];
    return data?.elements.filter((e) => e.floorId === selectedFloor.id) ?? [];
  }, [data, selectedFloor]);

  // Layer toggle
  const handleToggleLayer = useCallback((layer: string) => {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) {
        next.delete(layer);
      } else {
        next.add(layer);
      }
      return next;
    });
  }, []);

  // Handle import
  const handleImport = useCallback(
    (file: File, floorName: string, viewType: FloorplanViewType) => {
      importMutation.mutate(
        { file, floorName, viewType },
        {
          onSuccess: () => {
            setImportOpen(false);
          },
        },
      );
    },
    [importMutation],
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-9 w-full animate-pulse rounded-md bg-muted/50" />
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
          <Button
            variant="outline"
            size="sm"
            className="rounded-full gap-1.5"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" /> {t("button.retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Empty state — no floors
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
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high">
                <Upload className="h-6 w-6 text-on-surface-variant" />
              </div>
              <p className="type-body text-on-surface-variant max-w-md">
                {t("empty.description")}
              </p>
              <Button
                onClick={() => setImportOpen(true)}
                className="rounded-full gap-2"
              >
                <Upload className="h-4 w-4" />
                {t("button.import")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <FloorplanImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImport={handleImport}
          isLoading={importMutation.isPending}
        />
      </div>
    );
  }

  // Main render — floors exist
  return (
    <div id="floorplan-root" className="space-y-4">
      {/* Toolbar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          {/* Floor switcher */}
          <div className="flex items-center gap-2">
            <Building className="h-4 w-4 text-primary shrink-0" />
            <select
              value={selectedFloor?.id ?? ""}
              onChange={(e) => setSelectedFloorId(e.target.value || null)}
              className="h-8 rounded-full border border-outline-variant bg-card px-3 type-label hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {planFloors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f._count?.elements ?? 0})
                </option>
              ))}
              {elevationFloors.length > 0 && (
                <optgroup label={t("label.elevation")}>
                  {elevationFloors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f._count?.elements ?? 0})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 rounded-full border border-outline-variant p-0.5">
            <button
              onClick={() => setViewMode("geometry")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 type-label-sm transition-colors",
                viewMode === "geometry"
                  ? "bg-primary text-primary-foreground"
                  : "text-on-surface-variant hover:bg-surface-container-high",
              )}
            >
              <Grid3x3 className="h-3 w-3" />
              {t("mode.geometry")}
            </button>
            <button
              onClick={() => setViewMode("status")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 type-label-sm transition-colors",
                viewMode === "status"
                  ? "bg-primary text-primary-foreground"
                  : "text-on-surface-variant hover:bg-surface-container-high",
              )}
            >
              <Layers className="h-3 w-3" />
              {t("mode.status")}
            </button>
          </div>

          {/* Layer filter */}
          <FloorplanLayerFilter
            visibleLayers={visibleLayers}
            onToggleLayer={handleToggleLayer}
          />

          {/* Import button */}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto rounded-full gap-1.5"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="h-3.5 w-3.5" />
            {t("button.import")}
          </Button>
        </CardContent>
      </Card>

      {/* Section 1: Plan (top view) */}
      {selectedFloor && selectedFloor.viewType === "plan" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="type-title flex items-center gap-2">
              <Ruler className="h-4 w-4 text-primary" />
              {selectedFloor.name} — {t("label.plan")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FloorplanCanvas
              elements={floorElements}
              visibleLayers={visibleLayers}
              viewMode={viewMode}
              selectedElementId={selectedElementId}
              onSelectElement={setSelectedElementId}
              className="h-[500px]"
            />
          </CardContent>
        </Card>
      )}

      {/* Section 2: Elevation (side view) — if a plan floor is selected,
          show the first elevation floor (independent, Q40) */}
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

      {/* Selected element detail (mini panel) */}
      {selectedElementId && (
        <Card className="border-primary/30">
          <CardContent className="py-3">
            {(() => {
              const el = data.elements.find((e) => e.id === selectedElementId);
              if (!el) return null;
              return (
                <div className="flex flex-wrap items-center gap-3 type-body">
                  <span className="type-label-sm text-on-surface-variant">
                    {t("label.selectedElement")}:
                  </span>
                  <span className="font-medium">{el.type}</span>
                  <span className="type-label-sm text-on-surface-variant">
                    ({el.dxfLayer || el.layer})
                  </span>
                  {el.budgetItemLinks && el.budgetItemLinks.length > 0 && (
                    <span className="type-label-sm text-success">
                      ✓ {el.budgetItemLinks.length}× BudgetItem
                    </span>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Import dialog */}
      <FloorplanImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={handleImport}
        isLoading={importMutation.isPending}
      />
    </div>
  );
}
