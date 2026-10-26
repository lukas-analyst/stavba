"use client";

import { useState, useMemo, useEffect } from "react";
import { useDashboard, useUpdateBudgetItem } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CalendarRange,
  CalendarDays,
  CheckCircle2,
  Milestone,
  GitBranch,
  AlertTriangle,
} from "lucide-react";
import { formatDate, formatCzk, PHASE_COLORS } from "@/lib/format";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { EmptyStateBox } from "@/components/empty-state-box";

type ZoomLevel = "days" | "months" | "quarters" | "years";

// Pixel width per time unit at each zoom level
const UNIT_WIDTH: Record<ZoomLevel, number> = {
  days: 28, // 28px per day
  months: 36, // 36px per month
  quarters: 60, // 60px per quarter
  years: 90, // 90px per year
};

const DAY_MS = 1000 * 60 * 60 * 24;

// ===== Layout constants (must match Tailwind classes below) =====
// The Gantt body is laid out as a vertical stack of phase-header rows and
// item rows. These heights are pinned by the `h-7` / `h-12` classes so the
// dependency-arrow math can run in pure useMemo without DOM measurement.
const PHASE_HEADER_HEIGHT = 28; // h-7 (1.75rem)
const ROW_HEIGHT = 48;         // h-12 (3rem)
const LEFT_COLUMN_PX = 256;     // w-64 (16rem)

// Convert a date to a pixel offset from `rangeStart`. Hoisted to module
// scope so it has a stable identity for the React Compiler (the closure
// version created a new function every render, defeating useMemo).
function dateToOffset(date: Date, zoom: ZoomLevel, rangeStart: Date): number {
  if (zoom === "days") {
    return Math.round((date.getTime() - rangeStart.getTime()) / DAY_MS);
  } else if (zoom === "months") {
    const months =
      (date.getFullYear() - rangeStart.getFullYear()) * 12 +
      (date.getMonth() - rangeStart.getMonth());
    const dayInMonth = (date.getDate() - 1) / 30;
    return months + dayInMonth;
  } else if (zoom === "quarters") {
    const days = (date.getTime() - rangeStart.getTime()) / DAY_MS;
    return days / 90;
  } else {
    const days = (date.getTime() - rangeStart.getTime()) / DAY_MS;
    return days / 365;
  }
}

// ===== Dependency arrow (computed after layout measurement) =====
// Each arrow is an L-shaped SVG path from the end of bar B (the dependency)
// to the start of bar A (the dependent item). Coordinates are in pixels,
// relative to the Gantt body container (the .relative wrapper that holds
// all phase groups).
type DepArrow = {
  id: string;
  d: string;
};

// ===== Milestone detection =====
// An item is rendered as a milestone (diamond) when its start and end
// dates are identical. The dashboard SQL COALESCEs dateTo → dateFrom when
// dateTo is null, so an item with only dateFrom set is also a milestone.
function isMilestoneItem(item: { dateFrom: string | null; dateTo: string | null }): boolean {
  if (!item.dateFrom || !item.dateTo) return false;
  return new Date(item.dateFrom).getTime() === new Date(item.dateTo).getTime();
}

