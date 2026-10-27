"use client";

import { GripVertical } from "lucide-react";
import type { Active } from "@dnd-kit/core";
import type { DndItemType } from "./types";

// DragOverlay preview — shown at the cursor position while dragging a
// category or item. Reads the discriminated-union payload from the active
// drag's `data.current` and renders a compact card with the drag handle
// icon + the dragged entity's label.
//
// Returns null when the drag has no payload (shouldn't happen in practice —
// the DndBudgetTab only renders this component when `activeDrag` is set —
// but TypeScript needs the narrowing).
export function DragPreviewItem({ activeDrag }: { activeDrag: Active }) {
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
