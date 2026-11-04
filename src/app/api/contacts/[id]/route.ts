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
  nonEmptyString,
  optionalNullableString,
} from "@/lib/api-validation";

// PATCH body schema — all fields optional (partial update).
const patchContactBodySchema = z.object({
  name: nonEmptyString.max(200).optional(),
  type: z.string().max(50).nullish(),
  role: optionalNullableString,
  phone: optionalNullableString,
  email: optionalNullableString,
  website: optionalNullableString,
  company: optionalNullableString,
  ico: optionalNullableString,
  dic: optionalNullableString,
  notes: optionalNullableString,
  rating: z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return undefined;
      if (typeof v === "string") return Number(v);
      return v;
    },
    z.union([z.number().int().min(0).max(5), z.null()]).optional(),
  ),
});

// PATCH /api/contacts/[id]
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

    // Parse + validate body (Zod).
    const result = await parseBody(patchContactBodySchema, request, t);
    if (!result.success) return result.response;
    const body: Record<string, unknown> = { ...result.data };

    const existing = await db.contact.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: t("contact.notFound") },
        { status: 404 },
      );
    }

    // IDOR fix: verify editor access to the project that owns this contact.
    const access = await requireProjectAccess(existing.projectId, "editor");
    if (!access.ok) return access.response;

    const updated = await db.contact.update({
      where: { id },
      data: {
        name: body.name !== undefined ? (body.name as string).trim() : undefined,
        type: body.type !== undefined ? (body.type as string | null) ?? undefined : undefined,
        role: body.role !== undefined ? (body.role as string | null) ?? null : undefined,
        phone: body.phone !== undefined ? (body.phone as string | null) ?? null : undefined,
        email: body.email !== undefined ? (body.email as string | null) ?? null : undefined,
        website: body.website !== undefined ? (body.website as string | null) ?? null : undefined,
        company: body.company !== undefined ? (body.company as string | null) ?? null : undefined,
        ico: body.ico !== undefined ? (body.ico as string | null) ?? null : undefined,
        dic: body.dic !== undefined ? (body.dic as string | null) ?? null : undefined,
        notes: body.notes !== undefined ? (body.notes as string | null) ?? null : undefined,
        rating: body.rating !== undefined ? (body.rating as number | null) : undefined,
      },
      include: {
        persons: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, firstName: true, lastName: true, phone: true, email: true, role: true, sortOrder: true },
        },
      },
    });

    // Log update to audit log
    await logChanges(
      existing.projectId,
      "Contact",
      id,
      "update",
      existing as unknown as Record<string, unknown>,
      body as unknown as Record<string, unknown>,
      updated.name,
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH contact error:", error);
    return NextResponse.json(
      { error: t("contact.updateFailed") },
      { status: 500 },
    );
  }
}

// DELETE /api/contacts/[id]
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

    const existing = await db.contact.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: t("contact.notFound") },
        { status: 404 },
      );
    }

    // IDOR fix: verify editor access to the project that owns this contact.
    const access = await requireProjectAccess(existing.projectId, "editor");
    if (!access.ok) return access.response;

    // Log deletion before deleting (entity is gone after delete)
    await logChanges(
      existing.projectId,
      "Contact",
      id,
      "delete",
      existing as unknown as Record<string, unknown>,
      null,
      existing.name,
    );

    await db.contact.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE contact error:", error);
    return NextResponse.json(
      { error: t("contact.deleteFailed") },
      { status: 500 },
    );
  }
}
