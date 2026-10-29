"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  LogIn,
  Check,
  X,
  Mail,
  UserPlus,
  AlertTriangle,
  Clock,
} from "lucide-react";
import type { Locale } from "@/i18n/config";
import { BRAND } from "@/i18n/brand";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

// =====================================================================
// InvitationPage — accept/reject a project invitation
// ---------------------------------------------------------------------
// Reachable at `/invite/[token]`. The middleware lets `/invite/*`
// through; this page does the auth redirect itself using useSession.
//
// Flow:
//   1. If not authenticated → redirect to /auth/login?callbackUrl=/invite/[token]
//   2. If authenticated → fetch GET /api/invitations/[token]/info
//      (returns project name, owner, role, status, expiry)
//   3. Show invitation details + two buttons:
//      - Accept → POST /api/invitations/[token]/accept → redirect to /?project=slug
//      - Reject → POST /api/invitations/[token]/reject → redirect to /
//
// Error handling:
//   - 404 invitation not found → show "Pozvánka nebyla nalezena"
//   - 403 wrong e-mail → show "Pozvánka není pro váš e-mail"
//   - 400 expired/used → show appropriate message
//
// i18n: the `/invite/[token]/layout.tsx` wraps children in
// `<NextIntlClientProvider>` (via `PublicProviders`), so `useTranslations`
// works in this client component. Shared namespaces reused:
//   - `roles.*`         — role labels (viewer/editor/owner/admin)
//   - `auth.common.*`   — backToHome link
// Page-specific text lives under `public.invite.*`.
// =====================================================================

type InvitationInfo = {
  id: string;
  inviteeEmail: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  project: {
    id: string;
    name: string;
    slug: string;
    ownerId: string;
    ownerName: string | null;
    ownerEmail: string;
  };
  inviter: { id: string; name: string | null; email: string } | null;
};

// Known role IDs — values stored as English IDs in the DB.
const KNOWN_ROLES = ["viewer", "editor", "owner", "admin"] as const;
type RoleId = (typeof KNOWN_ROLES)[number];

function isKnownRole(r: string): r is RoleId {
  return (KNOWN_ROLES as readonly string[]).includes(r);
}

// Status keys mapped to the `public.invite.status.*` namespace.
// The DB may return "pending" | "accepted" | "rejected" | "revoked" | "expired".
// For a pending-but-expired invitation we display the "expired" status.
type InviteStatusKey = "accepted" | "rejected" | "revoked" | "expired" | "invalid";

