"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Prevent SSG — useSession() returns undefined during static generation
export const dynamic = "force-dynamic";
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
  Trash2,
  Bell,
} from "lucide-react";
import { toast } from "sonner";
import { BRAND } from "@/i18n/brand";
import { DeleteAccountDialog } from "@/components/delete-account-dialog";
import { PasswordStrength } from "@/components/password-strength";
import { Switch } from "@/components/ui/switch";

// =====================================================================
// /auth/profile — user profile + password change + session management
// ---------------------------------------------------------------------
// Sections:
//   1. Profil                    — edit name (PATCH /api/users/[id])
//                                email is read-only (F4 e-mail change is out of scope)
//   2. Změnit heslo             — POST /api/users/profile/password
//                                currentPassword + newPassword + confirm
//   3. Relace                   — POST /api/users/profile/sessions/revoke
//                                "Odhlásit všechny ostatní relace"
//   4. Notifikační preference  — localStorage-based email notification toggles
//   5. Odhlásit se              — signOut()
//
// Layout follows the auth pages pattern: logo + card (max-w-md), but
// extended vertically with multiple sections separated by dividers.
// =====================================================================

// localStorage key — used to persist email notification preferences
// locally (no server-side user-prefs table yet). Kept stable so future
// server-side sync can read the same key without migration.
const NOTIFICATIONS_KEY = "stavba.notifications.preferences";

type NotificationPrefs = {
  onMemberAssigned: boolean;
  onItemDelayed: boolean;
  onOwnerChanged: boolean;
};

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  onMemberAssigned: true,
  onItemDelayed: false,
  onOwnerChanged: true,
};

type UserProfile = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  createdAt: string;
};

