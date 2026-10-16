import { NextResponse } from "next/server";
import { db, dbRead } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/authz";

// GET /api/projects/[id]
// Uses `dbRead` (read replica if configured, falls back to primary).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json(project);
  } catch (error) {
    console.error("GET /api/projects/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }
}

// PATCH /api/projects/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireProjectAccess(id, "owner");
    if (!access.ok) return access.response;
    const body = await request.json();
    const { name, address, description, starred, status, currency, startDate, endDate, notes, ownerId, isPublic } = body;

    const existing = await db.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
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
        return NextResponse.json({ error: "New owner not found" }, { status: 404 });
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
        address: address !== undefined ? (address?.trim() || null) : undefined,
        description: description !== undefined ? (description?.trim() || null) : undefined,
        starred: starred !== undefined ? Boolean(starred) : undefined,
        status: status !== undefined ? status : undefined,
        currency: currency !== undefined ? currency : undefined,
        startDate: startDate !== undefined ? (startDate ? new Date(startDate) : null) : undefined,
        endDate: endDate !== undefined ? (endDate ? new Date(endDate) : null) : undefined,
        notes: notes !== undefined ? (typeof notes === "string" ? notes : null) : undefined,
        ownerId: ownerId !== undefined ? ownerId : undefined,
        isPublic: isPublic !== undefined ? Boolean(isPublic) : undefined,
        fullAddress: body.fullAddress !== undefined ? (body.fullAddress?.trim() || null) : undefined,
        studyUrl: body.studyUrl !== undefined ? (body.studyUrl?.trim() || null) : undefined,
        documentationUrl: body.documentationUrl !== undefined ? (body.documentationUrl?.trim() || null) : undefined,
        heatLoss: body.heatLoss !== undefined ? (body.heatLoss !== null ? Number(body.heatLoss) : null) : undefined,
        energyRating: body.energyRating !== undefined ? (body.energyRating?.trim() || null) : undefined,
        floorArea: body.floorArea !== undefined ? (body.floorArea !== null ? Number(body.floorArea) : null) : undefined,
        floors: body.floors !== undefined ? (body.floors !== null ? Number(body.floors) : null) : undefined,
        propertyNote: body.propertyNote !== undefined ? (body.propertyNote?.trim() || null) : undefined,
      },
    });

    // Log update to audit log
    await logChanges(
      id,
      "Project",
      id,
      "update",
      existing as unknown as Record<string, unknown>,
      body,
      existing.name,
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/projects/[id] error:", error);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}

// DELETE /api/projects/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireProjectAccess(id, "owner");
    if (!access.ok) return access.response;
    const existing = await db.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
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
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
