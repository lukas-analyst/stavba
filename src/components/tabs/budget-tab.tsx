"use client";

import { useState, useMemo, useRef, useEffect, useCallback, createContext, useContext } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
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
  X,
  GripVertical,
} from "lucide-react";
import {
  formatCzk,
  formatNumber,
  formatDate,
  PHASES,
  PHASE_COLORS,
  PHASE_BG_COLORS,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BudgetItemDialog } from "@/components/budget-item-dialog";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type Active,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// =====================================================================
// DnD layer for the Budget tab
// ---------------------------------------------------------------------
// Wraps the existing BudgetTab component with a DndContext that enables
// drag-and-drop reordering of:
//   1. Categories (outer SortableContext)
//   2. Budget items within a category (inner SortableContext per category)
//
// Drag handles (GripVertical icon) are shown on hover. Touch devices
// require a 200ms long-press to start dragging (so normal scrolling
// isn't interrupted). Keyboard navigation is supported via
// sortableKeyboardCoordinates.
//
// On drag end, the useReorder hook sends the new sort order to the API
// with optimistic updates — the UI updates instantly and rolls back
// on error.
// =====================================================================

// Types for DnD item identification
type DndItemType =
  | { kind: "category"; id: string; categoryName: string }
  | { kind: "item"; id: string; categoryName: string; label: string };

// Module-level handler registry — BudgetTab registers its onDragEnd handler
// here so DndBudgetTab (which wraps it in DndContext) can call it.
let dragEndHandler: ((event: DragEndEvent) => void) | null = null;

export function setDragEndHandler(fn: ((event: DragEndEvent) => void) | null) {
  dragEndHandler = fn;
}

