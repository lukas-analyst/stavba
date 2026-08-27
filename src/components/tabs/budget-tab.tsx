"use client";

import { useState, useMemo } from "react";
import {
  useBudgetItems,
  useUpdateBudgetItem,
  useDeleteBudgetItem,
  useDuplicateBudgetItem,
  useReorder,
  useProjects,
  useExportCsv,
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
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  Circle,
  PiggyBank,
  Download,
  Copy,
  MessageSquare,
} from "lucide-react";
import {
  formatCzk,
  formatNumber,
  formatDate,
  PHASES,
  PHASE_COLORS,
  PHASE_BORDER_COLORS,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BudgetItemDialog } from "@/components/budget-item-dialog";

export function BudgetTab({ projectId }: { projectId: string }) {
  const { data: items, isLoading } = useBudgetItems(projectId);
  const { data: projects } = useProjects();
  const project = projects?.find((p) => p.id === projectId);
  const reorder = useReorder(projectId);
  const exportCsv = useExportCsv(projectId);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [completionFilter, setCompletionFilter] = useState<"all" | "todo" | "done">("all");
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

  // Parse the saved category order (JSON string on the project)
  const savedCategoryOrder = useMemo(() => {
    if (!project?.categoryOrder) return [];
    try {
      const arr = JSON.parse(project.categoryOrder);
      return Array.isArray(arr) ? (arr as string[]) : [];
    } catch {
      return [];
    }
  }, [project?.categoryOrder]);

  // Group items by category, preserving order; respect saved category order
  const grouped = useMemo(() => {
    const filtered = (items ?? []).filter((it) => {
      if (phaseFilter !== "all" && it.phase !== phaseFilter) return false;
      if (completionFilter === "done" && !it.completed) return false;
      if (completionFilter === "todo" && it.completed) return false;
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
    // Sort categories by saved order; unknown categories go last (alphabetical)
    const entries = Array.from(groups.entries());
    entries.sort((a, b) => {
      const ia = savedCategoryOrder.indexOf(a[0]);
      const ib = savedCategoryOrder.indexOf(b[0]);
      if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return entries;
  }, [items, phaseFilter, search, savedCategoryOrder, completionFilter]);

  // Category totals
  const categoryTotals = useMemo(() => {
    const map = new Map<string, { plan: number; actual: number; count: number; saved: number }>();
    for (const it of items ?? []) {
      const cur = map.get(it.category) ?? { plan: 0, actual: 0, count: 0, saved: 0 };
      cur.plan += it.planCost || 0;
      cur.actual += it.actualCost || 0;
      cur.count += 1;
      if (it.completed) {
        cur.saved += Math.max(0, (it.planCost || 0) - (it.actualCost || 0));
      }
      map.set(it.category, cur);
    }
    return map;
  }, [items]);

  const grandPlan = (items ?? []).reduce((s, i) => s + (i.planCost || 0), 0);
  const grandActual = (items ?? []).reduce((s, i) => s + (i.actualCost || 0), 0);
  const grandSaved = (items ?? [])
    .filter((i) => i.completed)
    .reduce((s, i) => s + Math.max(0, (i.planCost || 0) - (i.actualCost || 0)), 0);
  const completedCount = (items ?? []).filter((i) => i.completed).length;

  // ===== Reorder handlers =====
  const moveItem = (catItems: BudgetItem[], currentIndex: number, direction: -1 | 1) => {
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= catItems.length) return;
    // Swap sortOrder values with the neighbor
    const a = catItems[currentIndex];
    const b = catItems[targetIndex];
    const newItems = [
      ...catItems.map((it) => ({ id: it.id, sortOrder: it.sortOrder })),
    ];
    newItems[currentIndex].sortOrder = b.sortOrder;
    newItems[targetIndex].sortOrder = a.sortOrder;
    reorder.mutate({ items: newItems });
  };

  const moveCategory = (category: string, direction: -1 | 1) => {
    const currentCats = grouped.map(([c]) => c);
    // Build full category order including any not currently visible
    const allCats = Array.from(new Set([...savedCategoryOrder, ...currentCats]));
    const idx = allCats.indexOf(category);
    const target = idx + direction;
    if (target < 0 || target >= allCats.length) return;
    const reordered = [...allCats];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    reorder.mutate({ categoryOrder: reordered });
  };

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
        {/* Completion filter pills */}
        <div className="flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
          {([
            { id: "all", label: "Vše" },
            { id: "todo", label: "Aktivní" },
            { id: "done", label: "Hotovo" },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setCompletionFilter(opt.id)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                completionFilter === opt.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Plán</div>
            <div className="font-bold">{formatCzk(grandPlan)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Skutečnost</div>
            <div className="font-bold text-amber-600">{formatCzk(grandActual)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Zbývá</div>
            <div className={cn("font-bold", grandPlan - grandActual < 0 ? "text-rose-600" : "text-emerald-600")}>
              {formatCzk(grandPlan - grandActual)}
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <PiggyBank className="h-3 w-3" /> Ušetřeno
            </div>
            <div className="font-bold text-emerald-600">{formatCzk(grandSaved)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Hotovo</div>
            <div className="font-bold">{completedCount}/{items?.length ?? 0}</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={exportCsv.isPending}
            onClick={async () => {
              try {
                await exportCsv.mutateAsync("budget");
                toast.success("Rozpočet exportován do CSV");
              } catch {
                toast.error("Export selhal");
              }
            }}
            title="Exportovat do CSV (Excel/Google Sheets)"
          >
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
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
        {grouped.map(([category, catItems], groupIndex) => {
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
                <button className="group flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/50">
                  {collapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  <span className="text-sm font-bold">{category}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {totals.count}
                  </Badge>
                  {totals.saved > 0 && (
                    <Badge variant="outline" className="text-[10px] text-emerald-700">
                      <PiggyBank className="mr-1 h-2.5 w-2.5" />
                      {formatCzk(totals.saved)}
                    </Badge>
                  )}
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
                  {/* Category reorder arrows */}
                  <span className="ml-1 flex flex-col">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        moveCategory(category, -1);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          moveCategory(category, -1);
                        }
                      }}
                      className={cn(
                        "flex h-3.5 w-3.5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground",
                        groupIndex === 0 && "pointer-events-none opacity-30",
                      )}
                      aria-label="Přesunout kategorii nahoru"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        moveCategory(category, 1);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          moveCategory(category, 1);
                        }
                      }}
                      className={cn(
                        "flex h-3.5 w-3.5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground",
                        groupIndex === grouped.length - 1 && "pointer-events-none opacity-30",
                      )}
                      aria-label="Přesunout kategorii dolů"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </span>
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="min-w-[200px]">Položka</TableHead>
                      <TableHead className="min-w-[140px]">Prvek / Úkol</TableHead>
                      <TableHead className="w-28">Fáze</TableHead>
                      <TableHead className="w-44">Poznámka</TableHead>
                      <TableHead className="w-28 text-right">Plán (Kč)</TableHead>
                      <TableHead className="w-20 text-right">Vůle</TableHead>
                      <TableHead className="w-20 text-right">Dny</TableHead>
                      <TableHead className="w-28">Datum od</TableHead>
                      <TableHead className="w-28">Datum do</TableHead>
                      <TableHead className="w-28 text-right">Skut. (Kč)</TableHead>
                      <TableHead className="w-24 text-right">Ušetřeno</TableHead>
                      <TableHead className="w-20 text-right">Hod.</TableHead>
                      <TableHead className="w-28 text-center">Stav</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catItems.map((item, idx) => (
                      <BudgetRow
                        key={item.id}
                        item={item}
                        projectId={projectId}
                        onEdit={() => setEditingItem(item)}
                        canMoveUp={idx > 0}
                        canMoveDown={idx < catItems.length - 1}
                        onMoveUp={() => moveItem(catItems, idx, -1)}
                        onMoveDown={() => moveItem(catItems, idx, 1)}
                      />
                    ))}
                  </TableBody>
                </Table>
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
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  item: BudgetItem;
  projectId: string;
  onEdit: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const updateItem = useUpdateBudgetItem(projectId);
  const deleteItem = useDeleteBudgetItem(projectId);
  const duplicateItem = useDuplicateBudgetItem(projectId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const overBudget = item.planCost && item.actualCost > item.planCost;
  const saved = item.completed
    ? Math.max(0, (item.planCost || 0) - (item.actualCost || 0))
    : null;
  const overSaved = item.completed && item.planCost
    ? (item.actualCost || 0) - (item.planCost || 0)
    : 0;

  const update = (field: keyof BudgetItem, value: unknown) => {
    updateItem.mutate({ id: item.id, data: { [field]: value } });
  };

  return (
    <TableRow
      className={cn(
        "group border-l-2 transition-colors",
        PHASE_BORDER_COLORS[item.phase] ?? "border-l-zinc-300",
        item.completed
          ? "bg-emerald-50/40 dark:bg-emerald-950/10"
          : "hover:bg-muted/30",
      )}
    >
      <TableCell>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            {item.required && (
              <span
                title="Nutné"
                aria-label="Nutné"
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-100 text-[10px] font-bold leading-none text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
              >
                !
              </span>
            )}
            <button
              onClick={onEdit}
              className={cn(
                "text-left text-sm font-medium hover:underline",
                item.completed && "line-through decoration-emerald-500/50",
              )}
            >
              {item.subcategory || "(bez názvu)"}
            </button>
            {item.completed && (
              <Badge variant="outline" className="h-4 px-1 text-[9px] text-emerald-700">
                Hotovo
              </Badge>
            )}
          </div>
          {item._count && (item._count.payments > 0 || item._count.timeEntries > 0 || item._count.comments > 0) && (
            <div className="mt-0.5 flex flex-wrap gap-1">
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
              {item._count.comments > 0 && (
                <Badge variant="outline" className="h-4 px-1 text-[10px] text-sky-700">
                  <MessageSquare className="mr-0.5 h-2 w-2" />
                  {item._count.comments}
                </Badge>
              )}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        {item.element ? (
          <button
            onClick={onEdit}
            className="block w-full text-left hover:underline"
            title={item.element}
          >
            <span className="line-clamp-2 text-xs text-foreground/80">
              {item.element}
            </span>
          </button>
        ) : (
          <span className="text-[11px] text-muted-foreground/50">—</span>
        )}
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
      <TableCell className="text-right text-[11px]">
        {item.completed ? (
          saved !== null && saved > 0 ? (
            <span className="font-medium text-emerald-600" title="Ušetřeno od plánu">
              {formatCzk(saved)}
            </span>
          ) : overSaved > 0 ? (
            <span className="font-medium text-rose-600" title="Překročeno oproti plánu">
              −{formatCzk(overSaved)}
            </span>
          ) : (
            <span className="text-muted-foreground">0 Kč</span>
          )
        ) : (
          <span className="text-muted-foreground/40" title="Označte jako hotové pro výpočet">
            —
          </span>
        )}
      </TableCell>
      <TableCell className="text-right text-[11px] text-violet-600">
        {item.actualHours > 0 ? formatNumber(item.actualHours, " h") : "—"}
      </TableCell>
      <TableCell className="text-center">
        <Button
          type="button"
          size="sm"
          variant={item.completed ? "default" : "outline"}
          onClick={() => update("completed", !item.completed)}
          disabled={updateItem.isPending}
          aria-pressed={item.completed}
          className={cn(
            "h-7 gap-1.5 px-2.5 text-xs",
            item.completed
              ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white dark:border-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-800"
              : "text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40",
          )}
          title={item.completed ? "Označit jako nedokončené" : "Označit jako hotové"}
        >
          {item.completed ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <Circle className="h-3.5 w-3.5" />
          )}
          Hotovo
        </Button>
      </TableCell>
      <TableCell>
        <div className="flex items-center">
          <span className="flex flex-col">
            <button
              onClick={onMoveUp}
              disabled={!canMoveUp}
              className={cn(
                "flex h-3.5 w-3.5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-20",
              )}
              aria-label="Přesunout nahoru"
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              onClick={onMoveDown}
              disabled={!canMoveDown}
              className={cn(
                "flex h-3.5 w-3.5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-20",
              )}
              aria-label="Přesunout dolů"
            >
              <ArrowDown className="h-3 w-3" />
            </button>
          </span>
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
                onClick={() => update("completed", !item.completed)}
              >
                {item.completed ? "Označit jako nedokončené" : "Označit jako hotové"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await duplicateItem.mutateAsync(item.id);
                    toast.success("Položka duplikována");
                  } catch {
                    toast.error("Nepodařilo se duplikovat");
                  }
                }}
              >
                <Copy className="mr-2 h-3.5 w-3.5" /> Duplikovat
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Smazat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
        <>{formatNumber(value, suffix ?? "")}</>
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
