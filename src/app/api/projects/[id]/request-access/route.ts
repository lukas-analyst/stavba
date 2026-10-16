import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireUser } from "@/lib/authz";

// =====================================================================
// POST /api/projects/[id]/request-access
// ---------------------------------------------------------------------
// Self-service "request access" button on the public project page
// (`/p/[slug]`). When an authenticated visitor clicks the button, this
// endpoint creates a `ProjectMember` row with role "viewer" so the
// project shows up in their sidebar and they can navigate to it via
// `/?project=<slug>` like any other project they have access to.
//
// Rules:
//   1. Must be signed in (requireUser). The middleware redirects
//      unauthenticated callers to /auth/login; this endpoint handles
//      the case where the session expired mid-request.
//   2. Project must exist (by slug) AND `isPublic === true`. Private
//      projects return 404 (same response as missing — don't leak
//      existence).
//   3. If the user is already the owner → 200 (idempotent, no-op).
//   4. If the user is already a member → 200 (idempotent, no-op).
//   5. Otherwise create a ProjectMember with role="viewer" + audit log.
//
// Returns 200 { ok: true, projectId } on success.
// =====================================================================

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireUser();
  if (response || !user) return response!;

  try {
    const { id: slugOrId } = await params;

    // Look up the project by slug first, then by ID as fallback.
    // Only public projects can be self-joined.
    let project = await db.project.findUnique({
      where: { slug: slugOrId },
      select: { id: true, ownerId: true, isPublic: true, name: true },
    });
    if (!project) {
      project = await db.project.findUnique({
        where: { id: slugOrId },
        select: { id: true, ownerId: true, isPublic: true, name: true },
      });
    }

    // Same 404 whether missing or private — don't leak existence.
    if (!project || !project.isPublic) {
      return NextResponse.json(
        { error: "Projekt nebyl nalezen nebo není veřejný." },
        { status: 404 },
      );
    }

    // Owner already has full access — no-op.
    if (project.ownerId === user.id) {
      return NextResponse.json({ ok: true, projectId: project.id });
    }

    // Already a member? — idempotent no-op. We don't downgrade their
    // existing role if they were previously promoted by the owner.
    const existing = await db.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: project.id, userId: user.id },
      },
      select: { id: true, role: true },
    });
    if (existing) {
      return NextResponse.json({ ok: true, projectId: project.id });
    }

    // Create the membership with viewer role.
    const member = await db.projectMember.create({
      data: {
        projectId: project.id,
        userId: user.id,
        role: "viewer",
      },
    });

    // Audit log: self-service join from public page.
    await logChanges(project.id, "ProjectMember", member.id, "create", null, {
      userId: user.id,
      userEmail: user.email,
      role: "viewer",
      source: "public_request_access",
    });

    return NextResponse.json({ ok: true, projectId: project.id });
  } catch (error) {
    console.error("POST /api/projects/[slug]/request-access error:", error);
    return NextResponse.json(
      { error: "Nepodařilo se udělit přístup." },
      { status: 500 },
    );
  }
}
