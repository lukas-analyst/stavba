"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import { Check, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { locales, LOCALE_META, type Locale } from "@/i18n/config";
import { Flag } from "@/components/ui/flags";
import { cn } from "@/lib/utils";

// =====================================================================
// LanguageSwitcher — flag-based locale dropdown
// ---------------------------------------------------------------------
// Uses next-intl's locale-aware `useRouter` and `usePathname` from
// `@/i18n/routing`. When switching locales, next-intl automatically:
//   1. Sets the NEXT_LOCALE cookie to the target locale
//   2. Builds the correct URL (with or without prefix based on as-needed)
//   3. Preserves the current path + search params
//
// This fixes the bug where switching from EN → CS would redirect back
// to EN because the middleware saw the stale NEXT_LOCALE cookie.
// =====================================================================

export function LanguageSwitcher({ className }: { className?: string }) {
  // next-intl's useRouter — locale-aware (sets cookie + builds correct URL)
  const router = useRouter();
  // next-intl's usePathname — returns path WITHOUT locale prefix
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentLocale = useLocale() as Locale;
  const t = useTranslations("LanguageSwitcher");
  const [isPending, startTransition] = useTransition();

  const switchTo = (next: Locale) => {
    if (next === currentLocale) return;

    // next-intl's useRouter.replace() with { locale } option automatically:
    //   - Sets NEXT_LOCALE cookie to `next`
    //   - Builds the URL with correct prefix (no prefix for cs, /en/ for en)
    //   - Preserves the pathname
    const query = searchParams.toString();
    const pathWithQuery = query ? `${pathname}?${query}` : pathname;

    startTransition(() => {
      router.replace(pathWithQuery, { locale: next });
      router.refresh();
    });
  };

  const currentMeta = LOCALE_META[currentLocale];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "shrink-0 state-layer-on-surface rounded-full h-9 w-9 sm:h-8 sm:w-8",
            className,
          )}
          aria-label={t("changeLanguage")}
          title={currentMeta.name}
          disabled={isPending}
        >
          <Flag
            code={currentLocale}
            className="h-4 w-6 sm:h-3.5 sm:w-5 rounded-[2px] overflow-hidden"
          />
          <span className="sr-only">{currentMeta.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="flex items-center gap-1.5 type-overline text-muted-foreground">
          <Globe className="h-3 w-3" />
          {t("language")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {locales.map((locale) => {
          const meta = LOCALE_META[locale];
          const isActive = locale === currentLocale;
          return (
            <DropdownMenuItem
              key={locale}
              onSelect={() => switchTo(locale)}
              className={cn(
                "cursor-pointer gap-2.5 rounded-none px-3 py-2 type-body",
                isActive && "bg-primary-container text-primary-container-foreground",
              )}
            >
              <Flag
                code={locale}
                className="h-3.5 w-5 rounded-[2px] overflow-hidden shrink-0"
              />
              <span className="flex-1">{meta.name}</span>
              {isActive && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
