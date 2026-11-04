import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { db, dbRead } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/authz";
import { generateToken, normalizeEmail } from "@/lib/auth-helpers";
import { sendEmail, emailShell, escapeHtml, escapeUrlAttr } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// =====================================================================
// /api/projects/[id]/invitations
// ---------------------------------------------------------------------
// GET  — list invitations for the project (requires viewer)
// POST — create a new invitation (requires owner), send e-mail via Brevo
//
// The invitation creates a `ProjectInvitation` record with a 24h expiry
// and e-mails the invitee a link `${NEXTAUTH_URL}/invite/${token}`.
// When the invitee signs in (or signs up) and clicks the link, the
// /api/invitations/[token]/accept endpoint creates a ProjectMember
// record. As a fallback, the signIn callback auto-accepts any pending
// invitation whose e-mail matches the user's e-mail — so even if the
// invitee never clicks the link, they get access on first login.
// =====================================================================

const INVITATION_EXPIRY_HOURS = 24;

// SECURITY (audit fix L2): rate-limit invitation sending per owner+IP.
// Without this, an owner can spam invitations to arbitrary e-mails
// (harassment / Brevo daily quota exhaustion). 10/hour is generous
// enough for legitimate project onboarding (you rarely invite more
// than 5 people at once) but tight enough to stop abuse.
const INVITE_SEND_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
} as const;

// Build the HTML body for the project-invitation e-mail.
// SECURITY (audit fix M3): all user-controlled values are HTML-escaped
// before interpolation to prevent HTML injection via projectName /
// inviterName / inviteeEmail. Brevo / Gmail strip most of this, but
// permissive HTML clients could execute the payload.
function invitationEmailHtml(opts: {
  inviteeEmail: string;
  projectName: string;
  inviterName: string | null;
  role: "viewer" | "editor";
  inviteUrl: string;
}): string {
  const roleLabel = opts.role === "editor" ? "Editor" : "Čtenář";
  const roleDesc =
    opts.role === "editor"
      ? "můžete prohlížet a upravovat rozpočet, platby, časové záznamy a kontakty"
      : "můžete prohlížet rozpočet, platby a časové záznamy (pouze pro čtení)";

  // Escape all user-controlled values.
  const safeProjectName = escapeHtml(opts.projectName);
  const safeInviterName = opts.inviterName ? escapeHtml(opts.inviterName) : "Někdo";
  const safeInviteeEmail = escapeHtml(opts.inviteeEmail);
  const safeInviteUrl = escapeUrlAttr(opts.inviteUrl);

  return emailShell(`
    <h1>Pozvánka do projektu „${safeProjectName}"</h1>
    <p>Ahoj,</p>
    <p>${safeInviterName} vás zve do projektu <strong>${safeProjectName}</strong> v aplikaci Stavba s rolí <strong>${roleLabel}</strong> — ${roleDesc}.</p>
    <p>Pozvánka je určena pro e-mail <strong>${safeInviteeEmail}</strong>. Pro přijetí se přihlaste (nebo si založte účet) pod touto e-mailovou adresou a klikněte na tlačítko níže.</p>
    <a href="${safeInviteUrl}" class="btn">Přijmout pozvánku</a>
    <p class="link-fallback">Pokud tlačítko nefunguje, zkopírujte tento odkaz do prohlížeče:<br>${safeInviteUrl}</p>
    <p class="hint">Tento odkaz vyprší za 24 hodin. Pokud vás nikdo nepozval, tento e-mail můžete bezpečně ignorovat.</p>
  `, `Pozvánka do projektu — Stavba`);
}

