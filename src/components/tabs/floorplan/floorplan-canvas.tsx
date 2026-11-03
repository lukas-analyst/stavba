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
      (e) => visibleLayers.has(e.layer),
    );
    if (visible.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of visible) {
      let xs: number[];
      let ys: number[];
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
        // No points — use bounding box
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
    // Handle case where all points are at the same coordinate (degenerate)
    const width = maxX - minX || 100;
    const height = maxY - minY || 100;
    const padding = Math.max(width, height) * 0.05; // 5% padding
    return {
      x: minX - padding,
      y: minY - padding,
      width: width + padding * 2,
      height: height + padding * 2,
      // Store maxY for Y-axis flip (DXF Y-up → SVG Y-down)
      maxY: maxY + padding,
    };
  }, [elements, visibleLayers]);

  // Filter visible elements
  const visibleElements = useMemo(() => {
    return elements.filter((e) => visibleLayers.has(e.layer));
  }, [elements, visibleLayers]);

  // Flip Y coordinate: DXF has Y-up, SVG has Y-down.
  // We flip by: svgY = bounds.maxY - dxfY
  const flipY = useCallback((y: number): number => {
    return bounds.maxY - y;
  }, [bounds]);

  // Pan handlers — track if we actually panned (to avoid deselect on click)
  const didPanRef = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    didPanRef.current = false;
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    // Multiply by 1.5 for higher pan sensitivity (T2 fix from testing)
    const SENSITIVITY = 1.5;
    const newX = (e.clientX - panStart.current.x) * SENSITIVITY;
    const newY = (e.clientY - panStart.current.y) * SENSITIVITY;
    // Mark as panned if movement is more than 3px (avoid micro-jitter)
    if (Math.abs(newX - pan.x) > 3 || Math.abs(newY - pan.y) > 3) {
      didPanRef.current = true;
    }
    setPan({ x: newX, y: newY });
  }, [pan]);

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
    // In "geometry" mode, use the layer color. In "status" mode, use
    // the BudgetItem status color.
    // IMPORTANT: "annotation" layer has color "bg-background" (#ffffff),
    // which is invisible on white canvas. Override to a visible gray.
    let fillColor: string;
    if (viewMode === "status") {
      fillColor = getStatusColor(el);
    } else {
      // Geometry mode — use layer color, but never "background" (invisible)
      const raw = layerMeta?.color?.replace("bg-", "") || "muted";
      fillColor = raw === "background" ? "muted" : raw;
    }
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
      "background": "#e5e7eb", // light gray (not pure white)
      "danger": "#ef4444",
    };
    const color = fillMap[fillColor] || "#9ca3af";
    const strokeColor = isSelected ? "#2563eb" : color;
    // Scale stroke width with bounds — DXF coordinates are in cm (thousands),
    // so a strokeWidth of 1 would be invisible. Use a fraction of bounds.
    const strokeWidth = (isSelected ? 3 : 2) * (bounds.width / 1000);
    // Wider invisible stroke for easier click detection (hit area)
    const hitWidth = strokeWidth + bounds.width / 200;

    // Click handler — stop propagation so SVG onClick (deselect) doesn't fire
    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onSelectElement?.(el.id);
    };

    // Render based on element type / points
    if (el.points) {
      try {
        const pts = JSON.parse(el.points) as number[][];
        if (pts.length === 2) {
          // Line — flip Y coordinates
          return (
            <g key={el.id} className="cursor-pointer" onClick={handleClick}>
              {/* Invisible wide stroke for click hit area */}
              <line
                x1={pts[0][0]} y1={flipY(pts[0][1])}
                x2={pts[1][0]} y2={flipY(pts[1][1])}
                stroke="transparent"
                strokeWidth={hitWidth}
                pointerEvents="stroke"
              />
              {/* Visible line */}
              <line
                x1={pts[0][0]} y1={flipY(pts[0][1])}
                x2={pts[1][0]} y2={flipY(pts[1][1])}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                pointerEvents="none"
              />
            </g>
          );
        } else if (pts.length >= 3) {
          // Polyline / polygon — flip all Y coordinates
          const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${flipY(p[1])}`).join(" ");
          const isClosed = pts.length >= 3;
          return (
            <g key={el.id} className="cursor-pointer" onClick={handleClick}>
              {/* Invisible wide stroke for click hit area */}
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={hitWidth}
                pointerEvents="stroke"
              />
              {/* Visible path */}
              <path
                d={path}
                fill={isClosed ? `${color}33` : "none"}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                pointerEvents="none"
              />
            </g>
          );
        }
      } catch {
        // fall through to bounding box
      }
    }

    // Fallback: render as bounding box rectangle — flip Y
    if (el.width != null && el.height != null) {
      return (
        <g key={el.id} className="cursor-pointer" onClick={handleClick}>
          {/* Visible rect */}
          <rect
            x={el.x} y={flipY(el.y) - el.height}
            width={el.width} height={el.height}
            fill={`${color}33`}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            rx={el.type === "outlet" || el.type === "light" ? 999 : 0}
          />
        </g>
      );
    }

    // Point or unknown — render as circle (flip Y)
    return (
      <g key={el.id} className="cursor-pointer" onClick={handleClick}>
        {/* Invisible wider circle for hit area */}
        <circle
          cx={el.x} cy={flipY(el.y)}
          r={strokeWidth * 2}
          fill="transparent"
          stroke="transparent"
          pointerEvents="all"
        />
        {/* Visible circle */}
        <circle
          cx={el.x} cy={flipY(el.y)}
          r={strokeWidth}
          fill={strokeColor}
          pointerEvents="none"
        />
      </g>
    );
  }, [viewMode, selectedElementId, onSelectElement, getStatusColor, bounds, flipY]);

  if (!bounds) {
    return (
      <div className={cn("flex items-center justify-center bg-surface-container-low rounded-lg border border-outline-variant", className)}>
        <p className="type-body text-on-surface-variant py-12">
          Žádné prvky k zobrazení. Nahrajte DXF soubor pro začátek.
        </p>
      </div>
    );
  }

  // Apply zoom by adjusting viewBox dimensions
  const zoomedWidth = bounds.width / zoom;
  const zoomedHeight = bounds.height / zoom;
  // Center the viewBox (apply pan)
  const viewBoxX = bounds.x - (zoomedWidth - bounds.width) / 2 + pan.x / zoom;
  const viewBoxY = bounds.y - (zoomedHeight - bounds.height) / 2 + pan.y / zoom;
  const viewBox = `${viewBoxX} ${viewBoxY} ${zoomedWidth} ${zoomedHeight}`;

  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-outline-variant bg-background", className)}>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={() => {
          // Only deselect if we didn't just pan (avoid deselect after drag)
          if (!didPanRef.current) {
            onSelectElement?.(null);
          }
        }}
        preserveAspectRatio="xMidYMid meet"
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
