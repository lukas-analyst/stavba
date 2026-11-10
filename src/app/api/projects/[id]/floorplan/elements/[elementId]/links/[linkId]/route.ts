import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

// DELETE /api/projects/[id]/floorplan/elements/[elementId]/links/[linkId]
// Remove a link between a floorplan element and a BudgetItem.
//
// Query: ?confirm=true (double-opt-in)
//
// Response 200 (without confirm):
//   { requiresConfirmation: true, link: { ... } }
// Response 200 (with confirm=true):
//   { deleted: true }
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; elementId: string; linkId: string }> },
) {
  const { id: projectId, elementId, linkId } = await params;
  const access = await requireProjectAccess(projectId, "owner");
  if (!access.ok) return access.response;

  try {
    const { searchParams } = new URL(request.url);
    const confirm = searchParams.get("confirm") === "true";

    // Find the link — verify it belongs to an element in this project
    const link = await db.floorplanElementBudgetItem.findFirst({
      where: {
        id: linkId,
        elementId,
        element: { projectId },
      },
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
    });

    if (!link) {
      return NextResponse.json(
        { error: "Link not found" },
        { status: 404 },
      );
    }

    // Double-opt-in: first call returns confirmation request
    if (!confirm) {
      return NextResponse.json({
        requiresConfirmation: true,
        link: {
          id: link.id,
          role: link.role,
          budgetItem: link.budgetItem,
        },
      });
    }

    // Confirmed — delete the link
    await db.floorplanElementBudgetItem.delete({
      where: { id: linkId },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("DELETE /floorplan/links error:", error);
    return NextResponse.json(
      { error: "Failed to delete link" },
      { status: 500 },
    );
  }
}
