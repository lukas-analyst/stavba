"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status");

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
          {status === "valid" && (
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
              <h1 className="mb-2 type-headline">E-mail ověřen!</h1>
              <p className="mb-6 type-body text-muted-foreground">
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
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-info/10">
                <CheckCircle2 className="h-8 w-8 text-info" />
              </div>
              <h1 className="mb-2 type-headline">E-mail je již ověřen</h1>
              <p className="mb-6 type-body text-muted-foreground">
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
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
                <AlertTriangle className="h-8 w-8 text-warning" />
              </div>
              <h1 className="mb-2 type-headline">Odkaz vypršel</h1>
              <p className="mb-6 type-body text-muted-foreground">
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
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
              <h1 className="mb-2 type-headline">Neplatný odkaz</h1>
              <p className="mb-6 type-body text-muted-foreground">
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
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <h1 className="mb-2 type-headline">Chyba při ověřování</h1>
              <p className="mb-6 type-body text-muted-foreground">
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
              <p className="type-body text-muted-foreground">Ověřuji…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
