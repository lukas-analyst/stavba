"use client";

import { useState, useMemo, useRef, useEffect, useCallback, createContext, useContext, memo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAnalytics } from "@/hooks/use-analytics";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TabSkeleton } from "@/components/ui/tab-skeleton";
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
  CheckCircle2,
  PiggyBank,
  Download,
  Copy,
  X,
  GripVertical,
  HandCoins,
  Link as LinkIcon,
  ExternalLink,
  User,
  ArrowRightLeft,
  CornerUpRight,
  ListChecks,
  CircleSlash,
  Ban,
} from "lucide-react";
import {
  formatCurrency,
  formatNumber,
  formatDate,
  PHASES,
  PHASE_COLORS,
  PHASE_BG_COLORS,
} from "@/lib/format";
import { CURRENCY_MAP } from "@/lib/currency-config";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { BudgetItemDialog } from "@/components/budget-item-dialog";
import { EmptyStateBox } from "@/components/empty-state-box";
import { InlineNumber, InlineDate } from "@/components/ui/inline-editors";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import { SegmentedButton } from "@/components/ui/segmented-button";
import { useAppStore } from "@/lib/store";
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

// =====================================================================
// Wrapper: DndBudgetTab — wraps BudgetTab with DnD context
// =====================================================================
export function DndBudgetTab({ projectId }: { projectId: string }) {
  const [activeDrag, setActiveDrag] = useState<Active | null>(null);
  // Handler is set by BudgetTab via this ref
  const dragEndHandlerRef = useRef<((event: DragEndEvent) => void) | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
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
        if (dragEndHandlerRef.current) dragEndHandlerRef.current(e);
      }}
      onDragCancel={() => setActiveDrag(null)}
    >
      <BudgetTab projectId={projectId} dragEndHandlerRef={dragEndHandlerRef} />
      <DragOverlay dropAnimation={null}>
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
  { id: "all", label: "all" },
  { id: "todo", label: "active" },
  { id: "done", label: "done" },
  { id: "rejected", label: "rejected" },
] as const;

type CompletionFilter = (typeof COMPLETION_OPTIONS)[number]["id"];

