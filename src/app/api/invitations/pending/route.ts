import { NextResponse } from "next/server";
import { dbRead } from "@/lib/db";
import { requireUser } from "@/lib/authz";

// =====================================================================
// GET /api/invitations/pending
// ---------------------------------------------------------------------
// Lists all pending ProjectInvitation rows addressed to the signed-in
// user's e-mail (and not yet expired). Each entry includes:
//   - invitation id + token (for constructing the accept/reject URLs)
//   - role being offered
//   - expiresAt
//   - project info: id, name, slug, owner name (so the UI can render
//     "You've been invited to project X by Y")
//
// Used by the client to render an "invitations" badge / banner.
// =====================================================================

export async function GET() {
  const { user, response } = await requireUser();
  if (response || !user) return response!;

  try {
    const normalizedEmail = user.email.trim().toLowerCase();

    const invitations = await dbRead.projectInvitation.findMany({
      where: {
        inviteeEmail: normalizedEmail,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        token: true,
        role: true,
        expiresAt: true,
        createdAt: true,
        project: {
          select: {
            id: true,
            name: true,
            slug: true,
            owner: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      invitations: invitations.map((inv) => ({
        id: inv.id,
        token: inv.token,
        role: inv.role,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
        project: {
          id: inv.project.id,
          name: inv.project.name,
          slug: inv.project.slug,
          owner: {
            id: inv.project.owner.id,
            name: inv.project.owner.name,
            email: inv.project.owner.email,
            image: inv.project.owner.image,
          },
        },
      })),
    });
  } catch (error) {
    console.error("GET /api/invitations/pending error:", error);
    return NextResponse.json(
      { error: "Nepodařilo se načíst pozvánky." },
      { status: 500 },
    );
  }
}
