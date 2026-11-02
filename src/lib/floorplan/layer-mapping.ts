// ============================================================
// Floorplan module — DXF layer mapping
// ============================================================
// Default mapping from DXF layer names to our floorplan layer
// categories + element types. Users can override this per-project
// via the layer-mappings API.
//
// These follow common architectural CAD conventions (AIA Layer
// Naming Guidelines). Czech architects may use different names
// (e.g. "ZDIV" instead of "A-WALL") — the user can remap during
// or after import.
// ============================================================

import type { FloorplanLayer, FloorplanElementType } from "./types";

export type LayerMappingEntry = {
  layer: FloorplanLayer;
  type: FloorplanElementType | string;
};

export type LayerMapping = Record<string, LayerMappingEntry>;

// Default DXF → floorplan layer mapping.
// Keys are DXF layer names (case-insensitive match at import time).
export const DEFAULT_LAYER_MAPPING: LayerMapping = {
  // === Structural ===
  "A-WALL": { layer: "structural", type: "wall" },
  "A-DOOR": { layer: "structural", type: "door" },
  "A-WIND": { layer: "structural", type: "window" },
  "A-FLOR": { layer: "structural", type: "floor" },
  "A-ROOF": { layer: "structural", type: "roof" },
  "A-STAIR": { layer: "structural", type: "stairs" },
  "A-CLNG": { layer: "structural", type: "ceiling" },
  "A-ROOM": { layer: "structural", type: "room" },
  "A-COLS": { layer: "structural", type: "column" },
  "A-CHIM": { layer: "structural", type: "chimney" },

  // === Electrical ===
  "E-LITE": { layer: "electrical", type: "light" },
  "E-POWR": { layer: "electrical", type: "outlet" },
  "E-SWCH": { layer: "electrical", type: "switch" },
  "E-CABL": { layer: "electrical", type: "cable" },

  // === Data / Smart home ===
  "E-DATA": { layer: "data", type: "cable" },
  "E-SENS": { layer: "data", type: "sensor" },

  // === Plumbing (water) ===
  "P-COLD": { layer: "plumbing", type: "pipe" },
  "P-HOT": { layer: "plumbing", type: "pipe" },

  // === Gas ===
  "P-GAS": { layer: "gas", type: "pipe" },

  // === Drainage ===
  "P-DRAIN": { layer: "drainage", type: "drain" },

  // === Terrain / exterior ===
  "Q-BOUND": { layer: "terrain", type: "fence" },
  "Q-PATH": { layer: "terrain", type: "annotation" },
  "Q-TREE": { layer: "terrain", type: "tree" },
};

// Default fallback for unmapped DXF layers.
// IMPORTANT: Most DXF files (especially from Czech architects) do NOT use
// AIA naming conventions (A-WALL, E-LITE, ...). They use generic layer
// names like "0", "Hladina 1", "Zdivo", "Stěny", etc. We default unmapped
// layers to "structural" (not "annotation") because the vast majority of
// DXF entities are walls, doors, windows, etc. — not text annotations.
// TEXT/MTEXT entities are explicitly mapped to "annotation" in dxf-parser.ts.
export const DEFAULT_UNMAPPED_LAYER: LayerMappingEntry = {
  layer: "structural",
  type: "wall",
};

// Layer display metadata — colors and labels for the UI
export const LAYER_META: Record<
  FloorplanLayer,
  { labelKey: string; color: string; defaultVisible: boolean }
> = {
  structural: { labelKey: "floorplan.layers.structural", color: "bg-muted", defaultVisible: true },
  electrical: { labelKey: "floorplan.layers.electrical", color: "bg-warning", defaultVisible: true },
  data: { labelKey: "floorplan.layers.data", color: "bg-info", defaultVisible: false },
  plumbing: { labelKey: "floorplan.layers.plumbing", color: "bg-info-soft", defaultVisible: false },
  gas: { labelKey: "floorplan.layers.gas", color: "bg-warning-soft", defaultVisible: false },
  drainage: { labelKey: "floorplan.layers.drainage", color: "bg-muted-foreground", defaultVisible: false },
  terrain: { labelKey: "floorplan.layers.terrain", color: "bg-success", defaultVisible: false },
  annotation: { labelKey: "floorplan.layers.annotation", color: "bg-background", defaultVisible: true },
};

// Resolve a DXF layer name to our floorplan layer + type.
// Case-insensitive. Falls back to DEFAULT_UNMAPPED_LAYER if not found.
export function resolveDxfLayer(
  dxfLayerName: string,
  userMapping?: LayerMapping,
): LayerMappingEntry {
  // Check user mapping first (case-insensitive)
  if (userMapping) {
    const userEntry = Object.entries(userMapping).find(
      ([key]) => key.toLowerCase() === dxfLayerName.toLowerCase(),
    );
    if (userEntry) return userEntry[1];
  }
  // Check default mapping (case-insensitive)
  const defaultEntry = Object.entries(DEFAULT_LAYER_MAPPING).find(
    ([key]) => key.toLowerCase() === dxfLayerName.toLowerCase(),
  );
  if (defaultEntry) return defaultEntry[1];
  // Fallback
  return DEFAULT_UNMAPPED_LAYER;
}
