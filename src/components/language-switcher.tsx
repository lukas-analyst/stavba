"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
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
import { Flag } from "@/components/ui/flags";
import { cn } from "@/lib/utils";

// =====================================================================
// LanguageSwitcher — flag-based locale dropdown
// ---------------------------------------------------------------------
// Renders the current locale's SVG flag + a dropdown to switch.
// Uses inline SVG flags (not emoji) because emoji flags don't render
// on Windows. The SVG component (`@/components/ui/flags`) maps locale
// codes (cs, en) to the correct flag.
//
// Visible on ALL screen sizes (mobile + desktop) — previously hidden
// on mobile, but the user requested it be available everywhere.
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
    const query = searchParams.toString();
    const pathWithQuery = query ? `${pathname}?${query}` : pathname;

    const targetPath =
      next === defaultLocale
        ? pathWithQuery
        : `/${next}${pathWithQuery === "/" ? "" : pathWithQuery}`;

    startTransition(() => {
      router.replace(targetPath);
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
