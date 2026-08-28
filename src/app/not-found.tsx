import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, Compass } from "lucide-react";

/**
 * Custom 404 page.
 *
 * Shown when the user lands on a route that doesn't match any file in
 * the App Router. The only meaningful destination in this app is `/`,
 * so we offer a single, prominent CTA back home.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-6 bg-muted/30 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Compass className="h-8 w-8" />
      </div>
      <div className="space-y-2">
        <h1 className="text-5xl font-bold tracking-tight md:text-7xl">404</h1>
        <p className="text-lg font-semibold md:text-xl">Stránka nenalezena</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Hledaná stránka neexistuje nebo byla přesunuta. Vraťte se na hlavní
          stránku aplikace Stavba a pokračujte ve správě rozpočtu.
        </p>
      </div>
      <Link href="/">
        <Button size="lg">
          <Home className="mr-2 h-4 w-4" />
          Zpět na hlavní stránku
        </Button>
      </Link>
    </div>
  );
}
