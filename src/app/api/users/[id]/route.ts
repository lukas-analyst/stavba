import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db, dbRead } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/authz";
import { requireUser } from "@/lib/require-user";
import { validateName } from "@/lib/auth-helpers";
import {
  parseBody,
  parseParam,
  cuidSchema,
  optionalNameSchema,
} from "@/lib/api-validation";

// =====================================================================
// /api/users/[id] — single-user mutations
// ---------------------------------------------------------------------
// PATCH /api/users/[id]
//   Body: { name?: string, isAdmin?: boolean }
//   - `name`     — editable by the user themselves OR by an admin.
//   - `isAdmin`  — ONLY editable by an existing admin. Non-admins who
//                  try to set this field receive 403. This is the only
//                  way to promote/demote admins (besides direct DB access).
//
//   Admins can also edit any other user's `name` (not just their own).
//   Non-admins can only edit their own profile.
//
//   Returns: 200 { id, name, email, image, isAdmin, createdAt }
//
// GET /api/users/[id]
//   Returns: 200 { id, name, email, image, createdAt } — used when the
//   client needs to fetch a single user (e.g. for the avatar dropdown).
//   Note: `isAdmin` is intentionally NOT returned here to avoid leaking
//   admin status to arbitrary clients. Use /api/users/profile for the
//   current user's own isAdmin flag.
//
//   SECURITY (audit fix C3): previously this route had NO auth check at
//   all — anyone on the internet with a user cuid could read any user's
//   email, name, image, and createdAt. The fix mirrors the scoping in
//   `GET /api/users`:
//     - Admins: can fetch any user (including soft-deleted).
//     - Non-admins: can fetch themselves OR users who share at least
//       one project with them. Otherwise 403.
// =====================================================================

type RouteContext = { params: Promise<{ id: string }> };

// Body schema for PATCH — `name` validated via optionalNameSchema (delegates
// to validateName for HTML/control char checks), `isAdmin` is a strict
// boolean. Both optional (partial update); authz for `isAdmin` happens
// after parsing (admin-only check).
const patchUserBodySchema = z.object({
  name: optionalNameSchema.optional(),
  isAdmin: z.boolean().optional(),
});

