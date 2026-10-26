"use client";

import { useState, useMemo, useEffect } from "react";
import {
  useTimeEntries,
  useBudgetItems,
  useContacts,
  useCreateTimeEntry,
  useUpdateTimeEntry,
  useDeleteTimeEntry,
  useUpdateBudgetItem,
  type TimeEntry,
} from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TabSkeleton } from "@/components/ui/tab-skeleton";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddDialogShell } from "@/components/ui/add-dialog-shell";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  Search,
  Clock,
  ArrowUpDown,
  CalendarRange,
  Table2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatNumber, formatDate, formatDateShort, WORKER_TYPES, workerTypeLabel, toBcp47 } from "@/lib/format";
import { toast } from "sonner";
import { EmptyStateBox } from "@/components/empty-state-box";
import { InlineDate, InlineNumber } from "@/components/ui/inline-editors";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useLastValue } from "@/hooks/use-last-value";
import { useAnalytics } from "@/hooks/use-analytics";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { SegmentedButton } from "@/components/ui/segmented-button";

type SortKey = "date" | "worker" | "hours" | "workerType";

// View mode for the Time tab — table (default, one-row-per-entry) or
// weekly (grid of worker × day-of-week with totals).
type TimeViewMode = "table" | "weekly";

// Sort options — labels are localized at render time via `t("sort." + value)`.
const SORT_OPTIONS: { value: SortKey }[] = [
  { value: "date" },
  { value: "worker" },
  { value: "hours" },
  { value: "workerType" },
];

