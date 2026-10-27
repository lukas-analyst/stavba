"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Lock, AlertCircle } from "lucide-react";

// =====================================================================
// Helper: log auth event to /api/auth/audit-log (F8).
// Fire-and-forget — telemetry must never block the login flow.
// Uses sendBeacon where available (survives page navigation after
// successful login), falls back to fetch with keepalive: true.
// =====================================================================
function logAuthEvent(action: string, success: boolean, metadata?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify({ action, success, metadata });
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      const queued = navigator.sendBeacon("/api/auth/audit-log", blob);
      if (queued) return;
    }
    void fetch("/api/auth/audit-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}

// Google "G" logo SVG (official Google brand colors)
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Validate callbackUrl is a safe relative path (prevent open redirect).
  // Only allow paths starting with "/" but not "//" (protocol-relative).
  const rawCallbackUrl = searchParams.get("callbackUrl") || "/";
  const callbackUrl =
    rawCallbackUrl.startsWith("/") && !rawCallbackUrl.startsWith("//")
      ? rawCallbackUrl
      : "/";
  const registeredParam = searchParams.get("registered");
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    errorParam === "use-oauth"
      ? "Tento e-mail je zaregistrován přes Google. Použijte tlačítko „Přihlásit přes Google“."
      : errorParam === "register-first"
        ? "Pro tento e-mail ještě nebyl vytvořen účet. Zaregistrujte se prosím."
        : errorParam === "CredentialsSignin"
          ? "Neplatný e-mail nebo heslo."
          : errorParam === "Configuration"
            ? "Chyba konfigurace přihlášení. Kontaktujte správce."
            : errorParam === "OAuthSignin" || errorParam === "OAuthCallback"
              ? "Přihlášení přes Google selhalo. Zkuste to znovu."
              : null,
  );

  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignIn = () => {
    setGoogleLoading(true);
    signIn("google", { callbackUrl });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        if (result.error === "use-oauth") {
          setError("Tento e-mail je zaregistrován přes Google. Použijte tlačítko „Přihlásit přes Google“.");
          logAuthEvent("login", false, { reason: "use-oauth", email });
        } else if (result.error === "register-first") {
          setError("Pro tento e-mail ještě nebyl vytvořen účet. Zaregistrujte se prosím.");
          logAuthEvent("login", false, { reason: "register-first", email });
        } else if (result.error.startsWith("rate_limited:")) {
          const retryAfter = result.error.split(":")[1];
          const minutes = Math.ceil(Number(retryAfter) / 60);
          setError(
            minutes > 1
              ? `Příliš mnoho pokusů o přihlášení. Zkuste to za ${minutes} minut.`
              : `Příliš mnoho pokusů o přihlášení. Zkuste to za ${retryAfter} sekund.`,
          );
          logAuthEvent("login", false, { reason: "rate_limited", email });
        } else {
          setError("Neplatný e-mail nebo heslo.");
          logAuthEvent("login", false, { reason: "invalid_credentials", email });
        }
        setLoading(false);
        return;
      }

      if (result?.url) {
        logAuthEvent("login", true, { email });
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Přihlášení selhalo. Zkuste to prosím znovu.");
      logAuthEvent("login", false, { reason: "exception", email });
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight">
              Stavba<span className="text-primary">.</span>
            </span>
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            Správa rozpočtu, nákladů a času pro stavby a rekonstrukce
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="mb-1 text-xl font-semibold">Přihlášení</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Přihlaste se ke svému účtu
          </p>

          {registeredParam === "1" && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-success">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Registrace proběhla. Zkontrolujte svůj e-mail pro ověření adresy.</span>
            </div>
          )}

          {error && (
            <div
              id="error-form"
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="vase@email.cz"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  aria-invalid={!!error}
                  aria-describedby={error ? "error-form" : undefined}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Heslo</Label>
                <Link
                  href="/auth/forgot-password"
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  Zapomenuté heslo?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  aria-invalid={!!error}
                  aria-describedby={error ? "error-form" : undefined}
                  className="pl-9"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Přihlašuji…
                </>
              ) : (
                "Přihlásit se"
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">nebo</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Google Sign-In */}
          <Button
            type="button"
            variant="outline"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="w-full gap-2"
            size="lg"
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GoogleIcon className="h-5 w-5" />
            )}
            {googleLoading ? "Přihlašuji…" : "Přihlásit přes Google"}
          </Button>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Nemáte účet?{" "}
            <Link
              href="/auth/register"
              className="font-medium text-foreground hover:underline"
            >
              Zaregistrovat se
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Stavba — Rozpočet Stavby
        </p>
      </div>
    </div>
  );
}
