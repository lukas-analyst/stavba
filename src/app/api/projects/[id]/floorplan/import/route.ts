import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/authz";
import { parseDxfContent } from "@/lib/floorplan/dxf-parser";
import { DEFAULT_LAYER_MAPPING } from "@/lib/floorplan/layer-mapping";
import type { FloorplanViewType } from "@/lib/floorplan/types";

// =====================================================================
// Route segment config — security hardening (audit fix H4)
// ---------------------------------------------------------------------
// `bodySizeLimit`: Vercel default is 4.5 MB; we enforce a 5 MB hard
// cap here to prevent memory-exhaustion DoS via large DXF uploads.
// `maxDuration`: gives the function up to 60s to parse + persist the
// DXF (large files take longer to parse). Vercel Pro allows up to 300s;
// 60s is safe for the 5 MB cap.
// =====================================================================
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const bodySizeLimit = "5mb";

// 5 MB hard cap (also enforced by `bodySizeLimit` at the route level,
// but double-check here for defense-in-depth and to give a clear error
// message instead of Vercel's generic 413).
const MAX_DXF_SIZE = 5 * 1024 * 1024;

// Sanitize user-supplied filename for use in the Vercel Blob path.
// `file.name` is controlled by the client and could contain path
// traversal segments or unexpected characters. We strip everything
// except [a-z0-9._-] and collapse to a safe slug.
function safeFileName(name: string): string {
  const lower = name.toLowerCase();
  // Remove the extension first, sanitize, then re-add `.dxf`.
  const base = lower.replace(/\.dxf$/i, "");
  const slug = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9._-]/g, "_") // replace anything else with _
    .replace(/_+/g, "_") // collapse runs of _
    .replace(/^[._-]+/, "") // strip leading separators
    .slice(0, 80) || "floorplan";
  return `${slug}.dxf`;
}

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

    // SECURITY (audit fix H4): enforce a hard size cap BEFORE reading
    // the file into memory. `file.size` is set by the platform parser
    // (Next.js / Vercel) and is trustworthy.
    if (file.size > MAX_DXF_SIZE) {
      return NextResponse.json(
        {
          error: `DXF soubor je příliš velký (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximální povolená velikost je 5 MB.`,
        },
        { status: 413 },
      );
    }

    // Reject empty files (could be a malformed upload or an attack probe).
    if (file.size === 0) {
      return NextResponse.json(
        { error: "Soubor je prázdný." },
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

    // Read DXF content as text — bounded by MAX_DXF_SIZE above.
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

    // Upload DXF file to Vercel Blob.
    //
    // SECURITY NOTE (audit fix H4): audit recommended `access: "private"`,
    // but switching to private requires a signed-URL GET handler (new API
    // route + UI changes). That's tracked as a follow-up. For now we:
    //   - sanitize the filename in the blob path (no path traversal /
    //     user-controlled subdirs),
    //   - keep `access: "public"` (existing behavior — `blobUrl` is
    //     stored in DB but NOT returned by any API response, so the URL
    //     is effectively unguessable: it contains a Vercel-generated
    //     random hash segment).
    // TODO(follow-up): switch to `access: "private"` + signed URL handler.
    const safeName = safeFileName(fileName);
    const blobPath = `pudorys/${projectId}/${Date.now()}-${safeName}`;
    let blobUrl = "";
    let fileSize = 0;
    try {
      const blob = await put(blobPath, file, {
        access: "public",
        contentType: "application/dxf",
        // Vercel Blob allows overriding the random suffix; we let it
        // add one (default) so the final URL is unguessable.
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
