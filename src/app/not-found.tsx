import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, Compass } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { detectLocaleFromRequest } from "@/i18n/detect";

/**
 * Custom 404 page.
 *
 * Shown when the user lands on a route that doesn't match any file in
 * the App Router. The only meaningful destination in this app is `/`,
 * so we offer a single, prominent CTA back home.
 *
 * i18n: This file lives at the ROOT of the App Router (NOT under a
 * `[locale]` segment), so it can't rely on `[locale]/layout.tsx`'s
 * `NextIntlClientProvider` being available. We detect the locale
 * server-side via `detectLocaleFromRequest()` (cookie > Accept-Language
 * > default `cs`) and use `getTranslations({ locale, namespace })` to
 * resolve strings directly — no client provider needed.
 *
 * The URL stays clean regardless of locale: `/unknown-page` for Czech
 * users, `/en/unknown-page` for English users (both render this file).
 */
export default async function NotFound() {
  const locale = await detectLocaleFromRequest();
  const t = await getTranslations({ locale, namespace: "errors.notFound" });

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-6 bg-muted/30 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Compass className="h-8 w-8" />
      </div>
      <div className="space-y-2">
        <h1 className="text-5xl font-bold tracking-tight md:text-7xl">{t("code")}</h1>
        <p className="text-lg font-semibold md:text-xl">{t("title")}</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <Link href="/">
        <Button size="lg">
          <Home className="mr-2 h-4 w-4" />
          {t("homeButton")}
        </Button>
      </Link>
    </div>
  );
}
