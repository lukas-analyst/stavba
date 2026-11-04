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
} from "@/lib/api-validation";

// Body schema for PATCH /api/projects/[id]/members/[memberId]
const patchMemberBodySchema = z.object({
  role: z.enum(["viewer", "editor"]),
});

// PATCH /api/projects/[id]/members/[memberId] — update member role
// Body: { role: "viewer" | "editor" }
//
// SECURITY: Requires the project owner role. Editors and viewers cannot
// promote/demote other members.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId, memberId: rawMemberId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;
    const memberIdResult = parseParam(cuidSchema, rawMemberId, t);
    if (!memberIdResult.success) return memberIdResult.response;
    const memberId = memberIdResult.data;

    const access = await requireProjectAccess(id, "owner");
    if (!access.ok) return access.response;

    // Parse + validate body (Zod). role is constrained to the enum.
    const result = await parseBody(patchMemberBodySchema, request, t);
    if (!result.success) return result.response;
    const { role: validRole } = result.data;

    const existing = await db.projectMember.findFirst({
      where: { id: memberId, projectId: id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: t("member.notFound") },
        { status: 404 },
      );
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
    return NextResponse.json(
      { error: t("member.updateFailed") },
      { status: 500 },
    );
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
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId, memberId: rawMemberId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;
    const memberIdResult = parseParam(cuidSchema, rawMemberId, t);
    if (!memberIdResult.success) return memberIdResult.response;
    const memberId = memberIdResult.data;

    // First, require at least viewer access so we can read the project.
    const access = await requireProjectAccess(id, "viewer");
    if (!access.ok) return access.response;
    const { user } = access;

    // Look up the member record so we can decide authorization.
    const memberWithUser = await db.projectMember.findFirst({
      where: { id: memberId, projectId: id },
      include: { user: { select: { email: true, name: true } } },
    });
    if (!memberWithUser) {
      return NextResponse.json(
        { error: t("member.notFound") },
        { status: 404 },
      );
    }

    // Authorization: owner can delete anyone; otherwise only self-deletion
    // is allowed.
    const isOwner = access.project.ownerId === user.id;
    const isSelf = memberWithUser.userId === user.id;

    if (!isOwner && !isSelf) {
      return NextResponse.json(
        { error: t("member.ownerRoleRequired") },
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
    return NextResponse.json(
      { error: t("member.deleteFailed") },
      { status: 500 },
    );
  }
}