export function ProfileClient() {
  const router = useRouter();
  // Safe useSession: during SSG prerender, useSession() returns undefined
  // (no SessionProvider context). We fall back to an empty object to avoid
  // destructuring errors. At runtime, the SessionProvider is always available.
  const _session = useSession();
  const { data: session, update: updateSession } = _session ?? {};
  const t = useTranslations("auth.profile");
  const tc = useTranslations("auth.common");
  const tv = useTranslations("auth.validation");
  const tn = useTranslations("auth.profile.notifications");

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
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

  // Notification preferences state (localStorage-backed)
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(
    DEFAULT_NOTIFICATION_PREFS,
  );
  const [notifPrefsLoaded, setNotifPrefsLoaded] = useState(false);

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
        toast.error(data?.error ?? t("toasts.saveError"));
        return;
      }
      // Refresh session so the avatar/name updates immediately in TopBar
      await updateSession();
      setProfile({ ...profile, name: name.trim() || null });
      toast.success(t("toasts.saveSuccess"));
    } catch {
      toast.error(t("toasts.saveErrorException"));
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
      toast.error(tv("passwordMismatch"));
      return;
    }
    if (newPassword.length < 8) {
      toast.error(tv("passwordTooShort"));
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      toast.error(tv("passwordTooWeak"));
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
        toast.error(data?.error ?? t("toasts.passwordError"));
        return;
      }
      toast.success(t("toasts.passwordSuccess"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error(t("toasts.passwordErrorException"));
    } finally {
      setChangingPassword(false);
    }
  };

  // ===== Notification preferences (localStorage) =====
  // Load preferences on mount. We use a separate effect (rather than
  // combining with the profile fetch) so the toggles hydrate even if the
  // profile fetch fails (e.g. user is on a flaky connection).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(NOTIFICATIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
        setNotifPrefs({
          onMemberAssigned:
            parsed.onMemberAssigned ?? DEFAULT_NOTIFICATION_PREFS.onMemberAssigned,
          onItemDelayed:
            parsed.onItemDelayed ?? DEFAULT_NOTIFICATION_PREFS.onItemDelayed,
          onOwnerChanged:
            parsed.onOwnerChanged ?? DEFAULT_NOTIFICATION_PREFS.onOwnerChanged,
        });
      }
    } catch {
      // ignore malformed JSON — keep defaults
    } finally {
      setNotifPrefsLoaded(true);
    }
  }, []);

  const handleToggleNotifPref = useCallback(
    (key: keyof NotificationPrefs, value: boolean) => {
      const next = { ...notifPrefs, [key]: value };
      setNotifPrefs(next);
      try {
        localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(next));
        toast.success(tn("toasts.saved"));
      } catch {
        toast.error(tn("toasts.saveError"));
      }
    },
    [notifPrefs, tn],
  );

  // ===== Section 3: Revoke other sessions =====
  const handleRevokeSessions = useCallback(async () => {
    setRevokingSessions(true);
    try {
      const res = await fetch("/api/users/profile/sessions/revoke", {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? t("toasts.revokeError"));
        return;
      }
      // Re-sync the session so the current JWT's tokenVersion is updated
      // (it will be re-synced on the next jwt callback run anyway, but
      // calling update() now speeds it up).
      await updateSession();
      toast.success(t("toasts.revokeSuccess"));
    } catch {
      toast.error(t("toasts.revokeErrorException"));
    } finally {
      setRevokingSessions(false);
    }
  }, [updateSession, t]);

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

  // Static array of toggle rows — labels and descriptions are resolved
  // via the `auth.profile.notifications.toggle.<key>` namespace at render
  // time so they translate when the user switches locale.
  const notifToggleRows: Array<{ key: keyof NotificationPrefs }> = [
    { key: "onMemberAssigned" },
    { key: "onItemDelayed" },
    { key: "onOwnerChanged" },
  ];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight">
              <img src="/logo.svg" alt="Logo" className="h-12 w-12 rounded-lg" />
            </span>
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("tagline")}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="mb-1 text-xl font-semibold">{t("title")}</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            {t("subtitle")}
          </p>

          {loadingProfile ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-8">
              {/* ====== Section 1: Profil ====== */}
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <UserIcon className="h-4 w-4" />
                  <span>{t("sections.profile")}</span>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="name">{t("fields.name")}</Label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="name"
                      type="text"
                      placeholder={t("fields.namePlaceholder")}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">{tc("email")}</Label>
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
                    {t("emailReadOnlyNote")}
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
                      {t("buttons.savingProfile")}
                    </>
                  ) : (
                    t("buttons.saveProfile")
                  )}
                </Button>
              </form>

              <div className="h-px bg-border" />

              {/* ====== Section 2: Změnit heslo ====== */}
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                  <span>{t("sections.password")}</span>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="currentPassword">{t("fields.currentPassword")}</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="currentPassword"
                      type="password"
                      placeholder={t("fields.currentPasswordPlaceholder")}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="newPassword">{t("fields.newPassword")}</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="newPassword"
                      type="password"
                      placeholder={tv("passwordPlaceholder")}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      className="pl-9"
                    />
                  </div>
                  <PasswordStrength password={newPassword} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">{t("fields.confirmNewPassword")}</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder={t("fields.confirmNewPasswordPlaceholder")}
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
                      {t("buttons.changingPassword")}
                    </>
                  ) : (
                    t("buttons.changePassword")
                  )}
                </Button>

                <p className="text-xs text-muted-foreground">
                  {t("passwordChangeNote")}
                </p>
              </form>

              <div className="h-px bg-border" />

              {/* ====== Section 3: Relace ====== */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <MonitorSmartphone className="h-4 w-4" />
                  <span>{t("sections.sessions")}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("sessionsDescription")}
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
                      {t("buttons.revokingSessions")}
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      {t("buttons.revokeSessions")}
                    </>
                  )}
                </Button>
              </div>

              <div className="h-px bg-border" />

              {/* ====== Section 4: Notifikační preference ====== */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Bell className="h-4 w-4" />
                  <span>{tn("title")}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {tn("description")}
                </p>
                <ul className="space-y-1">
                  {notifToggleRows.map((row) => {
                    const label = tn(`toggle.${row.key}.label`);
                    const description = tn(`toggle.${row.key}.description`);
                    return (
                      <li
                        key={row.key}
                        className="flex items-start justify-between gap-4 rounded-lg border bg-surface-container-low p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{label}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {description}
                          </div>
                        </div>
                        <Switch
                          checked={
                            notifPrefsLoaded ? notifPrefs[row.key] : false
                          }
                          onCheckedChange={(v) =>
                            handleToggleNotifPref(row.key, v)
                          }
                          aria-label={label}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="h-px bg-border" />

              {/* ====== Section 5: Odhlásit se ====== */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <LogOut className="h-4 w-4" />
                  <span>{t("sections.signOut")}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  size="lg"
                  onClick={handleSignOut}
                >
                  {t("buttons.signOutThisDevice")}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* === Danger Zone — Delete Account === */}
        <div className="mt-8 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 className="flex items-center gap-2 text-base font-semibold text-destructive">
                <Trash2 className="h-4 w-4" />
                {t("deleteAccount.sectionTitle")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("deleteAccount.sectionDescription")}
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="shrink-0"
              onClick={() => setDeleteAccountOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t("deleteAccount.button")}
            </Button>
          </div>
        </div>

        <DeleteAccountDialog
          open={deleteAccountOpen}
          onOpenChange={setDeleteAccountOpen}
        />

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
              {tc("backToHome")}
            </Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {tc("copyright", { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>
    </div>
  );
}