function BudgetTab({ projectId, dragEndHandlerRef }: { projectId: string; dragEndHandlerRef: React.MutableRefObject<((event: DragEndEvent) => void) | null> }) {
  const t = useTranslations("tabs.budget");
  const tPhases = useTranslations("phases");
  const tCommon = useTranslations("common");
  const qc = useQueryClient();
  const { data: items, isLoading } = useBudgetItems(projectId);
  const { data: projects } = useProjects();
  const project = projects?.find((p) => p.id === projectId);
  const reorder = useReorder(projectId);
  const exportCsv = useExportCsv(projectId);
  const { trackEvent } = useAnalytics(projectId);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [phaseFilter, setPhaseFilter] = useState<Set<string>>(new Set()); // multi-select (empty = all)
  const [completionFilter, setCompletionFilter] =
    useState<CompletionFilter>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const budgetFilter = useAppStore((s) => s.budgetFilter);

  // ===== Bulk-edit (multi-select) state =====
  // `selectionMode` toggles whether each row shows a Checkbox cell at the
  // start of the row (before the drag handle). When active, the row's
  // onClick (which opens the edit dialog) is disabled — clicking the row
  // body does nothing; the user must use the explicit checkbox.
  // `selectedIds` holds the IDs of currently selected items (across all
  // categories and pages of the table).
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((prev) => {
      const next = !prev;
      if (!next) setSelectedIds(new Set());
      return next;
    });
  }, []);

  // Bulk PATCH — fires N parallel PATCHes (one per selected ID) and then
  // invalidates the budget + dashboard queries. Per spec, we use raw
  // fetch() here (not the useUpdateBudgetItem mutation) so all the
  // parallel requests share a single pending state + toast.
  const bulkUpdate = useCallback(
    async (field: "completed" | "rejected", value: boolean) => {
      if (selectedIds.size === 0) return;
      setBulkPending(true);
      try {
        const promises = Array.from(selectedIds).map((id) =>
          fetch(`/api/budget-items/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ [field]: value }),
          }),
        );
        const results = await Promise.allSettled(promises);
        const failed = results.filter((r) => r.status === "rejected").length;
        await qc.invalidateQueries({ queryKey: ["budget", projectId] });
        await qc.invalidateQueries({ queryKey: ["dashboard", projectId] });
        if (failed === 0) {
          toast.success(
            t("toolbar.bulkSuccess", { count: selectedIds.size }),
          );
        } else {
          toast.error(
            t("toolbar.bulkPartialError", {
              count: failed,
              total: selectedIds.size,
            }),
          );
        }
        trackEvent("bulk_update_budget_items", { field, value, count: selectedIds.size });
        setSelectedIds(new Set());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("toolbar.bulkError"));
      } finally {
        setBulkPending(false);
      }
    },
    [selectedIds, qc, projectId, t, trackEvent],
  );

  // Bulk DELETE — same pattern as bulkUpdate but DELETE method. Requires
  // confirmation (setConfirmBulkDelete) before firing.
  const bulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkPending(true);
    try {
      const promises = Array.from(selectedIds).map((id) =>
        fetch(`/api/budget-items/${id}`, { method: "DELETE" }),
      );
      const results = await Promise.allSettled(promises);
      const failed = results.filter((r) => r.status === "rejected").length;
      await qc.invalidateQueries({ queryKey: ["budget", projectId] });
      await qc.invalidateQueries({ queryKey: ["dashboard", projectId] });
      if (failed === 0) {
        toast.success(
          t("toolbar.bulkDeleteSuccess", { count: selectedIds.size }),
        );
      } else {
        toast.error(
          t("toolbar.bulkPartialError", {
            count: failed,
            total: selectedIds.size,
          }),
        );
      }
      trackEvent("bulk_delete_budget_items", { count: selectedIds.size });
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toolbar.bulkError"));
    } finally {
      setBulkPending(false);
    }
  }, [selectedIds, qc, projectId, t, trackEvent]);

  // Apply budget filter from store (set from Dashboard KPI cards)
  useEffect(() => {
    if (!budgetFilter) return;
    queueMicrotask(() => {
      if (budgetFilter.type === "completion") {
        setCompletionFilter(budgetFilter.value);
        setPhaseFilter(new Set());
        setCategoryFilter("all");
        setSearch("");
      } else if (budgetFilter.type === "category") {
        setCategoryFilter(budgetFilter.value);
        setCompletionFilter("all");
        setPhaseFilter(new Set());
        setSearch("");
      } else if (budgetFilter.type === "saved") {
        setCompletionFilter("done");
        setPhaseFilter(new Set());
        setCategoryFilter("all");
      } else if (budgetFilter.type === "active") {
        setCompletionFilter("todo");
        setPhaseFilter(new Set());
        setCategoryFilter("all");
        setSearch("");
      }
      useAppStore.getState().setBudgetFilter(null);
    });
  }, [budgetFilter]);
  const [addOpen, setAddOpen] = useState(false);
  const [addOpenForCategory, setAddOpenForCategory] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);
  const [addTaskFor, setAddTaskFor] = useState<BudgetItem | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  // Accessibility (A4): visually-hidden live region announced to
  // screen-reader users after a successful drag-and-drop reorder.
  // dnd-kit handles its own internal announcements during the drag,
  // but doesn't fire a final "moved" message on drop — this fills
  // that gap so non-sighted users know the reorder landed.
  const dndAnnouncerRef = useRef<HTMLDivElement>(null);

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

  // Listen for FAB "add item" trigger (mobile contextual FAB)
  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent<string>).detail;
      if (action === "add-item") {
        setAddOpen(true);
      }
    };
    window.addEventListener("stavba:fab-add", handler);
    return () => window.removeEventListener("stavba:fab-add", handler);
  }, []);

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
      if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
      // Multi-select phase filter: if set is non-empty, item's phase must be in it
      if (phaseFilter.size > 0 && !phaseFilter.has(i.phase)) return false;
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
  }, [phaseFilter, completionFilter, debouncedSearch, categoryFilter]);

  const filteredTopLevel = useMemo(() => {
    const matches = itemMatches;
    return (items ?? [])
      .filter((it) => it.parentId === null)
      .filter((top) => {
        // Parent passes if it matches itself OR any child matches
        if (matches(top)) return true;
        const children = childrenMap.get(top.id) ?? [];
        return children.some(matches);
      });
  }, [items, childrenMap, itemMatches]);

  // Filtered children map — only contains children that pass the filter
  const filteredChildrenMap = useMemo(() => {
    const map = new Map<string, BudgetItem[]>();
    const matches = itemMatches;
    for (const [parentId, children] of childrenMap) {
      const filtered = children.filter(matches);
      if (filtered.length > 0) {
        map.set(parentId, filtered);
      }
    }
    return map;
  }, [childrenMap, itemMatches]);

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

  // Note: Category & item ordering is performed exclusively via drag-and-drop
  // (dnd-kit). Legacy arrow-button reorder handlers were removed in favour of
  // the DnD-first UX.

  // Register DnD drag-end handler via ref so DndBudgetTab can call it.
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
          // A4: announce the completed reorder to screen-reader users.
          if (dndAnnouncerRef.current) {
            dndAnnouncerRef.current.textContent = "Položka přesunuta";
          }
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
            // A4: announce the completed reorder to screen-reader users.
            if (dndAnnouncerRef.current) {
              dndAnnouncerRef.current.textContent = "Položka přesunuta";
            }
            return;
          }
        }
      }

      // Task drag: "task:XXX" IDs — reorder children within the SAME parent.
      // We find the parent that owns both the active and over task, then
      // swap their sortOrder values and persist the full new ordering.
      if (activeId.startsWith("task:") && overId.startsWith("task:")) {
        const activeTaskId = activeId.slice(5);
        const overTaskId = overId.slice(5);
        if (activeTaskId === overTaskId) return;
        // Build a parent → children map from the unfiltered items list
        // (filters would give a partial view and break reordering).
        const childrenOf = new Map<string, BudgetItem[]>();
        for (const it of items ?? []) {
          if (it.parentId) {
            const arr = childrenOf.get(it.parentId) ?? [];
            arr.push(it);
            childrenOf.set(it.parentId, arr);
          }
        }
        for (const [, siblings] of childrenOf) {
          const oldIndex = siblings.findIndex((c) => c.id === activeTaskId);
          const newIndex = siblings.findIndex((c) => c.id === overTaskId);
          if (oldIndex !== -1 && newIndex !== -1) {
            const reordered = arrayMove(siblings, oldIndex, newIndex);
            const newSortOrders = reordered.map((it, idx) => ({
              id: it.id,
              sortOrder: idx,
            }));
            reorder.mutate({ items: newSortOrders });
            // A4: announce the completed reorder to screen-reader users.
            if (dndAnnouncerRef.current) {
              dndAnnouncerRef.current.textContent = "Položka přesunuta";
            }
            return;
          }
        }
      }
    };

    dragEndHandlerRef.current = handler;
    return () => { dragEndHandlerRef.current = null; };
  }, [grouped, reorder]);

  if (isLoading) {
    return <TabSkeleton />;
  }

  // Category IDs for the outer SortableContext
  const categoryIds = grouped.map(([cat]) => `cat:${cat}`);

  return (
    <div id="budget-root" className="space-y-4">
      {/* A4: visually-hidden live region. dnd-kit announces drag-start /
          drag-over messages itself, but doesn't fire a final "moved"
          message on drop. We set this element's textContent after each
          successful reorder (see dragEndHandlerRef effect above) so
          non-sighted users get confirmation that the reorder landed. */}
      <div aria-live="polite" className="sr-only" ref={dndAnnouncerRef} />
      {/* Toolbar — MD3 horizontal filter pattern (matches Payments / Time tabs).
          All controls live in a single flex-wrap row that wraps naturally on
          narrow viewports. The "Přidat položku" button is HIDDEN on mobile
          (`hidden sm:flex`) because the ContextualFab (bottom-right FAB) already
          triggers the same "add-item" action via the `stavba:fab-add` custom
          event — having both on the narrow mobile viewport would be redundant.
          On desktop the FAB is hidden, so the toolbar Add button takes over. */}
      <div id="budget-toolbar" className="flex flex-wrap items-center gap-2">
        {/* Selection-mode toggle — switches the table into multi-select
            mode where each row shows a Checkbox cell at the start.
            When active, the button is rendered with the "default" variant
            (filled) to indicate the active state; otherwise it's a soft
            outline button. The active state also disables the row
            onClick (edit dialog) and reveals a sticky bulk-action bar
            at the bottom of the budget root container. */}
        <Button
          onClick={toggleSelectionMode}
          variant={selectionMode ? "default" : "outline"}
          size="icon"
          aria-pressed={selectionMode}
          aria-label={t("toolbar.selectionMode")}
          title={t("toolbar.selectionMode")}
          className="h-9 w-9 shrink-0 rounded-full"
        >
          <ListChecks className="h-4 w-4" />
        </Button>

        {/* MD3 Segmented Button — completion status
            Hidden on mobile (< sm) and replaced by the compact
            <Select> dropdown below (mobile-only) to save horizontal
            space. */}
        <div className="hidden sm:block">
          <SegmentedButton
            value={completionFilter}
            onChange={(v) => setCompletionFilter(v as CompletionFilter)}
            options={COMPLETION_OPTIONS.map((opt) => ({
              value: opt.id,
              label: t(`completion.${opt.label}`),
            }))}
            size="md"
          />
        </div>

        {/* Compact Select dropdown — mobile only (< sm)
            Replaces the SegmentedButton to save space. Same options,
            same state, just a smaller footprint. Full-width on mobile
            so it gets its own row in the wrapping flex toolbar. */}
        <div className="sm:hidden w-full">
          <Select
            value={completionFilter}
            onValueChange={(v) => setCompletionFilter(v as CompletionFilter)}
          >
            <SelectTrigger className="h-9 w-full rounded-full border-outline-variant bg-surface-container-low">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPLETION_OPTIONS.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {t(`completion.${opt.label}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Search input — filters by item name (debounced 250ms).
            Full-width on mobile (gets its own row), fixed w-64 on desktop. */}
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("toolbar.search")}
            aria-label={t("toolbar.search")}
            className="h-9 rounded-full pl-8"
          />
        </div>

        {/* Phase filter chips (multi-select) — wraps naturally inside its
            FilterChipGroup container; the group itself acts as a single
            flex item in the wrapping toolbar. */}
        <FilterChipGroup
          hasActiveFilters={phaseFilter.size > 0}
          onClear={() => setPhaseFilter(new Set())}
        >
          <span className="mr-1 text-xs font-medium text-on-surface-variant">{t("filter.phase")}</span>
          {PHASES.map((phase) => (
            <FilterChip
              key={phase}
              label={tPhases(phase)}
              selected={phaseFilter.has(phase)}
              onClick={() => {
                const next = new Set(phaseFilter);
                if (next.has(phase)) {
                  next.delete(phase);
                } else {
                  next.add(phase);
                }
                setPhaseFilter(next);
              }}
            />
          ))}
        </FilterChipGroup>

        {/* Desktop "Add item" button — hidden on mobile (mobile uses the FAB).
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

      {/* Budget table grouped by category — wrapped in SortableContext for category DnD */}
      <SortableContext items={categoryIds} strategy={verticalListSortingStrategy}>
        <div id="budget-categories" className="space-y-3">
          {grouped.length === 0 && (
            <EmptyStateBox
              icon={Filter}
              title={t("empty.title")}
              description={t("empty.description")}
            />
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
                projectCurrency={project?.currency ?? "CZK"}
                onCategoryDragEnd={(oldIdx, newIdx) =>
                  handleCategoryReorder(oldIdx, newIdx)
                }
                onAddItem={() => {
                  setAddOpenForCategory(category);
                }}
              >
                {/* Inner SortableContext for items within this category */}
                <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                  <div className="overflow-x-auto scrollbar-thin">
                  <Table className={selectionMode ? "min-w-[1240px]" : "min-w-[1200px]"}>
                    <TableHeader>
                      <TableRow className="sticky top-0 z-30 bg-surface-container-high">
                        {selectionMode && (
                          <TableHead className="w-10 text-center">
                            <CategorySelectAllCheckbox
                              catItems={catItems}
                              selectedIds={selectedIds}
                              onToggleAll={(ids) => {
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  const allSelected = ids.every((id) => next.has(id));
                                  if (allSelected) {
                                    ids.forEach((id) => next.delete(id));
                                  } else {
                                    ids.forEach((id) => next.add(id));
                                  }
                                  return next;
                                });
                              }}
                            />
                          </TableHead>
                        )}
                        <TableHead className="w-8"></TableHead>
                        <TableHead className="w-12"></TableHead>
                        <TableHead className="min-w-[200px]">{t("column.item")}</TableHead>
                        <TableHead className="w-28">{t("column.phase")}</TableHead>
                        <TableHead className="w-28 text-right">{t("column.plan")}</TableHead>
                        <TableHead className="w-20 text-right">{t("column.days")}</TableHead>
                        <TableHead className="w-28">{t("column.dateFrom")}</TableHead>
                        <TableHead className="w-28">{t("column.dateTo")}</TableHead>
                        <TableHead className="w-28 text-right">{t("column.actual")}</TableHead>
                        <TableHead className="w-20 text-right">{t("column.hours")}</TableHead>
                        <TableHead className="w-44 text-center">{t("column.status")}</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {catItems.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={selectionMode ? 13 : 12} className="py-8 text-center text-sm text-muted-foreground">
                            {t("empty.categoryRow")}
                          </TableCell>
                        </TableRow>
                      )}
                      {catItems.map((item) => {
                        const children = filteredChildrenMap.get(item.id) ?? [];
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
                            onAddTask={() => setAddTaskFor(item)}
                            highlightId={highlightId}
                            registerRow={registerRow}
                            categoryName={category}
                            onItemDragEnd={(oldI, newI) =>
                              handleItemReorder(category, oldI, newI)
                            }
                            selectionMode={selectionMode}
                            selectedIds={selectedIds}
                            onToggleSelection={toggleSelection}
                          />
                        );
                      })}
                    </TableBody>
                  </Table>
                  </div>
                </SortableContext>
              </SortableCategoryCard>
            );
          })}
        </div>
      </SortableContext>

      {/* Bulk-action bar — sticky at the bottom of the budget root container.
          Only rendered when at least one item is selected. Shows the count
          of selected items + action buttons: mark complete/incomplete,
          reject/unreject, delete selected, cancel selection. */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="sticky bottom-4 z-40 rounded-lg border border-outline-variant bg-surface-container-high p-3 shadow-lg">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {t("toolbar.selected", { count: selectedIds.size })}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulkUpdate("completed", true)}
                disabled={bulkPending}
                className="rounded-full"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span className="hidden sm:inline">{t("toolbar.bulkComplete")}</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulkUpdate("completed", false)}
                disabled={bulkPending}
                className="rounded-full"
              >
                <CircleSlash className="h-4 w-4" />
                <span className="hidden sm:inline">{t("toolbar.bulkIncomplete")}</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulkUpdate("rejected", true)}
                disabled={bulkPending}
                className="rounded-full text-danger hover:bg-danger-soft hover:text-danger-strong"
              >
                <Ban className="h-4 w-4" />
                <span className="hidden sm:inline">{t("toolbar.bulkReject")}</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulkUpdate("rejected", false)}
                disabled={bulkPending}
                className="rounded-full"
              >
                <span className="hidden sm:inline">{t("toolbar.bulkUnreject")}</span>
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmBulkDelete(true)}
                disabled={bulkPending}
                className="rounded-full"
              >
                {bulkPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                <span className="hidden sm:inline">{t("toolbar.bulkDelete")}</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
                disabled={bulkPending}
                className="rounded-full"
              >
                {t("toolbar.cancelSelection")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk-delete confirmation dialog — fires bulkDelete on confirm. */}
      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("toolbar.bulkDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("toolbar.bulkDeleteDescription", { count: selectedIds.size })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkPending}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={bulkDelete}
              disabled={bulkPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {bulkPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BudgetItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
        projectCurrency={project?.currency ?? "CZK"}
        onSubmitted={(created, isNew) => {
          setCollapsedCats((prev) => {
            const next = new Set(prev);
            next.delete(created.category);
            return next;
          });
          setSearch("");
          setPhaseFilter(new Set());
          setCompletionFilter("all");
          setHighlightId(created.id);
          if (isNew) {
            trackEvent("add_budget_item", {
              category: created.category,
              subcategory: created.subcategory,
              planCost: created.planCost,
            });
          }
        }}
      />
      <BudgetItemDialog
        open={!!editingItem}
        onOpenChange={(o) => !o && setEditingItem(null)}
        projectId={projectId}
        projectCurrency={project?.currency ?? "CZK"}
        item={editingItem}
        onSubmitted={(updated, isNew) => {
          setCollapsedCats((prev) => {
            const next = new Set(prev);
            next.delete(updated.category);
            return next;
          });
          setHighlightId(updated.id);
          if (isNew) {
            trackEvent("add_budget_item", {
              category: updated.category,
              subcategory: updated.subcategory,
              planCost: updated.planCost,
            });
          }
        }}
      />
      {addTaskFor && (
        <BudgetItemDialog
          open={!!addTaskFor}
          onOpenChange={(o) => !o && setAddTaskFor(null)}
          projectId={projectId}
          projectCurrency={project?.currency ?? "CZK"}
          parentId={addTaskFor.id}
          defaultCategory={addTaskFor.category}
          defaultPhase={addTaskFor.phase}
          parentItemName={addTaskFor.subcategory ?? addTaskFor.category}
          defaultDateFrom={addTaskFor.dateFrom ? addTaskFor.dateFrom.substring(0, 10) : undefined}
          defaultDateTo={addTaskFor.dateTo ? addTaskFor.dateTo.substring(0, 10) : undefined}
          onSubmitted={(created, isNew) => {
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
            setPhaseFilter(new Set());
            setCompletionFilter("all");
            setHighlightId(created.id);
            if (isNew) {
              trackEvent("add_budget_item", {
                category: created.category,
                subcategory: created.subcategory,
                planCost: created.planCost,
              });
            }
          }}
        />
      )}
      <BudgetItemDialog
        open={!!addOpenForCategory}
        onOpenChange={(o) => !o && setAddOpenForCategory(null)}
        projectId={projectId}
        projectCurrency={project?.currency ?? "CZK"}
        defaultCategory={addOpenForCategory ?? undefined}
        onSubmitted={(created, isNew) => {
          setCollapsedCats((prev) => {
            const next = new Set(prev);
            next.delete(created.category);
            return next;
          });
          setSearch("");
          setPhaseFilter(new Set());
          setCompletionFilter("all");
          setHighlightId(created.id);
          if (isNew) {
            trackEvent("add_budget_item", {
              category: created.category,
              subcategory: created.subcategory,
              planCost: created.planCost,
            });
          }
        }}
      />
    </div>
  );
}

// =====================================================================
// CategorySelectAllCheckbox — rendered in the table header of each
// category when selectionMode is on. Toggles all visible top-level
// items in this category (children are not toggled here — they have
// their own per-row checkbox). Shows indeterminate state when only
// some items are selected.
// =====================================================================
function CategorySelectAllCheckbox({
  catItems,
  selectedIds,
  onToggleAll,
}: {
  catItems: BudgetItem[];
  selectedIds: Set<string>;
  onToggleAll: (ids: string[]) => void;
}) {
  const t = useTranslations("tabs.budget.row");
  const ids = useMemo(() => catItems.map((it) => it.id), [catItems]);
  const selectedCount = ids.filter((id) => selectedIds.has(id)).length;
  const allSelected = ids.length > 0 && selectedCount === ids.length;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <Checkbox
      checked={allSelected}
      indeterminate={someSelected}
      onCheckedChange={() => onToggleAll(ids)}
      aria-label={t("aria.selectAllInCategory")}
      className="mx-auto"
    />
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
  onCategoryDragEnd,
  onAddItem,
  projectCurrency,
  children,
}: {
  id: string;
  categoryName: string;
  collapsed: boolean;
  onToggle: () => void;
  totals: { plan: number; actual: number; count: number; saved: number };
  burn: number;
  onCategoryDragEnd: (oldIndex: number, newIndex: number) => void;
  onAddItem?: () => void;
  projectCurrency: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("tabs.budget.category");
  const locale = useLocale() as Locale;
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
      id={`category-${categoryName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`}
      className={cn(
        "rounded-lg border border-outline-variant bg-card shadow-sm",
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
            {/* Drag handle — larger touch target on mobile (32px → 20px on desktop) */}
            <span
              {...listeners}
              className="flex h-8 w-8 cursor-grab items-center justify-center rounded text-muted-foreground/40 hover:bg-muted hover:text-foreground active:cursor-grabbing md:h-5 md:w-5"
              aria-label={t("aria.drag")}
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
            <Badge variant="secondary" className="type-label-sm">
              {totals.count}
            </Badge>
            {totals.saved > 0 && (
              <Badge variant="outline" className="type-label-sm text-success">
                <PiggyBank className="mr-1 h-2.5 w-2.5" />
                {formatCurrency(totals.saved, projectCurrency, locale)}
              </Badge>
            )}
            {/* Add item to this category (green plus) — span instead of button
                to avoid nested <button> inside CollapsibleTrigger */}
            {onAddItem && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddItem();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onAddItem();
                  }
                }}
                title={t("addItem.title", { name: categoryName })}
                aria-label={t("addItem.aria")}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-success transition-colors hover:bg-success-soft hover:text-success-strong dark:text-success dark:hover:bg-success-soft sm:h-5 sm:w-5"
              >
                <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              </span>
            )}
            <div className="ml-auto flex items-center gap-4 text-xs">
              <span className="text-muted-foreground">
                {formatCurrency(totals.actual, projectCurrency, locale)} / {formatCurrency(totals.plan, projectCurrency, locale)}
              </span>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    burn > 100
                      ? "bg-danger"
                      : burn > 80
                        ? "bg-warning"
                        : "bg-success",
                  )}
                  style={{ width: `${Math.min(burn, 100)}%` }}
                />
              </div>
              <span
                className={cn(
                  "font-semibold",
                  burn > 100
                    ? "text-danger"
                    : burn > 80
                      ? "text-warning"
                      : "text-success",
                )}
              >
                {burn.toFixed(0)}%
              </span>
            </div>
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
  onAddTask,
  highlightId,
  registerRow,
  categoryName,
  onItemDragEnd,
  selectionMode,
  selectedIds,
  onToggleSelection,
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
  onAddTask?: () => void;
  highlightId?: string | null;
  registerRow?: (id: string, el: HTMLTableRowElement | null) => void;
  categoryName: string;
  onItemDragEnd: (oldIndex: number, newIndex: number) => void;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
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
        onAddTask={onAddTask}
        highlightId={highlightId}
        registerRow={registerRow}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onToggleSelection={onToggleSelection}
      />
    </RowDragContext.Provider>
  );
}

