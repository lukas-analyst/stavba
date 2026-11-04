import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db, dbRead } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/authz";
import {
  parseBody,
  parseParam,
  slugOrIdSchema,
  cuidSchema,
  nonEmptyString,
  optionalNullableString,
} from "@/lib/api-validation";

// Status / currency / date schemas (kept in sync with /api/projects route).
const projectStatusSchema = z.enum(["active", "planning", "completed", "paused"]);
const currencySchema = z.string().regex(/^[A-Z]{3}$/, { message: "project.invalidCurrency" });
const isoDateSchema = z.string().refine(
  (s) => !isNaN(Date.parse(s)),
  { message: "project.invalidStartDate" },
);

// Number-or-null schema — accepts number, null, or undefined; rejects
// strings, NaN, Infinity. The previous `Number(body.heatLoss)` accepted
// "abc" (NaN stored in DB) — now rejected at parse time.
const optionalNumberOrNull = z
  .union([z.number().finite(), z.null(), z.undefined()])
  .optional();

// PATCH body schema — all 14+ fields are optional (partial update).
// Each field is strictly typed: status must be one of the 4 enum values,
// currency must match ISO 4217 format, dates must be ISO 8601 parseable,
// numbers must be finite, strings are trimmed.
const patchProjectBodySchema = z.object({
  name: nonEmptyString.max(200).optional(),
  address: optionalNullableString.optional(),
  description: optionalNullableString.optional(),
  starred: z.boolean().optional(),
  status: projectStatusSchema.optional(),
  currency: currencySchema.optional(),
  startDate: z.union([isoDateSchema, z.null()]).optional(),
  endDate: z.union([isoDateSchema, z.null()]).optional(),
  notes: z.union([z.string(), z.null()]).optional(),
  ownerId: cuidSchema.optional(),
  isPublic: z.boolean().optional(),
  fullAddress: optionalNullableString.optional(),
  studyUrl: optionalNullableString.optional(),
  documentationUrl: optionalNullableString.optional(),
  heatLoss: optionalNumberOrNull,
  energyRating: optionalNullableString.optional(),
  floorArea: optionalNumberOrNull,
  floors: optionalNumberOrNull,
  propertyNote: optionalNullableString.optional(),
  totalBudget: z.union([z.number().nonnegative().max(1e15), z.null()]).optional(),
});

// GET /api/projects/[id]
// Uses `dbRead` (read replica if configured, falls back to primary).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    // Validate path param (cuid OR slug).
    const idResult = parseParam(slugOrIdSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    const access = await requireProjectAccess(id, "viewer");
    if (!access.ok) return access.response;
    const project = await dbRead.project.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        address: true,
        description: true,
        starred: true,
        isPublic: true,
        status: true,
        currency: true,
        totalBudget: true,
        startDate: true,
        endDate: true,
        categoryOrder: true,
        notes: true,
        fullAddress: true,
        studyUrl: true,
        documentationUrl: true,
        heatLoss: true,
        energyRating: true,
        floorArea: true,
        floors: true,
        propertyNote: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { budgetItems: true, contacts: true } },
      },
    });
    if (!project) {
      return NextResponse.json(
        { error: t("project.notFound") },
        { status: 404 },
      );
    }
    return NextResponse.json(project);
  } catch (error) {
    console.error("GET /api/projects/[id] error:", error);
    return NextResponse.json(
      { error: t("project.fetchFailed") },
      { status: 500 },
    );
  }
}

