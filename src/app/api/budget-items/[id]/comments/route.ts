import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db, dbRead } from "@/lib/db";
import { requireProjectAccess } from "@/lib/authz";
import {
  parseBody,
  parseParam,
  cuidSchema,
  optionalNullableString,
} from "@/lib/api-validation";

// Body schema for POST /api/budget-items/[id]/comments
const createCommentBodySchema = z.object({
  author: optionalNullableString.optional(),
  text: z.string().trim().min(1, { message: "comment.textRequired" }).max(5000),
});

// GET /api/budget-items/[id]/comments - list all comments for a budget item
// Uses `dbRead` (read replica if configured, falls back to primary).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    // IDOR fix: resolve the budget item's projectId and verify the caller
    // has at least viewer access before returning comments.
    const item = await dbRead.budgetItem.findUnique({
      where: { id },
      select: { projectId: true },
    });
    if (!item) {
      return NextResponse.json(
        { error: t("comment.budgetItemNotFound") },
        { status: 404 },
      );
    }
    const access = await requireProjectAccess(item.projectId, "viewer");
    if (!access.ok) return access.response;

    const comments = await dbRead.comment.findMany({
      where: { budgetItemId: id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(comments);
  } catch (error) {
    console.error("GET comments error:", error);
    return NextResponse.json(
      { error: t("comment.fetchFailed") },
      { status: 500 },
    );
  }
}

// POST /api/budget-items/[id]/comments - add a comment
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    // Parse + validate body (Zod).
    const result = await parseBody(createCommentBodySchema, request, t);
    if (!result.success) return result.response;
    const { author, text } = result.data;

    const item = await db.budgetItem.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json(
        { error: t("comment.budgetItemNotFound") },
        { status: 404 },
      );
    }

    // IDOR fix: require editor access to the project that owns the budget
    // item. We also use access.user.id as the author identity so comments
    // are reliably attributed to the authenticated user, not the free-text
    // `author` field which is display-only.
    const access = await requireProjectAccess(item.projectId, "editor");
    if (!access.ok) return access.response;

    const comment = await db.comment.create({
      data: {
        budgetItemId: id,
        userId: access.user.id,
        author: (author ?? access.user.name ?? access.user.email ?? "Anonym").slice(0, 100),
        text: text,
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("POST comment error:", error);
    return NextResponse.json(
      { error: t("comment.createFailed") },
      { status: 500 },
    );
  }
}
