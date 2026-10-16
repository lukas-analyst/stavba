"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Loader2,
  User as UserIcon,
  Mail,
  KeyRound,
  LogOut,
  ArrowLeft,
  ShieldCheck,
  EyeOff,
  Info,
  Github,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useProjects } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { useHiddenProjectsSync } from "@/hooks/use-hidden-projects";
import {
  APP_VERSION,
  GIT_COMMIT_HASH,
  GIT_COMMIT_DATE,
  GIT_BRANCH,
  VERSION_LABEL,
} from "@/generated/version";

// =====================================================================
// /auth/settings — unified settings page
// ---------------------------------------------------------------------
// Sections:
//   1. Skryté projekty — toggle per-project visibility in TopBar dropdown
//      + sidebar (state persisted to localStorage `stavba:hidden-projects`
//      via the useAppStore action `toggleProjectHidden`).
//   2. Profil          — name (editable, PATCH /api/users/[id]) +
//      e-mail (read-only) + "Změnit heslo" (→ /auth/profile) +
//      "Odhlásit všechny relace" (same handler as /auth/profile).
//   3. O aplikaci      — version (from @/generated/version), GitHub link,
//      short description.
//
// Layout mirrors /auth/profile: logo + max-w-md card. Access requires
// authentication + e-mail verification (see middleware.ts: isProfilePage).
// =====================================================================

type UserProfile = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  createdAt: string;
};

// Repository URL — shown in the "O aplikaci" section. Hard-coded because
// package.json doesn't include a `repository` field (this is a private
// deployment). Falls back to the GitHub homepage when not set.
const GITHUB_URL = "https://github.com/lukas-hanzlik/stavba";

