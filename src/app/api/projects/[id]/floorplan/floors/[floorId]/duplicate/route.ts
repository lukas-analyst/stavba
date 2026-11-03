import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

// POST /api/projects/[id]/floorplan/floors/[floorId]/duplicate
// Duplicate a floor and all its elements (with new IDs).
// The DXF source is NOT duplicated (the new floor references the same source).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; floorId: string }> },
) {
  const { id: projectId, floorId } = await params;
  const access = await requireProjectAccess(projectId, "owner");
  if (!access.ok) return access.response;

  try {
    const original = await db.floorplanFloor.findFirst({
      where: { id: floorId, projectId },
      include: {
        elements: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!original) {
      return NextResponse.json({ error: "Floor not found" }, { status: 404 });
    }

    // Create duplicate floor
    const duplicate = await db.floorplanFloor.create({
      data: {
        projectId,
        name: `${original.name} (kopie)`,
        level: original.level,
        sortOrder: original.sortOrder + 1,
        viewType: original.viewType,
      },
    });

    // Duplicate elements (top-level only — children cascade via parentId)
    if (original.elements.length > 0) {
      const topLevel = original.elements.filter((e) => e.parentId === null);
      for (const el of topLevel) {
        await db.floorplanElement.create({
          data: {
            floorId: duplicate.id,
            projectId,
            parentId: null,
            type: el.type,
            layer: el.layer,
            x: el.x,
            y: el.y,
            width: el.width,
            height: el.height,
            rotation: el.rotation,
            points: el.points,
            source: el.source,
            dxfHandle: el.dxfHandle,
            dxfLayer: el.dxfLayer,
            metadata: el.metadata,
            sortOrder: el.sortOrder,
          },
        });
      }
    }

    return NextResponse.json({
      id: duplicate.id,
      name: duplicate.name,
      viewType: duplicate.viewType,
    }, { status: 201 });
  } catch (error) {
    console.error("POST duplicate floor error:", error);
    return NextResponse.json({ error: "Failed to duplicate floor" }, { status: 500 });
  }
}
