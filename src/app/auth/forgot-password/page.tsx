"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, CheckCircle2, AlertCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Žádost selhala.");
        setLoading(false);
        return;
      }

      setSent(true);
    } catch (err) {
      console.error("Forgot password error:", err);
      setError("Žádost selhala. Zkuste to prosím znovu.");
      setLoading(false);
    }
  };

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
          {sent ? (
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
              <h1 className="mb-2 type-headline">Zkontrolujte svůj e-mail</h1>
              <p className="mb-6 type-body text-muted-foreground">
                Pokud účet s e-mailem <strong>{email}</strong> existuje, odeslali jsme
                vám odkaz pro reset hesla. Platnost odkazu je 1 hodina.
              </p>
              <Button asChild variant="outline" className="w-full" size="lg">
                <Link href="/auth/login">Zpět na přihlášení</Link>
              </Button>
            </div>
          ) : (
            <>
              <h1 className="mb-1 type-headline">Zapomenuté heslo</h1>
              <p className="mb-6 type-body text-muted-foreground">
                Zadejte svůj e-mail a pošleme vám odkaz pro reset hesla.
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
                      Odesílám…
                    </>
                  ) : (
                    "Odeslat odkaz pro reset"
                  )}
                </Button>
              </form>

              <p className="mt-6 text-center type-body text-muted-foreground">
                Vzpomněli jste si na heslo?{" "}
                <Link
                  href="/auth/login"
                  className="font-medium text-foreground hover:underline"
                >
                  Přihlásit se
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
