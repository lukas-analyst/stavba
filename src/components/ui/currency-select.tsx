"use client";

import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Flag } from "@/components/ui/flags";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/currency-config";
import { cn } from "@/lib/utils";

// =====================================================================
// CurrencySelect — MD3-styled currency selector with flag + code
// ---------------------------------------------------------------------
// Uses the shadcn Select component (Radix Select) for consistent
// cross-platform behavior. Each option shows:
//   [flag] CODE  Symbol
//
// e.g. [🇪🇺] EUR  €
//
// When a rate is unavailable (grayed out + tooltip), we still show
// the option but disable it — the user sees it's "in preparation".
// =====================================================================

type CurrencySelectProps = {
  value: string;
  onChange: (value: string) => void;
  /** Project's default currency — options that match it show "(default)" */
  defaultCurrency?: string;
  /** Set of currency codes that have no exchange rate available yet */
  unavailableCurrencies?: Set<string>;
  className?: string;
  id?: string;
  disabled?: boolean;
};

export function CurrencySelect({
  value,
  onChange,
  defaultCurrency = "CZK",
  unavailableCurrencies,
  className,
  id,
  disabled,
}: CurrencySelectProps) {
  const t = useTranslations("currency");

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        className={cn("w-full gap-2 font-normal", className)}
      >
        <Flag
          code={value}
          className="h-3.5 w-5 rounded-[2px] overflow-hidden shrink-0"
        />
        {/* SelectValue renders the selected item's `textValue` (just the code).
            We set `textValue` on each SelectItem so only the code shows here,
            not the flag (which we render manually above to avoid duplicates). */}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_CURRENCIES.map((c) => {
          const isUnavailable = unavailableCurrencies?.has(c.code);
          const isDefault = c.code === defaultCurrency;
          return (
            <SelectItem
              key={c.code}
              value={c.code}
              disabled={isUnavailable}
              // textValue is what Radix shows in the trigger via SelectValue.
              // We include symbol so the trigger shows "CZK Kč" etc.
              textValue={`${c.code} ${c.symbol}`}
              className="gap-2"
            >
              <div className="flex items-center gap-2">
                <Flag
                  code={c.flagCode}
                  className="h-3.5 w-5 rounded-[2px] overflow-hidden shrink-0"
                />
                <span className={cn(isUnavailable && "text-muted-foreground/50")}>
                  {c.code}
                </span>
                <span className="text-muted-foreground">{c.symbol}</span>
                {isDefault && (
                  <span className="text-[10px] text-muted-foreground/70 ml-1">
                    ({t("default")})
                  </span>
                )}
                {isUnavailable && (
                  <span className="text-[10px] text-muted-foreground/50 ml-auto italic">
                    {t("unavailable")}
                  </span>
                )}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
