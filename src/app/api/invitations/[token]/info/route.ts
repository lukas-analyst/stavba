import { NextResponse } from "next/server";
import { dbRead } from "@/lib/db";
import { requireUser } from "@/lib/authz";

// =====================================================================
// GET /api/invitations/[token]/info
// ---------------------------------------------------------------------
// Returns a SAFE, human-readable summary of a pending invitation:
//   - project name + slug
//   - inviter (owner) name + email
//   - role being offered (viewer | editor)
//   - status + expiry
//
// Used by the /invite/[token] page so the invitee can decide whether
// to accept or reject BEFORE the ProjectMember record is created.
//
// Rules:
//   1. Must be signed in (requireUser). The middleware passes /api/invitations/*
//      through to allow the page to redirect unauthenticated users to /auth/login,
//      but this endpoint itself requires a session so we can compare the
//      signed-in e-mail against invitation.inviteeEmail.
//   2. Invitation must exist (by token) → else 404
//   3. The signed-in user's e-mail must match invitation.inviteeEmail →
//      else 403 (prevents someone from previewing invitations sent to others)
//
// NOTE: We deliberately do NOT mark expired invitations as "expired" here.
//       That's a side-effect that belongs to the accept/reject endpoints.
//       This endpoint is read-only — it just describes the invitation.
// =====================================================================

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { user, response } = await requireUser();
  if (response || !user) return response!;

  try {
    const { token } = await params;

    const invitation = await dbRead.projectInvitation.findUnique({
      where: { token },
      select: {
        id: true,
        inviteeEmail: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        project: {
          select: {
            id: true,
            name: true,
            slug: true,
            ownerId: true,
            owner: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        inviter: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Pozvánka nebyla nalezena." },
        { status: 404 },
      );
    }

    // Don't leak invitation details to users other than the invitee.
    if (
      !user.email ||
      user.email.trim().toLowerCase() !== invitation.inviteeEmail
    ) {
      return NextResponse.json(
        { error: "Tato pozvánka není pro váš e-mail." },
        { status: 403 },
      );
    }

    return NextResponse.json({
      id: invitation.id,
      inviteeEmail: invitation.inviteeEmail,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      project: {
        id: invitation.project.id,
        name: invitation.project.name,
        slug: invitation.project.slug,
        ownerId: invitation.project.ownerId,
        ownerName: invitation.project.owner.name,
        ownerEmail: invitation.project.owner.email,
      },
      inviter: invitation.inviter
        ? {
            id: invitation.inviter.id,
            name: invitation.inviter.name,
            email: invitation.inviter.email,
          }
        : null,
    });
  } catch (error) {
    console.error("GET /api/invitations/[token]/info error:", error);
    return NextResponse.json(
      { error: "Nepodařilo se načíst informace o pozvánce." },
      { status: 500 },
    );
  }
}
