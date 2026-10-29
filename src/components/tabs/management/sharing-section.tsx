"use client";

// ============================================================
// SharingSection — project members + owner management
// ------------------------------------------------------------
// Extracted from `project-management-tab.tsx`. Behavior is unchanged.
//
// - Avatar with image (Google auth ready) + initials fallback
// - "Správce" badge instead of "Vlastník"
// - "Člen" role label instead of "Prohlížeč"
// - Email autocomplete via datalist (existing users)
// - Detect existing member (warning ring + toast)
// - Detect unknown email (info hint)
// - Optimistic removal with brief loading state on the row
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Crown,
  Eye,
  Edit3,
  UserPlus,
  Shield,
  Share2,
  ArrowRight,
  Loader2,
  Info,
  Lock,
  Mail,
  X,
  AlertTriangle,
  QrCode as QrCodeIcon,
} from "lucide-react";
import { useUpdateProject } from "@/lib/api";
import type { ProjectRole } from "@/lib/roles";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/hooks/use-analytics";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type {
  InvitationRow,
  InvitationStatus,
  MembersResponse,
} from "./types";
import { QrCode } from "./qr-code";

// Status → badge color (MD3 sémantic tokens). Labels are now looked up via
// `t("invitationStatus." + status)` at render time (locales: cs / en).
const INVITATION_STATUS_META: Record<
  InvitationStatus,
  { className: string }
> = {
  pending: {
    className: "bg-warning-soft text-warning-strong",
  },
  accepted: {
    className: "bg-success-soft text-success-strong",
  },
  rejected: {
    className: "bg-muted text-muted-foreground",
  },
  revoked: {
    className: "bg-muted text-muted-foreground",
  },
  expired: {
    className: "bg-danger-soft text-danger-strong",
  },
};

export type SharingSectionProps = {
  projectId: string;
  projectSlug: string;
  projectName: string;
  isPublic: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  userRole: ProjectRole;
  currentUserId: string | null;
};

