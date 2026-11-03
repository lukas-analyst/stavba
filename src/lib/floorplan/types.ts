// ============================================================
// Floorplan module — TypeScript types
// ============================================================
// Shared types for the floorplan module. Used by API routes,
// React Query hooks, and UI components.
//
// See docs/FLOORPLAN_PLAN.md for the full design document.
// ============================================================

// ===== View types =====
export type FloorplanViewType = "plan" | "elevation";

// ===== Element types =====
export type FloorplanElementType =
  | "wall"
  | "window"
  | "door"
  | "room"
  | "stairs"
  | "chimney"
  | "column"
  | "ceiling"
  | "floor"
  | "roof"
  | "cable"
  | "pipe"
  | "drain"
  | "outlet"
  | "switch"
  | "light"
  | "sensor"
  | "appliance"
  | "tree"
  | "fence"
  | "annotation"
  | "layer"; // material layer (izolace, omítka, fólie — child of wall)

// ===== Layer categories =====
export type FloorplanLayer =
  | "structural"
  | "electrical"
  | "data"
  | "plumbing"
  | "gas"
  | "drainage"
  | "terrain"
  | "annotation";

// ===== BudgetItem link roles =====
export type FloorplanLinkRole = "primary" | "layer" | "appliance" | "connection";

// ===== Source (DXF file origin) =====
export type FloorplanElementSource = "dxf" | "manual";

// ===== API response types =====
export type FloorplanFloor = {
  id: string;
  projectId: string;
  name: string;
  level: number;
  sortOrder: number;
  viewType: FloorplanViewType;
  createdAt: string;
  updatedAt: string;
  _count?: { elements: number };
};

export type FloorplanElement = {
  id: string;
  floorId: string;
  projectId: string;
  parentId: string | null;
  type: FloorplanElementType | string;
  layer: FloorplanLayer | string;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  rotation: number;
  points: string | null;
  source: FloorplanElementSource;
  dxfHandle: string | null;
  dxfLayer: string | null;
  metadata: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  budgetItemLinks?: FloorplanElementBudgetItemLink[];
  children?: FloorplanElement[];
};

export type FloorplanElementBudgetItemLink = {
  id: string;
  elementId: string;
  budgetItemId: string;
  role: FloorplanLinkRole;
  metadata: string | null;
  createdAt: string;
  budgetItem?: {
    id: string;
    category: string;
    subcategory: string | null;
    phase: string;
    completed: boolean;
    rejected: boolean;
  };
};

export type FloorplanSource = {
  id: string;
  projectId: string;
  floorId: string | null;
  fileName: string;
  blobUrl: string;
  fileSize: number;
  importedAt: string;
  importedBy: string | null;
  layerMappings: string | null;
  entityCount: number;
  version: number;
};

export type FloorplanEditLock = {
  id: string;
  projectId: string;
  userId: string;
  acquiredAt: string;
  expiresAt: string;
  user?: {
    id: string;
    name: string | null;
    email: string;
  };
};

export type FloorplanData = {
  floors: FloorplanFloor[];
  elements: FloorplanElement[];
  sources: FloorplanSource[];
  layerMappings: Record<string, { layer: string; type: string }>;
};

// ===== Import types =====
export type FloorplanImportResult = {
  floorId: string;
  sourceId: string;
  elementCount: number;
  layers: string[];
  unmappedLayers: string[];
};
