import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";

// PATCH /api/projects/[id]/members/[memberId] — update member role
// Body: { role: "viewer" | "editor" }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  try {
    const { id, memberId } = await params;
    const body = await request.json();
    const { role } = body;

    const validRole = role === "editor" ? "editor" : "viewer";

    const existing = await db.projectMember.findFirst({
      where: { id: memberId, projectId: id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const updated = await db.projectMember.update({
      where: { id: memberId },
      data: { role: validRole },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    // Audit log: member role changed
    await logChanges(id, "ProjectMember", memberId, "update", {
      role: existing.role,
    }, {
      role: validRole,
      userEmail: updated.user.email,
    });

    return NextResponse.json({
      id: updated.id,
      role: updated.role,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      user: updated.user,
    });
  } catch (error) {
    console.error("PATCH member error:", error);
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }
}

// DELETE /api/projects/[id]/members/[memberId] — remove member
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  try {
    const { id, memberId } = await params;

    // Get user info before deleting for audit log
    const memberWithUser = await db.projectMember.findFirst({
      where: { id: memberId, projectId: id },
      include: { user: { select: { email: true, name: true } } },
    });
    if (!memberWithUser) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    await db.projectMember.delete({ where: { id: memberId } });

    // Audit log: member removed
    await logChanges(id, "ProjectMember", memberId, "delete", {
      userId: memberWithUser.userId,
      userEmail: memberWithUser.user.email,
      role: memberWithUser.role,
    }, null);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE member error:", error);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
