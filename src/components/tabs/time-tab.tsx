"use client";

import { useState, useMemo } from "react";
import {
  useTimeEntries,
  useBudgetItems,
  useContacts,
  useCreateTimeEntry,
  useDeleteTimeEntry,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Trash2,
  MoreHorizontal,
  Search,
  Clock,
  Loader2,
} from "lucide-react";
import { formatNumber, formatDate, WORKER_TYPES, workerTypeLabel } from "@/lib/format";
import { toast } from "sonner";

export function TimeTab({ projectId }: { projectId: string }) {
  const { data: entries, isLoading } = useTimeEntries(projectId);
  const { data: budgetItems } = useBudgetItems(projectId);
  const { data: contacts } = useContacts(projectId);
  const createTimeEntry = useCreateTimeEntry(projectId);
  const deleteTimeEntry = useDeleteTimeEntry(projectId);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    return (entries ?? []).filter((t) => {
      if (typeFilter !== "all" && t.workerType !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const text = `${t.workerName} ${t.description ?? ""} ${t.budgetItem?.category ?? ""} ${t.budgetItem?.subcategory ?? ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [entries, search, typeFilter]);

  const totalHours = filtered.reduce((s, t) => s + t.hours, 0);

  // Group by worker
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
        <div className="ml-auto flex items-center gap-3 text-sm">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Celkem ({filtered.length})</div>
            <div className="text-lg font-bold text-violet-600">
              {formatNumber(totalHours, " h")}
            </div>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Zaznamenat čas
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-96" />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          <Clock className="mx-auto mb-2 h-8 w-8 opacity-40" />
          {entries?.length === 0
            ? 'Zatím nebyl zaznamenán žádný čas. Klikněte na „Zaznamenat čas".'
            : "Žádné záznamy neodpovídají filtru."}
        </div>
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
      />
    </div>
  );
}

function TimeRow({
  entry,
  onDelete,
}: {
  entry: TimeEntry;
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

function TimeDialog({
  open,
  onOpenChange,
  budgetItems,
  contacts,
  createTimeEntry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  budgetItems: { id: string; category: string; subcategory: string | null }[];
  contacts: { id: string; name: string; type: string }[];
  createTimeEntry: ReturnType<typeof useCreateTimeEntry>;
}) {
  const [budgetItemId, setBudgetItemId] = useState("");
  const [contactId, setContactId] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [workerType, setWorkerType] = useState("self");
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [dateTo, setDateTo] = useState("");
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");

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
    try {
      await createTimeEntry.mutateAsync({
        budgetItemId,
        contactId: contactId || null,
        workerName,
        workerType,
        date,
        dateTo: dateTo || null,
        hours: h,
        description,
      });
      toast.success("Čas zaznamenán");
      setBudgetItemId("");
      setContactId("");
      setWorkerName("");
      setHours("");
      setDescription("");
      setWorkerType("self");
      setDateTo("");
      onOpenChange(false);
    } catch {
      toast.error("Nepodařilo se zaznamenat čas");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Zaznamenat čas</DialogTitle>
          <DialogDescription>
            Kdo na čem pracoval, kdy a jak dlouho. Firma, řemeslník i svépomoc.
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Zrušit
            </Button>
            <Button type="submit" disabled={createTimeEntry.isPending}>
              {createTimeEntry.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Zaznamenat
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
