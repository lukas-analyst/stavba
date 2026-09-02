import { NextResponse } from "next/server";
import { db, dbRead } from "@/lib/db";

// GET /api/projects/[id]
// Uses `dbRead` (read replica if configured, falls back to primary).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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
    const body = await request.json();
    const { name, address, description, starred, status, currency, startDate, endDate, notes } = body;

    const existing = await db.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
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
      },
    });

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
    const existing = await db.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    await db.project.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/projects/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