export function TimeTab({ projectId }: { projectId: string }) {
  const { data: entries, isLoading } = useTimeEntries(projectId);
  const { data: budgetItems } = useBudgetItems(projectId);
  const { data: contacts } = useContacts(projectId);
  const createTimeEntry = useCreateTimeEntry(projectId);
  const updateTimeEntry = useUpdateTimeEntry(projectId);
  const deleteTimeEntry = useDeleteTimeEntry(projectId);
  const updateBudgetItem = useUpdateBudgetItem(projectId);
  const { trackEvent } = useAnalytics(projectId);
  const t = useTranslations("tabs.time");
  const tc = useTranslations("common");
  const tWorkerTypes = useTranslations("workerTypes");
  const tAll = useTranslations();
  const activeLocale = useLocale() as Locale;
  const bcp47 = toBcp47(activeLocale);
  const [addOpen, setAddOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [search, setSearch] = useState("");
  // Debounce search so filter only re-runs 250ms after typing stops
  const debouncedSearch = useDebouncedValue(search, 250);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  // Toggle between the classic table view and the weekly grid view.
  // Defaults to "table" — the weekly grid is an alternate layout, not
  // a replacement. The same `entries` dataset feeds both views.
  const [viewMode, setViewMode] = useState<TimeViewMode>("table");

  // Listen for FAB "add time" trigger (mobile contextual FAB)
  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent<string>).detail;
      if (action === "add-time") {
        setAddOpen(true);
      }
    };
    window.addEventListener("stavba:fab-add", handler);
    return () => window.removeEventListener("stavba:fab-add", handler);
  }, []);

  // Unique categories derived from budget items for the category filter
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const b of budgetItems ?? []) {
      if (b.category) set.add(b.category);
    }
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b, bcp47));
  }, [budgetItems, bcp47]);

  const filtered = useMemo(() => {
    const arr = (entries ?? []).filter((entry) => {
      if (typeFilter !== "all" && entry.workerType !== typeFilter) return false;
      if (categoryFilter !== "all" && (entry.budgetItem?.category ?? "") !== categoryFilter) return false;
      if (debouncedSearch.trim()) {
        const q = debouncedSearch.toLowerCase();
        const text = `${entry.workerName} ${entry.description ?? ""} ${entry.budgetItem?.category ?? ""} ${entry.budgetItem?.subcategory ?? ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });

    arr.sort((a, b) => {
      switch (sortBy) {
        case "worker":
          return a.workerName.localeCompare(b.workerName, bcp47);
        case "hours":
          return b.hours - a.hours;
        case "workerType":
          if (a.workerType === b.workerType) {
            return b.date.localeCompare(a.date);
          }
          return a.workerType.localeCompare(b.workerType, bcp47);
        case "date":
        default: {
          // Newest first; tiebreak by id
          const cmp = b.date.localeCompare(a.date);
          return cmp !== 0 ? cmp : b.id.localeCompare(a.id);
        }
      }
    });
    return arr;
  }, [entries, debouncedSearch, typeFilter, categoryFilter, sortBy, bcp47]);

  const totalHours = filtered.reduce((s, e) => s + e.hours, 0);

  // Group by worker (top stats) - based on all entries (not filtered)
  const byWorker = useMemo(() => {
    const map = new Map<string, { hours: number; entries: number; type: string }>();
    for (const e of entries ?? []) {
      const key = e.workerName;
      const cur = map.get(key) ?? { hours: 0, entries: 0, type: e.workerType };
      cur.hours += e.hours;
      cur.entries += 1;
      map.set(key, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].hours - a[1].hours);
  }, [entries]);

  return (
    <div id="time-root" className="space-y-4">
      {/* Top stats: hours by worker */}
      <div id="time-worker-stats" className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {byWorker.slice(0, 6).map(([name, info]) => {
          const w = workerTypeLabel(info.type, tAll);
          return (
            <Card key={name} className="p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>{w.emoji}</span> {w.label}
              </div>
              <div className="mt-1 truncate text-sm font-bold" title={name}>
                {name}
              </div>
              <div className="mt-1 text-lg font-bold text-time">
                {formatNumber(info.hours, " h", activeLocale)}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("stats.entries", { count: info.entries })}
              </div>
            </Card>
          );
        })}
        {byWorker.length === 0 && (
          <Card className="col-span-full p-4 text-center text-sm text-muted-foreground">
            {t("stats.empty")}
          </Card>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* View-mode toggle (Table | Weekly) — same dataset, different layout */}
        <SegmentedButton
          value={viewMode}
          onChange={(v) => setViewMode(v as TimeViewMode)}
          options={[
            { value: "table", label: t("weekly.viewTable"), icon: Table2 },
            { value: "weekly", label: t("weekly.viewWeekly"), icon: CalendarRange },
          ]}
          size="sm"
        />
        {viewMode === "table" ? (
          <>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filter.allTypes")}</SelectItem>
                {WORKER_TYPES.map((wt) => (
                  <SelectItem key={wt.value} value={wt.value}>
                    {wt.emoji} {tWorkerTypes(wt.value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">{t("filter.allCategories")}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <SelectTrigger className="h-9 w-48">
                <ArrowUpDown className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {t(`sort.${o.value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-3 text-sm">
              <div className="text-right">
                <div className="text-xs text-muted-foreground">{t("total.label", { count: filtered.length })}</div>
                <div className="text-lg font-bold text-time">
                  {formatNumber(totalHours, " h", activeLocale)}
                </div>
              </div>
            </div>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            {t("weekly.title")}
          </span>
        )}
        {/* Desktop "Add time entry" button — hidden on mobile (mobile uses the FAB).
            Pushed to the end of the toolbar with ml-auto so it sits at the
            right edge of the row it lands on. */}
        <Button
          onClick={() => setAddOpen(true)}
          className="hidden sm:flex ml-auto gap-1.5 rounded-full"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          {t("toolbar.add")}
        </Button>
      </div>

      {isLoading ? (
        <>
          {/* Stats cards skeleton — kept separate since time-tab has unique
              top stats (worker hours). The TabSkeleton handles the toolbar +
              table portion below. */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          {/* Standard toolbar + table skeleton */}
          <TabSkeleton />
        </>
      ) : viewMode === "weekly" ? (
        <WeeklyTimesheet
          entries={entries ?? []}
          projectId={projectId}
          onEdit={(entry) => setEditEntry(entry)}
        />
      ) : filtered.length === 0 ? (
        <EmptyStateBox
          icon={Clock}
          title={entries?.length === 0 ? t("empty.title.noRecords") : t("empty.title.noMatch")}
          description={
            entries?.length === 0
              ? t("empty.description.noRecords")
              : t("empty.description.noMatch")
          }
          action={
            entries?.length === 0 ? (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> {t("empty.button.firstRecord")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto scrollbar-thin rounded-lg border border-outline-variant bg-card">
          <Table className="min-w-[800px]">
            <TableHeader>
              <TableRow className="sticky top-0 z-30 bg-surface-container-high">
                <TableHead className="w-16"></TableHead>
                <TableHead className="w-28">{t("column.date")}</TableHead>
                <TableHead className="min-w-[200px]">{t("column.budgetItem")}</TableHead>
                <TableHead className="min-w-[180px]">{t("column.description")}</TableHead>
                <TableHead className="w-32">{t("column.type")}</TableHead>
                <TableHead className="min-w-[160px]">{t("column.contact")}</TableHead>
                <TableHead className="text-right">{t("column.hours")}</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((entry) => (
                <TimeRow
                  key={entry.id}
                  entry={entry}
                  projectId={projectId}
                  onEdit={() => setEditEntry(entry)}
                  updateTimeEntry={updateTimeEntry}
                  onDelete={async () => {
                    try {
                      await deleteTimeEntry.mutateAsync(entry.id);
                      toast.success(t("toasts.deleteSuccess"));
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : t("toasts.deleteError"));
                    }
                  }}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TimeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
        budgetItems={budgetItems ?? []}
        contacts={contacts ?? []}
        createTimeEntry={createTimeEntry}
        updateBudgetItem={updateBudgetItem}
      />

      <TimeDialog
        open={editEntry !== null}
        onOpenChange={(open) => {
          if (!open) setEditEntry(null);
        }}
        projectId={projectId}
        budgetItems={budgetItems ?? []}
        contacts={contacts ?? []}
        createTimeEntry={createTimeEntry}
        updateTimeEntry={updateTimeEntry}
        updateBudgetItem={updateBudgetItem}
        editEntry={editEntry}
        onClose={() => setEditEntry(null)}
      />
    </div>
  );
}

// =====================================================================
// WeeklyTimesheet — grid view of hours logged per worker × day of week.
// ---------------------------------------------------------------------
// Used by the Time tab when the user toggles "Týdenní přehled".
//
// Layout:
//   • Toolbar: prev / today / next week buttons + current week range label
//   • Grid: workers as rows, days (Po–Ne) as columns, plus a totals column
//   • Footer: per-day totals row + grand total
//
// Multi-day entries (when `dateTo` is set) are spread evenly across the
// day span (hoursPerDay = hours / daySpan) — same convention as the
// Time-tab dialog's "≈ X h/day × N days" hint.
//
// Cell color thresholds:
//   0 h     → muted (empty / no hours)
//   1–6 h   → normal (default text color)
//   7–9 h   → success (green — standard full workday)
//   10 h+   → warning (amber — overtime / multi-worker)
// =====================================================================

// Day-of-week order for the grid. Week starts on Monday (ISO 8601) which
// is the Czech locale convention. JS `Date.getDay()` returns 0=Sun..
// 6=Sat, so we map to our own index 0..6 starting Monday.
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayKey = (typeof DAY_KEYS)[number];

// Map JS getDay() (0=Sun..6=Sat) to our Monday-based index (0..6).
function jsDayToMonIndex(jsDay: number): number {
  // Sunday (0) → 6, Monday (1) → 0, …, Saturday (6) → 5
  return (jsDay + 6) % 7;
}

// Returns Monday 00:00 local time of the week containing `date`.
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayOffset = jsDayToMonIndex(d.getDay());
  d.setDate(d.getDate() - dayOffset);
  return d;
}

// Adds `weeks` weeks to a Monday-start date (preserves local time 00:00).
function addWeeks(mondayStart: Date, weeks: number): Date {
  const d = new Date(mondayStart);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

// Returns the 7 day Date objects for a week (Monday..Sunday), each at
// local 00:00. Used for headers + per-day cell matching.
function weekDays(mondayStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mondayStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

// Same-calendar-day check (compares Y/M/D only, ignores time + tz).
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Color-band class for a given hours value.
// 0 h → muted; 1–6 h → normal; 7–9 h → success; 10+ h → warning.
function cellColorClass(hours: number): string {
  if (hours <= 0) return "bg-muted/20 text-muted-foreground";
  if (hours < 7) return "bg-surface-container text-on-surface";
  if (hours <= 9) return "bg-success-soft text-success-strong";
  return "bg-warning-soft text-warning-strong";
}

type WeeklyCell = {
  hours: number;
  // The entries that contributed to this cell — used for the click-
  // through to open the edit dialog (opens the first one for simplicity).
  entryIds: string[];
  firstEntry: TimeEntry | null;
};

type WeeklyRow = {
  workerName: string;
  cells: WeeklyCell[]; // length 7 (Mon..Sun)
  total: number;
};

type WeeklyGrid = {
  rows: WeeklyRow[];
  dayTotals: number[]; // length 7
  grandTotal: number;
  weekStart: Date;
  weekEnd: Date;
};

// Distributes a list of time entries across the 7-day grid for the
// week starting `weekStart`. Multi-day entries are split evenly across
// the days that fall within the entry's [date, dateTo] range AND the
// current week window.
function buildWeeklyGrid(
  entries: TimeEntry[],
  weekStart: Date,
): WeeklyGrid {
  const days = weekDays(weekStart);
  const weekEnd = days[6];

  // workerName → cell array (length 7)
  const rowsMap = new Map<string, WeeklyCell[]>();

  const ensureRow = (workerName: string): WeeklyCell[] => {
    let cells = rowsMap.get(workerName);
    if (!cells) {
      cells = Array.from({ length: 7 }, () => ({
        hours: 0,
        entryIds: [],
        firstEntry: null,
      }));
      rowsMap.set(workerName, cells);
    }
    return cells;
  };

  for (const entry of entries) {
    const start = new Date(entry.date);
    if (isNaN(start.getTime())) continue;

    // Determine the day range of the entry. Single-day when dateTo is
    // null/invalid; otherwise from `date` to `dateTo` inclusive.
    let end = start;
    if (entry.dateTo) {
      const parsedEnd = new Date(entry.dateTo);
      if (!isNaN(parsedEnd.getTime())) end = parsedEnd;
    }

    // Collect the list of in-week dates this entry touches.
    const touchedDays: Date[] = [];
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const endMidnight = new Date(end);
    endMidnight.setHours(0, 0, 0, 0);
    // Safety: cap at 14 days so a wildly malformed entry can't hang the UI.
    let safety = 0;
    while (cursor <= endMidnight && safety < 14) {
      if (cursor >= weekStart && cursor <= weekEnd) {
        touchedDays.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
      safety++;
    }

    if (touchedDays.length === 0) continue;

    // Even distribution: total hours / number of touched days.
    const hoursPerDay = entry.hours / touchedDays.length;

    const cells = ensureRow(entry.workerName);
    for (const d of touchedDays) {
      // Find which day index in our Mon..Sun array this is.
      const idx = days.findIndex((wd) => sameDay(wd, d));
      if (idx === -1) continue;
      const cell = cells[idx];
      cell.hours += hoursPerDay;
      cell.entryIds.push(entry.id);
      if (!cell.firstEntry) cell.firstEntry = entry;
    }
  }

  // Build sorted rows: by total hours desc, then by workerName asc.
  const rows: WeeklyRow[] = Array.from(rowsMap.entries())
    .map(([workerName, cells]) => {
      const total = cells.reduce((s, c) => s + c.hours, 0);
      return { workerName, cells, total };
    })
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.workerName.localeCompare(b.workerName);
    });

  const dayTotals = days.map((_, i) =>
    rows.reduce((s, r) => s + r.cells[i].hours, 0),
  );
  const grandTotal = dayTotals.reduce((s, v) => s + v, 0);

  return {
    rows,
    dayTotals,
    grandTotal,
    weekStart,
    weekEnd: weekEnd,
  };
}

function WeeklyTimesheet({
  entries,
  projectId,
  onEdit,
}: {
  entries: TimeEntry[];
  projectId: string;
  onEdit: (entry: TimeEntry) => void;
}) {
  const t = useTranslations("tabs.time");
  const tc = useTranslations("common");
  const activeLocale = useLocale() as Locale;
  const bcp47 = toBcp47(activeLocale);
  const { trackEvent } = useAnalytics(projectId);

  // Week cursor — anchored on the Monday of the currently shown week.
  // Defaults to the Monday of "today" so the user lands on the current
  // week when first opening the weekly view.
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));

  // Reset to current week when the user clicks "Today".
  const goToday = () => setWeekStart(startOfWeek(new Date()));
  const goPrev = () => setWeekStart((w) => addWeeks(w, -1));
  const goNext = () => setWeekStart((w) => addWeeks(w, 1));

  const grid = useMemo(
    () => buildWeeklyGrid(entries, weekStart),
    [entries, weekStart],
  );

  // Friendly week range label, e.g. "21. 10. – 27. 10. 2024".
  const rangeLabel = useMemo(() => {
    const fmtShort = (d: Date) =>
      new Intl.DateTimeFormat(bcp47, {
        day: "2-digit",
        month: "2-digit",
      }).format(d);
    const fmtYear = (d: Date) =>
      new Intl.DateTimeFormat(bcp47, { year: "numeric" }).format(d);
    // Show year once at the end (or twice if it spans years).
    if (grid.weekStart.getFullYear() === grid.weekEnd.getFullYear()) {
      return `${fmtShort(grid.weekStart)} – ${fmtShort(grid.weekEnd)} ${fmtYear(grid.weekEnd)}`;
    }
    return `${fmtShort(grid.weekStart)} ${fmtYear(grid.weekStart)} – ${fmtShort(grid.weekEnd)} ${fmtYear(grid.weekEnd)}`;
  }, [grid.weekStart, grid.weekEnd, bcp47]);

  const days = weekDays(weekStart);
  const todayKey = (() => {
    const now = new Date();
    const idx = days.findIndex((d) => sameDay(d, now));
    return idx === -1 ? null : DAY_KEYS[idx];
  })();

  const handleCellClick = (cell: WeeklyCell) => {
    if (cell.firstEntry) {
      trackEvent("weekly_edit_entry", { hours: cell.hours });
      onEdit(cell.firstEntry);
    }
  };

  return (
    <div className="space-y-3">
      {/* === Week navigator === */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={goPrev} title={t("weekly.prevWeek")}>
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">{t("weekly.prevWeek")}</span>
        </Button>
        <Button variant="outline" size="sm" onClick={goToday}>
          {t("weekly.today")}
        </Button>
        <Button variant="outline" size="sm" onClick={goNext} title={t("weekly.nextWeek")}>
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">{t("weekly.nextWeek")}</span>
        </Button>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{t("weekly.week")}</span>
          <span className="tabular-nums">{rangeLabel}</span>
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">{t("weekly.total")}</div>
            <div className="text-lg font-bold text-time tabular-nums">
              {formatNumber(grid.grandTotal, " h", activeLocale)}
            </div>
          </div>
        </div>
      </div>

      {/* === Weekly grid === */}
      {grid.rows.length === 0 ? (
        <EmptyStateBox
          icon={CalendarRange}
          title={t("weekly.noEntries")}
        />
      ) : (
        <div className="overflow-x-auto scrollbar-thin rounded-lg border border-outline-variant bg-card">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="sticky top-0 z-30 bg-surface-container-high">
                <TableHead className="sticky left-0 z-40 bg-surface-container-high min-w-[160px]">
                  {t("weekly.worker")}
                </TableHead>
                {DAY_KEYS.map((dk, i) => {
                  const isToday = todayKey === dk;
                  const dateLabel = formatDateShort(days[i].toISOString(), activeLocale);
                  return (
                    <TableHead
                      key={dk}
                      className={cn(
                        "text-center w-24",
                        isToday && "bg-primary-container/40",
                      )}
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-xs">{t(`weekly.dayShort.${dk}`)}</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {dateLabel}
                        </span>
                      </div>
                    </TableHead>
                  );
                })}
                <TableHead className="text-right w-24">{t("weekly.total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grid.rows.map((row) => (
                <TableRow key={row.workerName} className="hover:bg-muted/30">
                  <TableCell className="sticky left-0 z-20 bg-card font-medium">
                    <span className="block truncate" title={row.workerName}>
                      {row.workerName}
                    </span>
                  </TableCell>
                  {row.cells.map((cell, i) => {
                    const hasHours = cell.hours > 0;
                    const rounded = Math.round(cell.hours * 10) / 10;
                    const isToday = todayKey === DAY_KEYS[i];
                    return (
                      <TableCell
                        key={i}
                        className={cn(
                          "text-center tabular-nums",
                          cell.firstEntry && "cursor-pointer",
                        )}
                        onClick={() => cell.firstEntry && handleCellClick(cell)}
                        title={
                          cell.firstEntry
                            ? tc("edit")
                            : undefined
                        }
                      >
                        <span
                          className={cn(
                            "inline-flex h-8 min-w-[3rem] items-center justify-center rounded-md px-2 text-sm font-medium",
                            cellColorClass(cell.hours),
                            isToday && hasHours && "ring-1 ring-primary",
                          )}
                        >
                          {hasHours ? formatNumber(rounded, " h", activeLocale) : "—"}
                        </span>
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right tabular-nums font-semibold whitespace-nowrap">
                    {formatNumber(Math.round(row.total * 10) / 10, " h", activeLocale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <tfoot>
              <TableRow className="sticky bottom-0 z-10 bg-surface-container-low border-t font-semibold">
                <TableCell className="sticky left-0 z-20 bg-surface-container-low">
                  {t("weekly.total")}
                </TableCell>
                {grid.dayTotals.map((total, i) => {
                  const hasHours = total > 0;
                  const isToday = todayKey === DAY_KEYS[i];
                  return (
                    <TableCell
                      key={i}
                      className={cn(
                        "text-center tabular-nums",
                        isToday && "bg-primary-container/30",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-8 min-w-[3rem] items-center justify-center rounded-md px-2 text-sm",
                          cellColorClass(total),
                        )}
                      >
                        {hasHours
                          ? formatNumber(
                              Math.round(total * 10) / 10,
                              " h",
                              activeLocale,
                            )
                          : "—"}
                      </span>
                    </TableCell>
                  );
                })}
                <TableCell className="text-right tabular-nums whitespace-nowrap text-time">
                  {formatNumber(
                    Math.round(grid.grandTotal * 10) / 10,
                    " h",
                    activeLocale,
                  )}
                </TableCell>
              </TableRow>
            </tfoot>
          </Table>
        </div>
      )}

      {/* Legend for the cell color bands — small, discreet */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <LegendChip
          className="bg-muted/20"
          label={t("weekly.hours") + ": 0"}
        />
        <LegendChip
          className="bg-surface-container border border-outline-variant"
          label="1–6 h"
        />
        <LegendChip
          className="bg-success-soft text-success-strong"
          label="7–9 h"
        />
        <LegendChip
          className="bg-warning-soft text-warning-strong"
          label="10+ h"
        />
      </div>
    </div>
  );
}

function LegendChip({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded-sm", className)} />
      <span>{label}</span>
    </span>
  );
}

function TimeRow({
  entry,
  projectId,
  onEdit,
  onDelete,
  updateTimeEntry,
}: {
  entry: TimeEntry;
  projectId: string;
  onEdit: () => void;
  onDelete: () => void;
  updateTimeEntry?: ReturnType<typeof useUpdateTimeEntry>;
}) {
  const t = useTranslations("tabs.time");
  const tc = useTranslations("common");
  const tWorkerTypes = useTranslations("workerTypes");
  const tAll = useTranslations();
  const activeLocale = useLocale() as Locale;
  const [confirm, setConfirm] = useState(false);
  const { trackEvent } = useAnalytics(projectId);
  const w = workerTypeLabel(entry.workerType, tAll);

  // Inline update helper — patches a single field without opening the edit dialog.
  const update = (field: keyof TimeEntry, value: unknown) => {
    updateTimeEntry?.mutate({ id: entry.id, data: { [field]: value } });
    trackEvent("edit_time_entry", { field, value });
  };

  return (
    <TableRow
      className="group cursor-pointer hover:bg-muted/30 cv-row"
      onClick={() => onEdit()}
      title={t("aria.rowClick")}
      // Accessibility (A3): keyboard users can focus the row and press
      // Enter to open the edit dialog (same as a click). The aria-label
      // includes the worker name so screen-reader users hear which row
      // they're on before activating it.
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEdit();
        }
      }}
      aria-label={t("aria.editRow", { workerName: entry.workerName || "" })}
    >
      <TableCell className="w-16">
        <Badge
          variant="outline"
          className="type-label-sm text-time"
          title={t("aria.workersCount", { count: entry.workerCount })}
        >
          × {entry.workerCount}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col">
          <InlineDate
            value={entry.date}
            onCommit={(v) => update("date", v)}
            ariaLabel={t("column.date")}
          />
          {entry.dateTo && (
            <span className="type-label text-time">
              → {formatDate(entry.dateTo, undefined, activeLocale)}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="type-body font-medium">
            {entry.budgetItem?.subcategory || entry.budgetItem?.category}
          </span>
          <span className="type-label text-on-surface-variant">
            {entry.budgetItem?.category}
          </span>
        </div>
      </TableCell>
      <TableCell className="type-label text-on-surface-variant">
        {entry.description || "—"}
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Select
          value={entry.workerType}
          onValueChange={(v) => update("workerType", v)}
          disabled={!!entry.contact}
        >
          <SelectTrigger className="h-7 w-auto border-0 px-1 type-label-sm shadow-none hover:bg-surface-container-high gap-1 data-[disabled]:opacity-100">
            <Badge variant="outline" className="type-label-sm">
              {w.emoji} {w.label}
            </Badge>
          </SelectTrigger>
          <SelectContent>
            {WORKER_TYPES.map((wt) => (
              <SelectItem key={wt.value} value={wt.value}>
                {wt.emoji} {tWorkerTypes(wt.value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <span className="type-body font-medium">
            {entry.contact?.name || entry.workerName}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <InlineNumber
          value={entry.hours}
          onCommit={(v) => update("hours", v)}
          suffix=" h"
          className="font-semibold text-time"
          ariaLabel={t("column.hours")}
        />
      </TableCell>
      <TableCell
        className="text-right"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> {tc("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirm(true)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> {tc("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={confirm} onOpenChange={setConfirm}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("dialog.delete.title")}</DialogTitle>
              <DialogDescription>
                {t.rich("dialog.delete.body", {
                  workerName: entry.workerName,
                  hours: formatNumber(entry.hours, " h", activeLocale),
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirm(false)}>
                {tc("cancel")}
              </Button>
              <Button variant="destructive" onClick={() => { setConfirm(false); onDelete(); }}>
                {tc("delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}

interface TimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  budgetItems: { id: string; category: string; subcategory: string | null; parentId?: string | null; completed?: boolean }[];
  contacts: { id: string; name: string; type: string }[];
  createTimeEntry: ReturnType<typeof useCreateTimeEntry>;
  updateTimeEntry?: ReturnType<typeof useUpdateTimeEntry>;
  updateBudgetItem: ReturnType<typeof useUpdateBudgetItem>;
  editEntry?: TimeEntry | null;
  onClose?: () => void;
}

// Wrapper component: handles Dialog open state and remounts inner form via `key`
// whenever editEntry changes — ensures fresh state via useState initializers.
function TimeDialog(props: TimeDialogProps) {
  const { open } = props;
  if (!open) return null;
  return (
    <TimeDialogInner
      key={props.editEntry?.id ?? "new"}
      {...props}
    />
  );
}

function toDateStr(d: string | null | undefined): string {
  if (!d) return "";
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "";
    return dt.toISOString().substring(0, 10);
  } catch {
    return "";
  }
}

function TimeDialogInner({
  open,
  onOpenChange,
  projectId,
  budgetItems,
  contacts,
  createTimeEntry,
  updateTimeEntry,
  updateBudgetItem,
  editEntry,
  onClose,
}: TimeDialogProps) {
  const isEdit = !!editEntry;
  const today = new Date().toISOString().substring(0, 10);
  const { trackEvent } = useAnalytics(projectId);
  const t = useTranslations("tabs.time");
  const tWorkerTypes = useTranslations("workerTypes");
  const activeLocale = useLocale() as Locale;
  // Smart defaults: remember last used value per project (only persisted on
  // create — edit mode seeds from editEntry and skips localStorage writes).
  const [lastWorkerName, setLastWorkerName] = useLastValue<string>(
    "workerName",
    "",
    projectId,
  );
  const [lastWorkerType, setLastWorkerType] = useLastValue<string>(
    "workerType",
    "self",
    projectId,
  );
  const [lastContactId, setLastContactId] = useLastValue<string>(
    "contactId",
    "",
    projectId,
  );
  const [budgetItemId, setBudgetItemId] = useState(editEntry?.budgetItemId ?? "");
  // Default: NO contact for new time entries (user explicitly asked for this).
  // When editing existing entry, keep its contactId. Otherwise empty.
  const [contactId, setContactId] = useState(editEntry?.contactId ?? "");
  const [workerName, setWorkerName] = useState(editEntry?.workerName ?? lastWorkerName);
  const [workerType, setWorkerType] = useState(editEntry?.workerType ?? lastWorkerType);
  const [date, setDate] = useState(toDateStr(editEntry?.date) || today);
  const [dateTo, setDateTo] = useState(toDateStr(editEntry?.dateTo));
  const [hours, setHours] = useState(editEntry ? String(editEntry.hours ?? "") : "");
  const [workerCount, setWorkerCount] = useState(editEntry ? String(editEntry.workerCount ?? 1) : "1");
  const [description, setDescription] = useState(editEntry?.description ?? "");
  const [markCompleted, setMarkCompleted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Compute day span for display
  const daySpan = useMemo(() => {
    if (!dateTo) return 1;
    const a = new Date(date);
    const b = new Date(dateTo);
    if (isNaN(b.getTime())) return 1;
    const diff = Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : 1;
  }, [date, dateTo]);
  const hoursPerDay = hours
    ? (Number(hours.replace(",", ".")) / daySpan).toFixed(1)
    : null;

  const isPending = isEdit
    ? updateTimeEntry?.isPending ?? false
    : createTimeEntry.isPending;

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    if (!budgetItemId) newErrors.budgetItemId = t("form.error.budgetItem");
    if (!workerName.trim()) newErrors.workerName = t("form.error.workerName");
    const h = Number(hours.replace(",", "."));
    if (!hours || isNaN(h) || h <= 0) newErrors.hours = t("form.error.hours");
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const payload = {
      budgetItemId,
      contactId: contactId || null,
      workerName,
      workerType,
      date,
      dateTo: dateTo || null,
      hours: h,
      workerCount: workerCount ? Math.max(1, Number(workerCount)) : 1,
      description,
    };

    try {
      if (isEdit && editEntry && updateTimeEntry) {
        await updateTimeEntry.mutateAsync({ id: editEntry.id, data: payload });
        // If marking the budget item completed during edit
        if (markCompleted) {
          try {
            await updateBudgetItem.mutateAsync({ id: budgetItemId, data: { completed: true } });
            toast.success(t("toasts.updateSuccessWithItem"));
          } catch {
            toast.success(t("toasts.updateSuccessItemFail"));
          }
        } else {
          toast.success(t("toasts.updateSuccess"));
        }
      } else {
        await createTimeEntry.mutateAsync(payload);
        trackEvent("add_time_entry", { hours: h, workerName });
        // Persist last-used values for the next "new" entry (edit mode is skipped).
        setLastWorkerName(workerName);
        setLastWorkerType(workerType);
        setLastContactId(contactId);
        if (markCompleted) {
          try {
            await updateBudgetItem.mutateAsync({ id: budgetItemId, data: { completed: true } });
            toast.success(t("toasts.createSuccessWithItem"));
          } catch {
            toast.success(t("toasts.createSuccessItemFail"));
          }
        } else {
          toast.success(t("toasts.createSuccess"));
        }
      }
      onOpenChange(false);
      onClose?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (isEdit ? t("toasts.updateError") : t("toasts.createError")));
    }
  };

  // Selected budget item to show "already completed" hint next to checkbox
  const selectedBudgetItem = budgetItems.find((b) => b.id === budgetItemId);
  const alreadyCompleted = selectedBudgetItem?.completed === true;

  const submitLabel = isEdit ? t("form.submitLabel.edit") : t("form.submitLabel.create");

  return (
    <AddDialogShell
      open={open}
      onOpenChange={onOpenChange}
      titleValue={workerName}
      onTitleChange={setWorkerName}
      titlePlaceholder={t("form.titlePlaceholder")}
      descriptionValue={description}
      onDescriptionChange={setDescription}
      descriptionPlaceholder={t("form.descriptionPlaceholder")}
      submitLabel={submitLabel}
      onSubmit={handleSubmit}
      isSubmitting={isPending}
      maxWidth="max-w-3xl"
    >
      {errors.workerName && (
        <p className="text-xs text-destructive">{errors.workerName}</p>
      )}

      {/* ===== ZÁKLAD ===== */}
      <div className="space-y-2">
        <Label htmlFor="budgetItem">{t("form.label.budgetItem")}</Label>
        <SearchableSelect
          id="budgetItem"
          options={budgetItems.map((b) => {
            // For child items (tasks), show the parent item's name as hint
            // so the user can distinguish which parent a task belongs to.
            // e.g. "Hydroizolace" with hint "Hrubá stavba › Hydroizolace"
            const parent = b.parentId
              ? budgetItems.find((p) => p.id === b.parentId)
              : null;
            const label = `${b.category}${b.subcategory ? ` / ${b.subcategory}` : ""}${b.completed ? " ✓" : ""}`;
            return {
              value: b.id,
              label,
              hint: parent
                ? `${parent.subcategory || parent.category} › ${b.subcategory || b.category}`
                : b.category,
            };
          })}
          value={budgetItemId}
          onChange={(v) => {
            setBudgetItemId(v);
            if (errors.budgetItemId)
              setErrors((prev) => {
                const n = { ...prev };
                delete n.budgetItemId;
                return n;
              });
          }}
          placeholder={t("form.placeholder.budgetItem")}
          searchPlaceholder={t("form.search.budgetItem")}
          emptyText={t("form.empty.budgetItem")}
          className={cn(errors.budgetItemId && "border-destructive ring-destructive")}
        />
        {errors.budgetItemId && (
          <p className="text-xs text-destructive mt-1">{errors.budgetItemId}</p>
        )}
      </div>

      {/* Hodiny + Počet lidí + Datum od */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="hours">{t("form.label.hours")}</Label>
          <Input
            id="hours"
            value={hours}
            onChange={(e) => {
              setHours(e.target.value);
              if (errors.hours)
                setErrors((prev) => {
                  const n = { ...prev };
                  delete n.hours;
                  return n;
                });
            }}
            placeholder={t("form.placeholder.hours")}
            inputMode="decimal"
            aria-invalid={!!errors.hours}
            className={cn(errors.hours && "border-destructive ring-destructive")}
            required
          />
          {errors.hours && (
            <p className="text-xs text-destructive mt-1">{errors.hours}</p>
          )}
          {daySpan > 1 && hoursPerDay && (
            <p className="text-[11px] text-muted-foreground">
              {t("form.hint.hoursPerDay", { hours: hoursPerDay, days: daySpan })}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="workerCount">{t("form.label.workerCount")}</Label>
          <Input
            id="workerCount"
            type="number"
            inputMode="numeric"
            min="1"
            value={workerCount}
            onChange={(e) => setWorkerCount(e.target.value)}
            placeholder={t("form.placeholder.workerCount")}
          />
          {workerCount && Number(workerCount) > 1 && (
            <p className="text-[11px] text-muted-foreground">
              {t("form.hint.personHours", {
                total: formatNumber(Number(hours || 0) * Number(workerCount), " h", activeLocale),
              })}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">{t("form.label.dateFrom")}</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
      </div>

      {/* ===== DETAILY (volitelné) ===== */}
      <CollapsibleSection title={t("form.section.details")}>
        {/* Typ pracovníka */}
        <div className="space-y-2">
          <Label htmlFor="workerType">{t("form.label.workerType")}</Label>
          <Select value={workerType} onValueChange={setWorkerType}>
            <SelectTrigger id="workerType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORKER_TYPES.map((wt) => (
                <SelectItem key={wt.value} value={wt.value}>
                  {wt.emoji} {tWorkerTypes(wt.value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Datum do (vícedenní) */}
        <div className="space-y-2">
          <Label htmlFor="dateTo">{t("form.label.dateTo")}</Label>
          <Input
            id="dateTo"
            type="date"
            value={dateTo}
            min={date}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder={t("form.placeholder.dateTo")}
          />
          {dateTo && (
            <p className="text-[11px] text-muted-foreground">
              {t("form.hint.daySpan", { days: daySpan })}
            </p>
          )}
        </div>

        {/* Kontakt (volitelné) */}
        <div className="space-y-2">
          <Label htmlFor="contact">{t("form.label.contact")}</Label>
          <SearchableSelect
            id="contact"
            options={contacts.map((c) => ({
              value: c.id,
              label: c.name,
              hint: `${c.type}${c.role ? ` · ${c.role}` : ""}${c.company ? ` · ${c.company}` : ""}`,
            }))}
            value={contactId}
            onChange={(v) => {
              setContactId(v);
              // Auto-derive workerType + workerName from contact when assigned
              const selected = contacts.find((c) => c.id === v);
              if (selected) {
                // Map contact.type to workerType (company→company, craftsman→craftsman,
                // self→self, family→family, others default to "company")
                const typeMap: Record<string, string> = {
                  company: "company",
                  craftsman: "craftsman",
                  self: "self",
                  family: "family",
                };
                const derivedType = typeMap[selected.type] ?? "company";
                setWorkerType(derivedType);
                setWorkerName(selected.name);
              }
            }}
            placeholder={t("form.placeholder.contact")}
            searchPlaceholder={t("form.search.contact")}
            emptyText={t("form.empty.contact")}
          />
        </div>

        {/* Hotovo checkbox - propojí časový záznam s dokončením budget item */}
        <div className="flex flex-col gap-1 rounded-md border border-success/30 bg-success-soft/50 p-3 dark:border-success-strong/60 dark:bg-success-soft/40">
          <div className="flex items-start gap-2">
            <Checkbox
              id="markCompleted"
              checked={markCompleted}
              onCheckedChange={(v) => setMarkCompleted(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="markCompleted" className="cursor-pointer text-sm font-medium leading-tight">
              {t("form.markCompleted.label")}
            </Label>
          </div>
          {alreadyCompleted && (
            <p className="ml-6 text-[11px] text-muted-foreground">
              {t("form.markCompleted.alreadyCompleted")}
            </p>
          )}
        </div>
      </CollapsibleSection>
    </AddDialogShell>
  );
}