// PATCH /api/projects/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    // Validate path param.
    const idResult = parseParam(slugOrIdSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    const access = await requireProjectAccess(id, "owner");
    if (!access.ok) return access.response;

    // Parse + validate body (Zod). All fields optional (partial update).
    const result = await parseBody(patchProjectBodySchema, request, t);
    if (!result.success) return result.response;
    const body = result.data;
    const { name, address, description, starred, status, currency, startDate, endDate, notes, ownerId, isPublic, fullAddress, studyUrl, documentationUrl, heatLoss, energyRating, floorArea, floors, propertyNote, totalBudget } = body;

    const existing = await db.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: t("project.notFound") },
        { status: 404 },
      );
    }

    // If name is being changed, regenerate the slug
    let newSlug: string | undefined;
    if (name !== undefined && name.trim() && name.trim() !== existing.name) {
      const baseSlug = name.trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove diacritics
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
      const slug = baseSlug || `projekt-${Date.now().toString(36)}`;
      // Ensure uniqueness — exclude the current project from the check
      let finalSlug = slug;
      let suffix = 1;
      while (true) {
        const conflict = await dbRead.project.findFirst({
          where: { slug: finalSlug, NOT: { id } },
          select: { id: true },
        });
        if (!conflict) break;
        finalSlug = `${slug}-${suffix++}`;
      }
      newSlug = finalSlug;
    }

    // If changing owner, validate the new owner exists and is a user
    if (ownerId !== undefined && ownerId !== existing.ownerId) {
      const newOwner = await db.user.findUnique({ where: { id: ownerId } });
      if (!newOwner) {
        return NextResponse.json(
          { error: t("project.newOwnerNotFound") },
          { status: 404 },
        );
      }
      // If the old owner is not already a member, add them as editor
      // so they don't lose access entirely
      const oldOwnerMembership = await db.projectMember.findUnique({
        where: { projectId_userId: { projectId: id, userId: existing.ownerId } },
      });
      if (!oldOwnerMembership) {
        await db.projectMember.create({
          data: { projectId: id, userId: existing.ownerId, role: "editor" },
        });
      }
    }

    const updated = await db.project.update({
      where: { id },
      data: {
        name: name !== undefined ? name.trim() : undefined,
        // Update slug only if name changed and we generated a new one
        ...(newSlug ? { slug: newSlug } : {}),
        address: address !== undefined ? address : undefined,
        description: description !== undefined ? description : undefined,
        starred: starred !== undefined ? Boolean(starred) : undefined,
        status: status !== undefined ? status : undefined,
        currency: currency !== undefined ? currency : undefined,
        startDate: startDate !== undefined ? (startDate ? new Date(startDate) : null) : undefined,
        endDate: endDate !== undefined ? (endDate ? new Date(endDate) : null) : undefined,
        notes: notes !== undefined ? (typeof notes === "string" ? notes : null) : undefined,
        ownerId: ownerId !== undefined ? ownerId : undefined,
        isPublic: isPublic !== undefined ? Boolean(isPublic) : undefined,
        fullAddress: fullAddress !== undefined ? fullAddress : undefined,
        studyUrl: studyUrl !== undefined ? studyUrl : undefined,
        documentationUrl: documentationUrl !== undefined ? documentationUrl : undefined,
        heatLoss: heatLoss !== undefined ? heatLoss : undefined,
        energyRating: energyRating !== undefined ? energyRating : undefined,
        floorArea: floorArea !== undefined ? floorArea : undefined,
        floors: floors !== undefined ? floors : undefined,
        propertyNote: propertyNote !== undefined ? propertyNote : undefined,
        totalBudget: totalBudget !== undefined ? totalBudget : undefined,
      },
    });

    // Log update to audit log
    await logChanges(
      id,
      "Project",
      id,
      "update",
      existing as unknown as Record<string, unknown>,
      body as unknown as Record<string, unknown>,
      existing.name,
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/projects/[id] error:", error);
    return NextResponse.json(
      { error: t("project.updateFailed") },
      { status: 500 },
    );
  }
}

// DELETE /api/projects/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    // Validate path param.
    const idResult = parseParam(slugOrIdSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    const access = await requireProjectAccess(id, "owner");
    if (!access.ok) return access.response;
    const existing = await db.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: t("project.notFound") },
        { status: 404 },
      );
    }

    // SECURITY: Admins have owner-level access to VIEW/EDIT all projects,
    // but they CANNOT DELETE projects they don't own. Only the actual
    // project owner (project.ownerId === user.id) can delete.
    if (existing.ownerId !== access.user.id) {
      return NextResponse.json(
        { error: t("project.onlyOwnerCanDelete") },
        { status: 403 },
      );
    }

    // Log deletion before deleting (entity is gone after delete)
    await logChanges(
      id,
      "Project",
      id,
      "delete",
      existing as unknown as Record<string, unknown>,
      null,
      existing.name,
    );

    await db.project.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/projects/[id] error:", error);
    return NextResponse.json(
      { error: t("project.deleteFailed") },
      { status: 500 },
    );
  }
}
