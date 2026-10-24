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
} from "lucide-react";
import { formatNumber, formatDate, WORKER_TYPES, workerTypeLabel, toBcp47 } from "@/lib/format";
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

type SortKey = "date" | "worker" | "hours" | "workerType";

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
        <div className="ml-auto flex items-center gap-3 text-sm">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">{t("total.label", { count: filtered.length })}</div>
            <div className="text-lg font-bold text-time">
              {formatNumber(totalHours, " h", activeLocale)}
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {/* Toolbar skeleton */}
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-32" />
            <div className="ml-auto flex items-center gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-32" />
            </div>
          </div>
          {/* Stats skeleton */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          {/* Table skeleton */}
          <div className="overflow-hidden rounded-lg border">
            <div className="border-b bg-muted/40 px-4 py-2.5">
              <Skeleton className="h-4 w-full" />
            </div>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="border-b px-4 py-3">
                <Skeleton className="h-5 w-full" />
              </div>
            ))}
          </div>
        </div>
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
        <div className="flex flex-col gap-1 rounded-md border border-time/30 bg-time-soft/50 p-3 dark:border-time-strong/60 dark:bg-time-soft/60">
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
