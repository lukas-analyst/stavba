import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/authz";
import { parseDxfContent } from "@/lib/floorplan/dxf-parser";
import { DEFAULT_LAYER_MAPPING } from "@/lib/floorplan/layer-mapping";
import type { FloorplanViewType } from "@/lib/floorplan/types";

export const dynamic = "force-dynamic";

// POST /api/projects/[id]/floorplan/import
// Upload + parse DXF file, create FloorplanFloor + FloorplanElement[].
//
// Body: multipart/form-data
//   - file: .dxf soubor (binary, text)
//   - floorId?: String (existující floor, kam importovat)
//   - floorName?: String (pokud vytváříme nové patro)
//   - floorLevel?: Int
//   - viewType?: "plan" | "elevation" (default "plan")
//   - layerMappings?: JSON (override default mapping)
//
// Response 201: { floorId, sourceId, elementCount, layers, unmappedLayers }
// Response 400: { error: "Invalid DXF file" }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId, "owner");
  if (!access.ok) return access.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }

    const fileName = file.name;
    if (!fileName.toLowerCase().endsWith(".dxf")) {
      return NextResponse.json(
        { error: "File must be a .dxf file" },
        { status: 400 },
      );
    }

    // Read DXF content as text
    const dxfText = await file.text();

    // Parse DXF
    const parsed = parseDxfContent(dxfText);
    if (!parsed) {
      return NextResponse.json(
        { error: "Failed to parse DXF file" },
        { status: 400 },
      );
    }

    // Determine floor
    let floorId = formData.get("floorId") as string | null;
    const floorName = (formData.get("floorName") as string | null) || fileName.replace(/\.dxf$/i, "");
    const floorLevel = parseInt((formData.get("floorLevel") as string) || "0", 10);
    const viewType = ((formData.get("viewType") as string) || "plan") as FloorplanViewType;

    // Create floor if not provided
    if (!floorId) {
      const floor = await db.floorplanFloor.create({
        data: {
          projectId,
          name: floorName,
          level: floorLevel,
          viewType,
        },
      });
      floorId = floor.id;
    }

    // Upload DXF file to Vercel Blob
    const blobPath = `pudorys/${projectId}/${Date.now()}-${fileName}`;
    let blobUrl = "";
    let fileSize = 0;
    try {
      const blob = await put(blobPath, file, {
        access: "public",
        contentType: "application/dxf",
      });
      blobUrl = blob.url;
      fileSize = file.size;
    } catch (blobErr) {
      console.error("[floorplan/import] Blob upload failed:", blobErr);
      // Continue without blob — store elements but no backup file
      blobUrl = "";
      fileSize = file.size;
    }

    // Create FloorplanSource record
    const source = await db.floorplanSource.create({
      data: {
        projectId,
        floorId,
        fileName,
        blobUrl,
        fileSize,
        layerMappings: JSON.stringify(DEFAULT_LAYER_MAPPING),
        entityCount: parsed.entities.length,
      },
    });

    // Create FloorplanElement records (batch)
    if (parsed.entities.length > 0) {
      const elementData = parsed.entities.map((e, idx) => ({
        floorId: floorId!,
        projectId,
        parentId: null,
        type: e.type,
        layer: e.layer,
        x: e.x,
        y: e.y,
        width: e.width,
        height: e.height,
        rotation: e.rotation,
        points: e.points ? JSON.stringify(e.points) : null,
        source: "dxf" as const,
        dxfHandle: e.dxfHandle,
        dxfLayer: e.dxfLayer,
        metadata: e.metadata ? JSON.stringify(e.metadata) : null,
        sortOrder: idx,
      }));

      // Prisma createMany for batch insert
      await db.floorplanElement.createMany({
        data: elementData,
      });
    }

    return NextResponse.json({
      floorId,
      sourceId: source.id,
      elementCount: parsed.entities.length,
      layers: parsed.layers,
      unmappedLayers: parsed.unmappedLayers,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /floorplan/import error:", error);
    return NextResponse.json(
      { error: "Failed to import DXF file" },
      { status: 500 },
    );
  }
}
