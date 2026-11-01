import { NextResponse } from "next/server";
import { dbRead } from "@/lib/db";
import { requireProjectAccess } from "@/lib/authz";
import { DEFAULT_LAYER_MAPPING } from "@/lib/floorplan/layer-mapping";
import type { FloorplanViewType } from "@/lib/floorplan/types";

export const dynamic = "force-dynamic";

// GET /api/projects/[id]/floorplan
// Returns all floorplan data for a project: floors + elements + sources.
//
// Query params:
//   ?viewType=plan|elevation  — filter floors by view type (default: all)
//
// Response 200: { floors, elements, sources, layerMappings }
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId, "viewer");
  if (!access.ok) return access.response;

  try {
    const { searchParams } = new URL(request.url);
    const viewType = searchParams.get("viewType") as FloorplanViewType | null;

    // Build floor query
    const floorWhere: { projectId: string; viewType?: string } = { projectId };
    if (viewType) {
      floorWhere.viewType = viewType;
    }

    // Fetch floors (with element count)
    const floors = await dbRead.floorplanFloor.findMany({
      where: floorWhere,
      orderBy: [{ viewType: "asc" }, { sortOrder: "asc" }, { level: "asc" }],
      include: {
        _count: { select: { elements: true } },
      },
    });

    // Fetch all elements for these floors
    const floorIds = floors.map((f) => f.id);
    const elements = floorIds.length > 0
      ? await dbRead.floorplanElement.findMany({
          where: { floorId: { in: floorIds } },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: {
            budgetItemLinks: {
              include: {
                budgetItem: {
                  select: {
                    id: true,
                    category: true,
                    subcategory: true,
                    phase: true,
                    completed: true,
                    rejected: true,
                  },
                },
              },
            },
          },
        })
      : [];

    // Fetch sources
    const sources = await dbRead.floorplanSource.findMany({
      where: { projectId },
      orderBy: { importedAt: "desc" },
    });

    return NextResponse.json({
      floors,
      elements,
      sources,
      layerMappings: DEFAULT_LAYER_MAPPING,
    });
  } catch (error) {
    console.error("GET /floorplan error:", error);
    return NextResponse.json(
      { error: "Failed to fetch floorplan data" },
      { status: 500 },
    );
  }
}
