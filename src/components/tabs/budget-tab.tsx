"use client";

import { useState, useMemo } from "react";
import {
  useBudgetItems,
  useUpdateBudgetItem,
  useDeleteBudgetItem,
  type BudgetItem,
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  MoreHorizontal,
  AlertTriangle,
  Filter,
  Search,
  Loader2,
} from "lucide-react";
import {
  formatCzk,
  formatNumber,
  formatDate,
  PHASES,
  PHASE_COLORS,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BudgetItemDialog } from "@/components/budget-item-dialog";

export function BudgetTab({ projectId }: { projectId: string }) {
  const { data: items, isLoading } = useBudgetItems(projectId);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);

  const toggleCat = (cat: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Group items by category, preserving order
  const grouped = useMemo(() => {
    const filtered = (items ?? []).filter((it) => {
      if (phaseFilter !== "all" && it.phase !== phaseFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const text = `${it.category} ${it.subcategory ?? ""} ${it.note ?? ""} ${it.element ?? ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
    const groups = new Map<string, BudgetItem[]>();
    for (const it of filtered) {
      const arr = groups.get(it.category) ?? [];
      arr.push(it);
      groups.set(it.category, arr);
    }
    return Array.from(groups.entries());
  }, [items, phaseFilter, search]);

  // Category totals
  const categoryTotals = useMemo(() => {
    const map = new Map<string, { plan: number; actual: number; count: number }>();
    for (const it of items ?? []) {
      const cur = map.get(it.category) ?? { plan: 0, actual: 0, count: 0 };
      cur.plan += it.planCost || 0;
      cur.actual += it.actualCost || 0;
      cur.count += 1;
      map.set(it.category, cur);
    }
    return map;
  }, [items]);

  const grandPlan = (items ?? []).reduce((s, i) => s + (i.planCost || 0), 0);
  const grandActual = (items ?? []).reduce((s, i) => s + (i.actualCost || 0), 0);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hledat položku…"
            className="h-9 w-56 pl-8"
          />
        </div>
        <Select value={phaseFilter} onValueChange={setPhaseFilter}>
          <SelectTrigger className="h-9 w-44">
            <Filter className="mr-2 h-3.5 w-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny fáze</SelectItem>
            {PHASES.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Celkem plán</div>
            <div className="font-bold">{formatCzk(grandPlan)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Celkem skutečnost</div>
            <div className="font-bold text-amber-600">{formatCzk(grandActual)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Zbývá</div>
            <div className={cn("font-bold", grandPlan - grandActual < 0 ? "text-rose-600" : "text-emerald-600")}>
              {formatCzk(grandPlan - grandActual)}
            </div>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Přidat položku
          </Button>
        </div>
      </div>

      {/* Budget table grouped by category */}
      <div className="space-y-3">
        {grouped.length === 0 && (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            Žádné položky neodpovídají filtru.
          </div>
        )}
        {grouped.map(([category, catItems]) => {
          const collapsed = collapsedCats.has(category);
          const totals = categoryTotals.get(category)!;
          const burn = totals.plan > 0 ? (totals.actual / totals.plan) * 100 : 0;
          return (
            <Collapsible
              key={category}
              open={!collapsed}
              onOpenChange={() => toggleCat(category)}
              className="rounded-lg border bg-card"
            >
              <CollapsibleTrigger asChild>
                <button className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/50">
                  {collapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  <span className="text-sm font-bold">{category}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {totals.count}
                  </Badge>
                  <div className="ml-auto flex items-center gap-4 text-xs">
                    <span className="text-muted-foreground">
                      {formatCzk(totals.actual)} / {formatCzk(totals.plan)}
                    </span>
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          burn > 100 ? "bg-rose-500" : burn > 80 ? "bg-amber-500" : "bg-emerald-500",
                        )}
                        style={{ width: `${Math.min(burn, 100)}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        "font-semibold",
                        burn > 100 ? "text-rose-600" : burn > 80 ? "text-amber-600" : "text-emerald-600",
                      )}
                    >
                      {burn.toFixed(0)}%
                    </span>
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="w-8"></TableHead>
                        <TableHead className="min-w-[180px]">Položka</TableHead>
                        <TableHead className="w-28">Fáze</TableHead>
                        <TableHead className="w-44">Poznámka</TableHead>
                        <TableHead className="w-28 text-right">Plán (Kč)</TableHead>
                        <TableHead className="w-20 text-right">Vůle</TableHead>
                        <TableHead className="w-20 text-right">Dny</TableHead>
                        <TableHead className="w-28">Datum od</TableHead>
                        <TableHead className="w-28">Datum do</TableHead>
                        <TableHead className="w-28 text-right">Skut. (Kč)</TableHead>
                        <TableHead className="w-20 text-right">Hod.</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {catItems.map((item) => (
                        <BudgetRow
                          key={item.id}
                          item={item}
                          projectId={projectId}
                          onEdit={() => setEditingItem(item)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      <BudgetItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
      />
      <BudgetItemDialog
        open={!!editingItem}
        onOpenChange={(o) => !o && setEditingItem(null)}
        projectId={projectId}
        item={editingItem}
      />
    </div>
  );
}

function BudgetRow({
  item,
  projectId,
  onEdit,
}: {
  item: BudgetItem;
  projectId: string;
  onEdit: () => void;
}) {
  const updateItem = useUpdateBudgetItem(projectId);
  const deleteItem = useDeleteBudgetItem(projectId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const overBudget = item.planCost && item.actualCost > item.planCost;
  const burn = item.planCost ? (item.actualCost / item.planCost) * 100 : 0;

  const update = (field: keyof BudgetItem, value: unknown) => {
    updateItem.mutate({ id: item.id, data: { [field]: value } });
  };

  return (
    <TableRow className="group">
      <TableCell className="px-2">
        <Checkbox
          checked={item.required}
          onCheckedChange={(v) => update("required", v === true)}
          aria-label="Nutné"
        />
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <button
            onClick={onEdit}
            className="text-left text-sm font-medium hover:underline"
          >
            {item.subcategory || "(bez názvu)"}
          </button>
          {item.element && (
            <span className="text-[11px] text-muted-foreground">
              {item.element}
            </span>
          )}
          {item._count && (item._count.payments > 0 || item._count.timeEntries > 0) && (
            <div className="mt-0.5 flex gap-1">
              {item._count.payments > 0 && (
                <Badge variant="outline" className="h-4 px-1 text-[10px] text-emerald-700">
                  {item._count.payments} plateb
                </Badge>
              )}
              {item._count.timeEntries > 0 && (
                <Badge variant="outline" className="h-4 px-1 text-[10px] text-violet-700">
                  {item._count.timeEntries} časů
                </Badge>
              )}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Select
          value={item.phase}
          onValueChange={(v) => update("phase", v)}
        >
          <SelectTrigger className="h-7 border-0 px-1 text-[11px] shadow-none hover:bg-muted">
            <Badge
              variant="outline"
              className={cn("h-5 px-1.5 text-[10px]", PHASE_COLORS[item.phase] ?? "")}
            >
              {item.phase}
            </Badge>
          </SelectTrigger>
          <SelectContent>
            {PHASES.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {item.note ? (
          <span className="line-clamp-2 text-[11px] text-muted-foreground" title={item.note}>
            {item.note}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground/50">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <InlineNumber
          value={item.planCost}
          onCommit={(v) => update("planCost", v)}
          className="text-right"
        />
      </TableCell>
      <TableCell className="text-right">
        <InlineNumber
          value={item.flexibilityPercent}
          onCommit={(v) => update("flexibilityPercent", v)}
          suffix="%"
          className="text-right text-[11px]"
        />
      </TableCell>
      <TableCell className="text-right">
        <InlineNumber
          value={item.planDays}
          onCommit={(v) => update("planDays", v)}
          className="text-right text-[11px]"
        />
      </TableCell>
      <TableCell>
        <InlineDate
          value={item.dateFrom}
          onCommit={(v) => update("dateFrom", v)}
        />
      </TableCell>
      <TableCell>
        <InlineDate
          value={item.dateTo}
          onCommit={(v) => update("dateTo", v)}
        />
      </TableCell>
      <TableCell className={cn("text-right", overBudget && "font-semibold text-rose-600")}>
        <InlineNumber
          value={item.actualCost}
          onCommit={(v) => update("actualCost", v)}
          className="text-right"
        />
        {overBudget && (
          <span className="ml-1 inline-flex items-center text-[10px] text-rose-500">
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
      </TableCell>
      <TableCell className="text-right text-[11px] text-violet-600">
        {item.actualHours > 0 ? formatNumber(item.actualHours, " h") : "—"}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              Upravit detail
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Smazat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Smazat položku?</DialogTitle>
              <DialogDescription>
                Opravdu chcete smazat <strong>{item.subcategory || item.category}</strong>?
                Smažou se i související platby a časové záznamy.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                Zrušit
              </Button>
              <Button
                variant="destructive"
                disabled={deleteItem.isPending}
                onClick={async () => {
                  try {
                    await deleteItem.mutateAsync(item.id);
                    toast.success("Položka smazána");
                    setConfirmDelete(false);
                  } catch {
                    toast.error("Nepodařilo se smazat");
                  }
                }}
              >
                {deleteItem.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Smazat
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}

function InlineNumber({
  value,
  onCommit,
  suffix,
  className,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  suffix?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? "");

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const n = draft.trim() === "" ? null : Number(draft.replace(",", "."));
          if (n !== value && (n === null || !isNaN(n))) onCommit(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value?.toString() ?? "");
            setEditing(false);
          }
        }}
        className={cn("h-7 w-20 text-xs", className)}
      />
    );
  }
  return (
    <button
      onClick={() => {
        setDraft(value?.toString() ?? "");
        setEditing(true);
      }}
      className={cn(
        "block w-full rounded px-1 py-0.5 text-right text-xs hover:bg-muted",
        className,
      )}
    >
      {value === null || value === undefined ? (
        <span className="text-muted-foreground/50">—</span>
      ) : (
        <>
          {formatNumber(value, suffix ?? "")}
        </>
      )}
    </button>
  );
}

function InlineDate({
  value,
  onCommit,
}: {
  value: string | null;
  onCommit: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ? value.substring(0, 10) : "");

  if (editing) {
    return (
      <Input
        type="date"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== (value ? value.substring(0, 10) : "")) {
            onCommit(draft || null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value ? value.substring(0, 10) : "");
            setEditing(false);
          }
        }}
        className="h-7 w-36 text-xs"
      />
    );
  }
  return (
    <button
      onClick={() => {
        setDraft(value ? value.substring(0, 10) : "");
        setEditing(true);
      }}
      className="block w-full rounded px-1 py-0.5 text-left text-xs hover:bg-muted"
    >
      {value ? formatDate(value) : <span className="text-muted-foreground/50">—</span>}
    </button>
  );
}
