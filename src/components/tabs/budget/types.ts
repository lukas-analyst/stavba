// Shared types for the Budget tab sub-components.
//
// `DndItemType` is the discriminated union stored on each dnd-kit `active.data.current`
// so the DragOverlay preview (and the drag-end handler) can tell categories apart
// from top-level items and child tasks.

export type DndItemType =
  | { kind: "category"; id: string; categoryName: string }
  | { kind: "item"; id: string; categoryName: string; label: string };
