import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH /api/projects/[id]/reorder
// Body: { items: [{ id, sortOrder }], categoryOrder?: string[] (JSON-serializable) }
// Updates sortOrder of items and optionally the category order stored on the project.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { items, categoryOrder } = body as {
      items?: { id: string; sortOrder: number }[];
      categoryOrder?: string[];
    };

    const project = await db.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Update each item's sortOrder in a transaction
    if (items && Array.isArray(items)) {
      await db.$transaction(
        items.map((it) =>
          db.budgetItem.updateMany({
            where: { id: it.id, projectId: id },
            data: { sortOrder: Number(it.sortOrder) },
          }),
        ),
      );
    }

    // Update category order on the project (stored as JSON string)
    if (categoryOrder !== undefined && Array.isArray(categoryOrder)) {
      await db.project.update({
        where: { id },
        data: { categoryOrder: JSON.stringify(categoryOrder) },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH reorder error:", error);
    return NextResponse.json({ error: "Failed to reorder" }, { status: 500 });
  }
}
