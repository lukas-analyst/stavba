"use client";

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import type { FloorplanElement, FloorplanLayer } from "@/lib/floorplan/types";
import { LAYER_META } from "@/lib/floorplan/layer-mapping";
import { cn } from "@/lib/utils";

// ============================================================
// FloorplanCanvas — SVG renderer with drag, resize, zoom-to-cursor
// ============================================================
// MD3-compliant interactive canvas for floorplan elements.
// Features:
//   - Zoom to cursor (not center)
//   - Pan with drag (with sensitivity multiplier)
//   - Click to select element (onMouseUp, not onClick)
//   - Drag to move element (edit mode only)
//   - Resize handles on selected element (edit mode only)
//   - Layer filtering
//   - View mode: geometry / status
//   - Y-axis flip (DXF Y-up → SVG Y-down)
// ============================================================

type Props = {
  elements: FloorplanElement[];
  visibleLayers: Set<string>;
  viewMode: "geometry" | "status";
  selectedElementId?: string | null;
  onSelectElement?: (elementId: string | null) => void;
  onElementMove?: (elementId: string, x: number, y: number) => void;
  onElementResize?: (elementId: string, x: number, y: number, width: number, height: number) => void;
  editMode?: boolean;
  className?: string;
};

// Resize handle positions
type Handle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

const HANDLE_SIZE = 8; // pixels

