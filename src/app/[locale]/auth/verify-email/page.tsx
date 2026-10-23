"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { BRAND } from "@/i18n/brand";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status");
  const t = useTranslations("auth.verifyEmail");
  const tc = useTranslations("auth.common");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight">
              {BRAND.shortName}<span className="text-primary">.</span>
            </span>
          </Link>
        </div>

        {/* Card */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          {status === "valid" && (
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
              <h1 className="mb-2 text-xl font-semibold">{t("validTitle")}</h1>
              <p className="mb-6 text-sm text-muted-foreground">
                {t("validBody")}
              </p>
              <Button asChild className="w-full" size="lg">
                <Link href="/auth/login">{tc("signInLink")}</Link>
              </Button>
            </div>
          )}

          {status === "already" && (
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-info/10">
                <CheckCircle2 className="h-8 w-8 text-info" />
              </div>
              <h1 className="mb-2 text-xl font-semibold">{t("alreadyTitle")}</h1>
              <p className="mb-6 text-sm text-muted-foreground">
                {t("alreadyBody")}
              </p>
              <Button asChild className="w-full" size="lg">
                <Link href="/auth/login">{tc("signInLink")}</Link>
              </Button>
            </div>
          )}

          {status === "expired" && (
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
                <AlertTriangle className="h-8 w-8 text-warning" />
              </div>
              <h1 className="mb-2 text-xl font-semibold">{t("expiredTitle")}</h1>
              <p className="mb-6 text-sm text-muted-foreground">
                {t("expiredBody")}
              </p>
              <Button asChild className="w-full" size="lg">
                <Link href="/auth/login">{tc("signInLink")}</Link>
              </Button>
            </div>
          )}

          {(status === "invalid" || status === "missing") && (
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
              <h1 className="mb-2 text-xl font-semibold">{t("invalidTitle")}</h1>
              <p className="mb-6 text-sm text-muted-foreground">
                {t("invalidBody")}
              </p>
              <Button asChild className="w-full" size="lg">
                <Link href="/auth/login">{tc("signInLink")}</Link>
              </Button>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <h1 className="mb-2 text-xl font-semibold">{t("errorTitle")}</h1>
              <p className="mb-6 text-sm text-muted-foreground">
                {t("errorBody")}
              </p>
              <Button asChild className="w-full" size="lg">
                <Link href="/auth/login">{tc("backToLogin")}</Link>
              </Button>
            </div>
          )}

          {!status && (
            <div className="flex flex-col items-center text-center">
              <Loader2 className="mb-4 h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("checking")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
