import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/authz";
import {
  parseBody,
  parseParam,
  cuidSchema,
  nonEmptyString,
} from "@/lib/api-validation";

// Reorder uses a transaction with multiple updates — needs more than 10s for large lists
export const maxDuration = 30;

// PATCH /api/projects/[id]/reorder
// Body: { items: [{ id, sortOrder }], categoryOrder?: string[] (JSON-serializable) }
// Updates sortOrder of items and optionally the category order stored on the project.

// Each reorder item must have a valid cuid `id` and an integer `sortOrder`.
// The previous code accepted any string `id` (passed it to Prisma
// `where: { id: it.id, projectId }` — Prisma escaped, but malformed IDs
// would produce unhelpful errors). Now we validate upfront.
const reorderItemSchema = z.object({
  id: cuidSchema,
  sortOrder: z.number().int().nonnegative(),
});

const reorderBodySchema = z.object({
  items: z.array(reorderItemSchema).max(500).optional(),
  categoryOrder: z.array(nonEmptyString).max(100).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    // Validate path param.
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    const access = await requireProjectAccess(id, "editor");
    if (!access.ok) return access.response;

    // Parse + validate body (Zod).
    const result = await parseBody(reorderBodySchema, request, t);
    if (!result.success) return result.response;
    const { items, categoryOrder } = result.data;

    // `requireProjectAccess` already verified the project exists, so we can
    // drop the redundant findUnique lookup here.

    // Update each item's sortOrder in a transaction
    if (items && Array.isArray(items)) {
      await db.$transaction(
        items.map((it) =>
          db.budgetItem.updateMany({
            where: { id: it.id, projectId: id },
            data: { sortOrder: it.sortOrder },
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
    return NextResponse.json(
      { error: t("reorder.failed") },
      { status: 500 },
    );
  }
}