export function TimelineTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useDashboard(projectId);
  const t = useTranslations("tabs.timeline");
  const tc = useTranslations("common");
  const tPhases = useTranslations("phases");
  const format = useFormatter();
  const [zoom, setZoom] = useState<ZoomLevel>("months");
  const [editingItem, setEditingItem] = useState<string | null>(null);

  // Compute the date range that covers all timeline items
  const { items, rangeStart, rangeEnd, totalUnits } = useMemo(() => {
    const timeline = data?.timeline ?? [];
    if (timeline.length === 0) {
      const now = new Date();
      return {
        items: [],
        rangeStart: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        rangeEnd: new Date(now.getFullYear(), now.getMonth() + 3, 1),
        totalUnits: 4,
      };
    }
    let min = new Date(timeline[0].dateFrom || timeline[0].dateTo || new Date());
    let max = new Date(timeline[0].dateTo || timeline[0].dateFrom || new Date());
    for (const it of timeline) {
      const from = new Date(it.dateFrom || it.dateTo || new Date());
      const to = new Date(it.dateTo || it.dateFrom || new Date());
      if (from < min) min = from;
      if (to > max) max = to;
    }
    // Align rangeStart to start of the relevant unit
    let start: Date;
    let end: Date;
    let units: number;
    if (zoom === "days") {
      start = new Date(min.getFullYear(), min.getMonth(), min.getDate() - 7);
      end = new Date(max.getFullYear(), max.getMonth(), max.getDate() + 14);
      units = Math.round((end.getTime() - start.getTime()) / DAY_MS);
    } else if (zoom === "months") {
      start = new Date(min.getFullYear(), min.getMonth() - 1, 1);
      end = new Date(max.getFullYear(), max.getMonth() + 2, 1);
      units = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    } else if (zoom === "quarters") {
      start = new Date(min.getFullYear(), Math.floor(min.getMonth() / 3) * 3 - 3, 1);
      end = new Date(max.getFullYear(), Math.floor(max.getMonth() / 3) * 3 + 6, 1);
      units = Math.round((end.getTime() - start.getTime()) / (DAY_MS * 90));
    } else {
      start = new Date(min.getFullYear() - 1, 0, 1);
      end = new Date(max.getFullYear() + 2, 0, 1);
      units = end.getFullYear() - start.getFullYear();
    }

    const sorted = [...timeline].sort((a, b) => {
      const ad = new Date(a.dateFrom || a.dateTo || new Date()).getTime();
      const bd = new Date(b.dateFrom || b.dateTo || new Date()).getTime();
      return ad - bd;
    });
    return { items: sorted, rangeStart: start, rangeEnd: end, totalUnits: units };
  }, [data, zoom]);

  // Convert a pixel offset back to a date
  const offsetToDate = (offset: number) => {
    if (zoom === "days") {
      return new Date(rangeStart.getTime() + Math.round(offset) * DAY_MS);
    } else if (zoom === "months") {
      const months = Math.floor(offset);
      const dayInMonth = Math.round((offset - months) * 30) + 1;
      const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + months, 1);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return new Date(d.getFullYear(), d.getMonth(), Math.min(dayInMonth, lastDay));
    } else if (zoom === "quarters") {
      return new Date(rangeStart.getTime() + Math.round(offset * 90) * DAY_MS);
    } else {
      return new Date(rangeStart.getTime() + Math.round(offset * 365) * DAY_MS);
    }
  };

  // Header cells
  const headerCells = useMemo(() => {
    const cells: { label: string; sub?: string; width: number }[] = [];
    if (zoom === "days") {
      const d = new Date(rangeStart);
      let currentMonth = -1;
      let monthGroupWidth = 0;
      const monthLabels: { label: string; width: number }[] = [];
      for (let i = 0; i < totalUnits; i++) {
        const day = new Date(d.getTime() + i * DAY_MS);
        if (day.getMonth() !== currentMonth) {
          if (currentMonth !== -1) {
            const prevDay = new Date(d.getTime() + (i - 1) * DAY_MS);
            monthLabels.push({
              label: format.dateTime(prevDay, { month: "long", year: "numeric" }),
              width: monthGroupWidth,
            });
          }
          currentMonth = day.getMonth();
          monthGroupWidth = 1;
        } else {
          monthGroupWidth++;
        }
        const dowLabel = format.dateTime(day, { weekday: "short" });
        cells.push({
          label: String(day.getDate()),
          sub: dowLabel.charAt(0).toUpperCase() + dowLabel.slice(1),
          width: 1,
        });
      }
      if (monthGroupWidth > 0) {
        const last = new Date(d.getTime() + (totalUnits - 1) * DAY_MS);
        monthLabels.push({
          label: format.dateTime(last, { month: "long", year: "numeric" }),
          width: monthGroupWidth,
        });
      }
      return { dayCells: cells, groupCells: monthLabels };
    }
    // months / quarters / years
    const groupCells: { label: string; width: number }[] = [];
    if (zoom === "months") {
      for (let i = 0; i < totalUnits; i++) {
        const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + i, 1);
        groupCells.push({
          label: format.dateTime(d, { month: "short", year: "2-digit" }),
          width: 1,
        });
      }
    } else if (zoom === "quarters") {
      for (let i = 0; i < totalUnits; i++) {
        const d = new Date(rangeStart.getTime() + i * 90 * DAY_MS);
        const q = Math.floor(d.getMonth() / 3) + 1;
        groupCells.push({ label: `Q${q} ${d.getFullYear()}`, width: 1 });
      }
    } else {
      for (let i = 0; i < totalUnits; i++) {
        groupCells.push({ label: String(rangeStart.getFullYear() + i), width: 1 });
      }
    }
    return { dayCells: null, groupCells };
  }, [rangeStart, totalUnits, zoom, format]);

  // Group items by phase — uses English IDs (post Phase B migration).
  // Import PHASE_ORDER from format.ts to keep this in sync.
  const phaseOrder = ["preparation", "demolition", "shell", "finishing", "future", "unspecified"];
  const itemsByPhase = new Map<string, typeof items>();
  for (const it of items) {
    const arr = itemsByPhase.get(it.phase) ?? [];
    arr.push(it);
    itemsByPhase.set(it.phase, arr);
  }
  const phaseGroups = phaseOrder
    .map((p) => ({ phase: p, items: itemsByPhase.get(p) ?? [] }))
    .filter((g) => g.items.length > 0);

  // Today marker
  const today = new Date();
  const todayOffset = dateToOffset(today, zoom, rangeStart);

  const unitW = UNIT_WIDTH[zoom];

  // ===== Critical path (simplified CPM) =====
  // Each item has at most ONE dependsOnId (single parent), so the dependency
  // graph is a forest. The critical path is the longest chain (most items)
  // of dependent items. We compute chainLength(itemId) = length of the
  // dependency chain ending at itemId (1 = no deps, 2 = depends on one item, ...).
  // The max chainLength across all items is the critical path length.
  // Items whose chainLength equals the max AND are reachable by tracing back
  // through dependsOnId are highlighted on the Gantt.
  const criticalPath = useMemo(() => {
    const itemMap = new Map(items.map((it) => [it.id, it]));
    const chainLength = new Map<string, number>();
    const visited = new Set<string>(); // cycle guard
    const getChain = (id: string): number => {
      if (chainLength.has(id)) return chainLength.get(id)!;
      const item = itemMap.get(id);
      if (!item || !item.dependsOnId || !itemMap.has(item.dependsOnId)) {
        chainLength.set(id, 1);
        return 1;
      }
      // Cycle guard — if we encounter the same item while traversing up,
      // break the cycle (treat as no dependency).
      if (visited.has(id)) {
        chainLength.set(id, 1);
        return 1;
      }
      visited.add(id);
      const len = getChain(item.dependsOnId) + 1;
      chainLength.set(id, len);
      visited.delete(id);
      return len;
    };
    for (const it of items) getChain(it.id);

    let maxLen = 0;
    for (const len of chainLength.values()) if (len > maxLen) maxLen = len;

    const critical = new Set<string>();
    // Only highlight if there's an actual chain (maxLen > 1 means at least
    // one dependency exists).
    if (maxLen > 1) {
      for (const [id, len] of chainLength) {
        if (len !== maxLen) continue;
        // Trace back through dependsOnId to mark all items on this chain.
        let cur: string | null = id;
        const traceVisited = new Set<string>();
        while (cur && !traceVisited.has(cur)) {
          traceVisited.add(cur);
          critical.add(cur);
          cur = itemMap.get(cur)?.dependsOnId ?? null;
        }
      }
    }
    return critical;
  }, [items]);

  // ===== Dependency arrows (pure useMemo, no DOM measurement) =====
  // Bar positions are deterministic given the layout constants above:
  //   • X = LEFT_COLUMN_PX + startOffset * unitW
  //   • Y = cumulative row heights + ROW_HEIGHT / 2
  // So we can compute every arrow's path during render.
  const itemPositions = useMemo(() => {
    const map = new Map<string, { leftEdge: number; rightEdge: number; centerY: number }>();
    let y = 0;
    for (const group of phaseGroups) {
      y += PHASE_HEADER_HEIGHT; // phase header row
      for (const it of group.items) {
        const start = it.dateFrom ? new Date(it.dateFrom) : new Date(it.dateTo || today);
        const end = it.dateTo ? new Date(it.dateTo) : new Date(it.dateFrom || today);
        const startOffset = dateToOffset(start, zoom, rangeStart);
        const endOffset = dateToOffset(end, zoom, rangeStart);
        const widthUnits = Math.max(
          zoom === "days" ? 1 : 0.3,
          endOffset - startOffset + (zoom === "days" ? 1 : 0.5),
        );
        const centerX = LEFT_COLUMN_PX + startOffset * unitW;
        const ms = isMilestoneItem(it);
        const leftEdge = ms ? centerX - 6 : centerX; // 6px = half of 12px diamond
        const rightEdge = ms
          ? centerX + 6
          : centerX + Math.max(widthUnits * unitW, 24);
        map.set(it.id, { leftEdge, rightEdge, centerY: y + ROW_HEIGHT / 2 });
        y += ROW_HEIGHT;
      }
    }
    return map;
  }, [phaseGroups, rangeStart, totalUnits, zoom, unitW, today]);

  const depArrows = useMemo(() => {
    const itemMap = new Map(items.map((it) => [it.id, it]));
    const arrows: DepArrow[] = [];
    for (const it of items) {
      if (!it.dependsOnId) continue;
      const dep = itemMap.get(it.dependsOnId);
      // Skip if the dependency isn't on the timeline (no dates / not returned).
      if (!dep) continue;
      const depPos = itemPositions.get(it.dependsOnId);
      const itemPos = itemPositions.get(it.id);
      if (!depPos || !itemPos) continue;
      const startX = depPos.rightEdge;
      const startY = depPos.centerY;
      const endX = itemPos.leftEdge;
      const endY = itemPos.centerY;
      // Skip arrows that span an unreasonable distance backwards.
      if (endX - startX < -200) continue;
      // L-shape: right from dep's end → down/up → left to item's start.
      // The horizontal mid-point leaves a small gap on each side so the
      // arrowhead doesn't overlap the bars.
      const midX = Math.max(startX + 12, endX - 12);
      const d = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX - 5} ${endY}`;
      arrows.push({ id: `${it.id}->${it.dependsOnId}`, d });
    }
    return arrows;
  }, [items, itemPositions]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Controls skeleton */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Skeleton className="h-8 w-72" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        {/* Gantt skeleton */}
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyStateBox
        icon={CalendarRange}
        title={t("empty.title")}
        description={t("empty.description")}
      />
    );
  }

  return (
    <div id="timeline-root" className="space-y-4">
      {/* Controls */}
      <div id="timeline-controls" className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 type-body text-on-surface-variant">
          <CalendarRange className="h-4 w-4" />
          <span>
            {t("label.range", {
              start: formatDate(rangeStart),
              end: formatDate(rangeEnd),
            })}
          </span>
          <Badge variant="secondary" className="type-label-sm">
            {t("label.count", { count: items.length })}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-2 type-label text-on-surface-variant">{t("label.zoom")}</span>
          <Button
            size="sm"
            variant={zoom === "days" ? "default" : "outline"}
            onClick={() => setZoom("days")}
          >
            {t("zoom.days")}
          </Button>
          <Button
            size="sm"
            variant={zoom === "months" ? "default" : "outline"}
            onClick={() => setZoom("months")}
          >
            {t("zoom.months")}
          </Button>
          <Button
            size="sm"
            variant={zoom === "quarters" ? "default" : "outline"}
            onClick={() => setZoom("quarters")}
          >
            {t("zoom.quarters")}
          </Button>
          <Button
            size="sm"
            variant={zoom === "years" ? "default" : "outline"}
            onClick={() => setZoom("years")}
          >
            {t("zoom.years")}
          </Button>
        </div>
      </div>

      {/* Legend + hint */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {phaseGroups.map((g) => (
            <Badge
              key={g.phase}
              variant="outline"
              className={cn("type-label-sm", PHASE_COLORS[g.phase] ?? "")}
            >
              {tPhases(g.phase)} ({g.items.length})
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 type-label text-on-surface-variant">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-danger" /> {t("legend.today")}
          </span>
          <span className="flex items-center gap-1">
            <Milestone className="h-3 w-3" /> {t("legend.milestone")}
          </span>
          <span className="flex items-center gap-1">
            <GitBranch className="h-3 w-3" /> {t("legend.dependencies")}
          </span>
          {criticalPath.size > 0 && (
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-500" /> {t("legend.criticalPath")}
            </span>
          )}
          <span>{t("legend.doubleClickHint")}</span>
        </div>
      </div>

      {/* Gantt */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="type-title-lg">{t("title.gantt")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-max">
              {/* Header */}
              <div className="sticky top-0 z-20 flex border-b bg-surface-container-high backdrop-blur">
                <div className="sticky left-0 z-30 w-64 shrink-0 border-r bg-surface-container-high px-3 py-2 type-label font-semibold">
                  {t("columnHeader.item")}
                </div>
                <div className="flex">
                  {/* Top row: month/year grouping */}
                  <div className="flex">
                    {headerCells.groupCells.map((c, i) => (
                      <div
                        key={i}
                        className="border-l px-2 py-1 text-center type-label-sm font-medium"
                        style={{ width: `${c.width * unitW}px` }}
                      >
                        {c.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Day subheader (only for days zoom) */}
              {zoom === "days" && headerCells.dayCells && (
                <div className="flex border-b bg-surface-container-low">
                  <div className="sticky left-0 z-30 w-64 shrink-0 border-r bg-surface-container-low" />
                  <div className="flex">
                    {headerCells.dayCells.map((c, i) => {
                      const dow = new Date(rangeStart.getTime() + i * DAY_MS).getDay();
                      const isWeekend = dow === 0 || dow === 6;
                      return (
                        <div
                          key={i}
                          className={cn(
                            "border-l px-1 py-0.5 text-center type-label-sm",
                            isWeekend ? "bg-danger-soft/50 text-danger dark:bg-danger-soft/60" : "text-on-surface-variant",
                          )}
                          style={{ width: `${unitW}px` }}
                        >
                          <div className="font-medium">{c.label}</div>
                          <div className="type-label-sm opacity-60">{c.sub}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Gantt body */}
              <div className="relative">
                {todayOffset >= 0 && todayOffset <= totalUnits && (
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 z-10 border-l-2 border-dashed border-danger"
                    style={{ left: `calc(16rem + ${todayOffset * unitW}px)` }}
                  >
                    <div className="absolute -top-0.5 left-1 whitespace-nowrap rounded bg-danger px-1 type-label-sm text-white">
                      {t("legend.today")}
                    </div>
                  </div>
                )}

                {phaseGroups.map((group) => (
                  <div key={group.phase}>
                    {/* Phase label row */}
                    <div className="flex h-7 border-b bg-surface-container-low">
                      <div className="sticky left-0 z-20 w-64 shrink-0 border-r bg-surface-container-low px-3 py-1 type-overline text-on-surface-variant">
                        {tPhases(group.phase)}
                      </div>
                      <div className="flex-1" />
                    </div>
                    {/* Items */}
                    {group.items.map((it) => {
                      const start = it.dateFrom ? new Date(it.dateFrom) : new Date(it.dateTo || today);
                      const end = it.dateTo ? new Date(it.dateTo) : new Date(it.dateFrom || today);
                      const startOffset = dateToOffset(start, zoom, rangeStart);
                      const endOffset = dateToOffset(end, zoom, rangeStart);
                      const widthUnits = Math.max(
                        zoom === "days" ? 1 : 0.3,
                        endOffset - startOffset + (zoom === "days" ? 1 : 0.5),
                      );
                      const isPast = end < today;
                      const isFuture = start > today;
                      const isActive = start <= today && end >= today;

                      return (
                        <div key={it.id} className="flex h-12 border-b hover:bg-surface-container-high/60">
                          <div className="sticky left-0 z-20 w-64 shrink-0 border-r bg-card px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              {it.completed ? (
                                <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
                              ) : it.required ? (
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
                              ) : (
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-on-surface-variant/30" />
                              )}
                              <div className="min-w-0">
                                <div className={cn("truncate type-body font-medium", it.completed && "line-through decoration-success/50")}>
                                  {it.subcategory || it.category}
                                </div>
                                <div className="truncate type-label-sm text-on-surface-variant">
                                  {it.category}
                                  {it.planCost ? ` · ${formatCzk(it.planCost)}` : ""}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div
                            className="relative flex-1 py-2"
                            style={{ minWidth: `${totalUnits * unitW}px` }}
                          >
                            <GanttBar
                              item={it}
                              startOffset={startOffset}
                              widthUnits={widthUnits}
                              unitW={unitW}
                              isActive={isActive}
                              isPast={isPast}
                              isFuture={isFuture}
                              isCritical={criticalPath.has(it.id)}
                              zoom={zoom}
                              onDoubleClick={() => setEditingItem(it.id)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Dependency arrows — SVG overlay on top of bars but below
                    sticky labels. pointer-events:none so it never blocks
                    double-click on bars. */}
                {depArrows.length > 0 && (
                  <svg
                    className="pointer-events-none absolute inset-0 z-[15] text-muted-foreground"
                    width="100%"
                    height="100%"
                    style={{ overflow: "visible" }}
                    aria-hidden="true"
                  >
                    <defs>
                      <marker
                        id="gantt-arrow-head"
                        markerWidth="7"
                        markerHeight="7"
                        refX="6"
                        refY="3.5"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <path d="M0,0 L6,3.5 L0,7 Z" fill="currentColor" />
                      </marker>
                    </defs>
                    {depArrows.map((a) => (
                      <path
                        key={a.id}
                        d={a.d}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1}
                        markerEnd="url(#gantt-arrow-head)"
                      />
                    ))}
                  </svg>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insights */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 type-title">
              <CalendarDays className="h-4 w-4 text-info" />
              {t("title.upcoming")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 type-body">
            {data?.alerts.upcoming.slice(0, 3).map((it) => (
              <div key={it.id} className="flex items-center justify-between">
                <span className="truncate">{it.subcategory || it.category}</span>
                <span className="ml-2 font-medium text-info">{formatDate(it.dateFrom)}</span>
              </div>
            )) ?? <p className="text-on-surface-variant">{t("empty.upcoming")}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 type-title">
              <CalendarRange className="h-4 w-4 text-danger" />
              {t("title.overdue")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 type-body">
            {data?.alerts.overdue.slice(0, 3).map((it) => (
              <div key={it.id} className="flex items-center justify-between">
                <span className="truncate">{it.subcategory || it.category}</span>
                <span className="ml-2 font-medium text-danger">{formatDate(it.dateTo)}</span>
              </div>
            )) ?? <p className="text-on-surface-variant">{t("empty.overdue")}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 type-title">
              <CalendarRange className="h-4 w-4 text-warning" />
              {t("title.unscheduled")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 type-body">
            {data?.alerts.unscheduled.slice(0, 3).map((it) => (
              <div key={it.id} className="flex items-center justify-between">
                <span className="truncate">{it.subcategory || it.category}</span>
                <span className="ml-2 font-medium text-warning">{formatCzk(it.planCost)}</span>
              </div>
            )) ?? <p className="text-on-surface-variant">{t("empty.unscheduled")}</p>}
          </CardContent>
        </Card>
      </div>

      {/* Date edit dialog */}
      {editingItem && (
        <DateEditDialog
          itemId={editingItem}
          projectId={projectId}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  );
}

// ===== Gantt bar (double-click only — no drag/resize) =====

function GanttBar({
  item,
  startOffset,
  widthUnits,
  unitW,
  isActive,
  isCritical,
  onDoubleClick,
}: {
  item: {
    id: string;
    category: string;
    subcategory: string | null;
    phase: string;
    dateFrom: string | null;
    dateTo: string | null;
    planCost: number | null;
    completed: boolean;
  };
  startOffset: number;
  widthUnits: number;
  unitW: number;
  isActive: boolean;
  isPast: boolean;
  isFuture: boolean;
  isCritical: boolean;
  zoom: ZoomLevel;
  onDoubleClick: () => void;
}) {
  const t = useTranslations("tabs.timeline");
  const width = widthUnits * unitW;
  const left = startOffset * unitW;
  const barColor = PHASE_COLORS[item.phase] ?? "";
  const milestone = isMilestoneItem(item);
  const titleText = `${item.subcategory || item.category}\n${formatDate(item.dateFrom)} — ${formatDate(item.dateTo)}\n${formatCzk(item.planCost)}${item.completed ? t("suffix.completed") : ""}${milestone ? ` · ${t("legend.milestone")}` : ""}${isCritical ? ` · ${t("legend.criticalPath")}` : ""}`;

  // ===== Milestone: render as a diamond (rotated square) =====
  // A milestone is a zero-duration item (dateFrom === dateTo). The diamond
  // is centered on the date, with a small label below.
  if (milestone) {
    return (
      <div
        className="absolute top-1/2 cursor-pointer"
        style={{
          left: `${left}px`,
          transform: "translate(-50%, -50%)",
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClick();
        }}
        title={titleText}
      >
        <div
          className={cn(
            "h-3 w-3 rotate-45 border shadow-sm transition-shadow hover:shadow-md hover:brightness-105",
            barColor,
            isCritical && "!border-2 !border-amber-500",
            item.completed && "opacity-70",
          )}
        />
        <div className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap type-label-sm font-medium text-on-surface-variant">
          {item.subcategory || item.category}
        </div>
      </div>
    );
  }

  // ===== Regular bar =====
  return (
    <div
      className={cn(
        "absolute top-1/2 flex h-7 -translate-y-1/2 cursor-pointer items-center overflow-hidden rounded-md border shadow-sm transition-shadow hover:shadow-md hover:brightness-105",
        barColor,
        isActive && "ring-2 ring-offset-1",
        isCritical && "!border-2 !border-amber-500",
        item.completed && "opacity-70",
      )}
      style={{
        left: `${left}px`,
        width: `${Math.max(width, 24)}px`,
        minWidth: 24,
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
      title={titleText}
    >
      <span className="flex-1 truncate px-1.5 type-label-sm font-medium">
        {item.subcategory || item.category}
        {item.completed && " ✓"}
      </span>
    </div>
  );
}

// ===== Date edit dialog (double-click) =====
function DateEditDialog({
  itemId,
  projectId,
  onClose,
}: {
  itemId: string;
  projectId: string;
  onClose: () => void;
}) {
  const t = useTranslations("tabs.timeline");
  const tc = useTranslations("common");
  // We need the item's current dates. Reuse the dashboard data via a lightweight fetch.
  const updateItem = useUpdateBudgetItem(projectId);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Fetch the single item
    fetch(`/api/projects/${projectId}/budget`)
      .then((r) => r.json())
      .then((items: { id: string; dateFrom: string | null; dateTo: string | null }[]) => {
        const it = items.find((i) => i.id === itemId);
        if (it) {
          setDateFrom(it.dateFrom ? it.dateFrom.substring(0, 10) : "");
          setDateTo(it.dateTo ? it.dateTo.substring(0, 10) : "");
        }
        setLoaded(true);
      });
  }, [itemId, projectId]);

  const handleSave = async () => {
    await updateItem.mutateAsync({
      id: itemId,
      data: {
        dateFrom: dateFrom ? new Date(dateFrom).toISOString() : null,
        dateTo: dateTo ? new Date(dateTo).toISOString() : null,
      },
    });
    onClose();
  };

  if (!loaded) return null;

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("dialog.title")}</DialogTitle>
          <DialogDescription>
            {t("dialog.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="gantt-dateFrom">{t("dialog.label.dateFrom")}</Label>
            <Input
              id="gantt-dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gantt-dateTo">{t("dialog.label.dateTo")}</Label>
            <Input
              id="gantt-dateTo"
              type="date"
              value={dateTo}
              min={dateFrom}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tc("cancel")}</Button>
          <Button onClick={handleSave} disabled={updateItem.isPending}>
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
