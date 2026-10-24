import { NextResponse } from "next/server";
import { db, dbRead } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/authz";
import { generateToken } from "@/lib/auth-helpers";

// GET /api/projects/[id]/members — list all members of a project
// Requires at least viewer access to the project.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, "viewer");
  if (!access.ok) return access.response;

  try {
    // Get project owner + members
    const [project, members] = await Promise.all([
      dbRead.project.findUnique({
        where: { id },
        select: {
          ownerId: true,
          owner: { select: { id: true, name: true, email: true, image: true, deletedAt: true } },
        },
      }),
      dbRead.projectMember.findMany({
        where: { projectId: id },
        include: {
          user: { select: { id: true, name: true, email: true, image: true, deletedAt: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // `requireProjectAccess` already returned 404 if project was missing,
    // but TypeScript doesn't know that — guard defensively.
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({
      owner: project.owner,
      members: members.map((m) => ({
        id: m.id,
        role: m.role,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        user: m.user,
      })),
    });
  } catch (error) {
    console.error("GET members error:", error);
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }
}

// POST /api/projects/[id]/members — add a member to the project
// Body: { email: string, role: "viewer" | "editor" }
//
// SECURITY:
//   - Only the project owner can add members.
//   - If the e-mail does not belong to a registered User, we NEVER silently
//     create a ghost user. Instead, we create a `ProjectInvitation` so the
//     invitee can claim their membership after registering.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, "owner");
  if (!access.ok) return access.response;
  const { user } = access;

  try {
    const body = await request.json();
    const { email, role } = body;

    if (!email || typeof email !== "string" || !email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const validRole = role === "editor" ? "editor" : "viewer";

    // Find existing user by email — do NOT create a ghost user.
    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      // Registered user — create the ProjectMember record directly.

      // Check if already a member
      const existing = await db.projectMember.findUnique({
        where: { projectId_userId: { projectId: id, userId: existingUser.id } },
      });
      if (existing) {
        return NextResponse.json(
          { error: "Tento uživatel je již členem projektu" },
          { status: 409 },
        );
      }

      // Owner cannot be added as a member (they already have full access).
      if (access.project.ownerId === existingUser.id) {
        return NextResponse.json(
          { error: "Tento uživatel je již správcem projektu" },
          { status: 409 },
        );
      }

      const member = await db.projectMember.create({
        data: {
          projectId: id,
          userId: existingUser.id,
          role: validRole,
        },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      });

      // Audit log: member added
      await logChanges(id, "ProjectMember", member.id, "create", null, {
        userId: existingUser.id,
        userEmail: existingUser.email,
        role: validRole,
      });

      return NextResponse.json({
        id: member.id,
        role: member.role,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
        user: member.user,
      }, { status: 201 });
    }

    // -----------------------------------------------------------------
    // No registered user with this e-mail — create a ProjectInvitation.
    // -----------------------------------------------------------------

    // Check for an existing pending invitation (the unique constraint
    // [projectId, inviteeEmail] would otherwise cause a 500).
    const existingInvitation = await db.projectInvitation.findUnique({
      where: { projectId_inviteeEmail: { projectId: id, inviteeEmail: normalizedEmail } },
    });
    if (existingInvitation && existingInvitation.status === "pending") {
      return NextResponse.json(
        { error: "Na tento e-mail již čeká nepotvrzená pozvánka." },
        { status: 409 },
      );
    }
    // If a previous invitation was revoked/expired/rejected, replace it
    // with a fresh one.
    if (existingInvitation) {
      await db.projectInvitation.delete({ where: { id: existingInvitation.id } });
    }

    const token = generateToken();
    // 7-day expiry — matches typical invitation-link lifetimes.
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await db.projectInvitation.create({
      data: {
        projectId: id,
        invitedBy: user.id,
        inviteeEmail: normalizedEmail,
        role: validRole,
        token,
        status: "pending",
        expiresAt,
      },
    });

    // Audit log: invitation created
    await logChanges(id, "ProjectInvitation", invitation.id, "create", null, {
      inviteeEmail: normalizedEmail,
      role: validRole,
      invitedBy: user.id,
      expiresAt: expiresAt.toISOString(),
    });

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        inviteeEmail: invitation.inviteeEmail,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      },
      message:
        "Uživatel s tímto e-mailem ještě není registrován. Byla mu odeslána pozvánka — po registraci se automaticky stane členem projektu.",
    }, { status: 202 });
  } catch (error) {
    console.error("POST member error:", error);
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}
