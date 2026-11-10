import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireUser } from "@/lib/authz";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { parseParam, slugOrIdSchema } from "@/lib/api-validation";

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
// SECURITY (audit fix H6): added rate-limit (5 / hour per user+IP).
// Without it, an authenticated user could iterate public project slugs
// and auto-join every public project en masse — polluting their
// sidebar AND appearing in audit logs of many unrelated projects.
//
// Returns 200 { ok: true, projectId } on success.
// =====================================================================

// Rate-limit: 5 self-joins per hour per user+IP. A legitimate user
// might join a few public projects; 5/hour is generous. Keyed by both
// user.id and IP so that a single attacker can't bypass by rotating
// projects, and a shared-IP user (NAT) doesn't get blocked by another
// user on the same IP.
const REQUEST_ACCESS_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
} as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireUser();
  if (response || !user) return response!;

  const t = await getTranslations("api.errors");
  try {
    // Rate-limit per user + IP. Done AFTER auth so we have user.id.
    const ip = getClientIp(request);
    const rl = checkRateLimit(
      `request-access:${user.id}:${ip}`,
      REQUEST_ACCESS_RATE_LIMIT,
    );
    if (rl.limited) {
      const minutes = Math.max(1, Math.ceil(rl.retryAfter / 60));
      return NextResponse.json(
        { error: t("auth.rateLimit.requests", { minutes }) },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfter) },
        },
      );
    }

    const { id: rawSlugOrId } = await params;
    // Validate path param (cuid OR slug).
    const idResult = parseParam(slugOrIdSchema, rawSlugOrId, t);
    if (!idResult.success) return idResult.response;
    const slugOrId = idResult.data;

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
        { error: t("project.notFoundOrNotPublic") },
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
    console.error("POST /api/projects/[id]/request-access error:", error);
    return NextResponse.json(
      { error: t("project.requestAccessFailed") },
      { status: 500 },
    );
  }
}
