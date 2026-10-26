"use client";

import { useMemo } from "react";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useReorder, type BudgetItem } from "@/lib/api";
import { RowDragContext } from "./row-drag-context";
import { BudgetRow } from "./budget-row";
import { DetailPanelRow } from "./detail-panel-row";
import { computeRolledUp, computeSaved } from "./compute";

// =====================================================================
// SortableBudgetItemRows — wraps BudgetItemRows with DnD
// =====================================================================
export function SortableBudgetItemRows({
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
  allItems,
  projectCurrency,
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
  allItems?: BudgetItem[];
  projectCurrency: string;
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
        allItems={allItems}
        projectCurrency={projectCurrency}
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
export function SortableChildRow({
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
  allItems,
  projectCurrency,
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
  allItems?: BudgetItem[];
  projectCurrency: string;
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
        allItems={allItems}
        projectCurrency={projectCurrency}
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
  allItems,
  projectCurrency,
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
  // Hoisted from BudgetRow — full budget item list (for MoveItemDialog) and
  // the project's default currency. Threaded down from BudgetTab so each
  // row doesn't subscribe to the React Query cache itself.
  allItems?: BudgetItem[];
  projectCurrency: string;
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

  // Memoize the per-expanded-block child task IDs so the SortableContext
  // `items` array reference is stable across re-renders unless `childItems`
  // changes. Previously this was computed inside an IIFE on every render,
  // which defeated React's reconciliation (and any downstream memoization).
  const childTaskIds = useMemo(
    () => childItems.map((c) => `task:${c.id}`),
    [childItems],
  );

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
        allItems={allItems}
        projectCurrency={projectCurrency}
      />
      {isExpanded && !isChild && (
        <DetailPanelRow
          item={item}
          projectId={projectId}
          childItems={childItems}
          selectionMode={selectionMode}
        />
      )}
      {isExpanded && hasChildren && !isChild && (
        <SortableContext items={childTaskIds} strategy={verticalListSortingStrategy}>
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
                allItems={allItems}
                projectCurrency={projectCurrency}
              />
            );
          })}
        </SortableContext>
      )}
    </>
  );
}
