"use client";

import { useState, useEffect } from "react";
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
  const { data: session, status } = useSession();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  // Pre-fill e-mail from session
  useEffect(() => {
    if (session?.user?.email) {
      setEmail(session.user.email);
    }
  }, [session]);

  // If the user becomes verified (e.g. they opened the link in another tab),
  // redirect them home.
  useEffect(() => {
    if (session?.user?.emailVerified) {
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-12 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight">
              Stavba<span className="text-green-600">.</span>
            </span>
          </Link>
        </div>

        {/* Card */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950">
              <MailCheck className="h-8 w-8 text-amber-600" />
            </div>
            <h1 className="mb-2 text-xl font-semibold">Ověřte svůj e-mail</h1>
            <p className="text-sm text-muted-foreground">
              Pro přístup k vašim projektům musíte potvrdit svou e-mailovou adresu.
              Zkontrolujte svou schránku včetně složky spam.
            </p>
          </div>

          {session?.user?.email && (
            <div className="mb-4 rounded-lg bg-muted/50 p-3 text-center text-sm">
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

          <div className="mt-6 border-t pt-4">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => signOut({ callbackUrl: "/auth/login" })}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Odhlásit se
            </Button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Po ověření e-mailu budete přesměrováni na hlavní stránku.
        </p>
      </div>
    </div>
  );
}
