"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

export default function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
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
        setError(e instanceof Error ? e.message : "Nepodařilo se načíst pozvánku.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, sessionStatus]);

  const handleAccept = async () => {
    if (!token) return;
    setActing("accept");
    try {
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((json as { error?: string }).error || "Nepodařilo se přijmout pozvánku.");
      }
      toast.success("Pozvánka přijata — přesouvám do projektu");
      const slug = info?.project?.slug;
      router.push(slug ? `/?project=${slug}` : "/");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nepodařilo se přijmout pozvánku.");
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
        throw new Error((json as { error?: string }).error || "Nepodařilo se odmítnout pozvánku.");
      }
      toast.success("Pozvánka odmítnuta");
      router.push("/");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nepodařilo se odmítnout pozvánku.");
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
            <p className="mt-3 text-sm text-muted-foreground">Načítám pozvánku…</p>
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
        <p className="text-lg font-medium">Přihlaste se pro zobrazení pozvánky</p>
        <p className="text-sm text-muted-foreground">Přesměrovávám na přihlášení…</p>
        <Button asChild className="mt-2">
          <Link href={token ? `/auth/login?callbackUrl=/invite/${token}` : "/auth/login"}>
            Přejít na přihlášení
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
            <h1 className="text-xl font-semibold">Pozvánka není dostupná</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button asChild className="w-full">
            <Link href="/">Zpět na hlavní stránku</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!info) {
    return null;
  }

  const roleLabel = info.role === "editor" ? "Editor" : "Čtenář";
  const roleDesc =
    info.role === "editor"
      ? "Můžete prohlížet a upravovat rozpočet, platby, časové záznamy a kontakty."
      : "Můžete prohlížet rozpočet, platby a časové záznamy (pouze pro čtení).";
  const isExpired = new Date(info.expiresAt) < new Date();
  const isUsed = info.status !== "pending";

  // Already-used or expired invitation — show appropriate state with no actions
  if (isUsed || isExpired) {
    const statusLabel =
      info.status === "accepted"
        ? "Pozvánka již byla přijata"
        : info.status === "rejected"
          ? "Pozvánka byla odmítnuta"
          : info.status === "revoked"
            ? "Pozvánka byla zrušena správcem"
            : info.status === "expired" || isExpired
              ? "Pozvánka vypršela"
              : "Pozvánka již není platná";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 py-12 text-center">
        <div className="w-full max-w-md space-y-4">
          <div className="flex flex-col items-center gap-2">
            <AlertTriangle className="h-12 w-12 text-warning" />
            <h1 className="text-xl font-semibold">{statusLabel}</h1>
            <p className="text-sm text-muted-foreground">
              Projekt: <strong>{info.project.name}</strong>
            </p>
          </div>
          <Button asChild className="w-full">
            <Link href={info.project.slug ? `/?project=${info.project.slug}` : "/"}>
              Otevřít projekt
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/">Zpět na hlavní stránku</Link>
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
            <span className="text-2xl font-bold tracking-tight">
              Stavba<span className="text-primary">.</span>
            </span>
          </Link>
        </div>

        {/* Invitation card */}
        <Card className="shadow-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <UserPlus className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-xl">Pozvánka do projektu</CardTitle>
            <CardDescription>
              Byl jste pozván do projektu{" "}
              <strong className="text-foreground">{info.project.name}</strong>{" "}
              rolí{" "}
              <Badge variant="secondary" className="mx-0.5 align-middle">
                {roleLabel}
              </Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Project + inviter details */}
            <div className="space-y-2 rounded-lg border bg-surface-container-low p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="text-on-surface-variant">Projekt:</span>
                <span className="font-medium text-right">{info.project.name}</span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-on-surface-variant">Správce:</span>
                <span className="font-medium text-right">
                  {info.project.ownerName || info.project.ownerEmail}
                </span>
              </div>
              {info.inviter && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-on-surface-variant">Pozval:</span>
                  <span className="font-medium text-right">
                    {info.inviter.name || info.inviter.email}
                  </span>
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <span className="text-on-surface-variant">Role:</span>
                <span className="font-medium text-right">{roleLabel}</span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-on-surface-variant">Platnost do:</span>
                <span className="font-medium text-right flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDate(info.expiresAt, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>

            {/* Role description */}
            <p className="text-sm text-on-surface-variant">{roleDesc}</p>

            {/* Recipient email notice */}
            <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/5 p-3 text-sm">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-info" />
              <div>
                <p>Pozvánka je určena pro e-mail:</p>
                <p className="font-medium">{info.inviteeEmail}</p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Pro přijetí musíte být přihlášeni pod tímto e-mailem.
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
                Přijmout pozvánku
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
                Odmítnout
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Pokud vás nikdo nepozval, tento e-mail můžete bezpečně ignorovat.
        </p>
      </div>
    </div>
  );
}
