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
} from "lucide-react";
import { formatDate, formatCzk, PHASE_COLORS } from "@/lib/format";
import { cn } from "@/lib/utils";

type ZoomLevel = "days" | "months" | "quarters" | "years";

// Pixel width per time unit at each zoom level
const UNIT_WIDTH: Record<ZoomLevel, number> = {
  days: 28, // 28px per day
  months: 36, // 36px per month
  quarters: 60, // 60px per quarter
  years: 90, // 90px per year
};

const DAY_MS = 1000 * 60 * 60 * 24;

export function TimelineTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useDashboard(projectId);
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

  // Convert a date to a pixel offset from rangeStart
  const dateToOffset = (date: Date) => {
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
  };

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
            monthLabels.push({
              label: `${MONTHS_LONG[new Date(d.getTime() + (i - 1) * DAY_MS).getMonth()]} ${new Date(d.getTime() + (i - 1) * DAY_MS).getFullYear()}`,
              width: monthGroupWidth,
            });
          }
          currentMonth = day.getMonth();
          monthGroupWidth = 1;
        } else {
          monthGroupWidth++;
        }
        cells.push({
          label: String(day.getDate()),
          sub: ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"][day.getDay()],
          width: 1,
        });
      }
      if (monthGroupWidth > 0) {
        const last = new Date(d.getTime() + (totalUnits - 1) * DAY_MS);
        monthLabels.push({
          label: `${MONTHS_LONG[last.getMonth()]} ${last.getFullYear()}`,
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
          label: `${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`,
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
  }, [rangeStart, totalUnits, zoom]);

  // Group items by phase
  const phaseOrder = ["Příprava", "Demolice", "Hrubá stavba", "Zabydlování", "Do budoucna", "Neurčeno"];
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
  const todayOffset = dateToOffset(today);

  const unitW = UNIT_WIDTH[zoom];

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
      <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
        <CalendarRange className="mx-auto mb-2 h-8 w-8 opacity-40" />
        Žádné položky s datem. Přiřaďte datumy od/do v tabulce rozpočtu.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarRange className="h-4 w-4" />
          <span>
            {formatDate(rangeStart)} — {formatDate(rangeEnd)}
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {items.length} položek
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-2 text-xs text-muted-foreground">Zoom:</span>
          <Button
            size="sm"
            variant={zoom === "days" ? "default" : "outline"}
            onClick={() => setZoom("days")}
          >
            Dny
          </Button>
          <Button
            size="sm"
            variant={zoom === "months" ? "default" : "outline"}
            onClick={() => setZoom("months")}
          >
            Měsíce
          </Button>
          <Button
            size="sm"
            variant={zoom === "quarters" ? "default" : "outline"}
            onClick={() => setZoom("quarters")}
          >
            Kvartály
          </Button>
          <Button
            size="sm"
            variant={zoom === "years" ? "default" : "outline"}
            onClick={() => setZoom("years")}
          >
            Roky
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
              className={cn("text-[10px]", PHASE_COLORS[g.phase] ?? "")}
            >
              {g.phase} ({g.items.length})
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-rose-500" /> Dnes
          </span>
          <span>Dvojklik = upravit datumy</span>
        </div>
      </div>

      {/* Gantt */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Harmonogram stavby</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto" onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}>
            <div className="min-w-max">
              {/* Header */}
              <div className="sticky top-0 z-20 flex border-b bg-muted/80 backdrop-blur">
                <div className="sticky left-0 z-30 w-64 shrink-0 border-r bg-muted/80 px-3 py-2 text-xs font-semibold">
                  Položka
                </div>
                <div className="flex">
                  {/* Top row: month/year grouping */}
                  <div className="flex">
                    {headerCells.groupCells.map((c, i) => (
                      <div
                        key={i}
                        className="border-l px-2 py-1 text-center text-[10px] font-medium"
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
                <div className="flex border-b bg-muted/40">
                  <div className="sticky left-0 z-30 w-64 shrink-0 border-r bg-muted/40" />
                  <div className="flex">
                    {headerCells.dayCells.map((c, i) => {
                      const dow = new Date(rangeStart.getTime() + i * DAY_MS).getDay();
                      const isWeekend = dow === 0 || dow === 6;
                      return (
                        <div
                          key={i}
                          className={cn(
                            "border-l px-1 py-0.5 text-center text-[9px]",
                            isWeekend ? "bg-rose-50 text-rose-400 dark:bg-rose-950/20" : "text-muted-foreground",
                          )}
                          style={{ width: `${unitW}px` }}
                        >
                          <div className="font-medium">{c.label}</div>
                          <div className="text-[8px] opacity-60">{c.sub}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Today marker line */}
              <div className="relative">
                {todayOffset >= 0 && todayOffset <= totalUnits && (
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 z-10 border-l-2 border-dashed border-rose-500"
                    style={{ left: `calc(16rem + ${todayOffset * unitW}px)` }}
                  >
                    <div className="absolute -top-0.5 left-1 whitespace-nowrap rounded bg-rose-500 px-1 text-[9px] text-white">
                      Dnes
                    </div>
                  </div>
                )}

                {phaseGroups.map((group) => (
                  <div key={group.phase}>
                    {/* Phase label row */}
                    <div className="flex border-b bg-muted/20">
                      <div className="sticky left-0 z-20 w-64 shrink-0 border-r bg-muted/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        {group.phase}
                      </div>
                      <div className="flex-1" />
                    </div>
                    {/* Items */}
                    {group.items.map((it) => {
                      const start = it.dateFrom ? new Date(it.dateFrom) : new Date(it.dateTo || today);
                      const end = it.dateTo ? new Date(it.dateTo) : new Date(it.dateFrom || today);
                      const startOffset = dateToOffset(start);
                      const endOffset = dateToOffset(end);
                      const widthUnits = Math.max(
                        zoom === "days" ? 1 : 0.3,
                        endOffset - startOffset + (zoom === "days" ? 1 : 0.5),
                      );
                      const isPast = end < today;
                      const isFuture = start > today;
                      const isActive = start <= today && end >= today;

                      return (
                        <div key={it.id} className="flex border-b hover:bg-muted/10">
                          <div className="sticky left-0 z-20 w-64 shrink-0 border-r bg-card px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              {it.completed ? (
                                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                              ) : it.required ? (
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                              ) : (
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/30" />
                              )}
                              <div className="min-w-0">
                                <div className={cn("truncate text-xs font-medium", it.completed && "line-through decoration-emerald-500/50")}>
                                  {it.subcategory || it.category}
                                </div>
                                <div className="truncate text-[10px] text-muted-foreground">
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
                              zoom={zoom}
                              onDoubleClick={() => setEditingItem(it.id)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insights */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarDays className="h-4 w-4 text-sky-600" />
              Nejbližší akce
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            {data?.alerts.upcoming.slice(0, 3).map((it) => (
              <div key={it.id} className="flex items-center justify-between">
                <span className="truncate">{it.subcategory || it.category}</span>
                <span className="ml-2 font-medium text-sky-600">{formatDate(it.dateFrom)}</span>
              </div>
            )) ?? <p className="text-muted-foreground">Žádné blížící se termíny</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarRange className="h-4 w-4 text-rose-600" />
              Zpožděné
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            {data?.alerts.overdue.slice(0, 3).map((it) => (
              <div key={it.id} className="flex items-center justify-between">
                <span className="truncate">{it.subcategory || it.category}</span>
                <span className="ml-2 font-medium text-rose-600">{formatDate(it.dateTo)}</span>
              </div>
            )) ?? <p className="text-muted-foreground">Žádné zpožděné položky</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarRange className="h-4 w-4 text-amber-600" />
              K naplánování
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            {data?.alerts.unscheduled.slice(0, 3).map((it) => (
              <div key={it.id} className="flex items-center justify-between">
                <span className="truncate">{it.subcategory || it.category}</span>
                <span className="ml-2 font-medium text-amber-600">{formatCzk(it.planCost)}</span>
              </div>
            )) ?? <p className="text-muted-foreground">Vše naplánováno</p>}
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
const MONTHS_SHORT = ["Led", "Úno", "Bře", "Dub", "Kvě", "Čvn", "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro"];
const MONTHS_LONG = [
  "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
];

function GanttBar({
  item,
  startOffset,
  widthUnits,
  unitW,
  isActive,
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
  zoom: ZoomLevel;
  onDoubleClick: () => void;
}) {
  const width = widthUnits * unitW;
  const left = startOffset * unitW;
  const barColor = PHASE_COLORS[item.phase] ?? "";

  return (
    <div
      className={cn(
        "absolute top-1/2 flex h-7 -translate-y-1/2 cursor-pointer items-center overflow-hidden rounded-md border shadow-sm transition-shadow hover:shadow-md hover:brightness-105",
        barColor,
        isActive && "ring-2 ring-offset-1",
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
      title={`${item.subcategory || item.category}\n${formatDate(item.dateFrom)} — ${formatDate(item.dateTo)}\n${formatCzk(item.planCost)}${item.completed ? " · Hotovo" : ""}`}
    >
      <span className="flex-1 truncate px-1.5 text-[10px] font-medium">
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
          <DialogTitle>Upravit termíny</DialogTitle>
          <DialogDescription>
            Nastavte přesné datum zahájení a dokončení.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="gantt-dateFrom">Datum od</Label>
            <Input
              id="gantt-dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gantt-dateTo">Datum do</Label>
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
          <Button variant="outline" onClick={onClose}>Zrušit</Button>
          <Button onClick={handleSave} disabled={updateItem.isPending}>
            Uložit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
