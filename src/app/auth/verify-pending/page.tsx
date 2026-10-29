"use client";

import { useState, useEffect, useCallback } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MailCheck, RefreshCw, LogOut } from "lucide-react";
import { toast } from "sonner";

export default function VerifyPendingPage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);

  // Pre-fill e-mail from session
  useEffect(() => {
    if (session?.user?.email) {
      setEmail(session.user.email);
    }
  }, [session]);

  // Poll for e-mail verification status every 10 seconds.
  // The user might verify their e-mail in another tab — we want to
  // detect it and redirect them home automatically.
  const checkVerification = useCallback(async () => {
    if (status !== "authenticated") return;
    setChecking(true);
    try {
      const res = await fetch("/api/auth/session");
      if (res.ok) {
        const freshSession = await res.json();
        if (freshSession?.user?.emailVerified) {
          // E-mail is now verified — refresh session + redirect
          await update();
          router.push("/");
          router.refresh();
        }
      }
    } catch {
      // ignore polling errors
    } finally {
      setChecking(false);
    }
  }, [status, update, router]);

  // Poll every 10 seconds
  useEffect(() => {
    const interval = setInterval(checkVerification, 10_000);
    return () => clearInterval(interval);
  }, [checkVerification]);

  // Also check immediately when session changes
  useEffect(() => {
    const emailVerified = (session?.user as { emailVerified?: string | null } | undefined)?.emailVerified;
    if (emailVerified) {
      router.push("/");
      router.refresh();
    }
  }, [session, router]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSending(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Odeslání selhalo.");
      } else {
        toast.success("Verifikační e-mail byl znovu odeslán. Zkontrolujte svou schránku.");
      }
    } catch {
      toast.error("Odeslání selhalo. Zkuste to prosím znovu.");
    } finally {
      setSending(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="type-display tracking-tight">
              Stavba<span className="text-primary">.</span>
            </span>
          </Link>
        </div>

        {/* Card */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
              <MailCheck className="h-8 w-8 text-warning" />
            </div>
            <h1 className="mb-2 type-headline">Ověřte svůj e-mail</h1>
            <p className="type-body text-muted-foreground">
              Pro přístup k vašim projektům musíte potvrdit svou e-mailovou adresu.
              Zkontrolujte svou schránku včetně složky spam.
            </p>
          </div>

          {session?.user?.email && (
            <div className="mb-4 rounded-lg bg-muted/50 p-3 text-center type-body">
              <span className="text-muted-foreground">E-mail odeslán na: </span>
              <span className="font-medium">{session.user.email}</span>
            </div>
          )}

          {/* Resend form */}
          <form onSubmit={handleResend} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Nedorazil vám e-mail?</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vase@email.cz"
                className="h-9"
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={sending || !email}
              aria-busy={sending}
              className="w-full"
            >
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Odesílám…
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Znovu odeslat odkaz
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 space-y-2 border-t pt-4">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={checkVerification}
              disabled={checking}
              aria-busy={checking}
            >
              {checking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Kontroluji…
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Již jsem ověřil — obnovit
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => signOut({ callbackUrl: "/auth/login" })}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Odhlásit se
            </Button>
            <Button asChild variant="ghost" size="sm" className="w-full">
              <Link
                href="/auth/login"
                className="text-muted-foreground hover:text-foreground"
              >
                Zpět na přihlášení
              </Link>
            </Button>
          </div>
        </div>

        <p className="mt-6 text-center type-label text-muted-foreground">
          Po ověření e-mailu budete automaticky přesměrováni na hlavní stránku.
        </p>
      </div>
    </div>
  );
}
