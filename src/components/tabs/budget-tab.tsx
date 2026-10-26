"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAnalytics } from "@/hooks/use-analytics";
import {
  useBudgetItems,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { TabSkeleton } from "@/components/ui/tab-skeleton";
import {
  Plus,
  Trash2,
  Filter,
  Search,
  Loader2,
  CheckCircle2,
  ListChecks,
  CircleSlash,
  Ban,
} from "lucide-react";
import { PHASES } from "@/lib/format";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { BudgetItemDialog } from "@/components/budget-item-dialog";
import { EmptyStateBox } from "@/components/empty-state-box";
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
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
// Extracted sub-components — see ./budget/ folder.
import { DragPreviewItem } from "./budget/drag-preview";
import { computeRolledUp, computeSaved } from "./budget/compute";
import {
  SortableCategoryCard,
  CategorySelectAllCheckbox,
} from "./budget/sortable-category-card";
import { SortableBudgetItemRows } from "./budget/sortable-budget-item-rows";

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
// The main BudgetTab component (renamed from original BudgetTab)
// =====================================================================

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

  const toggleCat = useCallback((cat: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const toggleItem = useCallback((id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  // Grand totals — wrapped in useMemo so they're recomputed only when the
  // underlying items or childrenMap change, not on every render (which
  // previously caused unnecessary recalculations on hover/state changes).
  const { grandPlan, grandActual, grandSaved, topLevelCount, completedCount } = useMemo(() => {
    let gp = 0, ga = 0, gs = 0, tc = 0, cc = 0;
    for (const it of items ?? []) {
      if (it.parentId) continue;
      tc++;
      if (it.completed) cc++;
      const children = childrenMap.get(it.id) ?? [];
      const rolled = computeRolledUp(it, children);
      gp += rolled.planCost;
      ga += rolled.actualCost;
      if (it.completed) {
        gs += Math.max(0, rolled.planCost - rolled.actualCost);
      }
    }
    return { grandPlan: gp, grandActual: ga, grandSaved: gs, topLevelCount: tc, completedCount: cc };
  }, [items, childrenMap]);

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
                            allItems={items}
                            projectCurrency={project?.currency ?? "CZK"}
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
