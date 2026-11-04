import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/authz";
import {
  parseBody,
  parseParam,
  cuidSchema,
  optionalNullableString,
} from "@/lib/api-validation";

// PATCH body schema — both fields optional, but at least one required.
const patchNoteBodySchema = z
  .object({
    text: z.string().trim().min(1).max(5000).optional(),
    author: optionalNullableString.optional(),
  })
  .refine((data) => data.text !== undefined || data.author !== undefined, {
    message: "note.nothingToUpdate",
  });

// PATCH /api/notes/[id] - update text and/or author of an existing note.
// Body: { text?: string, author?: string }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    // Parse + validate body (Zod). The `.refine()` above ensures at least
    // one field is provided — replaces the manual
    // `text === undefined && author === undefined` check.
    const result = await parseBody(patchNoteBodySchema, request, t);
    if (!result.success) return result.response;
    const { text, author } = result.data;

    const existing = await db.note.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: t("note.notFound") },
        { status: 404 },
      );
    }

    // IDOR fix: require editor access to the project that owns this note.
    // Additionally, only the note author (or the project owner) may edit it
    // — editors cannot modify each other's notes. Legacy notes with
    // `userId === null` are editable only by the project owner.
    const access = await requireProjectAccess(existing.projectId, "editor");
    if (!access.ok) return access.response;
    const isOwner = access.project.ownerId === access.user.id;
    if (!isOwner && existing.userId !== access.user.id) {
      return NextResponse.json(
        { error: t("notes.cannotEditOthers") },
        { status: 403 },
      );
    }

    const data: { text?: string; author?: string | null } = {};
    if (text !== undefined) data.text = text;
    if (author !== undefined) data.author = (author ?? "Anonym").slice(0, 100);

    const updated = await db.note.update({
      where: { id },
      data,
    });

    // Log update to audit log
    await logChanges(
      existing.projectId,
      "Note",
      id,
      "update",
      existing as unknown as Record<string, unknown>,
      { text },
      null,
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH note error:", error);
    return NextResponse.json(
      { error: t("note.updateFailed") },
      { status: 500 },
    );
  }
}

// DELETE /api/notes/[id] - delete a single note
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    const existing = await db.note.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: t("note.notFound") },
        { status: 404 },
      );
    }

    // IDOR fix: require editor access to the project, and additionally
    // restrict delete to the note author (or the project owner). Legacy
    // notes with `userId === null` can only be deleted by the owner.
    const access = await requireProjectAccess(existing.projectId, "editor");
    if (!access.ok) return access.response;
    const isOwner = access.project.ownerId === access.user.id;
    if (!isOwner && existing.userId !== access.user.id) {
      return NextResponse.json(
        { error: t("notes.cannotDeleteOthers") },
        { status: 403 },
      );
    }

    // Log deletion before deleting (entity is gone after delete)
    await logChanges(
      existing.projectId,
      "Note",
      id,
      "delete",
      existing as unknown as Record<string, unknown>,
      null,
      existing.author,
    );

    await db.note.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE note error:", error);
    return NextResponse.json(
      { error: t("note.deleteFailed") },
      { status: 500 },
    );
  }
}