export function SharingSection({
  projectId,
  projectSlug,
  projectName,
  isPublic,
  isOwner,
  isAdmin,
  userRole,
  currentUserId,
}: SharingSectionProps) {
  // `canManage` covers everything an owner can do EXCEPT delete (delete is
  // gated separately in the parent component, owner-only). Editors get a
  // narrower set of permissions: they can invite new members (as viewer /
  // editor only — no owner option) and share the link, but cannot toggle
  // public visibility, change the project owner, revoke invitations, or
  // change existing members' roles.
  const canManage = isOwner || isAdmin;
  const canInvite = canManage || userRole === "editor";
  const t = useTranslations("tabs.management.sharing");
  const tCommon = useTranslations("common");
  const [data, setData] = useState<MembersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("viewer");
  const [adding, setAdding] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  // Confirmation dialog state for member removal. Set when the user clicks
  // the "Odebrat člena" / "Opustit projekt" button — the actual removal
  // (optimistic update + DELETE call + rollback) only fires after the user
  // confirms in the AlertDialog rendered at the bottom of the section.
  const [confirmRemove, setConfirmRemove] = useState<{
    memberId: string;
    name: string;
  } | null>(null);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [lastToastEmail, setLastToastEmail] = useState<string>("");
  // Pending invitations list (ProjectInvitation rows that haven't been
  // accepted/rejected yet). Fetched separately from members.
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(true);
  const [revokingIds, setRevokingIds] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  // SharingSection has its own analytics scope (its own projectId) so we
  // instantiate useAnalytics here to fire `project_share` telemetry events.
  const { trackEvent } = useAnalytics(projectId);
  // Re-use the parent ProjectManagementTab's updateProject mutation so the
  // isPublic toggle optimistically updates the project cache (sidebar,
  // project list, etc.) the same way the inline-edit ProjectInfoCard does.
  const updateProject = useUpdateProject(projectId);

  // Copy the public shareable link (`/p/<slug>`) to the clipboard.
  // Anyone with this link can view a public project read-only. If the
  // project is private, the link still resolves but the page redirects
  // to /auth/login — warn the user about that case.
  const handleShare = async () => {
    try {
      const url = `${window.location.origin}/p/${projectSlug}`;
      await navigator.clipboard.writeText(url);
      if (isPublic) {
        toast.success(t("toasts.shareLinkCopied"));
      } else {
        toast.warning(t("toasts.shareLinkPrivate"));
      }
      trackEvent("project_share", { action: "copy_link", role: "viewer", isPublic });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.shareLinkError"));
    }
  };

  // Toggle project public visibility. Uses optimistic update via
  // useUpdateProject mutation (which invalidates projects list, etc.).
  const handleTogglePublic = (next: boolean) => {
    updateProject.mutate(
      { isPublic: next },
      {
        onSuccess: () => {
          toast.success(
            next
              ? t("toasts.madePublic")
              : t("toasts.madePrivate"),
          );
          trackEvent("project_share", { action: "toggle_public", isPublic: next });
        },
        onError: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : t("toasts.publicToggleError"));
        },
      },
    );
  };

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Fetch pending invitations for the project (separate endpoint —
  // invitations for users who haven't yet accepted / registered).
  const fetchInvitations = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/invitations`);
      if (res.ok) {
        const json = await res.json();
        setInvitations(json.invitations ?? []);
      }
    } catch {
      // ignore
    } finally {
      setInvitationsLoading(false);
    }
  }, [projectId]);

  // Fetch members + all users + invitations on mount
  useEffect(() => {
    fetchMembers();
    fetchInvitations();
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((users) => setAllUsers(users))
      .catch(() => setAllUsers([]));
  }, [fetchMembers, fetchInvitations]);

  // Detect typed email matches (existing member or owner)
  const typedEmail = addEmail.trim().toLowerCase();
  const matchedMember =
    typedEmail && data?.members.find((m) => m.user.email.toLowerCase() === typedEmail);
  const matchedOwner =
    typedEmail && data?.owner?.email?.toLowerCase() === typedEmail;
  const isExistingMember = !!(matchedMember || matchedOwner);
  const isKnownUser =
    typedEmail && allUsers.some((u) => u.email.toLowerCase() === typedEmail);
  const hasAt = typedEmail.includes("@");
  const isNewUserHint = hasAt && !isExistingMember && !isKnownUser && typedEmail.length > 3;

  // Show toast once when email matches existing member
  useEffect(() => {
    if (isExistingMember && lastToastEmail !== typedEmail) {
      toast.warning(t("toasts.alreadyMember"));
      setLastToastEmail(typedEmail);
    } else if (!isExistingMember && lastToastEmail && lastToastEmail !== typedEmail) {
      setLastToastEmail("");
    }
  }, [isExistingMember, typedEmail, lastToastEmail, t]);

  const handleAdd = async () => {
    if (!addEmail.trim()) return;
    if (isExistingMember) {
      toast.warning(t("toasts.alreadyMember"));
      return;
    }
    setAdding(true);
    try {
      // Always create a ProjectInvitation (the dedicated /invitations
      // endpoint sends the e-mail and creates a 24h-expiry invitation
      // even if the invitee is already a registered user — for a
      // registered user the invitation is auto-accepted on their next
      // sign-in, or they can accept via the /invite/[token] page).
      const res = await fetch(`/api/projects/${projectId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail.trim(), role: addRole }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("toasts.inviteError"));
      }
      // Telemetry: project_share — invite
      trackEvent("project_share", {
        action: "invite",
        email: addEmail.trim(),
        role: addRole,
      });
      toast.success(t("toasts.inviteSent", { email: addEmail.trim() }));
      setAddEmail("");
      setLastToastEmail("");
      // Refresh the invitations list so the new pending row appears.
      fetchInvitations();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toasts.inviteError"));
    } finally {
      setAdding(false);
    }
  };

  // Revoke a pending invitation. Owner-only action — the API endpoint
  // enforces ownership, so we don't need to check isOwner here.
  const handleRevokeInvitation = async (invitationId: string, email: string) => {
    setRevokingIds((prev) => {
      const next = new Set(prev);
      next.add(invitationId);
      return next;
    });
    // Optimistically remove from local state after brief delay
    const removeTimer = setTimeout(() => {
      setInvitations((cur) => cur.filter((inv) => inv.id !== invitationId));
    }, 220);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/invitations/${invitationId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      clearTimeout(removeTimer);
      setInvitations((cur) => cur.filter((inv) => inv.id !== invitationId));
      trackEvent("project_share", {
        action: "revoke_invitation",
        email,
      });
      toast.success(t("toasts.inviteRevoked", { email }));
    } catch (err) {
      clearTimeout(removeTimer);
      // Restore the invitation at its original position
      const restore = invitations.find((inv) => inv.id === invitationId);
      if (restore) {
        setInvitations((cur) => {
          if (cur.some((inv) => inv.id === invitationId)) return cur;
          return [...cur, restore];
        });
      } else {
        fetchInvitations();
      }
      toast.error(err instanceof Error ? err.message : t("toasts.inviteRevokeError"));
    } finally {
      setRevokingIds((prev) => {
        const next = new Set(prev);
        next.delete(invitationId);
        return next;
      });
    }
  };

  const handleRoleChange = async (memberId: string, role: string) => {
    // Look up old role + email BEFORE optimistic update for telemetry
    const member = data?.members.find((m) => m.id === memberId);
    const oldRole = member?.role;
    const memberEmail = member?.user.email;
    // Optimistic role update
    const prev = data;
    setData((cur) =>
      cur
        ? { ...cur, members: cur.members.map((m) => (m.id === memberId ? { ...m, role } : m)) }
        : cur,
    );
    try {
      const res = await fetch(`/api/projects/${projectId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      // Telemetry: project_share — role_change
      trackEvent("project_share", {
        action: "role_change",
        email: memberEmail ?? null,
        oldRole: oldRole ?? null,
        newRole: role,
      });
      toast.success(t("toasts.roleChanged"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.roleChangeError"));
      setData(prev); // restore previous state
    }
  };

  // Open the confirmation dialog. The actual removal happens in
  // `confirmRemoveMember` after the user confirms. We deliberately
  // separate the trigger from the action so the AlertDialog can show
  // the member's name (and the user has a chance to cancel before any
  // network / state mutation).
  const handleRemove = (memberId: string, name: string) => {
    setConfirmRemove({ memberId, name });
  };

  // Perform the actual member removal — called from the AlertDialog's
  // "Odebrat člena" action button. Reuses the original optimistic-update
  // logic (brief loading state on the row → optimistic remove → API
  // DELETE → confirm / rollback on error).
  const confirmRemoveMember = async () => {
    if (!confirmRemove) return;
    const { memberId, name } = confirmRemove;
    // Close the dialog immediately so the user sees feedback on the row.
    setConfirmRemove(null);

    const memberToRestore = data?.members.find((m) => m.id === memberId);
    const memberEmail = memberToRestore?.user.email;
    // Brief loading state on the specific row
    setRemovingIds((prev) => {
      const next = new Set(prev);
      next.add(memberId);
      return next;
    });
    // Optimistically remove from local state after brief delay
    const removeTimer = setTimeout(() => {
      setData((cur) =>
        cur ? { ...cur, members: cur.members.filter((m) => m.id !== memberId) } : cur,
      );
    }, 220);

    try {
      const res = await fetch(`/api/projects/${projectId}/members/${memberId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      clearTimeout(removeTimer);
      // Ensure removed from state immediately on success
      setData((cur) =>
        cur ? { ...cur, members: cur.members.filter((m) => m.id !== memberId) } : cur,
      );
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(memberId);
        return next;
      });
      // Telemetry: project_share — remove
      trackEvent("project_share", {
        action: "remove",
        email: memberEmail ?? null,
      });
      toast.success(t("toasts.memberRemoved", { name }));
    } catch (err) {
      clearTimeout(removeTimer);
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(memberId);
        return next;
      });
      // Restore the member at original position
      if (memberToRestore) {
        setData((cur) => {
          if (!cur) return cur;
          if (cur.members.some((m) => m.id === memberId)) return cur;
          return { ...cur, members: [...cur.members, memberToRestore] };
        });
      } else {
        fetchMembers();
      }
      toast.error(err instanceof Error ? err.message : t("toasts.memberRemoveError"));
    }
  };

  const handleChangeOwner = async (newOwnerId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: newOwnerId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to change owner");
      }
      toast.success(t("toasts.ownerChanged"));
      qc.invalidateQueries({ queryKey: ["projects"] });
      fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.ownerChangeError"));
    }
  };

  if (loading) return <Skeleton className="h-48" />;

  const owner = data?.owner;
  const members = data?.members ?? [];
  const pendingInvitations = invitations.filter((inv) => inv.status === "pending");
  const pastInvitations = invitations.filter((inv) => inv.status !== "pending");

  return (
    <>
    <Card className="bg-surface-container-low shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 type-title-lg font-semibold">
              <Shield className="h-4 w-4 text-primary" />
              {t("title")}
            </CardTitle>
            <CardDescription className="mt-1 type-body text-on-surface-variant">{t("description")}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 rounded-full gap-1.5"
            onClick={handleShare}
            title={t("button.shareTitle")}
            aria-label={t("button.shareTitle")}
          >
            <Share2 className="h-3.5 w-3.5" />
            {t("button.share")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ===== Public project toggle ===== */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-6">
          <div className="min-w-0">
            <p className="type-body font-medium">{t("toggle.publicProject.label")}</p>
            <p className="type-label text-on-surface-variant">
              {t("toggle.publicProject.description")}
            </p>
          </div>
          <Switch
            checked={isPublic}
            onCheckedChange={handleTogglePublic}
            disabled={!canManage || updateProject.isPending}
            aria-label={t("aria.publicToggle")}
          />
        </div>
        {/* Editors see a "Pouze správce" hint explaining why the Switch
            is disabled. Owners / admins don't need this. */}
        {!canManage && (
          <div className="-mt-2 flex items-center gap-1.5 type-label text-muted-foreground">
            <Lock className="h-3 w-3" /> {t("lockHint")}
          </div>
        )}
        <div className="flex items-start gap-2 rounded-lg bg-info/5 p-2.5 type-label text-on-surface-variant">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-info" />
          <span>
            {t("publicInfo")}
          </span>
        </div>

        {/* ===== Owner ===== */}
        {owner && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-surface-container-low p-3">
            <Avatar className="h-10 w-10 shrink-0 border border-primary/30">
              {owner.image ? (
                <AvatarImage src={owner.image} alt={owner.name || owner.email} />
              ) : null}
              <AvatarFallback className="bg-secondary-container type-label-sm font-bold text-secondary-container-foreground">
                <Crown className="h-5 w-5 text-primary" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="type-body font-semibold">{owner.name || owner.email}</span>
                <Badge variant="secondary" className={cn("type-label-sm", "bg-success-soft text-success-strong dark:bg-success-soft dark:text-success-strong")}>{t("badge.owner")}</Badge>
              </div>
              <div className="type-label text-on-surface-variant truncate">{owner.email}</div>
            </div>
            {/* Change owner dropdown — owner / admin only. Editors
                cannot transfer ownership (the API also rejects this —
                `requireProjectAccess(id, "owner")` in the PATCH handler). */}
            {canManage && allUsers.length > 0 && (
              <Select onValueChange={handleChangeOwner}>
                <SelectTrigger className="h-8 w-auto rounded-full type-label-sm">
                  <span className="flex items-center gap-1"><ArrowRight className="h-3 w-3" /> {t("button.transferOwnership")}</span>
                </SelectTrigger>
                <SelectContent>
                  {allUsers
                    .filter((u) => u.id !== owner.id)
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name || u.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* ===== Members list ===== */}
        {members.length > 0 ? (
          <div className="space-y-1.5">
            {members.map((m) => {
              const isRemoving = removingIds.has(m.id);
              const isMatched = matchedMember?.id === m.id;
              // Owner / admin can change roles + remove any member.
              // Editors cannot change roles (the role Select is hidden for
              // them) — the API also rejects PATCH calls from non-owners.
              // A non-managing user can only remove THEMSELF (self-leave).
              const canManageMember = canManage;
              const isSelf = currentUserId === m.user.id;
              const canRemove = canManage || isSelf;
              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border bg-surface-container-low p-3 transition-all",
                    isMatched
                      ? "border-warning ring-2 ring-warning/30"
                      : "border-outline-variant",
                    isRemoving && "opacity-50",
                  )}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    {m.user.image ? (
                      <AvatarImage src={m.user.image} alt={m.user.name || m.user.email} />
                    ) : null}
                    <AvatarFallback className="bg-secondary-container type-label-sm font-bold text-secondary-container-foreground">
                      {(m.user.name || m.user.email)[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="type-body font-medium truncate">{m.user.name || m.user.email}</div>
                    <div className="type-label text-on-surface-variant truncate">{m.user.email}</div>
                  </div>
                  {/* Role selector — owner / admin only */}
                  {canManageMember ? (
                    <Select value={m.role} onValueChange={(v) => handleRoleChange(m.id, v)}>
                      <SelectTrigger className="h-7 w-auto rounded-full type-label-sm gap-1">
                        {m.role === "editor" ? <Edit3 className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        {m.role === "editor" ? t("role.editor") : t("role.viewer")}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer"><Eye className="mr-1.5 inline h-3 w-3" /> {t("roleSelect.viewer")}</SelectItem>
                        <SelectItem value="editor"><Edit3 className="mr-1.5 inline h-3 w-3" /> {t("roleSelect.editor")}</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary" className={cn("type-label-sm gap-1", m.role === "editor" ? "bg-info-soft text-info-strong dark:bg-info-soft dark:text-info-strong" : "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground")}>
                      {m.role === "editor" ? <Edit3 className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {m.role === "editor" ? t("role.editor") : t("role.viewer")}
                    </Badge>
                  )}
                  {/* Remove — owner / admin (anyone) or self (self-leave) */}
                  {canRemove && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 rounded-full state-layer-on-surface text-muted-foreground hover:text-danger"
                      onClick={() => handleRemove(m.id, m.user.name || m.user.email)}
                      disabled={isRemoving}
                      aria-label={isSelf && !canManage ? t("aria.leaveProject") : t("aria.removeMember")}
                      title={isSelf && !canManage ? t("aria.leaveProject") : t("aria.removeMember")}
                    >
                      {isRemoving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="type-label text-on-surface-variant">{t("empty.members")}</p>
        )}

        {/* ===== Pending invitations list ===== */}
        {(pendingInvitations.length > 0 || invitationsLoading) && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 type-label text-on-surface-variant">
              <Mail className="h-3.5 w-3.5" /> {t("pending.title")}
            </div>
            {invitationsLoading ? (
              <Skeleton className="h-12" />
            ) : (
              pendingInvitations.map((inv) => {
                const isRevoking = revokingIds.has(inv.id);
                const roleLabel = inv.role === "editor" ? t("role.editor") : t("role.viewer");
                const isExpired = new Date(inv.expiresAt) < new Date();
                const statusKey: InvitationStatus = isExpired ? "expired" : inv.status;
                const statusMeta = INVITATION_STATUS_META[statusKey] ?? INVITATION_STATUS_META.pending;
                const statusLabel = t(`invitationStatus.${statusKey}`);
                return (
                  <div
                    key={inv.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border bg-surface-container-low p-3 transition-all",
                      isRevoking && "opacity-50",
                      "border-outline-variant",
                    )}
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="bg-secondary-container type-label-sm font-bold text-secondary-container-foreground">
                        <Mail className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="type-body font-medium truncate">{inv.inviteeEmail}</div>
                      <div className="type-label text-on-surface-variant truncate">
                        {t("pending.role", { role: roleLabel, date: formatDate(inv.expiresAt, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) })}
                      </div>
                    </div>
                    <Badge variant="secondary" className={cn("type-label-sm", statusMeta.className)}>
                      {statusLabel}
                    </Badge>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 rounded-full state-layer-on-surface text-muted-foreground hover:text-danger"
                        onClick={() => handleRevokeInvitation(inv.id, inv.inviteeEmail)}
                        disabled={isRevoking}
                        aria-label={t("aria.revokeInvitation")}
                        title={t("aria.revokeInvitation")}
                      >
                        {isRevoking ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ===== Past invitations (collapsed history) ===== */}
        {pastInvitations.length > 0 && (
          <details className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <summary className="cursor-pointer type-label text-on-surface-variant select-none">
              {t("invitationHistory.title", { count: pastInvitations.length })}
            </summary>
            <div className="mt-2 space-y-1.5">
              {pastInvitations.map((inv) => {
                const roleLabel = inv.role === "editor" ? t("role.editor") : t("role.viewer");
                const statusMeta =
                  INVITATION_STATUS_META[inv.status] ?? INVITATION_STATUS_META.pending;
                const statusLabel = t(`invitationStatus.${inv.status}`);
                return (
                  <div
                    key={inv.id}
                    className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-2.5 type-body"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="type-body font-medium truncate">{inv.inviteeEmail}</div>
                      <div className="type-label text-on-surface-variant truncate">
                        {t("invitationHistory.role", { role: roleLabel, date: formatDate(inv.createdAt) })}
                      </div>
                    </div>
                    <Badge variant="secondary" className={cn("type-label-sm", statusMeta.className)}>
                      {statusLabel}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </details>
        )}

        {/* ===== Invite form (Pozvat e-mailem) ===== */}
        <div className="rounded-lg border border-dashed border-outline-variant p-3">
          <div className="mb-2 flex items-center gap-1.5 type-label text-on-surface-variant">
            <UserPlus className="h-3.5 w-3.5" /> {t("inviteForm.title")}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder={t("inviteForm.placeholderEmail")}
              type="email"
              list="users-datalist"
              className={cn(
                "h-8 flex-1 min-w-[200px] type-body",
                isExistingMember && "border-warning ring-2 ring-warning/30",
                isNewUserHint && "border-info/50",
              )}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <datalist id="users-datalist">
              {allUsers.map((u) => (
                <option key={u.id} value={u.email}>
                  {u.name || u.email}
                </option>
              ))}
            </datalist>
            <Select value={addRole} onValueChange={setAddRole}>
              <SelectTrigger className="h-8 w-auto rounded-full type-label-sm gap-1">
                {addRole === "editor" ? <Edit3 className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {addRole === "editor" ? t("role.editor") : t("role.viewer")}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer"><Eye className="mr-1.5 inline h-3 w-3" /> {t("role.viewer")}</SelectItem>
                <SelectItem value="editor"><Edit3 className="mr-1.5 inline h-3 w-3" /> {t("role.editor")}</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="rounded-full gap-1.5" onClick={handleAdd} disabled={!addEmail.trim() || adding || !canInvite}>
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              {t("inviteForm.button")}
            </Button>
          </div>
          {/* Hints */}
          {isExistingMember && (
            <div className="mt-2 flex items-center gap-1.5 type-label text-warning">
              <AlertTriangle className="h-3 w-3" /> {t("inviteForm.hint.existingMember")}
            </div>
          )}
          {isNewUserHint && !isExistingMember && (
            <div className="mt-2 flex items-center gap-1.5 type-label text-info">
              <Info className="h-3 w-3" /> {t("inviteForm.hint.newUser")}
            </div>
          )}
          {/* Editors can invite but only as viewer/editor — surface this
              so the role Select makes sense. Viewers see the standard
              "owner-only" lock hint (they never reach this tab through the
              sidebar, but the gate also covers direct deep-links). */}
          {userRole === "editor" && (
            <div className="mt-2 flex items-center gap-1.5 type-label text-info">
              <Info className="h-3 w-3" /> {t("inviteForm.hint.editor")}
            </div>
          )}
          {!canInvite && (
            <div className="mt-2 flex items-center gap-1.5 type-label text-muted-foreground">
              <Lock className="h-3 w-3" /> {t("inviteForm.hint.noInvite")}
            </div>
          )}
        </div>

        {/* ===== QR code — share via scan ===== */}
        <div className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
          <div className="mb-3 flex items-center gap-2">
            <QrCodeIcon className="h-4 w-4 text-primary" />
            <span className="type-body font-medium">{t("qr.title")}</span>
          </div>
          <p className="mb-3 type-label text-on-surface-variant">
            {t("qr.description")}
          </p>
          <div className="flex flex-col items-center gap-3">
            <QrCode projectSlug={projectSlug} projectName={projectName} />
          </div>
        </div>
      </CardContent>
    </Card>

    {/* ===== Confirmation dialog for member removal =====
        Triggered from the row "Odebrat člena" / "Opustit projekt"
        button via `setConfirmRemove({ memberId, name })`. The actual
        removal is performed in `confirmRemoveMember` (called from
        AlertDialogAction). Cancel just clears the state. */}
    <AlertDialog
      open={!!confirmRemove}
      onOpenChange={(open) => !open && setConfirmRemove(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmRemove.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("confirmRemove.body", { name: confirmRemove?.name ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("confirmRemove.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={confirmRemoveMember}>
            {t("confirmRemove.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
}
