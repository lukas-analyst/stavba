"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Token validity states:
  //   "checking" — validating token on mount
  //   "valid" — token is valid, show form
  //   "invalid" — token is invalid or expired
  //   "missing" — no token in URL
  type TokenState = "checking" | "valid" | "invalid" | "missing";
  const [tokenState, setTokenState] = useState<TokenState>(
    token ? "checking" : "missing",
  );

  // Validate token on mount — call a GET endpoint to check token validity
  // before showing the form. This prevents the user from filling out the
  // form only to discover the token is invalid on submit.
  useEffect(() => {
    if (!token) return; // tokenState already initialized to "missing"

    let cancelled = false;

    const validateToken = async () => {
      try {
        const res = await fetch(
          `/api/auth/verify-token?type=reset&token=${encodeURIComponent(token)}`,
        );
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setTokenState(data.valid ? "valid" : "invalid");
        } else {
          setTokenState("invalid");
        }
      } catch {
        if (!cancelled) setTokenState("invalid");
      }
    };

    validateToken();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== passwordConfirm) {
      setError("Hesla se neshodují.");
      return;
    }
    if (password.length < 8) {
      setError("Heslo musí mít alespoň 8 znaků.");
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Heslo musí obsahovat alespoň jedno písmeno a jednu číslici.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error?.includes("vypršel") || data.error?.includes("použit")) {
          setError(data.error);
          setTokenState("invalid");
        } else {
          setError(data.error || "Reset hesla selhal.");
        }
        setLoading(false);
        return;
      }

      setSuccess(true);
      toast.success("Heslo bylo úspěšně změněno.");
      setTimeout(() => router.push("/auth/login"), 2000);
    } catch (err) {
      console.error("Reset password error:", err);
      setError("Reset hesla selhal. Zkuste to prosím znovu.");
      setLoading(false);
    }
  };

  // === Checking token state ===
  if (tokenState === "checking") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <Link href="/" className="inline-flex items-center gap-2">
              <span className="type-display tracking-tight">
                Stavba<span className="text-primary">.</span>
              </span>
            </Link>
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
            <div className="flex flex-col items-center text-center">
              <Loader2 className="mb-4 h-8 w-8 animate-spin text-muted-foreground" />
              <p className="type-body text-muted-foreground">Ověřuji odkaz…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // === Invalid / missing token state ===
  if (tokenState === "invalid" || tokenState === "missing") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <Link href="/" className="inline-flex items-center gap-2">
              <span className="type-display tracking-tight">
                Stavba<span className="text-primary">.</span>
              </span>
            </Link>
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
              <h1 className="mb-2 type-headline">Neplatný odkaz</h1>
              <p className="mb-6 type-body text-muted-foreground">
                Tento odkaz pro reset hesla je neplatní nebo vypršel (platnost 1 hodina).
                Vyžádejte si prosím nový.
              </p>
              <Button asChild className="w-full" size="lg">
                <Link href="/auth/forgot-password">Nový odkaz</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // === Success state ===
  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <Link href="/" className="inline-flex items-center gap-2">
              <span className="type-display tracking-tight">
                Stavba<span className="text-primary">.</span>
              </span>
            </Link>
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
              <h1 className="mb-2 type-headline">Heslo změněno</h1>
              <p className="mb-6 type-body text-muted-foreground">
                Vaše heslo bylo úspěšně změněno. Přesměrovávám na přihlášení…
              </p>
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // === Form state ===
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
          <h1 className="mb-1 type-headline">Nové heslo</h1>
          <p className="mb-6 type-body text-muted-foreground">
            Zadejte své nové heslo
          </p>

          {error && (
            <div
              id="error-form"
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 type-body text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">Nové heslo</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Min. 8 znaků, písmeno + číslo"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  aria-invalid={!!error}
                  aria-describedby={error ? "error-form" : undefined}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="passwordConfirm">Potvrzení hesla</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="passwordConfirm"
                  type="password"
                  placeholder="Zopakujte heslo"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
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
                  Měním heslo…
                </>
              ) : (
                "Změnit heslo"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
