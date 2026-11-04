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

// PATCH body schema — all fields optional (partial update).
const patchPersonBodySchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: optionalNullableString,
  email: optionalNullableString,
  role: optionalNullableString,
  sortOrder: z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return undefined;
      if (typeof v === "string") return Number(v);
      return v;
    },
    z.number().int().nonnegative().optional(),
  ),
});

// =====================================================================
// PATCH/DELETE /api/contacts/[id]/persons/[personId]
// ---------------------------------------------------------------------
// SECURITY (audit fix C4): previously these two handlers had NO auth
// check. Now both resolve parent contact's `projectId` and require
// `editor` access. Zod validation added for body + path params.
// =====================================================================

// PATCH /api/contacts/[id]/persons/[personId] — update a person
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; personId: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId, personId: rawPersonId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;
    const personIdResult = parseParam(cuidSchema, rawPersonId, t);
    if (!personIdResult.success) return personIdResult.response;
    const personId = personIdResult.data;

    // Parse + validate body (Zod).
    const result = await parseBody(patchPersonBodySchema, request, t);
    if (!result.success) return result.response;
    const body: Record<string, unknown> = { ...result.data };

    const existing = await db.contactPerson.findFirst({
      where: { id: personId, contactId: id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: t("contact.personNotFound") },
        { status: 404 },
      );
    }

    // Fetch parent contact to resolve projectId
    const contact = await db.contact.findUnique({
      where: { id },
      select: { projectId: true },
    });
    if (!contact) {
      return NextResponse.json(
        { error: t("contact.notFound") },
        { status: 404 },
      );
    }

    // IDOR fix: verify editor access to the project that owns this contact.
    const access = await requireProjectAccess(contact.projectId, "editor");
    if (!access.ok) return access.response;

    const updated = await db.contactPerson.update({
      where: { id: personId },
      data: {
        firstName: body.firstName !== undefined ? (body.firstName as string) : undefined,
        lastName: body.lastName !== undefined ? (body.lastName as string) : undefined,
        phone: body.phone !== undefined ? (body.phone as string | null) ?? null : undefined,
        email: body.email !== undefined ? (body.email as string | null) ?? null : undefined,
        role: body.role !== undefined ? (body.role as string | null) ?? null : undefined,
        sortOrder: body.sortOrder !== undefined ? (body.sortOrder as number) : undefined,
      },
    });

    // Log update to audit log
    await logChanges(
      contact.projectId,
      "ContactPerson",
      personId,
      "update",
      existing as unknown as Record<string, unknown>,
      body as unknown as Record<string, unknown>,
      null,
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH contact person error:", error);
    return NextResponse.json(
      { error: t("contact.personUpdateFailed") },
      { status: 500 },
    );
  }
}

// DELETE /api/contacts/[id]/persons/[personId] — delete a person
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; personId: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId, personId: rawPersonId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;
    const personIdResult = parseParam(cuidSchema, rawPersonId, t);
    if (!personIdResult.success) return personIdResult.response;
    const personId = personIdResult.data;

    const existing = await db.contactPerson.findFirst({
      where: { id: personId, contactId: id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: t("contact.personNotFound") },
        { status: 404 },
      );
    }

    // Fetch parent contact to resolve projectId
    const contact = await db.contact.findUnique({
      where: { id },
      select: { projectId: true },
    });
    if (!contact) {
      return NextResponse.json(
        { error: t("contact.notFound") },
        { status: 404 },
      );
    }

    // IDOR fix: verify editor access to the project that owns this contact.
    const access = await requireProjectAccess(contact.projectId, "editor");
    if (!access.ok) return access.response;

    // Log deletion before deleting (entity is gone after delete)
    await logChanges(
      contact.projectId,
      "ContactPerson",
      personId,
      "delete",
      existing as unknown as Record<string, unknown>,
      null,
      `${existing.firstName} ${existing.lastName}`,
    );

    await db.contactPerson.delete({ where: { id: personId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE contact person error:", error);
    return NextResponse.json(
      { error: t("contact.personDeleteFailed") },
      { status: 500 },
    );
  }
}
