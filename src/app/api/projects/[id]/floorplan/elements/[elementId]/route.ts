import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

// PATCH /api/projects/[id]/floorplan/elements/[elementId]
// Update element geometry (x, y, width, height) or metadata.
// Used by drag-to-move and resize handles.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; elementId: string }> },
) {
  const { id: projectId, elementId } = await params;
  const access = await requireProjectAccess(projectId, "owner");
  if (!access.ok) return access.response;

  try {
    const body = await request.json();
    const { x, y, width, height, rotation, points, metadata, type, layer } = body as {
      x?: number;
      y?: number;
      width?: number | null;
      height?: number | null;
      rotation?: number;
      points?: string;
      metadata?: string;
      type?: string;
      layer?: string;
    };

    // Verify element belongs to this project
    const element = await db.floorplanElement.findFirst({
      where: { id: elementId, projectId },
      select: { id: true },
    });
    if (!element) {
      return NextResponse.json({ error: "Element not found" }, { status: 404 });
    }

    // Build update data (only provided fields)
    const updateData: Record<string, unknown> = {};
    if (x !== undefined) updateData.x = x;
    if (y !== undefined) updateData.y = y;
    if (width !== undefined) updateData.width = width;
    if (height !== undefined) updateData.height = height;
    if (rotation !== undefined) updateData.rotation = rotation;
    if (points !== undefined) updateData.points = points;
    if (metadata !== undefined) updateData.metadata = metadata;
    if (type !== undefined) updateData.type = type;
    if (layer !== undefined) updateData.layer = layer;

    const updated = await db.floorplanElement.update({
      where: { id: elementId },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH element error:", error);
    return NextResponse.json({ error: "Failed to update element" }, { status: 500 });
  }
}

// DELETE /api/projects/[id]/floorplan/elements/[elementId]
// Delete element with double-opt-in.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; elementId: string }> },
) {
  const { id: projectId, elementId } = await params;
  const access = await requireProjectAccess(projectId, "owner");
  if (!access.ok) return access.response;

  try {
    const { searchParams } = new URL(request.url);
    const confirm = searchParams.get("confirm") === "true";

    const element = await db.floorplanElement.findFirst({
      where: { id: elementId, projectId },
      include: {
        _count: { select: { children: true, budgetItemLinks: true } },
      },
    });

    if (!element) {
      return NextResponse.json({ error: "Element not found" }, { status: 404 });
    }

    if (!confirm) {
      return NextResponse.json({
        requiresConfirmation: true,
        element: {
          id: element.id,
          type: element.type,
          layer: element.layer,
          childrenCount: element._count.children,
          linkedBudgetItemsCount: element._count.budgetItemLinks,
        },
      });
    }

    // Cascade delete will handle children + budgetItemLinks
    await db.floorplanElement.delete({ where: { id: elementId } });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("DELETE element error:", error);
    return NextResponse.json({ error: "Failed to delete element" }, { status: 500 });
  }
}
