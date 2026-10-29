"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Lock, User, AlertCircle, CheckCircle2 } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validation
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
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registrace selhala.");
        setLoading(false);
        return;
      }

      // Registration succeeded — redirect to login with a flag
      router.push("/auth/login?registered=1");
    } catch (err) {
      console.error("Register error:", err);
      setError("Registrace selhala. Zkuste to prosím znovu.");
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
          <p className="mt-2 type-body text-muted-foreground">
            Vytvořte si účet a začněte spravovat své projekty
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="mb-1 type-headline">Registrace</h1>
          <p className="mb-6 type-body text-muted-foreground">
            Založte si nový účet zdarma
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
              <Label htmlFor="name">Jméno (volitelné)</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="name"
                  type="text"
                  placeholder="Jan Novák"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  className="pl-9"
                />
              </div>
            </div>

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
              <Label htmlFor="password">Heslo</Label>
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
                  Registruji…
                </>
              ) : (
                "Vytvořit účet"
              )}
            </Button>
          </form>

          <p className="mt-6 text-center type-body text-muted-foreground">
            Už máte účet?{" "}
            <Link
              href="/auth/login"
              className="font-medium text-foreground hover:underline"
            >
              Přihlásit se
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center type-label text-muted-foreground">
          © {new Date().getFullYear()} Stavba — Rozpočet Stavby
        </p>
      </div>
    </div>
  );
}
