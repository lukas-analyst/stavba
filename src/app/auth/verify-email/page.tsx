"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status");

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
          {status === "valid" && (
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50 dark:bg-green-950">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h1 className="mb-2 text-xl font-semibold">E-mail ověřen!</h1>
              <p className="mb-6 text-sm text-muted-foreground">
                Vaše e-mailová adresa byla úspěšně potvrzena. Nyní se můžete
                přihlásit a začít spravovat své projekty.
              </p>
              <Button asChild className="w-full" size="lg">
                <Link href="/auth/login">Přihlásit se</Link>
              </Button>
            </div>
          )}

          {status === "already" && (
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950">
                <CheckCircle2 className="h-8 w-8 text-blue-600" />
              </div>
              <h1 className="mb-2 text-xl font-semibold">E-mail je již ověřen</h1>
              <p className="mb-6 text-sm text-muted-foreground">
                Vaše e-mailová adresa byla již dříve úspěšně ověřena.
                Můžete se přihlásit ke svému účtu.
              </p>
              <Button asChild className="w-full" size="lg">
                <Link href="/auth/login">Přihlásit se</Link>
              </Button>
            </div>
          )}

          {status === "expired" && (
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950">
                <AlertTriangle className="h-8 w-8 text-amber-600" />
              </div>
              <h1 className="mb-2 text-xl font-semibold">Odkaz vypršel</h1>
              <p className="mb-6 text-sm text-muted-foreground">
                Platnost tohoto odkazu již vypršela (platnost je 24 hodin).
                Přihlaste se a vyžádejte si nový verifikační e-mail.
              </p>
              <Button asChild className="w-full" size="lg">
                <Link href="/auth/login">Přihlásit se</Link>
              </Button>
            </div>
          )}

          {(status === "invalid" || status === "missing") && (
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-950">
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
              <h1 className="mb-2 text-xl font-semibold">Neplatný odkaz</h1>
              <p className="mb-6 text-sm text-muted-foreground">
                Tento odkaz je neplatný nebo byl již použit. Přihlaste se a
                vyžádejte si nový verifikační e-mail.
              </p>
              <Button asChild className="w-full" size="lg">
                <Link href="/auth/login">Přihlásit se</Link>
              </Button>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-950">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
              <h1 className="mb-2 text-xl font-semibold">Chyba při ověřování</h1>
              <p className="mb-6 text-sm text-muted-foreground">
                Něco se pokazilo. Zkuste to prosím později nebo nás kontaktujte.
              </p>
              <Button asChild className="w-full" size="lg">
                <Link href="/auth/login">Zpět na přihlášení</Link>
              </Button>
            </div>
          )}

          {!status && (
            <div className="flex flex-col items-center text-center">
              <Loader2 className="mb-4 h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Ověřuji…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
