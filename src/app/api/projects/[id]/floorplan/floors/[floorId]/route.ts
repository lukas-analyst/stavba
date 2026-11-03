import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

// DELETE /api/projects/[id]/floorplan/floors/[floorId]
// Delete a floor and all its elements + sources.
// Double-opt-in: ?confirm=true required.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; floorId: string }> },
) {
  const { id: projectId, floorId } = await params;
  const access = await requireProjectAccess(projectId, "owner");
  if (!access.ok) return access.response;

  try {
    const { searchParams } = new URL(request.url);
    const confirm = searchParams.get("confirm") === "true";

    const floor = await db.floorplanFloor.findFirst({
      where: { id: floorId, projectId },
      include: {
        _count: { select: { elements: true, sources: true } },
      },
    });

    if (!floor) {
      return NextResponse.json({ error: "Floor not found" }, { status: 404 });
    }

    if (!confirm) {
      return NextResponse.json({
        requiresConfirmation: true,
        floor: {
          id: floor.id,
          name: floor.name,
          viewType: floor.viewType,
          elementsCount: floor._count.elements,
          sourcesCount: floor._count.sources,
        },
      });
    }

    // Cascade delete will handle elements + sources
    await db.floorplanFloor.delete({ where: { id: floorId } });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("DELETE floor error:", error);
    return NextResponse.json({ error: "Failed to delete floor" }, { status: 500 });
  }
}

// PATCH /api/projects/[id]/floorplan/floors/[floorId]
// Rename or reorder a floor.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; floorId: string }> },
) {
  const { id: projectId, floorId } = await params;
  const access = await requireProjectAccess(projectId, "owner");
  if (!access.ok) return access.response;

  try {
    const body = await request.json();
    const { name, level, sortOrder } = body as {
      name?: string;
      level?: number;
      sortOrder?: number;
    };

    const floor = await db.floorplanFloor.findFirst({
      where: { id: floorId, projectId },
      select: { id: true },
    });
    if (!floor) {
      return NextResponse.json({ error: "Floor not found" }, { status: 404 });
    }

    const updated = await db.floorplanFloor.update({
      where: { id: floorId },
      data: {
        ...(name !== undefined && { name }),
        ...(level !== undefined && { level }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH floor error:", error);
    return NextResponse.json({ error: "Failed to update floor" }, { status: 500 });
  }
}
