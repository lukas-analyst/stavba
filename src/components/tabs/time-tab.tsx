"use client";

import { useState, useMemo } from "react";
import {
  useTimeEntries,
  useBudgetItems,
  useContacts,
  useCreateTimeEntry,
  useUpdateTimeEntry,
  useDeleteTimeEntry,
  useUpdateBudgetItem,
  useExportCsv,
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
import { Textarea } from "@/components/ui/textarea";
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
  Loader2,
  Download,
  ArrowUpDown,
  CheckCircle2,
} from "lucide-react";
import { formatNumber, formatDate, WORKER_TYPES, workerTypeLabel } from "@/lib/format";
import { toast } from "sonner";
import { EmptyStateBox } from "@/components/empty-state-box";

type SortKey = "date" | "worker" | "hours" | "workerType";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "date", label: "Datum (nejnovější)" },
  { value: "worker", label: "Pracovník (A→Z)" },
  { value: "hours", label: "Hodiny (sestupně)" },
  { value: "workerType", label: "Typ pracovníka" },
];

export function TimeTab({ projectId }: { projectId: string }) {
  const { data: entries, isLoading } = useTimeEntries(projectId);
  const { data: budgetItems } = useBudgetItems(projectId);
  const { data: contacts } = useContacts(projectId);
  const createTimeEntry = useCreateTimeEntry(projectId);
  const updateTimeEntry = useUpdateTimeEntry(projectId);
  const deleteTimeEntry = useDeleteTimeEntry(projectId);
  const updateBudgetItem = useUpdateBudgetItem(projectId);
  const exportCsv = useExportCsv(projectId);
  const [addOpen, setAddOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("date");

  // Unique categories derived from budget items for the category filter
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const b of budgetItems ?? []) {
      if (b.category) set.add(b.category);
    }
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b, "cs-CZ"));
  }, [budgetItems]);

  const filtered = useMemo(() => {
    const arr = (entries ?? []).filter((t) => {
      if (typeFilter !== "all" && t.workerType !== typeFilter) return false;
      if (categoryFilter !== "all" && (t.budgetItem?.category ?? "") !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const text = `${t.workerName} ${t.description ?? ""} ${t.budgetItem?.category ?? ""} ${t.budgetItem?.subcategory ?? ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });

    arr.sort((a, b) => {
      switch (sortBy) {
        case "worker":
          return a.workerName.localeCompare(b.workerName, "cs-CZ");
        case "hours":
          return b.hours - a.hours;
        case "workerType":
          if (a.workerType === b.workerType) {
            return b.date.localeCompare(a.date);
          }
          return a.workerType.localeCompare(b.workerType, "cs-CZ");
        case "date":
        default: {
          // Newest first; tiebreak by id
          const cmp = b.date.localeCompare(a.date);
          return cmp !== 0 ? cmp : b.id.localeCompare(a.id);
        }
      }
    });
    return arr;
  }, [entries, search, typeFilter, categoryFilter, sortBy]);

  const totalHours = filtered.reduce((s, t) => s + t.hours, 0);

  // Group by worker (top stats) - based on all entries (not filtered)
  const byWorker = useMemo(() => {
    const map = new Map<string, { hours: number; entries: number; type: string }>();
    for (const t of entries ?? []) {
      const key = t.workerName;
      const cur = map.get(key) ?? { hours: 0, entries: 0, type: t.workerType };
      cur.hours += t.hours;
      cur.entries += 1;
      map.set(key, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].hours - a[1].hours);
  }, [entries]);

  return (
    <div className="space-y-4">
      {/* Top stats: hours by worker */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {byWorker.slice(0, 6).map(([name, info]) => {
          const w = workerTypeLabel(info.type);
          return (
            <Card key={name} className="p-3">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span>{w.emoji}</span> {w.label}
              </div>
              <div className="mt-1 truncate text-sm font-bold" title={name}>
                {name}
              </div>
              <div className="mt-1 text-lg font-bold text-violet-600">
                {formatNumber(info.hours, " h")}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {info.entries} záznamů
              </div>
            </Card>
          );
        })}
        {byWorker.length === 0 && (
          <Card className="col-span-full p-4 text-center text-sm text-muted-foreground">
            Zatím žádné časové záznamy
          </Card>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hledat záznam…"
            className="h-9 w-56 pl-8"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny typy</SelectItem>
            {WORKER_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.emoji} {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-9 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">Všechny kategorie</SelectItem>
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
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Celkem ({filtered.length})</div>
            <div className="text-lg font-bold text-violet-600">
              {formatNumber(totalHours, " h")}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={exportCsv.isPending || (entries?.length ?? 0) === 0}
            onClick={async () => {
              try {
                await exportCsv.mutateAsync("time");
                toast.success("Čas exportován do CSV");
              } catch {
                toast.error("Export selhal");
              }
            }}
            title="Exportovat do CSV (Excel/Google Sheets)"
          >
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Zaznamenat čas
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-96" />
      ) : filtered.length === 0 ? (
        <EmptyStateBox
          icon={Clock}
          title={entries?.length === 0 ? "Zatím žádné časové záznamy" : "Žádné záznamy neodpovídají filtru"}
          description={
            entries?.length === 0
              ? "Zaznamenávejte čas strávený prací - firma, řemeslník i svépomoc. Podporuje i vícedenní záznamy."
              : "Zkuste změnit filtr nebo vyhledávání."
          }
          action={
            entries?.length === 0 ? (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Zaznamenat první čas
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-28">Datum</TableHead>
                <TableHead className="min-w-[160px]">Pracovník</TableHead>
                <TableHead className="w-32">Typ</TableHead>
                <TableHead className="min-w-[200px]">Položka rozpočtu</TableHead>
                <TableHead className="min-w-[180px]">Popis práce</TableHead>
                <TableHead className="text-right">Hodiny</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TimeRow
                  key={t.id}
                  entry={t}
                  onEdit={() => setEditEntry(t)}
                  onDelete={async () => {
                    try {
                      await deleteTimeEntry.mutateAsync(t.id);
                      toast.success("Záznam smazán");
                    } catch {
                      toast.error("Nepodařilo se smazat");
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
  onEdit,
  onDelete,
}: {
  entry: TimeEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const w = workerTypeLabel(entry.workerType);
  return (
    <TableRow className="group">
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        <div className="flex flex-col">
          <span>{formatDate(entry.date)}</span>
          {entry.dateTo && (
            <span className="text-[10px] text-violet-600">
              → {formatDate(entry.dateTo)}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">{entry.workerName}</span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[10px]">
          {w.emoji} {w.label}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-xs font-medium">
            {entry.budgetItem?.subcategory || entry.budgetItem?.category}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {entry.budgetItem?.category}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {entry.description || "—"}
      </TableCell>
      <TableCell className="text-right text-sm font-semibold text-violet-600">
        {formatNumber(entry.hours, " h")}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Upravit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirm(true)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Smazat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={confirm} onOpenChange={setConfirm}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Smazat časový záznam?</DialogTitle>
              <DialogDescription>
                Opravdu chcete smazat záznam{" "}
                <strong>{entry.workerName}</strong> ·{" "}
                {formatNumber(entry.hours, " h")}?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirm(false)}>
                Zrušit
              </Button>
              <Button variant="destructive" onClick={() => { setConfirm(false); onDelete(); }}>
                Smazat
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
  budgetItems: { id: string; category: string; subcategory: string | null; completed?: boolean }[];
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
  const { open, onOpenChange, editEntry } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {open && (
          <TimeDialogInner
            key={editEntry?.id ?? "new"}
            {...props}
          />
        )}
      </DialogContent>
    </Dialog>
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
  budgetItems,
  contacts,
  createTimeEntry,
  updateTimeEntry,
  updateBudgetItem,
  editEntry,
  onClose,
  onOpenChange,
}: Omit<TimeDialogProps, "open">) {
  const isEdit = !!editEntry;
  const today = new Date().toISOString().substring(0, 10);
  const [budgetItemId, setBudgetItemId] = useState(editEntry?.budgetItemId ?? "");
  const [contactId, setContactId] = useState(editEntry?.contactId ?? "");
  const [workerName, setWorkerName] = useState(editEntry?.workerName ?? "");
  const [workerType, setWorkerType] = useState(editEntry?.workerType ?? "self");
  const [date, setDate] = useState(toDateStr(editEntry?.date) || today);
  const [dateTo, setDateTo] = useState(toDateStr(editEntry?.dateTo));
  const [hours, setHours] = useState(editEntry ? String(editEntry.hours ?? "") : "");
  const [description, setDescription] = useState(editEntry?.description ?? "");
  const [markCompleted, setMarkCompleted] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!budgetItemId) {
      toast.error("Vyberte položku rozpočtu");
      return;
    }
    const h = Number(hours.replace(",", "."));
    if (!h || h <= 0) {
      toast.error("Zadejte platný počet hodin");
      return;
    }
    if (!workerName.trim()) {
      toast.error("Zadejte jméno pracovníka");
      return;
    }

    const payload = {
      budgetItemId,
      contactId: contactId || null,
      workerName,
      workerType,
      date,
      dateTo: dateTo || null,
      hours: h,
      description,
    };

    try {
      if (isEdit && editEntry && updateTimeEntry) {
        await updateTimeEntry.mutateAsync({ id: editEntry.id, data: payload });
        // If marking the budget item completed during edit
        if (markCompleted) {
          try {
            await updateBudgetItem.mutateAsync({ id: budgetItemId, data: { completed: true } });
            toast.success("Záznam upraven, položka označena jako hotová");
          } catch {
            toast.success("Záznam upraven (nepodařilo se označit položku jako hotovou)");
          }
        } else {
          toast.success("Záznam upraven");
        }
      } else {
        await createTimeEntry.mutateAsync(payload);
        if (markCompleted) {
          try {
            await updateBudgetItem.mutateAsync({ id: budgetItemId, data: { completed: true } });
            toast.success("Čas zaznamenán, položka označena jako hotová");
          } catch {
            toast.success("Čas zaznamenán (nepodařilo se označit položku jako hotovou)");
          }
        } else {
          toast.success("Čas zaznamenán");
        }
      }
      onOpenChange(false);
      onClose?.();
    } catch {
      toast.error(isEdit ? "Nepodařilo se upravit záznam" : "Nepodařilo se zaznamenat čas");
    }
  };

  // Selected budget item to show "already completed" hint next to checkbox
  const selectedBudgetItem = budgetItems.find((b) => b.id === budgetItemId);
  const alreadyCompleted = selectedBudgetItem?.completed === true;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Upravit časový záznam" : "Zaznamenat čas"}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Upravte záznam o práci. Změny se propíší do statistik položky rozpočtu."
            : "Kdo na čem pracoval, kdy a jak dlouho. Firma, řemeslník i svépomoc."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="budgetItem">Položka rozpočtu *</Label>
          <Select value={budgetItemId} onValueChange={setBudgetItemId}>
            <SelectTrigger id="budgetItem">
              <SelectValue placeholder="Vyberte položku…" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {budgetItems.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.category}
                  {b.subcategory ? ` / ${b.subcategory}` : ""}
                  {b.completed ? " ✓" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="workerName">Pracovník (jméno) *</Label>
            <Input
              id="workerName"
              value={workerName}
              onChange={(e) => setWorkerName(e.target.value)}
              placeholder="např. Jan Svoboda"
              list="contacts-list"
              required
            />
            <datalist id="contacts-list">
              {contacts.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label htmlFor="workerType">Typ pracovníka</Label>
            <Select value={workerType} onValueChange={setWorkerType}>
              <SelectTrigger id="workerType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORKER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.emoji} {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="hours">Hodiny celkem *</Label>
            <Input
              id="hours"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="40"
              inputMode="decimal"
              required
            />
            {daySpan > 1 && hoursPerDay && (
              <p className="text-[11px] text-muted-foreground">
                ≈ {hoursPerDay} h/den × {daySpan} dní
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">Datum od *</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="dateTo">Datum do (vícedenní)</Label>
            <Input
              id="dateTo"
              type="date"
              value={dateTo}
              min={date}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="(volitelné)"
            />
            {dateTo && (
              <p className="text-[11px] text-muted-foreground">
                Práce trvá {daySpan} {daySpan === 1 ? "den" : daySpan < 5 ? "dny" : "dní"}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact">Kontakt (volitelné)</Label>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger id="contact">
                <SelectValue placeholder="Bez kontaktu" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Popis práce</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Co se dělalo, postup, materiál…"
            rows={2}
          />
        </div>
        {/* Hotovo checkbox - propojí časový záznam s dokončením budget item */}
        <div className="flex flex-col gap-1 rounded-md border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900/60 dark:bg-violet-950/20">
          <div className="flex items-start gap-2">
            <Checkbox
              id="markCompleted"
              checked={markCompleted}
              onCheckedChange={(v) => setMarkCompleted(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="markCompleted" className="cursor-pointer text-sm font-medium leading-tight">
              Označit položku rozpočtu jako hotovou
            </Label>
          </div>
          <p className="ml-6 text-[11px] text-muted-foreground">
            {alreadyCompleted
              ? "Položka je již označena jako hotová."
              : "Po uložení záznamu se zavolá PATCH na budget item s completed: true. Propojí časový záznam s dokončením položky."}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Uložit změny" : "Zaznamenat"}
            {markCompleted && !isPending && (
              <CheckCircle2 className="ml-1.5 h-4 w-4 text-violet-500" />
            )}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