export async function GET(_request: Request, { params }: RouteContext) {
  const t = await getTranslations("api.errors");
  try {
    // Auth: must be a verified user (emailVerified != null). Mirrors
    // `GET /api/users` which uses `requireVerifiedUser`.
    const { user, response } = await requireVerifiedUser();
    if (response || !user) return response!;

    const { id: rawId } = await params;
    // Validate path param.
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    // Self — always allowed (user looking up their own profile).
    if (id === user.id) {
      const self = await dbRead.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, image: true, createdAt: true },
      });
      if (!self) {
        return NextResponse.json({ error: t("users.userNotFound") }, { status: 404 });
      }
      return NextResponse.json(self);
    }

    // Admin bypass — can fetch any user (including soft-deleted), to
    // power the admin panel. Includes deletedAt so the UI can show
    // "pending deletion" status.
    if (user.isAdmin) {
      const target = await dbRead.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
          deletedAt: true,
        },
      });
      if (!target) {
        return NextResponse.json({ error: t("users.userNotFound") }, { status: 404 });
      }
      // Mask deletedAt for the response (the public shape stays the same
      // as the non-admin path; deletedAt is included so admin UI can
      // show "pending deletion" badge). Non-admins never reach here.
      return NextResponse.json({
        id: target.id,
        name: target.name,
        email: target.email,
        image: target.image,
        createdAt: target.createdAt,
        ...(target.deletedAt ? { deletedAt: target.deletedAt } : {}),
      });
    }

    // Non-admin, not self — only allowed if the requester shares at
    // least one project with the target user (as owner or member of
    // any project the target is also owner/member of). This prevents
    // arbitrary user enumeration by cuid.
    const [ownedByRequester, membershipsOfRequester] = await Promise.all([
      dbRead.project.findMany({
        where: { ownerId: user.id },
        select: { id: true },
      }),
      dbRead.projectMember.findMany({
        where: { userId: user.id },
        select: { projectId: true },
      }),
    ]);
    const requesterProjectIds = new Set<string>([
      ...ownedByRequester.map((p) => p.id),
      ...membershipsOfRequester.map((m) => m.projectId),
    ]);

    if (requesterProjectIds.size === 0) {
      // Requester is in no projects → can't share with anyone.
      return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 403 });
    }

    // Does the target user appear as owner or member in any of those
    // projects? If yes → reveal minimal public fields. If no → 403.
    const [targetOwned, targetMemberships] = await Promise.all([
      dbRead.project.findFirst({
        where: { id: { in: Array.from(requesterProjectIds) }, ownerId: id },
        select: { id: true },
      }),
      dbRead.projectMember.findFirst({
        where: {
          projectId: { in: Array.from(requesterProjectIds) },
          userId: id,
        },
        select: { projectId: true },
      }),
    ]);

    if (!targetOwned && !targetMemberships) {
      // Don't leak whether the user exists at all — return 403 (not 404)
      // so an attacker can't enumerate valid user ids by cuid.
      return NextResponse.json({ error: t("users.cannotViewOtherProfile") }, { status: 403 });
    }

    const target = await dbRead.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, image: true, createdAt: true, deletedAt: true },
    });
    if (!target || target.deletedAt) {
      // Non-admins never see soft-deleted users (their email is
      // anonymized to `deleted_<id>_<email>` during the cooling-off
      // period). Return 404 — same as "doesn't exist".
      return NextResponse.json({ error: t("users.userNotFound") }, { status: 404 });
    }
    // Strip deletedAt from the response — non-admins don't need it.
    const { deletedAt: _stripped, ...publicFields } = target;
    return NextResponse.json(publicFields);
  } catch (error) {
    console.error("GET /api/users/[id] error:", error);
    return NextResponse.json({ error: t("users.fetchFailed") }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    // Validate path param.
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    // Parse + validate body (Zod). Replaces ad-hoc
    // `body as { name?, isAdmin? }` cast + 3 typeof checks.
    const result = await parseBody(patchUserBodySchema, request, t);
    if (!result.success) return result.response;
    const { name, isAdmin } = result.data;

    // Build the update payload. `name` and `isAdmin` are both optional,
    // but at least one must be provided so we don't no-op silently.
    const data: { name?: string | null; isAdmin?: boolean } = {};

    if (name !== undefined) {
      // optionalNameSchema returns null for empty (name is optional) or
      // the trimmed name. validateName already ran inside the schema
      // (superRefine), so we don't need to re-validate here — but we
      // keep the explicit null check for clarity.
      data.name = name;
    }

    // ===== Admin-gated field: isAdmin =====
    // Only an existing admin can set `isAdmin` (promote or demote).
    // We fetch the requester's isAdmin flag fresh from DB (not from the
    // JWT) so a just-demoted admin can't sneak in one last change using
    // a stale token. The requester must also be authenticated.
    if (isAdmin !== undefined) {
      const { user: requester, response: authResponse } = await requireUser();
      if (authResponse) return authResponse;
      if (!requester) {
        return NextResponse.json(
          { error: t("auth.notAuthenticated") },
          { status: 401 },
        );
      }
      const requesterUser = await db.user.findUnique({
        where: { id: requester.id },
        select: { isAdmin: true },
      });
      if (!requesterUser?.isAdmin) {
        return NextResponse.json(
          { error: t("users.adminOnly") },
          { status: 403 },
        );
      }
      // Safety: prevent self-demotion so the instance never
      // ends up with zero admins.
      if (id === requester.id && isAdmin === false) {
        return NextResponse.json(
          { error: t("users.cannotDemoteSelf") },
          { status: 400 },
        );
      }
      data.isAdmin = isAdmin;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: t("users.noUpdatableFields") },
        { status: 400 },
      );
    }

    // Verify the target user exists.
    const existing = await db.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: t("users.userNotFound") }, { status: 404 });
    }

    // Authorization for the `name` field:
    //   - Admins can edit ANY user's name.
    //   - Non-admins can only edit their own profile.
    // (The `isAdmin` field was already authorized above.)
    if (data.name !== undefined) {
      const { user: requester, response: authResponse } = await requireUser();
      if (authResponse) return authResponse;
      if (!requester) {
        return NextResponse.json(
          { error: t("auth.notAuthenticated") },
          { status: 401 },
        );
      }
      if (id !== requester.id && !requester.isAdmin) {
        return NextResponse.json(
          { error: t("users.cannotEditOtherProfile") },
          { status: 403 },
        );
      }
    }

    const updated = await db.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        isAdmin: true,
        createdAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/users/[id] error:", error);
    return NextResponse.json(
      { error: t("users.updateFailed") },
      { status: 500 },
    );
  }
}