export function FloorplanCanvas({
  elements,
  visibleLayers,
  viewMode,
  selectedElementId,
  onSelectElement,
  onElementMove,
  onElementResize,
  editMode = false,
  className,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Pan state
  const isPanning = useRef(false);
  const didPan = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const mouseDownScreen = useRef({ x: 0, y: 0 });

  // Drag state (element move)
  const draggingElement = useRef<FloorplanElement | null>(null);
  const dragStart = useRef({ x: 0, y: 0, elX: 0, elY: 0 });

  // Resize state
  const resizingHandle = useRef<Handle | null>(null);
  const resizeStart = useRef({ x: 0, y: 0, elX: 0, elY: 0, elW: 0, elH: 0 });

  // ===== Bounding box =====
  const bounds = useMemo(() => {
    const visible = elements.filter((e) => visibleLayers.has(e.layer));
    if (visible.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of visible) {
      let xs: number[], ys: number[];
      if (el.points) {
        try {
          const pts = JSON.parse(el.points) as number[][];
          xs = pts.map((p) => p[0]);
          ys = pts.map((p) => p[1]);
        } catch {
          xs = [el.x, el.x + (el.width ?? 1)];
          ys = [el.y, el.y + (el.height ?? 1)];
        }
      } else {
        const w = el.width ?? 1;
        const h = el.height ?? 1;
        xs = [el.x, el.x + w];
        ys = [el.y, el.y + h];
      }
      minX = Math.min(minX, ...xs);
      minY = Math.min(minY, ...ys);
      maxX = Math.max(maxX, ...xs);
      maxY = Math.max(maxY, ...ys);
    }
    const width = maxX - minX || 100;
    const height = maxY - minY || 100;
    const padding = Math.max(width, height) * 0.05;
    return {
      x: minX - padding,
      y: minY - padding,
      width: width + padding * 2,
      height: height + padding * 2,
      maxY: maxY + padding,
    };
  }, [elements, visibleLayers]);

  // Y-axis flip: DXF Y-up → SVG Y-down
  const flipY = useCallback((y: number): number => {
    return bounds ? bounds.maxY - y : y;
  }, [bounds]);

  // Visible elements (filtered by layer)
  const visibleElements = useMemo(() => {
    return elements.filter((e) => visibleLayers.has(e.layer));
  }, [elements, visibleLayers]);

  // ===== Coordinate conversion: screen → DXF =====
  // Converts a mouse position (screen px) to DXF coordinates.
  const screenToDxf = useCallback((screenX: number, screenY: number): { x: number; y: number } | null => {
    if (!svgRef.current || !bounds) return null;
    const rect = svgRef.current.getBoundingClientRect();
    // SVG viewBox coordinates
    const vbX = bounds.x - (bounds.width / zoom - bounds.width) / 2 + pan.x / zoom;
    const vbY = bounds.y - (bounds.height / zoom - bounds.height) / 2 + pan.y / zoom;
    const vbW = bounds.width / zoom;
    const vbH = bounds.height / zoom;

    // Screen → viewBox (account for preserveAspectRatio="xMidYMid meet")
    const scaleX = vbW / rect.width;
    const scaleY = vbH / rect.height;
    const scale = Math.max(scaleX, scaleY);
    const renderedW = vbW / scale * (rect.width > 0 ? rect.width / rect.width : 1);
    // Actually, preserveAspectRatio="xMidYMid meet" means:
    // The content is scaled to fit within the viewport, centered.
    const contentScale = Math.min(rect.width / vbW, rect.height / vbH);
    const renderedWidth = vbW * contentScale;
    const renderedHeight = vbH * contentScale;
    const offsetX = (rect.width - renderedWidth) / 2;
    const offsetY = (rect.height - renderedHeight) / 2;

    // Screen → SVG viewBox coords
    const svgX = vbX + ((screenX - rect.left - offsetX) / contentScale);
    const svgY = vbY + ((screenY - rect.top - offsetY) / contentScale);

    // SVG Y → DXF Y (un-flip)
    return { x: svgX, y: bounds.maxY - svgY };
  }, [bounds, zoom, pan]);

  // ===== ViewBox =====
  const viewBox = useMemo(() => {
    if (!bounds) return "0 0 100 100";
    const zw = bounds.width / zoom;
    const zh = bounds.height / zoom;
    const vx = bounds.x - (zw - bounds.width) / 2 + pan.x / zoom;
    const vy = bounds.y - (zh - bounds.height) / 2 + pan.y / zoom;
    return `${vx} ${vy} ${zw} ${zh}`;
  }, [bounds, zoom, pan]);

  // ===== Zoom to cursor =====
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (!bounds || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    // Current cursor position in DXF coords (before zoom)
    const before = screenToDxf(e.clientX, e.clientY);
    if (!before) return;

    // Apply zoom
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(20, zoom * delta));

    // After zoom, we need to adjust pan so the cursor stays at the same DXF point
    // viewBox center moves; we compensate by adjusting pan
    setZoom(newZoom);

    // Calculate where the cursor would be in DXF coords after zoom (without pan adjustment)
    // and adjust pan to keep cursor at the same DXF point
    // This is done in the next render via useEffect
    requestAnimationFrame(() => {
      const after = screenToDxf(e.clientX, e.clientY);
      if (!after || !before) return;
      // The difference in DXF coords is how much we need to pan
      const dx = (after.x - before.x) * newZoom;
      const dy = (after.y - before.y) * newZoom;
      setPan((p) => ({ x: p.x - dx, y: p.y + dy })); // +dy because Y is flipped
    });
  }, [zoom, bounds, screenToDxf]);

  // ===== Pan handlers =====
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Don't start panning if we're dragging an element or resizing
    if (draggingElement.current || resizingHandle.current) return;

    isPanning.current = true;
    didPan.current = false;
    mouseDownScreen.current = { x: e.clientX, y: e.clientY };
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Handle element drag
    if (draggingElement.current) {
      const dxf = screenToDxf(e.clientX, e.clientY);
      if (!dxf) return;
      const newX = dragStart.current.elX + (dxf.x - dragStart.current.x);
      const newY = dragStart.current.elY + (dxf.y - dragStart.current.y);
      // Update visual position (local state will be updated by parent)
      onElementMove?.(draggingElement.current.id, newX, newY);
      return;
    }

    // Handle resize
    if (resizingHandle.current) {
      const dxf = screenToDxf(e.clientX, e.clientY);
      if (!dxf) return;
      const handle = resizingHandle.current;
      const start = resizeStart.current;
      let newX = start.elX;
      let newY = start.elY;
      let newW = start.elW;
      let newH = start.elH;

      const dx = dxf.x - start.x;
      const dy = dxf.y - start.y;

      if (handle.includes("e")) newW = Math.max(1, start.elW + dx);
      if (handle.includes("w")) { newW = Math.max(1, start.elW - dx); newX = start.elX + dx; }
      if (handle.includes("s")) newH = Math.max(1, start.elH + dy);
      if (handle.includes("n")) { newH = Math.max(1, start.elH - dy); newY = start.elY + dy; }

      onElementResize?.(draggingElement.current?.id ?? "", newX, newY, newW, newH);
      return;
    }

    // Handle pan
    if (!isPanning.current) return;
    const SENSITIVITY = 1.5;
    const newX = (e.clientX - panStart.current.x) * SENSITIVITY;
    const newY = (e.clientY - panStart.current.y) * SENSITIVITY;
    const movedX = Math.abs(e.clientX - mouseDownScreen.current.x);
    const movedY = Math.abs(e.clientY - mouseDownScreen.current.y);
    if (movedX > 3 || movedY > 3) {
      didPan.current = true;
    }
    setPan({ x: newX, y: newY });
  }, [pan, screenToDxf, onElementMove, onElementResize]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    // If we were dragging an element, stop
    if (draggingElement.current) {
      draggingElement.current = null;
      return;
    }
    // If we were resizing, stop
    if (resizingHandle.current) {
      resizingHandle.current = null;
      return;
    }
    // If we were panning, stop and maybe deselect
    isPanning.current = false;
    if (!didPan.current) {
      // Click on empty space → deselect (only if target is SVG itself)
      if (e.target === e.currentTarget) {
        onSelectElement?.(null);
      }
    }
  }, [onSelectElement]);

  const handleMouseLeave = useCallback(() => {
    isPanning.current = false;
    draggingElement.current = null;
    resizingHandle.current = null;
  }, []);

  // ===== Status color =====
  const getStatusColor = useCallback((el: FloorplanElement): string => {
    const links = el.budgetItemLinks;
    if (!links || links.length === 0) return "muted";
    const hasRejected = links.some((l) => l.budgetItem?.rejected);
    const allCompleted = links.every((l) => l.budgetItem?.completed);
    if (hasRejected) return "danger";
    if (allCompleted) return "success";
    return "warning";
  }, []);

  // ===== Color mapping =====
  const fillMap: Record<string, string> = {
    muted: "#9ca3af", warning: "#f59e0b", info: "#3b82f6",
    "info-soft": "#60a5fa", "warning-soft": "#fbbf24",
    "muted-foreground": "#6b7280", success: "#22c55e",
    background: "#e5e7eb", danger: "#ef4444",
  };

  // ===== Start element drag =====
  const startElementDrag = useCallback((e: React.MouseEvent, el: FloorplanElement) => {
    if (!editMode) return;
    e.stopPropagation();
    draggingElement.current = el;
    const dxf = screenToDxf(e.clientX, e.clientY);
    dragStart.current = {
      x: dxf?.x ?? 0,
      y: dxf?.y ?? 0,
      elX: el.x,
      elY: el.y,
    };
  }, [editMode, screenToDxf]);

  // ===== Start resize =====
  const startResize = useCallback((e: React.MouseEvent, el: FloorplanElement, handle: Handle) => {
    if (!editMode) return;
    e.stopPropagation();
    resizingHandle.current = handle;
    draggingElement.current = el; // reuse for ID tracking
    const dxf = screenToDxf(e.clientX, e.clientY);
    resizeStart.current = {
      x: dxf?.x ?? 0,
      y: dxf?.y ?? 0,
      elX: el.x,
      elY: el.y,
      elW: el.width ?? 1,
      elH: el.height ?? 1,
    };
  }, [editMode, screenToDxf]);

  // ===== Element select handler =====
  const handleSelect = useCallback((e: React.MouseEvent, el: FloorplanElement) => {
    e.stopPropagation();
    if (!didPan.current && !draggingElement.current && !resizingHandle.current) {
      onSelectElement?.(el.id);
    }
  }, [onSelectElement]);

  // ===== Render element =====
  const renderElement = useCallback((el: FloorplanElement) => {
    const layerMeta = LAYER_META[el.layer as FloorplanLayer];
    let fillColor: string;
    if (viewMode === "status") {
      fillColor = getStatusColor(el);
    } else {
      const raw = layerMeta?.color?.replace("bg-", "") || "muted";
      fillColor = raw === "background" ? "muted" : raw;
    }
    const isSelected = el.id === selectedElementId;
    const color = fillMap[fillColor] || "#9ca3af";
    const strokeColor = isSelected ? "#2563eb" : color;
    const strokeWidth = (isSelected ? 3 : 2) * (bounds ? bounds.width / 1000 : 1);
    const hitWidth = strokeWidth + (bounds ? bounds.width / 200 : 5);

    const commonProps = {
      key: el.id,
      className: cn("cursor-pointer", editMode && "cursor-move"),
      onMouseDown: editMode ? (e: React.MouseEvent) => startElementDrag(e, el) : undefined,
      onMouseUp: (e: React.MouseEvent) => handleSelect(e, el),
    };

    // Render based on element type / points
    if (el.points) {
      try {
        const pts = JSON.parse(el.points) as number[][];
        if (pts.length === 2) {
          return (
            <g {...commonProps}>
              <line
                x1={pts[0][0]} y1={flipY(pts[0][1])}
                x2={pts[1][0]} y2={flipY(pts[1][1])}
                stroke="transparent" strokeWidth={hitWidth} pointerEvents="stroke"
              />
              <line
                x1={pts[0][0]} y1={flipY(pts[0][1])}
                x2={pts[1][0]} y2={flipY(pts[1][1])}
                stroke={strokeColor} strokeWidth={strokeWidth} pointerEvents="none"
              />
            </g>
          );
        } else if (pts.length >= 3) {
          const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${flipY(p[1])}`).join(" ");
          return (
            <g {...commonProps}>
              <path d={path} fill="none" stroke="transparent" strokeWidth={hitWidth} pointerEvents="stroke" />
              <path d={path} fill={`${color}33`} stroke={strokeColor} strokeWidth={strokeWidth} pointerEvents="none" />
            </g>
          );
        }
      } catch { /* fall through */ }
    }

    // Bounding box rect
    const w = el.width ?? 1;
    const h = el.height ?? 1;
    const rectY = flipY(el.y) - h;

    // Resize handles (only for selected element in edit mode with width/height)
    const showHandles = isSelected && editMode && el.width != null && el.height != null;
    const handleSize = (bounds ? bounds.width / 100 : 10);
    const handles: Handle[] = ["nw", "ne", "sw", "se"];

    return (
      <g {...commonProps}>
        <rect
          x={el.x} y={rectY}
          width={w} height={h}
          fill={`${color}33`} stroke={strokeColor} strokeWidth={strokeWidth}
          rx={el.type === "outlet" || el.type === "light" ? 999 : 0}
        />
        {/* Resize handles */}
        {showHandles && handles.map((h) => {
          const hx = h.includes("w") ? el.x : el.x + w;
          const hy = h.includes("n") ? rectY : rectY + h;
          return (
            <rect
              key={h}
              x={hx - handleSize / 2}
              y={hy - handleSize / 2}
              width={handleSize}
              height={handleSize}
              fill="#2563eb"
              stroke="#ffffff"
              strokeWidth={handleSize / 4}
              className="cursor-nwse-resize"
              onMouseDown={(e) => startResize(e, el, h)}
              pointerEvents="all"
            />
          );
        })}
      </g>
    );
  }, [viewMode, selectedElementId, editMode, bounds, flipY, getStatusColor, startElementDrag, startResize, handleSelect]);

  // ===== Empty state =====
  if (!bounds) {
    return (
      <div className={cn("flex items-center justify-center bg-surface-container-low rounded-lg border border-outline-variant", className)}>
        <p className="type-body text-on-surface-variant py-12">
          Žádné prvky k zobrazení. Nahrajte DXF soubor pro začátek.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest", className)}>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="w-full h-full"
        style={{ cursor: editMode ? "default" : "grab" }}
        data-panning={isPanning.current ? "true" : undefined}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Background grid (subtle) */}
        {bounds && (
          <defs>
            <pattern id="floorplan-grid" width={50} height={50} patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e5e7eb" strokeWidth={0.5} />
            </pattern>
          </defs>
        )}
        {bounds && (
          <rect
            x={bounds.x} y={bounds.y}
            width={bounds.width} height={bounds.height}
            fill="url(#floorplan-grid)"
            pointerEvents="none"
          />
        )}

        {/* Elements by layer */}
        {visibleElements
          .sort((a, b) => {
            const order = ["structural", "electrical", "data", "plumbing", "gas", "drainage", "terrain", "annotation"];
            return order.indexOf(a.layer) - order.indexOf(b.layer);
          })
          .map(renderElement)}
      </svg>

      {/* Zoom controls — MD3 FAB style */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        <button
          onClick={() => setZoom((z) => Math.min(20, z * 1.2))}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-highest shadow-md border border-outline-variant hover:bg-surface-container-high transition-colors"
          aria-label="Přiblížit"
        >
          <span className="text-lg leading-none">+</span>
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.1, z * 0.8))}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-highest shadow-md border border-outline-variant hover:bg-surface-container-high transition-colors"
          aria-label="Oddálit"
        >
          <span className="text-lg leading-none">−</span>
        </button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-highest shadow-md border border-outline-variant hover:bg-surface-container-high transition-colors"
          aria-label="Resetovat pohled"
        >
          <span className="text-xs">⟲</span>
        </button>
      </div>

      {/* Zoom indicator */}
      <div className="absolute top-2 left-2 rounded-md bg-surface-container-highest/90 px-2 py-1 type-label-sm text-on-surface-variant tabular-nums shadow-sm">
        {Math.round(zoom * 100)}%
      </div>

      {/* Edit mode indicator */}
      {editMode && (
        <div className="absolute top-2 right-2 rounded-md bg-warning-soft/90 px-2 py-1 type-label-sm text-warning-strong shadow-sm flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-warning animate-pulse" />
          Edit mode
        </div>
      )}
    </div>
  );
}