export default function SettingsPage() {
  const router = useRouter();
  const { data: session, update: updateSession } = useSession();

  // ===== Hidden projects state =====
  const hiddenProjectIds = useAppStore((s) => s.hiddenProjectIds);
  const toggleProjectHidden = useAppStore((s) => s.toggleProjectHidden);
  // Hydrate from localStorage on mount + persist on change
  useHiddenProjectsSync();

  const { data: projects, isLoading: loadingProjects } = useProjects();

  // ===== Profile state =====
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [name, setName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // ===== Sessions state (revoke all) =====
  const [revokingSessions, setRevokingSessions] = useState(false);

  // Fetch user profile on mount (same as /auth/profile)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users/profile");
        if (!res.ok) return;
        const data = (await res.json()) as UserProfile;
        if (cancelled) return;
        setProfile(data);
        setName(data.name ?? "");
      } catch {
        // ignore — session may not be loaded yet
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ===== Save profile (name) — same handler as /auth/profile =====
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingProfile(true);
    try {
      const res = await fetch(`/api/users/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "Uložení profilu selhalo.");
        return;
      }
      // Refresh session so the avatar/name updates immediately in TopBar
      await updateSession();
      setProfile({ ...profile, name: name.trim() || null });
      toast.success("Profil byl uložen.");
    } catch {
      toast.error("Uložení profilu selhalo. Zkuste to prosím znovu.");
    } finally {
      setSavingProfile(false);
    }
  };

  // ===== Revoke other sessions — same handler as /auth/profile =====
  const handleRevokeSessions = useCallback(async () => {
    setRevokingSessions(true);
    try {
      const res = await fetch("/api/users/profile/sessions/revoke", {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "Odhlášení ostatních relací selhalo.");
        return;
      }
      await updateSession();
      toast.success("Všechny ostatní relace byly odhlášeny.");
    } catch {
      toast.error("Odhlášení ostatních relací selhalo. Zkuste to prosím znovu.");
    } finally {
      setRevokingSessions(false);
    }
  }, [updateSession]);

  const sessionUser = session?.user;
  const displayEmail = profile?.email ?? sessionUser?.email ?? "";

  // Build commit-date string (only if available from git)
  const commitDateLabel = GIT_COMMIT_DATE
    ? new Date(GIT_COMMIT_DATE).toLocaleString("cs-CZ", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight">
              Stavba<span className="text-primary">.</span>
            </span>
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            Skryté projekty, profil a informace o aplikaci
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="mb-1 text-xl font-semibold">Nastavení</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Spravujte viditelnost projektů, svůj profil a zjistěte více o aplikaci.
          </p>

          <div className="space-y-8">
            {/* ====== Section 1: Skryté projekty ====== */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <EyeOff className="h-4 w-4" />
                <span>Skryté projekty</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Skryté projekty se nezobrazují v přepínači projektů v horní liště.
                Stále jsou přístupné přes přímý odkaz.
              </p>

              {loadingProjects ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : projects && projects.length > 0 ? (
                <ul className="space-y-1.5">
                  {projects.map((p) => {
                    const isHidden = hiddenProjectIds.includes(p.id);
                    return (
                      <li
                        key={p.id}
                        className="flex items-center gap-3 rounded-lg border bg-surface-container-low p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">
                              {p.name}
                            </span>
                            {p.starred && (
                              <Badge
                                variant="secondary"
                                className="shrink-0 text-[10px] bg-warning-soft text-warning-strong"
                              >
                                ★
                              </Badge>
                            )}
                          </div>
                          {p.address && (
                            <p className="truncate text-xs text-muted-foreground">
                              {p.address}
                            </p>
                          )}
                        </div>
                        <Switch
                          checked={isHidden}
                          onCheckedChange={() => toggleProjectHidden(p.id)}
                          aria-label={
                            isHidden
                              ? `Zobrazit projekt ${p.name}`
                              : `Skrýt projekt ${p.name}`
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-lg border bg-surface-container-low p-3 text-sm text-muted-foreground">
                  Zatím nemáte žádné projekty.
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                Zapnutý přepínač = projekt je skrytý. Změny se ukládají automaticky.
              </p>
            </section>

            <div className="h-px bg-border" />

            {/* ====== Section 2: Profil (zjednodušený) ====== */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <UserIcon className="h-4 w-4" />
                <span>Profil</span>
              </div>

              {loadingProfile ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Jméno</Label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="name"
                        type="text"
                        placeholder="Jan Novák"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="name"
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="email">E-mail</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={displayEmail}
                        readOnly
                        disabled
                        className="pl-9 cursor-not-allowed opacity-70"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      E-mail nelze změnit. Pro změnu kontaktujte podporu.
                    </p>
                  </div>

                  <Button
                    type="submit"
                    disabled={savingProfile}
                    className="w-full"
                    size="lg"
                  >
                    {savingProfile ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Ukládám…
                      </>
                    ) : (
                      "Uložit jméno"
                    )}
                  </Button>

                  {/* Secondary actions: change password + revoke sessions */}
                  <div className="flex flex-col gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => router.push("/auth/profile")}
                    >
                      <KeyRound className="h-4 w-4" />
                      Změnit heslo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2"
                      onClick={handleRevokeSessions}
                      disabled={revokingSessions}
                    >
                      {revokingSessions ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )}
                      {revokingSessions
                        ? "Odhlašuji relace…"
                        : "Odhlásit všechny ostatní relace"}
                    </Button>
                  </div>
                </form>
              )}
            </section>

            <div className="h-px bg-border" />

            {/* ====== Section 3: O aplikaci ====== */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Info className="h-4 w-4" />
                <span>O aplikaci</span>
              </div>

              <p className="text-sm text-muted-foreground">
                Aplikace <strong className="text-foreground">Stavba</strong> slouží
                ke komplexní správě rozpočtu, nákladů, času a materiálu pro stavby
                a rekonstrukce. Vytvořte si projekt, přidejte rozpočet, sledujte
                platby a čas, spravujte kontakty a sdílejte práci s týmem.
              </p>

              {/* Version metadata card */}
              <div className="space-y-1.5 rounded-lg border bg-surface-container-low p-3 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Verze</span>
                  <span className="font-mono font-medium">{APP_VERSION}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Commit</span>
                  <span className="font-mono font-medium">{GIT_COMMIT_HASH}</span>
                </div>
                {commitDateLabel && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Datum buildu</span>
                    <span className="tabular-nums">{commitDateLabel}</span>
                  </div>
                )}
                {GIT_BRANCH && GIT_BRANCH !== "unknown" && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Větev</span>
                    <span className="font-mono">{GIT_BRANCH}</span>
                  </div>
                )}
                <div className="flex justify-between gap-2 border-t border-outline-variant pt-1.5 mt-1.5">
                  <span className="text-muted-foreground">Label</span>
                  <span className="font-mono text-muted-foreground">
                    {VERSION_LABEL}
                  </span>
                </div>
              </div>

              {/* GitHub link */}
              <Button
                asChild
                variant="outline"
                className="w-full gap-2"
                size="lg"
              >
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="h-4 w-4" />
                  Zdrojový kód na GitHubu
                  <ExternalLink className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                </a>
              </Button>
            </section>
          </div>
        </div>

        {/* Footer: Back to home + sign-out */}
        <div className="mt-6 flex flex-col items-center gap-3">
          <div className="flex w-full gap-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="flex-1 gap-2 text-muted-foreground"
            >
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
                Zpět na hlavní stránku
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 gap-2 text-muted-foreground"
              onClick={() => signOut({ callbackUrl: "/auth/login" })}
            >
              <LogOut className="h-4 w-4" />
              Odhlásit se
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Stavba — Rozpočet Stavby
          </p>
        </div>
      </div>
    </div>
  );
}
