"use client";

import { useState, useMemo } from "react";
import { useDashboard } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  CalendarDays,
} from "lucide-react";
import { formatDate, formatCzk, PHASE_COLORS } from "@/lib/format";
import { cn } from "@/lib/utils";

// Display granularity: months
const MONTHS = [
  "Led", "Úno", "Bře", "Dub", "Kvě", "Čvn",
  "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro",
];

export function TimelineTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useDashboard(projectId);
  const [zoom, setZoom] = useState<"months" | "quarters" | "years">("months");

  // Compute the date range that covers all timeline items
  const { items, rangeStart, rangeEnd, totalMonths } = useMemo(() => {
    const timeline = data?.timeline ?? [];
    if (timeline.length === 0) {
      return { items: [], rangeStart: new Date(), rangeEnd: new Date(), totalMonths: 0 };
    }
    let min = new Date(timeline[0].dateFrom || timeline[0].dateTo || new Date());
    let max = new Date(timeline[0].dateTo || timeline[0].dateFrom || new Date());
    for (const it of timeline) {
      const from = new Date(it.dateFrom || it.dateTo || new Date());
      const to = new Date(it.dateTo || it.dateFrom || new Date());
      if (from < min) min = from;
      if (to > max) max = to;
    }
    // pad by 1 month each side
    min = new Date(min.getFullYear(), min.getMonth() - 1, 1);
    max = new Date(max.getFullYear(), max.getMonth() + 2, 1);
    const months =
      (max.getFullYear() - min.getFullYear()) * 12 + (max.getMonth() - min.getMonth());

    // sort by dateFrom
    const sorted = [...timeline].sort((a, b) => {
      const ad = new Date(a.dateFrom || a.dateTo || new Date()).getTime();
      const bd = new Date(b.dateFrom || b.dateTo || new Date()).getTime();
      return ad - bd;
    });
    return { items: sorted, rangeStart: min, rangeEnd: max, totalMonths: months };
  }, [data]);

  if (isLoading) {
    return <Skeleton className="h-96" />;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
        <CalendarRange className="mx-auto mb-2 h-8 w-8 opacity-40" />
        Žádné položky s datem. Přiřaďte datumy od/do v tabulce rozpočtu.
      </div>
    );
  }

  // Render header months
  const headerCells: { label: string; year: number; month?: number; width: number }[] = [];
  if (zoom === "months") {
    for (let i = 0; i < totalMonths; i++) {
      const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + i, 1);
      headerCells.push({
        label: MONTHS[d.getMonth()],
        year: d.getFullYear(),
        month: d.getMonth(),
        width: 1,
      });
    }
  } else if (zoom === "quarters") {
    // group months into quarters
    for (let i = 0; i < totalMonths; i += 3) {
      const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + i, 1);
      const q = Math.floor(d.getMonth() / 3) + 1;
      const monthsInQ = Math.min(3, totalMonths - i);
      headerCells.push({
        label: `Q${q}`,
        year: d.getFullYear(),
        width: monthsInQ,
      });
    }
  } else {
    // years
    const startYear = rangeStart.getFullYear();
    const endYear = rangeEnd.getFullYear();
    for (let y = startYear; y <= endYear; y++) {
      const startMonth = y === startYear ? rangeStart.getMonth() : 0;
      const endMonth = y === endYear ? rangeEnd.getMonth() : 11;
      const months = endMonth - startMonth + 1;
      headerCells.push({ label: String(y), year: y, width: months });
    }
  }

  // Compute the left offset and width of each bar (in month units)
  const monthToOffset = (date: Date) => {
    const offset =
      (date.getFullYear() - rangeStart.getFullYear()) * 12 +
      (date.getMonth() - rangeStart.getMonth());
    // day-of-month fraction
    const dayFraction = (date.getDate() - 1) / 30;
    return Math.max(0, offset + dayFraction);
  };

  // Now group items by phase for display order
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
  const todayOffset = monthToOffset(today);

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

      {/* Legend */}
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

      {/* Gantt */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Harmonogram rekonstrukce</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-max">
              {/* Header */}
              <div className="flex border-b bg-muted/30">
                <div className="sticky left-0 z-10 w-64 shrink-0 border-r bg-muted/30 px-3 py-2 text-xs font-semibold">
                  Položka
                </div>
                <div className="flex">
                  {headerCells.map((c, i) => (
                    <div
                      key={i}
                      className="border-l px-2 py-2 text-center text-[11px] font-medium"
                      style={{ width: `${c.width * 36}px` }}
                    >
                      <div>{c.label}</div>
                      {(zoom === "months" || zoom === "quarters") && (
                        <div className="text-[9px] text-muted-foreground">{c.year}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Today marker line */}
              <div className="relative">
                {todayOffset >= 0 && todayOffset <= totalMonths && (
                  <div
                    className="absolute top-0 bottom-0 z-10 border-l-2 border-dashed border-rose-500"
                    style={{ left: `calc(16rem + ${todayOffset * 36}px)` }}
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
                      <div className="sticky left-0 z-10 w-64 shrink-0 border-r bg-muted/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        {group.phase}
                      </div>
                      <div className="flex-1" />
                    </div>
                    {/* Items */}
                    {group.items.map((it) => {
                      const start = it.dateFrom ? new Date(it.dateFrom) : new Date(it.dateTo || today);
                      const end = it.dateTo ? new Date(it.dateTo) : new Date(it.dateFrom || today);
                      const startOffset = monthToOffset(start);
                      const endOffset = monthToOffset(end);
                      const width = Math.max(0.3, endOffset - startOffset + 0.5);
                      const isPast = end < today;
                      const isFuture = start > today;
                      const isActive = start <= today && end >= today;

                      return (
                        <div
                          key={it.id}
                          className="flex border-b hover:bg-muted/20"
                        >
                          <div className="sticky left-0 z-10 w-64 shrink-0 border-r bg-card px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              {it.required && (
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                              )}
                              <div className="min-w-0">
                                <div className="truncate text-xs font-medium">
                                  {it.subcategory || it.category}
                                </div>
                                <div className="truncate text-[10px] text-muted-foreground">
                                  {it.category}
                                  {it.planCost ? ` · ${formatCzk(it.planCost)}` : ""}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="relative flex-1 py-2" style={{ minWidth: `${totalMonths * 36}px` }}>
                            <div
                              className={cn(
                                "absolute top-1/2 h-5 -translate-y-1/2 rounded-md border px-1.5 text-[10px] font-medium shadow-sm transition-all",
                                PHASE_COLORS[it.phase] ?? "",
                                isActive && "ring-2 ring-offset-1",
                              )}
                              style={{
                                left: `${startOffset * 36}px`,
                                width: `${width * 36}px`,
                                minWidth: "20px",
                              }}
                              title={`${it.subcategory || it.category}\n${formatDate(start)} — ${formatDate(end)}\n${formatCzk(it.planCost)}`}
                            >
                              <span className="block truncate">
                                {formatDate(start, { month: "numeric", day: "numeric" })}–{formatDate(end, { month: "numeric", day: "numeric" })}
                              </span>
                            </div>
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
    </div>
  );
}
