"use client";

import { createContext, useContext } from "react";
import type { useSortable } from "@dnd-kit/sortable";

// RowDragContext lets the sortable wrappers (SortableBudgetItemRows &
// SortableChildRow) hand their dnd-kit listeners, ref callback, style and
// attributes down to the inner BudgetRow component without prop-drilling
// through BudgetItemRows. BudgetRow consumes it via `useRowDragListeners`.
//
// `null` means the row isn't inside a sortable wrapper (e.g. when used in
// tests or directly without DnD) — BudgetRow treats that as "no drag handle".
export const RowDragContext = createContext<{
  listeners: ReturnType<typeof useSortable>["listeners"];
  isDragging: boolean;
  sortableRef: (el: HTMLElement | null) => void;
  sortableStyle: React.CSSProperties;
  sortableAttributes: Record<string, unknown>;
} | null>(null);

// Convenience hook so consumers don't need to import createContext themselves.
export function useRowDragListeners() {
  return useContext(RowDragContext);
}