// =====================================================================
// Wrapper: DndBudgetTab — wraps BudgetTab with DnD context
// =====================================================================
export function DndBudgetTab({ projectId }: { projectId: string }) {
  const [activeDrag, setActiveDrag] = useState<Active | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e) => setActiveDrag(e.active)}
      onDragEnd={(e) => {
        setActiveDrag(null);
        if (dragEndHandler) dragEndHandler(e);
      }}
      onDragCancel={() => setActiveDrag(null)}
    >
      <BudgetTab projectId={projectId} />
      <DragOverlay>
        {activeDrag ? (
          <DragPreviewItem activeDrag={activeDrag} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// =====================================================================
// DragOverlay preview — shown at the cursor position while dragging
// =====================================================================
function DragPreviewItem({ activeDrag }: { activeDrag: Active }) {
  const data = activeDrag.data.current as DndItemType | undefined;
  if (!data) return null;

  if (data.kind === "category") {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 shadow-lg">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-bold">{data.categoryName}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 shadow-lg">
      <GripVertical className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-medium">{data.label}</span>
    </div>
  );
}

// Context to pass drag listeners from SortableBudgetItemRows to BudgetRow
const RowDragContext = createContext<{
  listeners: ReturnType<typeof useSortable>["listeners"];
  isDragging: boolean;
  sortableRef: (el: HTMLElement | null) => void;
  sortableStyle: React.CSSProperties;
  sortableAttributes: Record<string, unknown>;
} | null>(null);

function useRowDragListeners() {
  return useContext(RowDragContext);
}

// =====================================================================
// The main BudgetTab component (renamed from original BudgetTab)
// =====================================================================

// Rolled-up totals for an item (own + children sums)
type RolledUp = {
  planCost: number;
  planDays: number;
  actualCost: number;
  actualHours: number;
};

function computeRolledUp(item: BudgetItem, children: BudgetItem[]): RolledUp {
  const own = {
    planCost: item.planCost || 0,
    planDays: item.planDays || 0,
    actualCost: item.actualCost || 0,
    actualHours: item.actualHours || 0,
  };
  const childSum = children.reduce(
    (acc, c) => {
      acc.planCost += c.planCost || 0;
      acc.planDays += c.planDays || 0;
      acc.actualCost += c.actualCost || 0;
      acc.actualHours += c.actualHours || 0;
      return acc;
    },
    { planCost: 0, planDays: 0, actualCost: 0, actualHours: 0 },
  );
  return {
    planCost: own.planCost + childSum.planCost,
    planDays: own.planDays + childSum.planDays,
    actualCost: own.actualCost + childSum.actualCost,
    actualHours: own.actualHours + childSum.actualHours,
  };
}

function computeSaved(item: BudgetItem, children: BudgetItem[]): number | null {
  if (!item.completed) return null;
  const rolled = computeRolledUp(item, children);
  return Math.max(0, rolled.planCost - rolled.actualCost);
}

const COMPLETION_OPTIONS = [
  { id: "all", label: "Vše" },
  { id: "todo", label: "Aktivní" },
  { id: "done", label: "Hotovo" },
  { id: "rejected", label: "Zavrženo" },
] as const;

type CompletionFilter = (typeof COMPLETION_OPTIONS)[number]["id"];

function BudgetTab({ projectId }: { projectId: string }) {
  const { data: items, isLoading } = useBudgetItems(projectId);
  const { data: projects } = useProjects();
  const project = projects?.find((p) => p.id === projectId);
  const reorder = useReorder(projectId);
  const exportCsv = useExportCsv(projectId);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [completionFilter, setCompletionFilter] =
    useState<CompletionFilter>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [addOpen, setAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);
  const [addTaskFor, setAddTaskFor] = useState<BudgetItem | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  const registerRow = useCallback((id: string, el: HTMLTableRowElement | null) => {
    const map = rowRefs.current;
    if (el) map.set(id, el);
    else map.delete(id);
  }, []);

  const scrolledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!highlightId) {
      scrolledRef.current = null;
      return;
    }
    const el = rowRefs.current.get(highlightId);
    if (el && scrolledRef.current !== highlightId) {
      scrolledRef.current = highlightId;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const t = setTimeout(() => {
      setHighlightId(null);
      scrolledRef.current = null;
    }, 2400);
    return () => clearTimeout(t);
  }, [highlightId, items]);

  useEffect(() => {
    if (!highlightId) return;
    const exists = items?.some((i) => i.id === highlightId);
    if (!exists) {
      const t = setTimeout(() => {
        setHighlightId((cur) => {
          if (!cur) return cur;
          if (items?.some((i) => i.id === cur)) return cur;
          return null;
        });
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [highlightId, items]);

  const toggleCat = (cat: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleItem = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const childrenMap = useMemo(() => {
    const map = new Map<string, BudgetItem[]>();
    for (const it of items ?? []) {
      if (it.parentId) {
        const arr = map.get(it.parentId) ?? [];
        arr.push(it);
        map.set(it.parentId, arr);
      }
    }
    return map;
  }, [items]);

  const itemMatches = useMemo(() => {
    return (i: BudgetItem): boolean => {
      if (phaseFilter !== "all" && i.phase !== phaseFilter) return false;
      if (completionFilter === "done" && !i.completed) return false;
      if (completionFilter === "todo" && (i.completed || i.rejected)) return false;
      if (completionFilter === "rejected" && !i.rejected) return false;
      if (debouncedSearch.trim()) {
        const q = debouncedSearch.toLowerCase();
        const text =
          `${i.category} ${i.subcategory ?? ""} ${i.note ?? ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    };
  }, [phaseFilter, completionFilter, debouncedSearch]);

  const filteredTopLevel = useMemo(() => {
    const matches = itemMatches;
    return (items ?? [])
      .filter((it) => it.parentId === null)
      .filter((top) => {
        if (matches(top)) return true;
        const children = childrenMap.get(top.id) ?? [];
        return children.some(matches);
      });
  }, [items, childrenMap, itemMatches]);

  const projectCategoryOrder = project?.categoryOrder;
  const savedCategoryOrder = useMemo(() => {
    if (!projectCategoryOrder) return [];
    try {
      const arr = JSON.parse(projectCategoryOrder);
      return Array.isArray(arr) ? (arr as string[]) : [];
    } catch {
      return [];
    }
  }, [projectCategoryOrder]);

  const grouped = useMemo(() => {
    const groups = new Map<string, BudgetItem[]>();
    for (const it of filteredTopLevel) {
      const arr = groups.get(it.category) ?? [];
      arr.push(it);
      groups.set(it.category, arr);
    }
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
  }, [filteredTopLevel, savedCategoryOrder]);

  const categoryTotals = useMemo(() => {
    const map = new Map<
      string,
      { plan: number; actual: number; count: number; saved: number }
    >();
    for (const it of items ?? []) {
      if (it.parentId) continue;
      const cur =
        map.get(it.category) ?? { plan: 0, actual: 0, count: 0, saved: 0 };
      const children = childrenMap.get(it.id) ?? [];
      const rolled = computeRolledUp(it, children);
      cur.plan += rolled.planCost;
      cur.actual += rolled.actualCost;
      cur.count += 1 + children.length;
      if (it.completed) {
        cur.saved += Math.max(0, rolled.planCost - rolled.actualCost);
      }
      map.set(it.category, cur);
    }
    return map;
  }, [items, childrenMap]);

  const grandPlan = (items ?? [])
    .filter((i) => !i.parentId)
    .reduce((s, i) => {
      const children = childrenMap.get(i.id) ?? [];
      return s + computeRolledUp(i, children).planCost;
    }, 0);
  const grandActual = (items ?? [])
    .filter((i) => !i.parentId)
    .reduce((s, i) => {
      const children = childrenMap.get(i.id) ?? [];
      return s + computeRolledUp(i, children).actualCost;
    }, 0);
  const grandSaved = (items ?? [])
    .filter((i) => !i.parentId && i.completed)
    .reduce((s, i) => {
      const children = childrenMap.get(i.id) ?? [];
      const rolled = computeRolledUp(i, children);
      return s + Math.max(0, rolled.planCost - rolled.actualCost);
    }, 0);

  const topLevelCount = (items ?? []).filter((i) => !i.parentId).length;
  const completedCount = (items ?? []).filter(
    (i) => !i.parentId && i.completed,
  ).length;

  // ===== DnD handlers =====

  // Handle item reorder within a category
  const handleItemReorder = (
    categoryName: string,
    oldIndex: number,
    newIndex: number,
  ) => {
    const catItems = grouped.find(([c]) => c === categoryName)?.[1] ?? [];
    if (oldIndex === newIndex || !catItems.length) return;
    const reordered = arrayMove(catItems, oldIndex, newIndex);
    const newSortOrders = reordered.map((it, idx) => ({
      id: it.id,
      sortOrder: idx,
    }));
    reorder.mutate({ items: newSortOrders });
  };

  // Handle category reorder
  const handleCategoryReorder = (oldIndex: number, newIndex: number) => {
    const allCats = grouped.map(([c]) => c);
    if (oldIndex === newIndex || !allCats.length) return;
    const reordered = arrayMove(allCats, oldIndex, newIndex);
    reorder.mutate({ categoryOrder: reordered });
  };

  // Legacy move handlers (for arrow buttons — kept as fallback)
  const moveItem = (catItems: BudgetItem[], currentIndex: number, direction: -1 | 1) => {
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= catItems.length) return;
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
    const allCats = Array.from(new Set([...savedCategoryOrder, ...currentCats]));
    const idx = allCats.indexOf(category);
    const target = idx + direction;
    if (target < 0 || target >= allCats.length) return;
    const reordered = [...allCats];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    reorder.mutate({ categoryOrder: reordered });
  };

  // Register DnD drag-end handler so DndBudgetTab wrapper can call it.
  // Uses the module-level `setDragEndHandler` to communicate between
  // the DndContext wrapper (DndBudgetTab) and the BudgetTab component.
  // This avoids prop drilling while keeping the DndContext at the top.
  useEffect(() => {
    const handler = (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      // Category drag: "cat:XXX" IDs
      if (activeId.startsWith("cat:") && overId.startsWith("cat:")) {
        const oldIndex = grouped.findIndex(([c]) => `cat:${c}` === activeId);
        const newIndex = grouped.findIndex(([c]) => `cat:${c}` === overId);
        if (oldIndex !== -1 && newIndex !== -1) {
          const allCats = grouped.map(([c]) => c);
          const reordered = arrayMove(allCats, oldIndex, newIndex);
          reorder.mutate({ categoryOrder: reordered });
        }
        return;
      }

      // Item drag: "item:XXX" IDs — must be within same category
      if (activeId.startsWith("item:") && overId.startsWith("item:")) {
        const activeItemId = activeId.slice(5);
        const overItemId = overId.slice(5);
        // Find which category the items belong to
        for (const [categoryName, catItems] of grouped) {
          const oldIndex = catItems.findIndex((it) => it.id === activeItemId);
          const newIndex = catItems.findIndex((it) => it.id === overItemId);
          if (oldIndex !== -1 && newIndex !== -1) {
            const reordered = arrayMove(catItems, oldIndex, newIndex);
            const newSortOrders = reordered.map((it, idx) => ({
              id: it.id,
              sortOrder: idx,
            }));
            reorder.mutate({ items: newSortOrders });
            return;
          }
        }
      }
    };

    setDragEndHandler(handler);
    return () => setDragEndHandler(null);
  }, [grouped, reorder]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-9 w-64" />
          <div className="ml-auto flex items-center gap-3">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border">
          <div className="border-b bg-muted/40 px-4 py-2.5">
            <Skeleton className="h-4 w-full" />
          </div>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="border-b px-4 py-3">
              <Skeleton className="h-5 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Category IDs for the outer SortableContext
  const categoryIds = grouped.map(([cat]) => `cat:${cat}`);

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
        <div className="flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
          {COMPLETION_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setCompletionFilter(opt.id)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                completionFilter === opt.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
                opt.id === "rejected" && completionFilter !== opt.id && "text-rose-500 hover:text-rose-600",
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
            <div
              className={cn(
                "font-bold",
                grandPlan - grandActual < 0 ? "text-rose-600" : "text-emerald-600",
              )}
            >
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
            <div className="font-bold">
              {completedCount}/{topLevelCount}
            </div>
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

      {/* Budget table grouped by category — wrapped in SortableContext for category DnD */}
      <SortableContext items={categoryIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {grouped.length === 0 && (
            <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              Žádné položky neodpovídají filtru.
            </div>
          )}
          {grouped.map(([category, catItems], groupIndex) => {
            const collapsed = collapsedCats.has(category);
            const totals = categoryTotals.get(category) ?? {
              plan: 0,
              actual: 0,
              count: 0,
              saved: 0,
            };
            const burn = totals.plan > 0 ? (totals.actual / totals.plan) * 100 : 0;
            const sortableId = `cat:${category}`;
            const itemIds = catItems.map((it) => `item:${it.id}`);

            return (
              <SortableCategoryCard
                key={category}
                id={sortableId}
                categoryName={category}
                collapsed={collapsed}
                onToggle={() => toggleCat(category)}
                totals={totals}
                burn={burn}
                groupIndex={groupIndex}
                totalGroups={grouped.length}
                onMoveCategoryUp={() => moveCategory(category, -1)}
                onMoveCategoryDown={() => moveCategory(category, 1)}
                onCategoryDragEnd={(oldIdx, newIdx) =>
                  handleCategoryReorder(oldIdx, newIdx)
                }
              >
                {/* Inner SortableContext for items within this category */}
                <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="w-8"></TableHead>
                        <TableHead className="w-12"></TableHead>
                        <TableHead className="min-w-[200px]">Položka</TableHead>
                        <TableHead className="w-28">Fáze</TableHead>
                        <TableHead className="w-28 text-right">Plán (Kč)</TableHead>
                        <TableHead className="w-20 text-right">Dny</TableHead>
                        <TableHead className="w-28">Datum od</TableHead>
                        <TableHead className="w-28">Datum do</TableHead>
                        <TableHead className="w-28 text-right">Skut. (Kč)</TableHead>
                        <TableHead className="w-20 text-right">Hod.</TableHead>
                        <TableHead className="w-36 text-center">Stav</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {catItems.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={12} className="py-8 text-center text-sm text-muted-foreground">
                            Žádné položky v této kategorii.
                          </TableCell>
                        </TableRow>
                      )}
                      {catItems.map((item, idx) => {
                        const children = childrenMap.get(item.id) ?? [];
                        const isExpanded = expandedItems.has(item.id);
                        return (
                          <SortableBudgetItemRows
                            key={item.id}
                            sortableId={`item:${item.id}`}
                            item={item}
                            childItems={children}
                            projectId={projectId}
                            isExpanded={isExpanded}
                            onToggleExpand={() => toggleItem(item.id)}
                            expandedItems={expandedItems}
                            onToggleChildExpand={toggleItem}
                            onEdit={setEditingItem}
                            canMoveUp={idx > 0}
                            canMoveDown={idx < catItems.length - 1}
                            onMoveUp={() => moveItem(catItems, idx, -1)}
                            onMoveDown={() => moveItem(catItems, idx, 1)}
                            onAddTask={() => setAddTaskFor(item)}
                            highlightId={highlightId}
                            registerRow={registerRow}
                            categoryName={category}
                            onItemDragEnd={(oldI, newI) =>
                              handleItemReorder(category, oldI, newI)
                            }
                          />
                        );
                      })}
                    </TableBody>
                  </Table>
                </SortableContext>
              </SortableCategoryCard>
            );
          })}
        </div>
      </SortableContext>

      <BudgetItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
        onSubmitted={(created) => {
          setCollapsedCats((prev) => {
            const next = new Set(prev);
            next.delete(created.category);
            return next;
          });
          setSearch("");
          setPhaseFilter("all");
          setCompletionFilter("all");
          setHighlightId(created.id);
        }}
      />
      <BudgetItemDialog
        open={!!editingItem}
        onOpenChange={(o) => !o && setEditingItem(null)}
        projectId={projectId}
        item={editingItem}
        onSubmitted={(updated) => {
          setCollapsedCats((prev) => {
            const next = new Set(prev);
            next.delete(updated.category);
            return next;
          });
          setHighlightId(updated.id);
        }}
      />
      {addTaskFor && (
        <BudgetItemDialog
          open={!!addTaskFor}
          onOpenChange={(o) => !o && setAddTaskFor(null)}
          projectId={projectId}
          parentId={addTaskFor.id}
          defaultCategory={addTaskFor.category}
          defaultPhase={addTaskFor.phase}
          parentItemName={addTaskFor.subcategory ?? addTaskFor.category}
          onSubmitted={(created) => {
            setExpandedItems((prev) => {
              const next = new Set(prev);
              next.add(addTaskFor.id);
              return next;
            });
            setCollapsedCats((prev) => {
              const next = new Set(prev);
              next.delete(created.category);
              return next;
            });
            setSearch("");
            setPhaseFilter("all");
            setCompletionFilter("all");
            setHighlightId(created.id);
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// SortableCategoryCard — wraps a Collapsible category with DnD
// =====================================================================
function SortableCategoryCard({
  id,
  categoryName,
  collapsed,
  onToggle,
  totals,
  burn,
  groupIndex,
  totalGroups,
  onMoveCategoryUp,
  onMoveCategoryDown,
  onCategoryDragEnd,
  children,
}: {
  id: string;
  categoryName: string;
  collapsed: boolean;
  onToggle: () => void;
  totals: { plan: number; actual: number; count: number; saved: number };
  burn: number;
  groupIndex: number;
  totalGroups: number;
  onMoveCategoryUp: () => void;
  onMoveCategoryDown: () => void;
  onCategoryDragEnd: (oldIndex: number, newIndex: number) => void;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data: { type: "category", categoryName } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border bg-card",
        isDragging && "shadow-xl ring-2 ring-primary/30",
      )}
    >
      <Collapsible
        open={!collapsed}
        onOpenChange={onToggle}
      >
        <CollapsibleTrigger asChild>
          <button
            className="group flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/50"
            {...attributes}
          >
            {/* Drag handle */}
            <span
              {...listeners}
              className="flex h-5 w-5 cursor-grab items-center justify-center rounded text-muted-foreground/40 hover:bg-muted hover:text-foreground active:cursor-grabbing"
              aria-label="Přetáhnout kategorii"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-4 w-4" />
            </span>
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            <span className="text-sm font-bold">{categoryName}</span>
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
                    burn > 100
                      ? "bg-rose-500"
                      : burn > 80
                        ? "bg-amber-500"
                        : "bg-emerald-500",
                  )}
                  style={{ width: `${Math.min(burn, 100)}%` }}
                />
              </div>
              <span
                className={cn(
                  "font-semibold",
                  burn > 100
                    ? "text-rose-600"
                    : burn > 80
                      ? "text-amber-600"
                      : "text-emerald-600",
                )}
              >
                {burn.toFixed(0)}%
              </span>
            </div>
            {/* Legacy arrow buttons (kept as fallback) */}
            <span className="ml-1 flex flex-col">
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveCategoryUp();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    onMoveCategoryUp();
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
                  onMoveCategoryDown();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    onMoveCategoryDown();
                  }
                }}
                className={cn(
                  "flex h-3.5 w-3.5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground",
                  groupIndex === totalGroups - 1 &&
                    "pointer-events-none opacity-30",
                )}
                aria-label="Přesunout kategorii dolů"
              >
                <ArrowDown className="h-3 w-3" />
              </span>
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>{children}</CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// =====================================================================
// SortableBudgetItemRows — wraps BudgetItemRows with DnD
// =====================================================================
function SortableBudgetItemRows({
  sortableId,
  item,
  childItems,
  projectId,
  isExpanded,
  onToggleExpand,
  expandedItems,
  onToggleChildExpand,
  onEdit,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onAddTask,
  highlightId,
  registerRow,
  categoryName,
  onItemDragEnd,
}: {
  sortableId: string;
  item: BudgetItem;
  childItems: BudgetItem[];
  projectId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  expandedItems: Set<string>;
  onToggleChildExpand: (id: string) => void;
  onEdit: (item: BudgetItem) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddTask?: () => void;
  highlightId?: string | null;
  registerRow?: (id: string, el: HTMLTableRowElement | null) => void;
  categoryName: string;
  onItemDragEnd: (oldIndex: number, newIndex: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId,
    data: {
      type: "item",
      categoryName,
      label: item.subcategory || item.category,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <RowDragContext.Provider value={{ listeners, isDragging, sortableRef: setNodeRef, sortableStyle: style, sortableAttributes: attributes }}>
      <BudgetItemRows
        item={item}
        childItems={childItems}
        projectId={projectId}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        expandedItems={expandedItems}
        onToggleChildExpand={onToggleChildExpand}
        onEdit={onEdit}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onAddTask={onAddTask}
        highlightId={highlightId}
        registerRow={registerRow}
      />
    </RowDragContext.Provider>
  );
}

// =====================================================================
// BudgetItemRows — renders one parent row + optional detail panel + child rows
// (Same as original, but now includes a drag handle)
// =====================================================================
function BudgetItemRows({
  item,
  childItems,
  projectId,
  isExpanded,
  onToggleExpand,
  expandedItems,
  onToggleChildExpand,
  onEdit,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onAddTask,
  onMoveChild,
  isChild = false,
  highlightId,
  registerRow,
}: {
  item: BudgetItem;
  childItems: BudgetItem[];
  projectId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  expandedItems: Set<string>;
  onToggleChildExpand: (id: string) => void;
  onEdit: (item: BudgetItem) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddTask?: () => void;
  onMoveChild?: (siblings: BudgetItem[], idx: number, dir: -1 | 1) => void;
  isChild?: boolean;
  highlightId?: string | null;
  registerRow?: (id: string, el: HTMLTableRowElement | null) => void;
}) {
  const reorder = useReorder(projectId);
  const handleMoveChild = (siblings: BudgetItem[], idx: number, dir: -1 | 1) => {
    if (onMoveChild) {
      onMoveChild(siblings, idx, dir);
      return;
    }
    const target = idx + dir;
    if (target < 0 || target >= siblings.length) return;
    const a = siblings[idx];
    const b = siblings[target];
    const newItems = siblings.map((it) => ({ id: it.id, sortOrder: it.sortOrder }));
    newItems[idx].sortOrder = b.sortOrder;
    newItems[target].sortOrder = a.sortOrder;
    reorder.mutate({ items: newItems });
  };

  const rolled = computeRolledUp(item, childItems);
  const hasChildren = childItems.length > 0;
  const saved = computeSaved(item, childItems);
  const overBudget = rolled.planCost > 0 && rolled.actualCost > rolled.planCost;

  return (
    <>
      <BudgetRow
        item={item}
        projectId={projectId}
        onEdit={onEdit}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        childCount={childItems.length}
        rolled={rolled}
        saved={saved}
        overBudget={overBudget}
        onAddTask={onAddTask}
        isChild={isChild}
        highlightId={highlightId}
        registerRow={registerRow}
      />
      {isExpanded && !isChild && (
        <DetailPanelRow
          item={item}
          saved={saved}
          projectId={projectId}
        />
      )}
      {isExpanded &&
        hasChildren &&
        !isChild &&
        childItems.map((child, ci) => {
          const childExpanded = expandedItems.has(child.id);
          const childChildren: BudgetItem[] = [];
          return (
            <BudgetItemRows
              key={child.id}
              item={child}
              childItems={childChildren}
              projectId={projectId}
              isExpanded={childExpanded}
              onToggleExpand={() => onToggleChildExpand(child.id)}
              expandedItems={expandedItems}
              onToggleChildExpand={onToggleChildExpand}
              onEdit={onEdit}
              canMoveUp={ci > 0}
              canMoveDown={ci < childItems.length - 1}
              onMoveUp={() => handleMoveChild(childItems, ci, -1)}
              onMoveDown={() => handleMoveChild(childItems, ci, 1)}
              isChild
              highlightId={highlightId}
              registerRow={registerRow}
            />
          );
        })}
    </>
  );
}

// =====================================================================
// BudgetRow — one row in the budget table
// (Same as original, but now includes a drag handle cell)
// =====================================================================
function BudgetRow({
  item,
  projectId,
  onEdit,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  isExpanded,
  onToggleExpand,
  childCount,
  rolled,
  saved,
  overBudget,
  onAddTask,
  isChild,
  highlightId,
  registerRow,
}: {
  item: BudgetItem;
  projectId: string;
  onEdit: (item: BudgetItem) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  childCount: number;
  rolled: RolledUp;
  saved: number | null;
  overBudget: boolean;
  onAddTask?: () => void;
  isChild: boolean;
  highlightId?: string | null;
  registerRow?: (id: string, el: HTMLTableRowElement | null) => void;
}) {
  const updateItem = useUpdateBudgetItem(projectId);
  const deleteItem = useDeleteBudgetItem(projectId);
  const duplicateItem = useDuplicateBudgetItem(projectId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dragCtx = useRowDragListeners();

  const update = (field: keyof BudgetItem, value: unknown) => {
    updateItem.mutate({ id: item.id, data: { [field]: value } });
  };

  const displayPlanCost = childCount > 0 ? rolled.planCost : item.planCost;
  const displayPlanDays = childCount > 0 ? rolled.planDays : item.planDays;
  const displayActualCost = childCount > 0 ? rolled.actualCost : item.actualCost;
  const displayActualHours = childCount > 0 ? rolled.actualHours : item.actualHours;

  const overSaved =
    item.completed && rolled.planCost > 0
      ? rolled.actualCost - rolled.planCost
      : 0;

  const isHighlighted = !!highlightId && highlightId === item.id;

  return (
    <TableRow
      ref={(el) => {
        registerRow?.(item.id, el);
        if (dragCtx) dragCtx.sortableRef(el);
      }}
      style={dragCtx?.sortableStyle}
      {...(dragCtx?.sortableAttributes ?? {})}
      onDoubleClick={() => onEdit(item)}
      className={cn(
        "group transition-colors",
        isChild
          ? cn(
              "bg-muted/30 hover:bg-muted/40",
              item.rejected && "opacity-70",
            )
          : cn(
              item.rejected
                ? "opacity-60 bg-rose-50/40 dark:bg-rose-950/10"
                : item.completed
                  ? "bg-emerald-50/40 dark:bg-emerald-950/10"
                  : "hover:bg-muted/30",
            ),
        isHighlighted && "stavba-highlight-row",
        dragCtx?.isDragging && "opacity-40",
      )}
    >
      {/* Drag handle cell (only for top-level items, not children) */}
      {!isChild && dragCtx?.listeners ? (
        <TableCell className="w-8 align-middle">
          <span
            {...dragCtx.listeners}
            className="flex h-5 w-5 cursor-grab items-center justify-center rounded text-muted-foreground/30 hover:bg-muted hover:text-foreground active:cursor-grabbing"
            aria-label="Přetáhnout položku"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </span>
        </TableCell>
      ) : (
        <TableCell className="w-8" />
      )}

      {/* Expand/collapse toggle (parents) OR indented └ marker (children) */}
      {isChild ? (
        <TableCell className="align-middle pl-8">
          <span aria-hidden className="select-none text-muted-foreground/60">
            └
          </span>
        </TableCell>
      ) : (
        <TableCell
          className="relative align-middle cursor-pointer"
          onClick={onToggleExpand}
        >
          <div
            aria-hidden
            className={cn(
              "absolute inset-y-0 left-0 w-1",
              item.rejected
                ? "bg-rose-500"
                : PHASE_BG_COLORS[item.phase] ?? "bg-zinc-300",
            )}
          />
          <div className="relative flex items-center gap-1">
            <span className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </span>
            <span className="text-[10px] text-muted-foreground/60">
              {childCount > 0 ? `${childCount} ${childCount === 1 ? "úkol" : childCount < 5 ? "úkoly" : "úkolů"}` : ""}
            </span>
          </div>
        </TableCell>
      )}

      {/* Položka / Úkol */}
      <TableCell
        className={isChild ? "cursor-pointer" : ""}
        onClick={isChild ? () => onEdit(item) : undefined}
      >
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
            <span
              className={cn(
                "text-left font-medium",
                isChild ? "cursor-pointer hover:underline" : "",
                isChild ? "text-xs" : "text-sm",
                item.rejected
                  ? "line-through decoration-rose-500/70"
                  : item.completed && "line-through decoration-emerald-500/50",
                childCount > 0 && "font-semibold",
              )}
            >
              {item.subcategory || "(bez názvu)"}
            </span>
            {item.rejected && (
              <Badge variant="outline" className="h-4 px-1 text-[9px] text-rose-700">
                Zavrženo
              </Badge>
            )}
            {item.completed && !item.rejected && (
              <Badge variant="outline" className="h-4 px-1 text-[9px] text-emerald-700">
                Hotovo
              </Badge>
            )}
            {!isChild && onAddTask && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddTask();
                }}
                title="Přidat úkol pod tuto položku"
                aria-label="Přidat úkol"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-emerald-700 transition-colors hover:bg-emerald-100 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
          {item._count &&
            (item._count.payments > 0 || item._count.timeEntries > 0) && (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {item._count.payments > 0 && (
                  <Badge variant="outline" className="h-4 px-1 text-[10px] text-emerald-700">
                    {item._count.payments === 1
                      ? "1 platba"
                      : item._count.payments < 5
                        ? `${item._count.payments} platby`
                        : `${item._count.payments} plateb`}
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

      {/* Fáze */}
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

      {/* Plán (Kč) */}
      <TableCell className="text-right">
        {childCount > 0 ? (
          <span className="block w-full rounded px-1 py-0.5 text-right text-xs font-semibold">
            {formatNumber(displayPlanCost, " Kč")}
          </span>
        ) : (
          <InlineNumber
            value={item.planCost}
            onCommit={(v) => update("planCost", v)}
            className="text-right"
          />
        )}
      </TableCell>

      {/* Dny */}
      <TableCell className="text-right">
        {childCount > 0 ? (
          <span className="block w-full rounded px-1 py-0.5 text-right text-xs font-semibold">
            {(displayPlanDays ?? 0) > 0 ? formatNumber(displayPlanDays) : "—"}
          </span>
        ) : (
          <InlineNumber
            value={item.planDays}
            onCommit={(v) => update("planDays", v)}
            className="text-right text-[11px]"
          />
        )}
      </TableCell>

      {/* Datum od */}
      <TableCell>
        <InlineDate
          value={item.dateFrom}
          onCommit={(v) => update("dateFrom", v)}
        />
      </TableCell>

      {/* Datum do */}
      <TableCell>
        <InlineDate
          value={item.dateTo}
          onCommit={(v) => update("dateTo", v)}
        />
      </TableCell>

      {/* Skut. (Kč) */}
      <TableCell
        className={cn(
          "text-right",
          overBudget && "font-semibold text-rose-600",
        )}
      >
        {childCount > 0 ? (
          <span className="block w-full rounded px-1 py-0.5 text-right text-xs font-semibold">
            {formatNumber(displayActualCost, " Kč")}
          </span>
        ) : (
          <InlineNumber
            value={item.actualCost}
            onCommit={(v) => update("actualCost", v)}
            className="text-right"
          />
        )}
        {overBudget && (
          <span className="ml-1 inline-flex items-center text-[10px] text-rose-500">
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
      </TableCell>

      {/* Hodiny */}
      <TableCell className="text-right text-[11px] text-violet-600">
        {displayActualHours > 0 ? formatNumber(displayActualHours, " h") : "—"}
      </TableCell>

      {/* Stav: Hotovo + Rejected (X) */}
      <TableCell className="text-center">
        <div className="flex items-center justify-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={item.completed ? "default" : "outline"}
            onClick={() => update("completed", !item.completed)}
            disabled={updateItem.isPending || item.rejected}
            aria-pressed={item.completed}
            className={cn(
              "h-7 gap-1 px-2 text-xs",
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
          <Button
            type="button"
            size="sm"
            variant={item.rejected ? "default" : "outline"}
            onClick={() => update("rejected", !item.rejected)}
            disabled={updateItem.isPending}
            aria-pressed={item.rejected}
            className={cn(
              "h-7 w-7 p-0",
              item.rejected
                ? "border-rose-600 bg-rose-600 text-white hover:bg-rose-700 hover:text-white dark:border-rose-700 dark:bg-rose-700 dark:hover:bg-rose-800"
                : "text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40",
            )}
            title={item.rejected ? "Zrušit zavržení" : "Zavrhnout položku"}
            aria-label={item.rejected ? "Zrušit zavržení" : "Zavrhnout"}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>

      {/* Akce */}
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
              <DropdownMenuItem onClick={() => onEdit(item)}>Upravit detail</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => update("completed", !item.completed)}
              >
                {item.completed ? "Označit jako nedokončené" : "Označit jako hotové"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => update("rejected", !item.rejected)}
              >
                {item.rejected ? "Zrušit zavržení" : "Zavrhnout"}
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
                {deleteItem.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Smazat
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}

// ===== DetailPanelRow — expandable panel below an item row with hidden fields =====
function DetailPanelRow({
  item,
  saved,
  projectId,
}: {
  item: BudgetItem;
  saved: number | null;
  projectId: string;
}) {
  const updateItem = useUpdateBudgetItem(projectId);

  const update = (field: keyof BudgetItem, value: unknown) => {
    updateItem.mutate({ id: item.id, data: { [field]: value } });
  };

  const overSaved =
    item.completed && item.planCost
      ? (item.actualCost || 0) - (item.planCost || 0)
      : 0;

  return (
    <TableRow className="bg-muted/20 hover:bg-muted/20">
      <TableCell colSpan={12} className="relative py-3">
        <div
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 w-1",
            item.rejected
              ? "bg-rose-500"
              : PHASE_BG_COLORS[item.phase] ?? "bg-zinc-300",
          )}
        />
        <div className="grid grid-cols-1 gap-4 pl-10 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Poznámka
            </div>
            <InlineTextarea
              value={item.note}
              onCommit={(v) => update("note", v)}
              placeholder="Doplňující informace, jednotkové ceny, postup…"
            />
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Vůle (%)
            </div>
            <InlineNumber
              value={item.flexibilityPercent}
              onCommit={(v) => update("flexibilityPercent", v)}
              suffix="%"
              className="text-left text-xs"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Míra flexibility odhadu.
            </p>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Ušetřeno
            </div>
            <div className="rounded border bg-background px-2 py-1.5 text-xs">
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
                <span
                  className="text-muted-foreground/40"
                  title="Označte jako hotové pro výpočet"
                >
                  —
                </span>
              )}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Počítáno po dokončení položky.
            </p>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ===== Inline editors =====
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

function InlineTextarea({
  value,
  onCommit,
  placeholder,
}: {
  value: string | null;
  onCommit: (v: string | null) => void;
  placeholder?: string;
}) {
  return (
    <Textarea
      key={value ?? "__empty__"}
      defaultValue={value ?? ""}
      onBlur={(e) => {
        const trimmed = e.target.value.trim() === "" ? null : e.target.value.trim();
        if (trimmed !== (value ?? null)) {
          onCommit(trimmed);
        }
      }}
      onKeyDown={(e) => {
        const target = e.target as HTMLTextAreaElement;
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          target.blur();
        }
        if (e.key === "Escape") {
          target.value = value ?? "";
          target.blur();
        }
      }}
      placeholder={placeholder}
      rows={3}
      className="text-xs"
    />
  );
}