// =====================================================================
// SortableChildRow — wraps a child task in useSortable so it can be
// dragged to reorder within its parent. Uses "task:XXX" IDs (distinct
// from top-level "item:XXX" IDs) so the drag-end handler can tell them
// apart and only allow reordering within the same parent.
// =====================================================================
function SortableChildRow({
  childId,
  item,
  childItems,
  projectId,
  isExpanded,
  onToggleExpand,
  expandedItems,
  onToggleChildExpand,
  onEdit,
  highlightId,
  registerRow,
  selectionMode,
  selectedIds,
  onToggleSelection,
}: {
  childId: string;
  item: BudgetItem;
  childItems: BudgetItem[];
  projectId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  expandedItems: Set<string>;
  onToggleChildExpand: (id: string) => void;
  onEdit: (item: BudgetItem) => void;
  highlightId?: string | null;
  registerRow?: (id: string, el: HTMLTableRowElement | null) => void;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `task:${childId}`,
    data: { type: "task", label: item.subcategory || item.category },
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
        isChild
        highlightId={highlightId}
        registerRow={registerRow}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onToggleSelection={onToggleSelection}
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
  onAddTask,
  onMoveChild,
  isChild = false,
  highlightId,
  registerRow,
  selectionMode = false,
  selectedIds,
  onToggleSelection,
}: {
  item: BudgetItem;
  childItems: BudgetItem[];
  projectId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  expandedItems: Set<string>;
  onToggleChildExpand: (id: string) => void;
  onEdit: (item: BudgetItem) => void;
  onAddTask?: () => void;
  onMoveChild?: (siblings: BudgetItem[], idx: number, dir: -1 | 1) => void;
  isChild?: boolean;
  highlightId?: string | null;
  registerRow?: (id: string, el: HTMLTableRowElement | null) => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelection?: (id: string) => void;
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
        selectionMode={selectionMode}
        selected={!!selectedIds?.has(item.id)}
        onToggleSelection={onToggleSelection}
      />
      {isExpanded && !isChild && (
        <DetailPanelRow
          item={item}
          projectId={projectId}
          childItems={childItems}
          selectionMode={selectionMode}
        />
      )}
      {isExpanded &&
        hasChildren &&
        !isChild &&
        (() => {
          const taskIds = childItems.map((c) => `task:${c.id}`);
          return (
            <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
              {childItems.map((child) => {
                const childExpanded = expandedItems.has(child.id);
                const childChildren: BudgetItem[] = [];
                return (
                  <SortableChildRow
                    key={child.id}
                    childId={child.id}
                    item={child}
                    childItems={childChildren}
                    projectId={projectId}
                    isExpanded={childExpanded}
                    onToggleExpand={() => onToggleChildExpand(child.id)}
                    expandedItems={expandedItems}
                    onToggleChildExpand={onToggleChildExpand}
                    onEdit={onEdit}
                    highlightId={highlightId}
                    registerRow={registerRow}
                    selectionMode={selectionMode}
                    selectedIds={selectedIds}
                    onToggleSelection={onToggleSelection}
                  />
                );
              })}
            </SortableContext>
          );
        })()}
    </>
  );
}

