"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  User as UserIcon,
  Mail,
  Lock,
  KeyRound,
  LogOut,
  ArrowLeft,
  ShieldCheck,
  MonitorSmartphone,
} from "lucide-react";
import { toast } from "sonner";

// =====================================================================
// /auth/profile — user profile + password change + session management
// ---------------------------------------------------------------------
// Sections:
//   1. Profil           — edit name (PATCH /api/users/[id])
//                         email is read-only (F4 e-mail change is out of scope)
//   2. Změnit heslo    — POST /api/users/profile/password
//                         currentPassword + newPassword + confirm
//   3. Relace          — POST /api/users/profile/sessions/revoke
//                         "Odhlásit všechny ostatní relace"
//   4. Odhlásit se     — signOut()
//
// Layout follows the auth pages pattern: logo + card (max-w-md), but
// extended vertically with multiple sections separated by dividers.
// =====================================================================

type UserProfile = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  createdAt: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const { data: session, update: updateSession } = useSession();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Profile form state
  const [name, setName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Sessions state
  const [revokingSessions, setRevokingSessions] = useState(false);

  // Fetch user profile on mount
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

  // ===== Section 1: Save profile (name) =====
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

  // ===== Section 2: Change password =====
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    // Client-side validation
    if (newPassword !== confirmPassword) {
      toast.error("Nová hesla se neshodují.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Heslo musí mít alespoň 8 znaků.");
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      toast.error("Heslo musí obsahovat alespoň jedno písmeno a jednu číslici.");
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch("/api/users/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "Změna hesla selhala.");
        return;
      }
      toast.success("Heslo bylo změněno.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error("Změna hesla selhala. Zkuste to prosím znovu.");
    } finally {
      setChangingPassword(false);
    }
  };

  // ===== Section 3: Revoke other sessions =====
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
      // Re-sync the session so the current JWT's tokenVersion is updated
      // (it will be re-synced on the next jwt callback run anyway, but
      // calling update() now speeds it up).
      await updateSession();
      toast.success("Všechny ostatní relace byly odhlášeny.");
    } catch {
      toast.error("Odhlášení ostatních relací selhalo. Zkuste to prosím znovu.");
    } finally {
      setRevokingSessions(false);
    }
  }, [updateSession]);

  // ===== Section 4: Sign out =====
  const handleSignOut = () => {
    // Audit-log the logout (fire-and-forget, non-blocking)
    try {
      const payload = JSON.stringify({ action: "logout", success: true });
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        const queued = navigator.sendBeacon("/api/auth/audit-log", blob);
        if (queued) {
          signOut({ callbackUrl: "/auth/login" });
          return;
        }
      }
      void fetch("/api/auth/audit-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    } catch {
      // ignore — telemetry must never block logout
    }
    signOut({ callbackUrl: "/auth/login" });
  };

  const sessionUser = session?.user;
  const displayEmail = profile?.email ?? sessionUser?.email ?? "";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="type-display tracking-tight">
              Stavba<span className="text-primary">.</span>
            </span>
          </Link>
          <p className="mt-2 type-body text-muted-foreground">
            Spravujte svůj účet, heslo a relace
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="mb-1 type-headline">Profil</h1>
          <p className="mb-6 type-body text-muted-foreground">
            Zde můžete upravit své údaje, změnit heslo a spravovat aktivní relace.
          </p>

          {loadingProfile ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-8">
              {/* ====== Section 1: Profil ====== */}
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="flex items-center gap-2 type-body font-medium text-muted-foreground">
                  <UserIcon className="h-4 w-4" />
                  <span>Profil</span>
                </div>

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
                  <p className="type-label text-muted-foreground">
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
                    "Uložit změny"
                  )}
                </Button>
              </form>

              <div className="h-px bg-border" />

              {/* ====== Section 2: Změnit heslo ====== */}
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="flex items-center gap-2 type-body font-medium text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                  <span>Změnit heslo</span>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="currentPassword">Aktuální heslo</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="currentPassword"
                      type="password"
                      placeholder="••••••••"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="newPassword">Nové heslo</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="newPassword"
                      type="password"
                      placeholder="Min. 8 znaků, písmeno + číslo"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Potvrzení nového hesla</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Zopakujte nové heslo"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      className="pl-9"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={changingPassword}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  {changingPassword ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Měním heslo…
                    </>
                  ) : (
                    "Změnit heslo"
                  )}
                </Button>

                <p className="type-label text-muted-foreground">
                  Po změně hesla budou odhlášeny všechny ostatní relace
                  (na jiných zařízeních).
                </p>
              </form>

              <div className="h-px bg-border" />

              {/* ====== Section 3: Relace ====== */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 type-body font-medium text-muted-foreground">
                  <MonitorSmartphone className="h-4 w-4" />
                  <span>Relace</span>
                </div>
                <p className="type-body text-muted-foreground">
                  Odhlásí všechny ostatní přihlášené relace (na jiných
                  zařízeních). Tato relace zůstane aktivní.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  size="lg"
                  onClick={handleRevokeSessions}
                  disabled={revokingSessions}
                >
                  {revokingSessions ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Odhlašuji…
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Odhlásit všechny ostatní relace
                    </>
                  )}
                </Button>
              </div>

              <div className="h-px bg-border" />

              {/* ====== Section 4: Odhlásit se ====== */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 type-body font-medium text-muted-foreground">
                  <LogOut className="h-4 w-4" />
                  <span>Odhlásit se</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  size="lg"
                  onClick={handleSignOut}
                >
                  Odhlásit se z tohoto zařízení
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer: Back to home */}
        <div className="mt-6 flex flex-col items-center gap-3">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground"
          >
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Zpět na hlavní stránku
            </Link>
          </Button>
          <p className="text-center type-label text-muted-foreground">
            © {new Date().getFullYear()} Stavba — Rozpočet Stavby
          </p>
        </div>
      </div>
    </div>
  );
}
