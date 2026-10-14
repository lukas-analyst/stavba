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
        status: true,
        currency: true,
        totalBudget: true,
        startDate: true,
        endDate: true,
        categoryOrder: true,
        notes: true,
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
    const { name, address, description, starred, status, currency, startDate, endDate, notes, ownerId } = body;

    const existing = await db.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
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
        address: address !== undefined ? (address?.trim() || null) : undefined,
        description: description !== undefined ? (description?.trim() || null) : undefined,
        starred: starred !== undefined ? Boolean(starred) : undefined,
        status: status !== undefined ? status : undefined,
        currency: currency !== undefined ? currency : undefined,
        startDate: startDate !== undefined ? (startDate ? new Date(startDate) : null) : undefined,
        endDate: endDate !== undefined ? (endDate ? new Date(endDate) : null) : undefined,
        notes: notes !== undefined ? (typeof notes === "string" ? notes : null) : undefined,
        ownerId: ownerId !== undefined ? ownerId : undefined,
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