// =====================================================================
// BudgetRow — one row in the budget table
// (Same as original, but now includes a drag handle cell)
// =====================================================================
const BudgetRow = memo(function BudgetRow({
  item,
  projectId,
  onEdit,
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
  selectionMode = false,
  selected = false,
  onToggleSelection,
}: {
  item: BudgetItem;
  projectId: string;
  onEdit: (item: BudgetItem) => void;
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
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelection?: (id: string) => void;
}) {
  const updateItem = useUpdateBudgetItem(projectId);
  const deleteItem = useDeleteBudgetItem(projectId);
  const duplicateItem = useDuplicateBudgetItem(projectId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const dragCtx = useRowDragListeners();
  const { trackEvent } = useAnalytics(projectId);
  const t = useTranslations("tabs.budget.row");
  // Column-header translations — used as accessible labels for the inline
  // editors (InlineNumber / InlineDate) so screen-reader users hear the
  // field's purpose rather than just its numeric value.
  const tColumn = useTranslations("tabs.budget.column");
  const tPhases = useTranslations("phases");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  // Fetch the full budget item list so the MoveItemDialog can show all
  // candidate parents. react-query dedupes identical queries so this is
  // free (the parent component already fetched the same data).
  const { data: allItems } = useBudgetItems(projectId);
  // Resolve the project's default currency for multi-currency display.
  // `useProjects()` is shared with `BudgetTab` (react-query dedupes), so
  // this is a cache lookup, not a network request on every row render.
  const { data: projects } = useProjects();
  const projectCurrency = projects?.find((p) => p.id === projectId)?.currency ?? "CZK";

  const update = (field: keyof BudgetItem, value: unknown) => {
    updateItem.mutate({ id: item.id, data: { [field]: value } });
    trackEvent("edit_budget_item", { field });
  };

  const handleMove = async (newParentId: string | null) => {
    await updateItem.mutateAsync({
      id: item.id,
      data: { parentId: newParentId || null },
    });
    trackEvent("move_budget_item", { toTopLevel: newParentId === null });
  };

  const displayPlanCost = childCount > 0 ? rolled.planCost : item.planCost;
  const displayPlanDays = childCount > 0 ? rolled.planDays : item.planDays;
  const displayActualCost = childCount > 0 ? rolled.actualCost : item.actualCost;
  const displayActualHours = childCount > 0 ? rolled.actualHours : item.actualHours;

  // Multi-currency: when the item has `planCostCurrency` set (foreign currency),
  // the Plán column shows the original amount + the converted amount in
  // parens. Parents aggregate `planCostConverted` from children (all in
  // project currency), so the foreign-currency branch only applies to
  // leaf items (childCount === 0).
  const planCostCurrency = item.planCostCurrency ?? projectCurrency;
  const isForeignPlanCurrency =
    childCount === 0 && !!item.planCostCurrency && item.planCostCurrency !== projectCurrency;
  const planConverted = item.planCostConverted ?? item.planCost ?? 0;
  const projectSymbol = CURRENCY_MAP[projectCurrency]?.symbol ?? projectCurrency;

  const isHighlighted = !!highlightId && highlightId === item.id;

  return (
    <TableRow
      ref={(el) => {
        registerRow?.(item.id, el);
        if (dragCtx) dragCtx.sortableRef(el);
      }}
      style={dragCtx?.sortableStyle}
      {...(dragCtx?.sortableAttributes ?? {})}
      onClick={() => {
        // Disable the edit-dialog shortcut when in selection mode —
        // clicking the row body in selection mode does nothing (the
        // user must use the explicit checkbox to toggle selection).
        if (selectionMode) return;
        onEdit(item);
      }}
      // Accessibility (A3): keyboard users can focus the row and press
      // Enter to open the edit dialog (same as a click). In selection
      // mode the row body is no longer an edit affordance — the
      // checkbox handles selection — so we drop it from the tab order
      // (tabIndex=undefined) to avoid a misleading focusable-but-inert
      // element. aria-label is also omitted in selection mode (the
      // checkbox already announces the row via its own aria-label).
      tabIndex={!selectionMode ? 0 : undefined}
      onKeyDown={
        !selectionMode
          ? (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onEdit(item);
              }
            }
          : undefined
      }
      aria-label={
        !selectionMode
          ? t("aria.editRow", { name: item.subcategory || item.category })
          : undefined
      }
      className={cn(
        "group transition-colors",
        // In selection mode the row body is no longer clickable (the
        // edit dialog is invoked via the actions menu instead), so we
        // drop the `cursor-pointer` hint to avoid misleading the user.
        selectionMode ? "cursor-default" : "cursor-pointer",
        // Virtual paint hint — browser skips painting off-screen rows,
        // dramatically improving scroll perf for 100+ item projects.
        // Children rows inherit from parent's expanded state.
        "cv-row",
        isChild
          ? cn(
              "bg-muted/30 hover:bg-muted/40",
              item.rejected && "opacity-70",
            )
          : cn(
              item.rejected
                ? "opacity-60 bg-danger-soft/30"
                : item.completed
                  ? "bg-success-soft/30"
                  : "hover:bg-muted/30",
            ),
        // Highlight selected rows with a primary tint (in selection mode)
        selected && "bg-primary/10 ring-1 ring-inset ring-primary/40",
        isHighlighted && "stavba-highlight-row",
        dragCtx?.isDragging && "opacity-40",
      )}
    >
      {/* Selection checkbox cell — only rendered when selectionMode is on.
          Placed BEFORE the drag handle so the checkbox is the first
          column (per task spec). Clicking the checkbox toggles the row
          in `selectedIds`; stopPropagation prevents the row's onClick
          (which is disabled in selection mode anyway, but the click
          would still bubble to the drag handle's parent and could
          interfere with DnD activation). */}
      {selectionMode && (
        <TableCell
          className="w-10 text-center align-middle"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelection?.(item.id)}
            aria-label={t("aria.selectRow", { name: item.subcategory || item.category })}
            className="mx-auto"
          />
        </TableCell>
      )}
      {/* Drag handle cell — top-level items AND child tasks.
          Children get a lighter, indented handle to hint at sub-level.
          Cell width is wider on mobile (w-12) to comfortably fit the
          32px touch target; collapses to w-8 on desktop. */}
      {dragCtx?.listeners ? (
        <TableCell className="w-12 align-middle sm:w-8">
          <span
            {...dragCtx.listeners}
            className={cn(
              "flex h-8 w-8 cursor-grab items-center justify-center rounded text-muted-foreground/30 hover:bg-muted hover:text-foreground active:cursor-grabbing md:h-5 md:w-5",
              isChild && "ml-2 opacity-60",
            )}
            aria-label={t("aria.drag")}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </span>
        </TableCell>
      ) : (
        <TableCell className="w-12 sm:w-8" />
      )}

      {/* Expand/collapse toggle (parents) OR gradient bg for children */}
      {isChild ? (
        <TableCell className="relative align-middle pl-8">
          {/* Gradient fade from parent's phase color (left) to transparent (right) */}
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 w-16 pointer-events-none"
            style={{
              background: `linear-gradient(to right, var(--phase-color, transparent) 0%, transparent 100%)`,
              opacity: 0.15,
            }}
            data-phase-color={
              item.rejected ? "rose" : item.phase
            }
            ref={(el) => {
              if (!el) return;
              // Set CSS variable from PHASE_BG_COLORS
              const colorMap: Record<string, string> = {
                "preparation": "#a78bfa",
                "demolition": "#f87171",
                "earthworks": "#8b6f47",
                "foundation": "#6b7280",
                "shell": "#fbbf24",
                "installations": "#3b82f6",
                "finishing": "#34d399",
                "facade": "#f59e0b",
                "roof": "#ef4444",
                "interior": "#10b981",
                "exterior": "#84cc16",
                "final_inspection": "#a855f7",
                "future": "#60a5fa",
                "unspecified": "#a1a1aa",
                "rose": "#f43f5e",
              };
              const key = el.getAttribute("data-phase-color") ?? "";
              el.style.setProperty("--phase-color", colorMap[key] ?? "#a1a1aa");
            }}
          />
          <span aria-hidden className="relative select-none text-muted-foreground/60">
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
                ? "bg-danger"
                : PHASE_BG_COLORS[item.phase] ?? "bg-muted-foreground/50",
            )}
          />
          <div className="relative flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label={isExpanded ? t("aria.collapse") : t("aria.expand")}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {childCount > 0 ? (
                <span className="type-label">
                  {t("childCount", { count: childCount })}
                </span>
              ) : (
                <span className="type-label text-muted-foreground/50">{t("addTask")}</span>
              )}
            </button>
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
                title={t("required.title")}
                aria-label={t("required.aria")}
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-warning-soft type-label-sm font-bold leading-none text-warning-strong dark:bg-warning-soft/40 dark:text-warning/70"
              >
                !
              </span>
            )}
            <span
              className={cn(
                "type-body text-left font-medium",
                isChild ? "cursor-pointer hover:underline" : "",
                item.rejected
                  ? "line-through decoration-danger/70"
                  : item.completed && "line-through decoration-success/50",
                childCount > 0 && "font-semibold",
              )}
            >
              {item.subcategory || t("placeholder.noName")}
            </span>
            {item.rejected && (
              <Badge variant="outline" className="type-label-sm h-4 px-1 text-danger dark:text-danger/60">
                {t("badge.rejected")}
              </Badge>
            )}
            {item.completed && !item.rejected && (
              <Badge variant="outline" className="type-label-sm h-4 px-1 text-success">
                {t("badge.done")}
              </Badge>
            )}
            {item.subsidyEligible && (
              <Badge
                variant="outline"
                title={
                  item.subsidyAmount != null
                    ? t("badge.subsidyTitleWithAmount", { amount: formatCurrency(item.subsidyAmount, projectCurrency, locale) })
                    : t("badge.subsidyTitleNoAmount")
                }
                className="type-label-sm h-4 gap-0.5 px-1 text-subsidy-strong dark:text-subsidy"
              >
                <HandCoins className="h-2.5 w-2.5" />
                {t("badge.subsidy")}
                {item.subsidyAmount != null && item.subsidyAmount > 0 && (
                  <span className="ml-0.5 tabular-nums">
                    {formatCurrency(item.subsidyAmount, projectCurrency, locale)}
                  </span>
                )}
              </Badge>
            )}
            {!isChild && onAddTask && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddTask();
                }}
                title={t("badge.addTaskTitle")}
                aria-label={t("badge.addTaskAria")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-success transition-colors hover:bg-success-soft hover:text-success-strong dark:text-success dark:hover:bg-success-soft sm:h-6 sm:w-6"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
          {item._count &&
            (item._count.payments > 0 || item._count.timeEntries > 0) && (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {item._count.payments > 0 && (
                  <Badge variant="outline" className="h-4 px-1 type-label-sm text-success">
                    {t("paymentsCount", { count: item._count.payments })}
                  </Badge>
                )}
                {item._count.timeEntries > 0 && (
                  <Badge variant="outline" className="h-4 px-1 type-label-sm text-time">
                    {t("timeCount", { count: item._count.timeEntries })}
                  </Badge>
                )}
              </div>
            )}
        </div>
      </TableCell>

      {/* Fáze */}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Select
          value={item.phase}
          onValueChange={(v) => update("phase", v)}
        >
          <SelectTrigger className="h-7 border-0 px-1 type-label shadow-none hover:bg-muted">
            <Badge
              variant="outline"
              className={cn("h-5 px-1.5 type-label-sm", PHASE_COLORS[item.phase] ?? "")}
            >
              {tPhases(item.phase)}
            </Badge>
          </SelectTrigger>
          <SelectContent>
            {PHASES.map((p) => (
              <SelectItem key={p} value={p}>
                {tPhases(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>

      {/* Plán (Kč) — Variant D:
          • Leaf (no children): own planCost, editable inline.
          • Parent (has children): TOTAL (own + Σ children) shown bold as
            the primary number; the parent's OWN planCost shown below as a
            small muted "+ X Kč" line (editable inline). Hidden when the
            parent's own cost is null/0 to avoid noise.
            Children's planCosts are visible as rows below, so we don't
            repeat them in the breakdown.

          Multi-currency: when a LEAF item has `planCostCurrency` set
          (foreign currency), we display the original amount in that
          currency + the converted amount in the project's currency in
          parens — same pattern as the payment table. Inline editing is
          disabled for foreign-currency rows (the user must open the
          edit dialog). */}
      <TableCell onClick={(e) => e.stopPropagation()} className="text-right">
        {childCount > 0 ? (
          <div className="flex flex-col items-end gap-0.5">
            {/* Total = own + Σ children (read-only display, in project currency) */}
            <span
              className={cn(
                "block w-full rounded px-1 py-0.5 text-right font-semibold tabular-nums",
                "hover:bg-surface-container-high",
              )}
              title={t("tooltip.planTotal", { own: formatCurrency(item.planCost ?? 0, projectCurrency, locale), children: formatCurrency(displayPlanCost - (item.planCost ?? 0), projectCurrency, locale) })}
            >
              {displayPlanCost > 0 ? formatCurrency(displayPlanCost, projectCurrency, locale) : (
                <span className="text-muted-foreground/50">—</span>
              )}
            </span>
            {/* Own cost — editable inline, shown only when there's a value.
                "+" prefix indicates it adds to the total. */}
            {item.planCost != null && item.planCost !== 0 && (
              <span className="flex w-full items-center justify-end gap-0.5 type-label-sm text-muted-foreground tabular-nums">
                <span className="shrink-0 text-muted-foreground/60">+</span>
                <InlineNumber
                  value={item.planCost}
                  onCommit={(v) => update("planCost", v)}
                  className="text-right tabular-nums text-muted-foreground hover:text-foreground"
                  suffix={` ${projectSymbol}`}
                  ariaLabel={tColumn("plan")}
                />
              </span>
            )}
          </div>
        ) : isForeignPlanCurrency ? (
          // Foreign currency leaf: original amount + converted amount in parens.
          // Inline editing is disabled (the currency + amount together determine
          // the converted value, so the user must open the edit dialog).
          <div className="flex flex-col items-end">
            <span className="font-medium tabular-nums">
              {formatCurrency(item.planCost ?? 0, planCostCurrency, locale)}
            </span>
            <span className="type-label text-muted-foreground tabular-nums">
              ({formatCurrency(planConverted, projectCurrency, locale)})
            </span>
          </div>
        ) : (
          <InlineNumber
            value={item.planCost}
            onCommit={(v) => update("planCost", v)}
            className={cn("text-right font-medium")}
            suffix={` ${projectSymbol}`}
            ariaLabel={tColumn("plan")}
          />
        )}
      </TableCell>

      {/* Dny — editable for ALL items */}
      <TableCell onClick={(e) => e.stopPropagation()} className="text-right">
        <InlineNumber
          value={item.planDays}
          onCommit={(v) => update("planDays", v)}
          className={cn("text-right type-label", childCount > 0 && "font-semibold")}
          ariaLabel={tColumn("days")}
        />
      </TableCell>

      {/* Datum od */}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <InlineDate
          value={item.dateFrom}
          onCommit={(v) => update("dateFrom", v)}
          ariaLabel={tColumn("dateFrom")}
        />
      </TableCell>

      {/* Datum do */}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <InlineDate
          value={item.dateTo}
          onCommit={(v) => update("dateTo", v)}
          ariaLabel={tColumn("dateTo")}
        />
      </TableCell>

      {/* Skut. (Kč) — Variant D (same pattern as Plán):
          • Leaf: own actualCost, editable inline.
          • Parent: TOTAL (own + Σ children) bold + "+ X Kč" editable below
            (only when parent's own actualCost is non-null/non-zero).
            actualCost is normally auto-computed from payments, but the
            parent's own actualCost can still be adjusted manually. */}
      <TableCell
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "text-right",
          overBudget && "text-danger",
        )}
      >
        {childCount > 0 ? (
          <div className="flex flex-col items-end gap-0.5">
            <span
              className={cn(
                "block w-full rounded px-1 py-0.5 text-right font-semibold tabular-nums",
                overBudget && "text-danger",
              )}
              title={t("tooltip.actualTotal", { own: formatCurrency(item.actualCost ?? 0, projectCurrency, locale), children: formatCurrency(displayActualCost - (item.actualCost ?? 0), projectCurrency, locale) })}
            >
              {displayActualCost > 0 ? formatCurrency(displayActualCost, projectCurrency, locale) : (
                <span className="text-muted-foreground/50">—</span>
              )}
            </span>
            {item.actualCost != null && item.actualCost !== 0 && (
              <span className="flex w-full items-center justify-end gap-0.5 type-label-sm text-muted-foreground tabular-nums">
                <span className="shrink-0 text-muted-foreground/60">+</span>
                <InlineNumber
                  value={item.actualCost}
                  onCommit={(v) => update("actualCost", v)}
                  className="text-right tabular-nums text-muted-foreground hover:text-foreground"
                  suffix={` ${projectSymbol}`}
                  ariaLabel={tColumn("actual")}
                />
              </span>
            )}
          </div>
        ) : (
          <InlineNumber
            value={item.actualCost}
            onCommit={(v) => update("actualCost", v)}
            className={cn("text-right", overBudget && "font-semibold text-danger")}
            ariaLabel={tColumn("actual")}
          />
        )}
        {overBudget && (
          <span className="ml-1 inline-flex items-center type-label-sm text-danger">
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
      </TableCell>

      {/* Hodiny */}
      <TableCell className="text-right type-label text-time">
        {displayActualHours > 0 ? formatNumber(displayActualHours, " h") : "—"}
      </TableCell>

      {/* Stav: Nutné + Hotovo + Rejected (X) — stopPropagation prevents row edit dialog */}
      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={item.required ? "default" : "outline"}
            onClick={(e) => { e.stopPropagation(); update("required", !item.required); }}
            disabled={updateItem.isPending}
            aria-pressed={item.required}
            aria-label={item.required ? t("required.ariaRequired") : t("required.ariaOptional")}
            className={cn(
              "h-9 w-9 shrink-0 p-0 sm:h-7 sm:w-7",
              item.required
                ? "border-warning bg-warning text-white hover:bg-warning-strong hover:text-white dark:border-warning/60 dark:bg-warning/70 dark:hover:bg-warning/80"
                : "text-warning hover:border-warning/50 hover:bg-warning-soft hover:text-warning-strong dark:text-warning/70 dark:hover:border-warning/40 dark:hover:bg-warning-soft/50",
            )}
            title={
              item.required
                ? t("required.titleRequired")
                : t("required.titleOptional")
            }
          >
            <AlertTriangle className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={item.completed ? "default" : "outline"}
            onClick={(e) => { e.stopPropagation(); update("completed", !item.completed); }}
            disabled={updateItem.isPending || item.rejected}
            aria-pressed={item.completed}
            className={cn(
              "h-9 w-9 p-0 sm:h-7 sm:w-7",
              item.completed
                ? "border-success bg-success text-white hover:bg-success-strong hover:text-white dark:border-success/60 dark:bg-success/70 dark:hover:bg-success/80"
                : "text-success hover:border-success/50 hover:bg-success-soft hover:text-success-strong dark:text-success/70 dark:hover:border-success/40 dark:hover:bg-success-soft/50",
            )}
            title={item.completed ? t("completed.titleDone") : t("completed.titleTodo")}
            aria-label={item.completed ? t("completed.ariaDone") : t("completed.ariaTodo")}
          >
            <CheckCircle2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={item.rejected ? "default" : "outline"}
            onClick={(e) => { e.stopPropagation(); update("rejected", !item.rejected); }}
            disabled={updateItem.isPending}
            aria-pressed={item.rejected}
            className={cn(
              "h-9 w-9 p-0 sm:h-7 sm:w-7",
              item.rejected
                ? "border-danger bg-danger text-white hover:bg-danger-strong hover:text-white dark:border-danger/60 dark:bg-danger/70 dark:hover:bg-danger/80"
                : "text-danger hover:border-danger/50 hover:bg-danger-soft hover:text-danger-strong dark:text-danger/70 dark:hover:border-danger/40 dark:hover:bg-danger-soft/50",
            )}
            title={item.rejected ? t("rejected.titleRejected") : t("rejected.titleNotRejected")}
            aria-label={item.rejected ? t("rejected.ariaRejected") : t("rejected.ariaNotRejected")}
          >
            <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </Button>
        </div>
      </TableCell>

      {/* Akce — stopPropagation prevents row edit dialog when opening menu */}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground opacity-60 transition-opacity hover:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 sm:h-7 sm:w-7"
                title={t("actions.titleMore")}
                aria-label={t("actions.ariaMore")}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(item)}>{t("menu.editDetail")}</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => update("required", !item.required)}
              >
                <AlertTriangle className="mr-2 h-3.5 w-3.5 text-warning" />
                {item.required ? t("menu.markOptional") : t("menu.markRequired")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => update("subsidyEligible", !item.subsidyEligible)}
              >
                <HandCoins className="mr-2 h-3.5 w-3.5 text-subsidy" />
                {item.subsidyEligible ? t("menu.subsidyRemove") : t("menu.subsidyAdd")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => update("completed", !item.completed)}
              >
                {item.completed ? t("menu.markNotDone") : t("menu.markDone")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => update("rejected", !item.rejected)}
              >
                {item.rejected ? t("menu.unreject") : t("menu.reject")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMoveOpen(true)}>
                <ArrowRightLeft className="mr-2 h-3.5 w-3.5 text-primary" />
                {t("menu.move")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await duplicateItem.mutateAsync(item.id);
                    toast.success(t("toasts.duplicateSuccess"));
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : t("toasts.duplicateError"));
                  }
                }}
              >
                <Copy className="mr-2 h-3.5 w-3.5" /> {t("menu.duplicate")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> {tCommon("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("delete.title")}</DialogTitle>
              <DialogDescription>
                {t.rich("delete.body", {
                  name: item.subcategory || item.category,
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                {tCommon("cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={deleteItem.isPending}
                onClick={async () => {
                  try {
                    await deleteItem.mutateAsync(item.id);
                    toast.success(t("toasts.deleteSuccess"));
                    setConfirmDelete(false);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : t("toasts.deleteError"));
                  }
                }}
              >
                {deleteItem.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {tCommon("delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {allItems && (
          <MoveItemDialog
            open={moveOpen}
            onOpenChange={setMoveOpen}
            item={item}
            projectId={projectId}
            allItems={allItems}
            onMove={handleMove}
          />
        )}
      </TableCell>
    </TableRow>
  );
});

// ===== DetailPanelRow — expandable panel below an item row with hidden fields =====
function DetailPanelRow({
  item,
  projectId,
  childItems = [],
  selectionMode = false,
}: {
  item: BudgetItem;
  projectId: string;
  childItems?: BudgetItem[];
  selectionMode?: boolean;
}) {
  const updateItem = useUpdateBudgetItem(projectId);
  const { trackEvent } = useAnalytics(projectId);
  const t = useTranslations("tabs.budget.detail");

  const update = (field: keyof BudgetItem, value: unknown) => {
    updateItem.mutate({ id: item.id, data: { [field]: value } });
    trackEvent("edit_budget_item", { field });
  };

  return (
    <TableRow className="detail-panel bg-muted/20 hover:bg-muted/20">
      <TableCell colSpan={selectionMode ? 13 : 12} className="relative py-3">
        {/* Gradient fade from phase color (left edge) to transparent */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-24 pointer-events-none"
          style={{
            background: `linear-gradient(to right, var(--phase-color, transparent) 0%, transparent 100%)`,
            opacity: 0.12,
          }}
          data-phase-color={item.rejected ? "rose" : item.phase}
          ref={(el) => {
            if (!el) return;
            const colorMap: Record<string, string> = {
              "preparation": "#a78bfa",
              "demolition": "#f87171",
              "earthworks": "#8b6f47",
              "foundation": "#6b7280",
              "shell": "#fbbf24",
              "installations": "#3b82f6",
              "finishing": "#34d399",
              "facade": "#f59e0b",
              "roof": "#ef4444",
              "interior": "#10b981",
              "exterior": "#84cc16",
              "final_inspection": "#a855f7",
              "future": "#60a5fa",
              "unspecified": "#a1a1aa",
              "rose": "#f43f5e",
            };
            const key = el.getAttribute("data-phase-color") ?? "";
            el.style.setProperty("--phase-color", colorMap[key] ?? "#a1a1aa");
          }}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Poznámka */}
          <div className="space-y-2">
            <div className="type-label-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("label.note")}
            </div>
            <InlineTextarea
              value={item.note}
              onCommit={(v) => update("note", v)}
              placeholder={t("placeholder.note")}
            />
          </div>

          {/* Kontakt — přiřazená osoba/firma */}
          <div className="space-y-2">
            <div className="flex items-center gap-1 type-label-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <User className="h-3 w-3" />
              {t("label.contact")}
            </div>
            {item.contact ? (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-medium text-foreground">{item.contact.name}</span>
                {item.contact.role && (
                  <span className="text-muted-foreground">· {item.contact.role}</span>
                )}
              </div>
            ) : (
              <span className="type-label text-muted-foreground/60">
                {t("contact.unassigned")}
              </span>
            )}
          </div>

          {/* Odkazy */}
          <div className="space-y-2">
            <div className="flex items-center gap-1 type-label-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <LinkIcon className="h-3 w-3" />
              {t("label.links")}
              {item.links && item.links.length > 0 && (
                <span className="rounded bg-muted px-1.5 py-0.5 type-label-sm tabular-nums">
                  {item.links.length}
                </span>
              )}
            </div>
            {item.links && item.links.length > 0 && (
              <ul className="space-y-0.5">
                {item.links.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={link.url}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {/* Odkazy z úkolů — zobrazeny pod odkazy položky */}
            {childItems.filter((c) => c.links && c.links.length > 0).length > 0 && (
              <div className="mt-2 space-y-1 border-t pt-2">
                <div className="flex items-center gap-1 type-label-sm font-medium text-muted-foreground">
                  <ChevronRight className="h-3 w-3" />
                  {t("label.linksFromTasks")}
                </div>
                {childItems
                  .filter((c) => c.links && c.links.length > 0)
                  .map((child) => (
                    <div key={child.id} className="space-y-0.5">
                      <div className="type-label-sm text-muted-foreground/70">
                        └ {child.subcategory || t("placeholder.noName")}
                      </div>
                      <ul className="space-y-0.5 pl-3">
                        {child.links!.map((link) => (
                          <li key={link.id}>
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={link.url}
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0 opacity-40" />
                              {link.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ===== Inline editors =====
// InlineNumber and InlineDate are now imported from @/components/ui/inline-editors
// (shared with Payments and Time tabs for consistency).
// InlineTextarea is still local because it's only used in the budget detail panel.

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

// =====================================================================
// MoveItemDialog — re-parent a budget item (task) to a different parent.
//
// Lets the user move a child task under a different top-level item, or
// promote it to a top-level item (parentId = null). Excludes the item
// itself and all its descendants (so you can't create a cycle), and
// only shows top-level items as candidates (you can't nest under
// another task — the UI only supports 2 levels for now).
// =====================================================================
function MoveItemDialog({
  open,
  onOpenChange,
  item,
  projectId,
  allItems,
  onMove,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: BudgetItem;
  projectId: string;
  allItems: BudgetItem[];
  onMove: (newParentId: string | null) => Promise<void>;
}) {
  const t = useTranslations("tabs.budget.moveDialog");
  const tCommon = useTranslations("common");
  // Collect descendants of `item` so we can exclude them from the target
  // list (cycle prevention). We only need direct children here because
  // candidates are top-level items — a descendant of `item` can only be
  // a top-level item if `item` itself is top-level AND the descendant was
  // promoted. To be safe, walk the full subtree.
  const descendantIds = useMemo(() => {
    const ids = new Set<string>();
    const queue: string[] = [item.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const it of allItems) {
        if (it.parentId === current && !ids.has(it.id)) {
          ids.add(it.id);
          queue.push(it.id);
        }
      }
    }
    return ids;
  }, [item.id, allItems]);

  // Candidate targets: top-level items (parentId == null) in the same
  // project, excluding self and descendants. Grouped by category for
  // easier scanning when there are many items.
  const candidates = useMemo(() => {
    return allItems
      .filter(
        (it) =>
          it.id !== item.id &&
          !it.parentId &&
          !descendantIds.has(it.id) &&
          it.projectId === projectId,
      )
      .sort((a, b) => {
        // Group by category, then by sortOrder
        if (a.category !== b.category) {
          return a.category.localeCompare(b.category, "cs");
        }
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });
  }, [allItems, item.id, descendantIds, projectId]);

  const [selectedParentId, setSelectedParentId] = useState<string | null>(
    item.parentId ?? null,
  );

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) setSelectedParentId(item.parentId ?? null);
  }, [open, item.parentId]);

  const [moving, setMoving] = useState(false);

  const currentParent = allItems.find((it) => it.id === item.parentId);

  const handleConfirm = async () => {
    if ((selectedParentId ?? null) === (item.parentId ?? null)) {
      onOpenChange(false);
      return;
    }
    setMoving(true);
    try {
      await onMove(selectedParentId);
      toast.success(
        selectedParentId
          ? t("toasts.movedToParent")
          : t("toasts.movedToTop"),
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.error"));
    } finally {
      setMoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t.rich("description", {
              name: item.subcategory || item.category,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {currentParent && (
            <div className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {t("currentParent", { name: currentParent.subcategory || currentParent.category })}
            </div>
          )}

          {candidates.length === 0 ? (
            <p className="rounded-md border border-dashed border-muted px-3 py-4 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <Select
              value={selectedParentId ?? "__top__"}
              onValueChange={(v) =>
                setSelectedParentId(v === "__top__" ? null : v)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("placeholder.select")} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__top__">
                  <span className="flex items-center gap-2">
                    <CornerUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                    {t("topLevel")}
                  </span>
                </SelectItem>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">{c.category}</span>
                      <span className="text-muted-foreground/50">›</span>
                      <span className="font-medium">
                        {c.subcategory || t("placeholder.noName")}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              moving ||
              candidates.length === 0 ||
              (selectedParentId ?? null) === (item.parentId ?? null)
            }
          >
            {moving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
