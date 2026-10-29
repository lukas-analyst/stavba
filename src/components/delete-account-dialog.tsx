"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";

// =====================================================================
// DeleteAccountDialog — confirmation dialog for account deletion
// ---------------------------------------------------------------------
// Asks for identity verification before soft-deleting the account:
//   - Credentials users: type their password
//   - OAuth (Google) users: type their email address
//
// On success: signs the user out + redirects to login with a toast.
// =====================================================================

export function DeleteAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: session } = useSession();
  const t = useTranslations("auth.profile.deleteAccount");
  const [password, setPassword] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(false);

  // Determine auth provider: if session has no password (OAuth-only),
  // ask for email confirmation instead of password.
  // We check via the session — OAuth users typically don't have a
  // password set. A more robust check would be to fetch the user
  // profile, but the session is sufficient for UI branching.
  const isOAuthUser = !session?.user?.email; // fallback — actual check is server-side
  // Better heuristic: if the user signed in via Google, they won't have
  // a password. We can't know for sure from the client, so we let the
  // API validate. But for UI, we show both fields if we're unsure.
  // Simpler approach: try password first; if user has no password,
  // the API returns an error telling them to use email confirmation.
  //
  // For better UX, we check the account provider from the session.
  // NextAuth session doesn't expose this by default, so we use a
  // simple heuristic: if the user's image is from Google (googleusercontent.com),
  // they're likely OAuth. Otherwise, show password field.
  const userImage = session?.user?.image ?? "";
  const likelyOAuth = userImage.includes("googleusercontent.com") || userImage.includes("google");

  const canSubmit = acknowledged && (
    likelyOAuth ? emailConfirm.trim().length > 0 : password.trim().length > 0
  );

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: likelyOAuth ? undefined : password,
          emailConfirm: likelyOAuth ? emailConfirm : undefined,
          acknowledged,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || t("error"));
        setLoading(false);
        return;
      }

      // Success — sign out + redirect
      toast.success(t("success"));
      onOpenChange(false);
      // Small delay so the toast is visible before redirect
      setTimeout(() => {
        signOut({ callbackUrl: "/auth/login?deleted=1" });
      }, 1500);
    } catch {
      toast.error(t("error"));
      setLoading(false);
    }
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      // Reset form when closing
      setPassword("");
      setEmailConfirm("");
      setAcknowledged(false);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Warning box */}
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 type-body">
            <p className="font-medium text-destructive mb-1">{t("warningTitle")}</p>
            <p className="text-muted-foreground type-label">{t("warningBody")}</p>
          </div>

          {/* Identity verification */}
          {likelyOAuth ? (
            <div className="space-y-2">
              <Label htmlFor="emailConfirm">{t("emailConfirmLabel")}</Label>
              <Input
                id="emailConfirm"
                type="email"
                value={emailConfirm}
                onChange={(e) => setEmailConfirm(e.target.value)}
                placeholder={session?.user?.email ?? ""}
                autoComplete="email"
              />
              <p className="type-label text-muted-foreground">{t("emailConfirmHint")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="deletePassword">{t("passwordLabel")}</Label>
              <Input
                id="deletePassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
          )}

          {/* Acknowledgment checkbox */}
          <div className="flex items-start gap-2">
            <Checkbox
              id="acknowledge"
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="acknowledge" className="cursor-pointer type-body leading-tight">
              {t("acknowledge")}
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleClose(false)} disabled={loading}>
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!canSubmit || loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("deleting")}
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                {t("confirm")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
