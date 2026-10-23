"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
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
import { locales, LOCALE_META, defaultLocale, type Locale } from "@/i18n/config";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

// =====================================================================
// LanguageSwitcher — flag-based locale dropdown
// ---------------------------------------------------------------------
// Renders a globe icon + current locale flag. Clicking opens a dropdown
// listing all available locales (defined in `src/i18n/config.ts`).
//
// Selecting a locale navigates to the localized URL:
//   • Default locale (cs): NO prefix (`/`, `/budget`, …)
//   • Non-default (en, de, …): prefix (`/en/`, `/de/`, …)
//
// The current path + search params are preserved when switching —
// `next-intl`'s `usePathname()` returns the locale-stripped path so we
// can reconstruct the URL in the target locale. We use `router.replace`
// inside a `startTransition` to avoid a full page reload.
//
// The cookie (`NEXT_LOCALE`) is set automatically by next-intl middleware
// when the locale prefix is detected on the next request.
// =====================================================================

export function LanguageSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentLocale = useLocale() as Locale;
  const t = useTranslations("LanguageSwitcher");
  const [isPending, startTransition] = useTransition();

  const switchTo = (next: Locale) => {
    if (next === currentLocale) return;
    // Build the new URL with the same path + query.
    const query = searchParams.toString();
    const pathWithQuery = query ? `${pathname}?${query}` : pathname;

    // For the default locale, no prefix. For others, prefix with /<locale>.
    // next-intl's `usePathname()` already strips the locale segment, so
    // `pathname` here is locale-independent (e.g. "/budget", not "/en/budget").
    const targetPath =
      next === defaultLocale
        ? pathWithQuery
        : `/${next}${pathWithQuery === "/" ? "" : pathWithQuery}`;

    startTransition(() => {
      router.replace(targetPath);
      // Force a refresh so server components re-render with the new locale
      // (messages, metadata, etc.).
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
          {/* Show flag on mobile, flag + code on desktop */}
          <span className="text-base leading-none">{currentMeta.flag}</span>
          <span className="sr-only">{currentMeta.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
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
                "cursor-pointer gap-2 rounded-none px-3 py-2 type-body",
                isActive && "bg-primary-container text-primary-container-foreground",
              )}
            >
              <span className="text-base leading-none">{meta.flag}</span>
              <span className="flex-1">{meta.name}</span>
              {isActive && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
