import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/authz";

// PATCH /api/projects/[id]/members/[memberId] — update member role
// Body: { role: "viewer" | "editor" }
//
// SECURITY: Requires the project owner role. Editors and viewers cannot
// promote/demote other members.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id, memberId } = await params;
  const access = await requireProjectAccess(id, "owner");
  if (!access.ok) return access.response;

  try {
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
//
// SECURITY:
//   - The project owner can remove any member.
//   - A member can also remove THEMSELF (self-leave), even with just the
//     "viewer" role — this allows users to leave projects they no longer
//     want to be part of.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id, memberId } = await params;

  // First, require at least viewer access so we can read the project.
  const access = await requireProjectAccess(id, "viewer");
  if (!access.ok) return access.response;
  const { user } = access;

  try {
    // Look up the member record so we can decide authorization.
    const memberWithUser = await db.projectMember.findFirst({
      where: { id: memberId, projectId: id },
      include: { user: { select: { email: true, name: true } } },
    });
    if (!memberWithUser) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Authorization: owner can delete anyone; otherwise only self-deletion
    // is allowed.
    const isOwner = access.project.ownerId === user.id;
    const isSelf = memberWithUser.userId === user.id;

    if (!isOwner && !isSelf) {
      return NextResponse.json(
        { error: `Pro tuto akci je vyžadována role „owner".` },
        { status: 403 },
      );
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
