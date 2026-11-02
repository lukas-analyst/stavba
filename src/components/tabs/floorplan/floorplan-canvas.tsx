"use client";

import { useMemo, useState, useRef, useCallback } from "react";
import type { FloorplanElement, FloorplanLayer } from "@/lib/floorplan/types";
import { LAYER_META } from "@/lib/floorplan/layer-mapping";
import { cn } from "@/lib/utils";

// ============================================================
// FloorplanCanvas — SVG renderer for floorplan elements
// ============================================================
// Renders DXF-imported elements as SVG. Supports:
//   - Zoom / pan via viewBox
//   - Layer filtering (show/hide layers)
//   - Click to select element
//   - View mode: "geometry" (raw) or "status" (colored by BudgetItem state)
// ============================================================

type Props = {
  elements: FloorplanElement[];
  visibleLayers: Set<string>;
  viewMode: "geometry" | "status";
  selectedElementId?: string | null;
  onSelectElement?: (elementId: string | null) => void;
  className?: string;
};

export function FloorplanCanvas({
  elements,
  visibleLayers,
  viewMode,
  selectedElementId,
  onSelectElement,
  className,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  // Compute bounding box of all visible elements
  const bounds = useMemo(() => {
    const visible = elements.filter(
      (e) => visibleLayers.has(e.layer) && e.layer !== "annotation" || visibleLayers.has(e.layer),
    );
    if (visible.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of visible) {
      const xs = el.points ? JSON.parse(el.points).map((p: number[]) => p[0]) : [el.x, el.x + (el.width || 0)];
      const ys = el.points ? JSON.parse(el.points).map((p: number[]) => p[1]) : [el.y, el.y + (el.height || 0)];
      minX = Math.min(minX, ...xs);
      minY = Math.min(minY, ...ys);
      maxX = Math.max(maxX, ...xs);
      maxY = Math.max(maxY, ...ys);
    }
    const padding = 20;
    return {
      x: minX - padding,
      y: minY - padding,
      width: (maxX - minX) + padding * 2,
      height: (maxY - minY) + padding * 2,
    };
  }, [elements, visibleLayers]);

  // Filter visible elements
  const visibleElements = useMemo(() => {
    return elements.filter((e) => visibleLayers.has(e.layer));
  }, [elements, visibleLayers]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // Zoom with wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.1, Math.min(10, z * delta)));
  }, []);

  // Status color for "status" view mode — declared before renderElement
  // useCallback so it's available in the closure.
  const getStatusColor = useCallback((el: FloorplanElement): string => {
    const links = el.budgetItemLinks;
    if (!links || links.length === 0) return "muted";
    const hasRejected = links.some((l) => l.budgetItem?.rejected);
    const allCompleted = links.every((l) => l.budgetItem?.completed);
    if (hasRejected) return "danger";
    if (allCompleted) return "success";
    return "warning";
  }, []);

  // Render element to SVG shape
  const renderElement = useCallback((el: FloorplanElement) => {
    const layerMeta = LAYER_META[el.layer as FloorplanLayer];
    const fillColor = viewMode === "status"
      ? getStatusColor(el)
      : layerMeta?.color?.replace("bg-", "") || "muted";
    const isSelected = el.id === selectedElementId;

    // Map tailwind bg-* to fill color (simplified for SVG)
    const fillMap: Record<string, string> = {
      "muted": "#9ca3af",
      "warning": "#f59e0b",
      "info": "#3b82f6",
      "info-soft": "#60a5fa",
      "warning-soft": "#fbbf24",
      "muted-foreground": "#6b7280",
      "success": "#22c55e",
      "background": "#ffffff",
    };
    const color = fillMap[fillColor] || "#9ca3af";
    const strokeColor = isSelected ? "#2563eb" : color;
    const strokeWidth = isSelected ? 2 : 1;

    // Render based on element type / points
    if (el.points) {
      try {
        const pts = JSON.parse(el.points) as number[][];
        if (pts.length === 2) {
          // Line
          return (
            <line
              key={el.id}
              x1={pts[0][0]} y1={pts[0][1]}
              x2={pts[1][0]} y2={pts[1][1]}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              onClick={(e) => { e.stopPropagation(); onSelectElement?.(el.id); }}
              className="cursor-pointer"
            />
          );
        } else if (pts.length >= 3) {
          // Polyline / polygon
          const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
          const isClosed = pts.length >= 3;
          return (
            <path
              key={el.id}
              d={path}
              fill={isClosed ? `${color}33` : "none"}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              onClick={(e) => { e.stopPropagation(); onSelectElement?.(el.id); }}
              className="cursor-pointer"
            />
          );
        }
      } catch {
        // fall through to bounding box
      }
    }

    // Fallback: render as bounding box rectangle
    if (el.width != null && el.height != null) {
      return (
        <rect
          key={el.id}
          x={el.x} y={el.y}
          width={el.width} height={el.height}
          fill={`${color}33`}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          rx={el.type === "outlet" || el.type === "light" ? 999 : 0}
          onClick={(e) => { e.stopPropagation(); onSelectElement?.(el.id); }}
          className="cursor-pointer"
        />
      );
    }

    // Point or unknown — render as circle
    return (
      <circle
        key={el.id}
        cx={el.x} cy={el.y}
        r={2}
        fill={strokeColor}
        onClick={(e) => { e.stopPropagation(); onSelectElement?.(el.id); }}
        className="cursor-pointer"
      />
    );
  }, [viewMode, selectedElementId, onSelectElement, getStatusColor]);

  if (!bounds) {
    return (
      <div className={cn("flex items-center justify-center bg-surface-container-low rounded-lg border border-outline-variant", className)}>
        <p className="type-body text-on-surface-variant py-12">
          Žádné prvky k zobrazení. Nahrajte DXF soubor pro začátek.
        </p>
      </div>
    );
  }

  const viewBox = `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`;

  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-outline-variant bg-background", className)}>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        style={{
          transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
          transformOrigin: "center",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={() => onSelectElement?.(null)}
      >
        {/* Render elements by layer (structural first, annotations last) */}
        {visibleElements
          .sort((a, b) => {
            const order = ["structural", "electrical", "data", "plumbing", "gas", "drainage", "terrain", "annotation"];
            return order.indexOf(a.layer) - order.indexOf(b.layer);
          })
          .map(renderElement)}
      </svg>

      {/* Zoom controls */}
      <div className="absolute bottom-2 right-2 flex flex-col gap-1">
        <button
          onClick={() => setZoom((z) => Math.min(10, z * 1.2))}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-background border border-outline-variant shadow-sm hover:bg-surface-container-high"
          aria-label="Zoom in"
        >
          <span className="text-lg">+</span>
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.1, z * 0.8))}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-background border border-outline-variant shadow-sm hover:bg-surface-container-high"
          aria-label="Zoom out"
        >
          <span className="text-lg">−</span>
        </button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-background border border-outline-variant shadow-sm hover:bg-surface-container-high"
          aria-label="Reset view"
        >
          <span className="text-xs">⟲</span>
        </button>
      </div>

      {/* Zoom indicator */}
      <div className="absolute top-2 left-2 rounded-md bg-background/80 px-2 py-1 type-label-sm text-on-surface-variant tabular-nums">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}