export default function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const t = useTranslations("public.invite");
  const tRoles = useTranslations("roles");
  const tAuthCommon = useTranslations("auth.common");
  const locale = useLocale() as Locale;
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<"accept" | "reject" | null>(null);

  // Unwrap params promise (Next.js 15+)
  useEffect(() => {
    params.then((p) => setToken(p.token));
  }, [params]);

  // Redirect to login if not authenticated (with callback back here).
  useEffect(() => {
    if (sessionStatus === "unauthenticated" && token) {
      router.replace(`/auth/login?callbackUrl=/invite/${token}`);
    }
  }, [sessionStatus, token, router]);

  // Fetch invitation info once we have the token AND the user is authenticated.
  useEffect(() => {
    if (!token) return;
    if (sessionStatus !== "authenticated") return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/invitations/${token}/info`)
      .then(async (res) => {
        if (cancelled) return null;
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (json as { error?: string }).error || `HTTP ${res.status}`,
          );
        }
        return json as InvitationInfo;
      })
      .then((json) => {
        if (cancelled || !json) return;
        setInfo(json);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : t("toasts.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, sessionStatus, t]);

  const handleAccept = async () => {
    if (!token) return;
    setActing("accept");
    try {
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((json as { error?: string }).error || t("toasts.acceptFailed"));
      }
      toast.success(t("toasts.acceptSuccess"));
      const slug = info?.project?.slug;
      router.push(slug ? `/?project=${slug}` : "/");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toasts.acceptFailed"));
      setActing(null);
    }
  };

  const handleReject = async () => {
    if (!token) return;
    setActing("reject");
    try {
      const res = await fetch(`/api/invitations/${token}/reject`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((json as { error?: string }).error || t("toasts.rejectFailed"));
      }
      toast.success(t("toasts.rejectSuccess"));
      router.push("/");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toasts.rejectFailed"));
      setActing(null);
    }
  };

  // Loading session or info
  if (sessionStatus === "loading" || (sessionStatus === "authenticated" && loading)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-md space-y-4">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-3 type-body text-muted-foreground">{t("loading")}</p>
          </div>
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  // Unauthenticated — redirect effect will fire; render placeholder meanwhile
  if (sessionStatus !== "authenticated") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <LogIn className="h-12 w-12 text-muted-foreground" />
        <p className="type-title-lg font-medium">{t("unauthenticated.title")}</p>
        <p className="type-body text-muted-foreground">{t("unauthenticated.redirecting")}</p>
        <Button asChild className="mt-2">
          <Link href={token ? `/auth/login?callbackUrl=/invite/${token}` : "/auth/login"}>
            {t("unauthenticated.goToLogin")}
          </Link>
        </Button>
      </div>
    );
  }

  // Error state — invitation not found / wrong email / expired / used
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 py-12 text-center">
        <div className="w-full max-w-md space-y-4">
          <div className="flex flex-col items-center gap-2">
            <AlertTriangle className="h-12 w-12 text-warning" />
            <h1 className="type-headline">{t("error.title")}</h1>
            <p className="type-body text-muted-foreground">{error}</p>
          </div>
          <Button asChild className="w-full">
            <Link href="/">{tAuthCommon("backToHome")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!info) {
    return null;
  }

  const roleId: RoleId = isKnownRole(info.role) ? info.role : "viewer";
  const roleLabel = tRoles(roleId);
  const roleDesc = t(`roleDescription.${roleId}`);
  const isExpired = new Date(info.expiresAt) < new Date();
  const isUsed = info.status !== "pending";

  // Map the DB status (or expired-pending) to a translation key.
  function resolveStatusKey(): InviteStatusKey {
    if (info.status === "accepted") return "accepted";
    if (info.status === "rejected") return "rejected";
    if (info.status === "revoked") return "revoked";
    if (info.status === "expired" || isExpired) return "expired";
    return "invalid";
  }
  const statusLabel = t(`status.${resolveStatusKey()}`);

  // Already-used or expired invitation — show appropriate state with no actions
  if (isUsed || isExpired) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 py-12 text-center">
        <div className="w-full max-w-md space-y-4">
          <div className="flex flex-col items-center gap-2">
            <AlertTriangle className="h-12 w-12 text-warning" />
            <h1 className="type-headline">{statusLabel}</h1>
            <p className="type-body text-muted-foreground">
              {t("field.project")} <strong>{info.project.name}</strong>
            </p>
          </div>
          <Button asChild className="w-full">
            <Link href={info.project.slug ? `/?project=${info.project.slug}` : "/"}>
              {t("actions.openProject")}
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/">{tAuthCommon("backToHome")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-6 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="type-display tracking-tight">
              <img src="/logo.svg" alt="Logo" className="h-16 w-16 rounded-xl" />
            </span>
          </Link>
        </div>

        {/* Invitation card */}
        <Card className="shadow-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <UserPlus className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="type-headline">{t("title")}</CardTitle>
            <CardDescription>
              {t.rich("description", {
                name: info.project.name,
                role: roleLabel,
                strong: (chunks) => (
                  <strong className="text-foreground">{chunks}</strong>
                ),
                badge: (chunks) => (
                  <Badge variant="secondary" className="mx-0.5 align-middle">
                    {chunks}
                  </Badge>
                ),
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Project + inviter details */}
            <div className="space-y-2 rounded-lg border bg-surface-container-low p-3 type-body">
              <div className="flex items-start justify-between gap-2">
                <span className="text-on-surface-variant">{t("field.project")}</span>
                <span className="font-medium text-right">{info.project.name}</span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-on-surface-variant">{t("field.owner")}</span>
                <span className="font-medium text-right">
                  {info.project.ownerName || info.project.ownerEmail}
                </span>
              </div>
              {info.inviter && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-on-surface-variant">{t("field.inviter")}</span>
                  <span className="font-medium text-right">
                    {info.inviter.name || info.inviter.email}
                  </span>
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <span className="text-on-surface-variant">{t("field.role")}</span>
                <span className="font-medium text-right">{roleLabel}</span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-on-surface-variant">{t("field.expiresAt")}</span>
                <span className="font-medium text-right flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDate(
                    info.expiresAt,
                    { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" },
                    locale,
                  )}
                </span>
              </div>
            </div>

            {/* Role description */}
            <p className="type-body text-on-surface-variant">{roleDesc}</p>

            {/* Recipient email notice */}
            <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/5 p-3 type-body">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-info" />
              <div>
                <p>{t("emailNotice.title")}</p>
                <p className="font-medium">{info.inviteeEmail}</p>
                <p className="mt-1 type-label text-on-surface-variant">
                  {t("emailNotice.hint")}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-2">
              <Button
                onClick={handleAccept}
                disabled={acting !== null}
                className="w-full gap-1.5"
                size="lg"
              >
                {acting === "accept" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {t("actions.accept")}
              </Button>
              <Button
                onClick={handleReject}
                disabled={acting !== null}
                variant="outline"
                className="w-full gap-1.5"
                size="lg"
              >
                {acting === "reject" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                {t("actions.reject")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center type-label text-muted-foreground">
          {t("footer")}
        </p>
      </div>
    </div>
  );
}
