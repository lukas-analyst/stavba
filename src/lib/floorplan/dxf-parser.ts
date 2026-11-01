// ============================================================
// Floorplan module — DXF parser wrapper
// ============================================================
// Wraps the dxf-parser library and converts DXF entities into
// FloorplanElement records. Handles layer mapping (DXF layer name
// → our floorplan layer + element type).
// ============================================================

import { DxfParser, type IEntity } from "dxf-parser";
import { resolveDxfLayer, type LayerMapping } from "./layer-mapping";
import type { FloorplanElementType, FloorplanLayer } from "./types";

// Type for the parsed DXF output
export type ParsedDxf = {
  entities: ParsedEntity[];
  layers: string[];
  unmappedLayers: string[];
};

export type ParsedEntity = {
  type: string;
  layer: string;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  rotation: number;
  points: number[][] | null;
  dxfHandle: string | null;
  dxfLayer: string;
  metadata: Record<string, unknown> | null;
};

// Parse a DXF file (string) and convert entities to FloorplanElement-like
// objects. Returns the parsed entities + layer info for the UI.
export function parseDxfContent(
  dxfContent: string,
  userMapping?: LayerMapping,
): ParsedDxf | null {
  const parser = new DxfParser();
  let dxf;
  try {
    dxf = parser.parseSync(dxfContent);
  } catch (err) {
    console.error("[dxf-parser] Parse error:", err);
    return null;
  }

  if (!dxf || !dxf.entities || dxf.entities.length === 0) {
    return { entities: [], layers: [], unmappedLayers: [] };
  }

  // Collect all unique DXF layer names
  const dxfLayerSet = new Set<string>();
  for (const entity of dxf.entities) {
    if (entity.layer) dxfLayerSet.add(entity.layer);
  }
  const dxfLayers = Array.from(dxfLayerSet).sort();

  // Determine which layers have no mapping
  const unmappedLayers = dxfLayers.filter(
    (l) => !resolveDxfLayer(l, userMapping) || resolveDxfLayer(l, userMapping).type === "annotation",
  );

  // Convert each DXF entity to our FloorplanElement shape
  const parsedEntities: ParsedEntity[] = dxf.entities
    .map((entity) => convertEntity(entity, userMapping))
    .filter((e): e is ParsedEntity => e !== null);

  return {
    entities: parsedEntities,
    layers: dxfLayers,
    unmappedLayers,
  };
}

// Convert a single DXF entity to our ParsedEntity format.
function convertEntity(
  entity: IEntity,
  userMapping?: LayerMapping,
): ParsedEntity | null {
  const dxfLayerName = entity.layer || "0";
  const mapped = resolveDxfLayer(dxfLayerName, userMapping);

  const base = {
    type: mapped.type as string,
    layer: mapped.layer as string,
    dxfHandle: (entity as { handle?: string }).handle ?? null,
    dxfLayer: dxfLayerName,
    rotation: 0,
    metadata: null as Record<string, unknown> | null,
  };

  switch (entity.type) {
    case "LINE": {
      const line = entity as unknown as {
        vertices: { x: number; y: number; z: number }[];
      };
      if (!line.vertices || line.vertices.length < 2) return null;
      const start = line.vertices[0];
      const end = line.vertices[1];
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const width = Math.abs(end.x - start.x);
      const height = Math.abs(end.y - start.y);
      return {
        ...base,
        type: base.type === "annotation" ? "wall" : base.type,
        x, y, width: width || 1, height: height || 1,
        points: [[start.x, start.y], [end.x, end.y]],
      };
    }

    case "CIRCLE": {
      const circle = entity as unknown as {
        center: { x: number; y: number; z: number };
        radius: number;
      };
      if (!circle.center || !circle.radius) return null;
      return {
        ...base,
        type: base.type === "annotation" ? "outlet" : base.type,
        x: circle.center.x - circle.radius,
        y: circle.center.y - circle.radius,
        width: circle.radius * 2,
        height: circle.radius * 2,
        points: null,
        metadata: { radius: circle.radius },
      };
    }

    case "ARC": {
      const arc = entity as unknown as {
        center: { x: number; y: number; z: number };
        radius: number;
        startAngle: number;
        endAngle: number;
      };
      if (!arc.center || !arc.radius) return null;
      return {
        ...base,
        type: base.type === "annotation" ? "outlet" : base.type,
        x: arc.center.x - arc.radius,
        y: arc.center.y - arc.radius,
        width: arc.radius * 2,
        height: arc.radius * 2,
        points: null,
        metadata: {
          center: [arc.center.x, arc.center.y],
          radius: arc.radius,
          startAngle: arc.startAngle,
          endAngle: arc.endAngle,
        },
      };
    }

    case "LWPOLYLINE":
    case "POLYLINE": {
      const poly = entity as unknown as {
        vertices: { x: number; y: number; z: number }[];
      };
      if (!poly.vertices || poly.vertices.length === 0) return null;
      const xs = poly.vertices.map((v) => v.x);
      const ys = poly.vertices.map((v) => v.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      return {
        ...base,
        type: base.type === "annotation" ? "wall" : base.type,
        x: minX, y: minY,
        width: maxX - minX || 1,
        height: maxY - minY || 1,
        points: poly.vertices.map((v) => [v.x, v.y]),
      };
    }

    case "TEXT":
    case "MTEXT": {
      const text = entity as unknown as {
        startPoint: { x: number; y: number; z: number };
        textHeight: number;
        text: string;
        rotation: number;
      };
      if (!text.startPoint) return null;
      return {
        ...base,
        type: "annotation",
        layer: "annotation" as FloorplanLayer,
        x: text.startPoint.x,
        y: text.startPoint.y,
        width: (text.textHeight || 2.5) * (text.text?.length || 1) * 0.6,
        height: text.textHeight || 2.5,
        points: null,
        metadata: { text: text.text || "", textHeight: text.textHeight },
      };
    }

    case "POINT": {
      const point = entity as unknown as {
        position: { x: number; y: number; z: number };
      };
      if (!point.position) return null;
      return {
        ...base,
        type: base.type === "annotation" ? "annotation" : base.type,
        x: point.position.x,
        y: point.position.y,
        width: 1, height: 1,
        points: [[point.position.x, point.position.y]],
      };
    }

    case "INSERT": {
      const insert = entity as unknown as {
        name: string;
        position: { x: number; y: number; z: number };
        xScale: number;
        yScale: number;
        rotation: number;
      };
      if (!insert.position) return null;
      return {
        ...base,
        type: base.type === "annotation" ? "annotation" : base.type,
        x: insert.position.x,
        y: insert.position.y,
        width: null, height: null,
        rotation: insert.rotation || 0,
        points: null,
        metadata: {
          blockName: insert.name,
          xScale: insert.xScale,
          yScale: insert.yScale,
        },
      };
    }

    default:
      // Unknown entity type — skip
      return null;
  }
}
