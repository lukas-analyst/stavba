"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, CheckCircle2, AlertCircle } from "lucide-react";
import { BRAND } from "@/i18n/brand";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgotPassword");
  const tc = useTranslations("auth.common");
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
        setError(data.error || t("errors.generic"));
        setLoading(false);
        return;
      }

      setSent(true);
    } catch (err) {
      console.error("Forgot password error:", err);
      setError(t("errors.generic"));
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
              <img src="/logo.svg" alt="Logo" className="h-16 w-16 rounded-xl" />
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
              <h1 className="mb-2 text-xl font-semibold">{t("success.title")}</h1>
              <p className="mb-6 text-sm text-muted-foreground">
                {t("success.body", { email })}
              </p>
              <Button asChild variant="outline" className="w-full" size="lg">
                <Link href="/auth/login">{tc("backToLogin")}</Link>
              </Button>
            </div>
          ) : (
            <>
              <h1 className="mb-1 text-xl font-semibold">{t("title")}</h1>
              <p className="mb-6 text-sm text-muted-foreground">
                {t("subtitle")}
              </p>

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
                  <Label htmlFor="email">{tc("email")}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder={tc("emailPlaceholder")}
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
                      {t("submitting")}
                    </>
                  ) : (
                    t("submit")
                  )}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {t("remember")}{" "}
                <Link
                  href="/auth/login"
                  className="font-medium text-foreground hover:underline"
                >
                  {tc("signInLink")}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