// ---------------------------------------------------------------------
// GET /api/projects/[id]/invitations
// ---------------------------------------------------------------------
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, "viewer");
  if (!access.ok) return access.response;

  const t = await getTranslations("api.errors");
  try {
    const invitations = await dbRead.projectInvitation.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        inviteeEmail: true,
        role: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
        updatedAt: true,
        inviter: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({
      invitations: invitations.map((inv) => ({
        id: inv.id,
        inviteeEmail: inv.inviteeEmail,
        role: inv.role,
        status: inv.status,
        expiresAt: inv.expiresAt,
        acceptedAt: inv.acceptedAt,
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
        invitedBy: inv.inviter,
      })),
    });
  } catch (error) {
    console.error("GET /api/projects/[id]/invitations error:", error);
    return NextResponse.json(
      { error: t("invitations.loadFailed") },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------
// POST /api/projects/[id]/invitations
// Body: { email: string, role: "viewer" | "editor" }
// ---------------------------------------------------------------------
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, "owner");
  if (!access.ok) return access.response;
  const { user } = access;

  const t = await getTranslations("api.errors");
  try {
    // SECURITY (audit fix L2): rate-limit invitation sending per
    // owner+IP. Done AFTER auth so we have user.id. Keyed by both
    // user.id and IP so a shared-IP user (NAT) doesn't get blocked
    // by another user on the same IP.
    const ip = getClientIp(request);
    const rl = checkRateLimit(
      `invite-send:${user.id}:${ip}`,
      INVITE_SEND_RATE_LIMIT,
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

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: t("invitations.invalidRequestJson") },
        { status: 400 },
      );
    }

    const { email, role } = body as { email?: unknown; role?: unknown };

    if (typeof email !== "string" || !email.trim()) {
      return NextResponse.json(
        { error: t("auth.emailRequired") },
        { status: 400 },
      );
    }
    const inviteeEmail = normalizeEmail(email);

    // Basic e-mail shape validation — same regex as auth-helpers.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteeEmail)) {
      return NextResponse.json(
        { error: t("invitations.invalidEmailFormat") },
        { status: 400 },
      );
    }

    const validRole: "viewer" | "editor" = role === "editor" ? "editor" : "viewer";

    // 1) Is the invitee already a member of the project?
    const existingMember = await db.user.findUnique({
      where: { email: inviteeEmail },
      select: { id: true },
    });

    if (existingMember) {
      // Owner check (owner is implicitly a member — don't allow inviting them)
      if (access.project.ownerId === existingMember.id) {
        return NextResponse.json(
          { error: t("invitations.alreadyOwner") },
          { status: 400 },
        );
      }
      const membership = await db.projectMember.findUnique({
        where: { projectId_userId: { projectId: id, userId: existingMember.id } },
        select: { id: true },
      });
      if (membership) {
        return NextResponse.json(
          { error: t("invitations.alreadyMember") },
          { status: 400 },
        );
      }
    }

    // 2) Is there already an invitation for this e-mail? If pending,
    //    we replace it with a fresh one (regenerate token + extend expiry).
    //    If revoked/expired/rejected, we also replace it.
    const existingInvitation = await db.projectInvitation.findUnique({
      where: {
        projectId_inviteeEmail: { projectId: id, inviteeEmail },
      },
    });
    if (existingInvitation) {
      await db.projectInvitation.delete({ where: { id: existingInvitation.id } });
    }

    // 3) Generate token + compute expiry (24h from now).
    const token = generateToken();
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

    // 4) Persist the invitation.
    const invitation = await db.projectInvitation.create({
      data: {
        projectId: id,
        invitedBy: user.id,
        inviteeEmail,
        role: validRole,
        token,
        status: "pending",
        expiresAt,
      },
    });

    // 5) Send the e-mail via Brevo. We do this AFTER the DB write so the
    //    invitation exists even if Brevo fails — the user can still be
    //    auto-accepted on sign-in.
    const inviteUrl = `${process.env.NEXTAUTH_URL ?? ""}/invite/${token}`;
    try {
      await sendEmail({
        to: inviteeEmail,
        subject: `Pozvánka do projektu „${access.project.name}" — Stavba`,
        htmlContent: invitationEmailHtml({
          inviteeEmail,
          projectName: access.project.name,
          inviterName: user.name,
          role: validRole,
          inviteUrl,
        }),
      });
    } catch (emailError) {
      // Log but don't fail the request — the invitation exists in DB and
      // can still be auto-accepted when the user logs in.
      console.error(
        "Failed to send invitation e-mail (invitation still created):",
        emailError,
      );
    }

    // 6) Audit log.
    await logChanges(id, "ProjectInvitation", invitation.id, "create", null, {
      inviteeEmail,
      role: validRole,
      invitedBy: user.id,
      expiresAt: expiresAt.toISOString(),
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects/[id]/invitations error:", error);
    return NextResponse.json(
      { error: t("invitations.createFailed") },
      { status: 500 },
    );
  }
}
