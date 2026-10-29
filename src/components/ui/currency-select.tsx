"use client";

import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Flag } from "@/components/ui/flags";
import { SUPPORTED_CURRENCIES, CURRENCY_MAP } from "@/lib/currency-config";
import { cn } from "@/lib/utils";

// =====================================================================
// CurrencySelect — MD3-styled currency selector with flag + code
// ---------------------------------------------------------------------
// IMPORTANT: Radix Select's `<SelectValue>` renders the CHILDREN of the
// selected `<SelectItem>`, not just `textValue`. If we put a `<Flag>`
// SVG inside the SelectItem children, it would also appear in the
// trigger (via SelectValue), creating a double-flag.
//
// Solution: SelectItem children contain ONLY text ("CZK Kč", "EUR €").
// The Flag is rendered manually in the trigger, driven by the current
// `value` prop. The dropdown items show flags via a custom renderer
// that uses `textValue` for display + a data attribute for the flag.
//
// Actually, the simplest approach that works: don't render Flag inside
// SelectItem at all. Just text. The trigger has its own Flag.
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
  const currentMeta = CURRENCY_MAP[value];

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        className={cn("w-full gap-2 font-normal", className)}
      >
        {/* Flag rendered manually in the trigger — NOT inside SelectItem
            children (Radix would clone it into SelectValue → double flag). */}
        <Flag
          code={value}
          className="h-3.5 w-5 rounded-[2px] overflow-hidden shrink-0"
        />
        {/* SelectValue shows the selected item's text content.
            We only put text (code + symbol) in SelectItem children,
            so the trigger shows: [flag] CZK Kč */}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_CURRENCIES.map((c) => {
          const isUnavailable = unavailableCurrencies?.has(c.code);
          const isDefault = c.code === defaultCurrency;
          // textValue is what SelectValue displays in the trigger.
          // Include symbol so trigger shows "CZK Kč" etc.
          const textValue = `${c.code} ${c.symbol}`;
          return (
            <SelectItem
              key={c.code}
              value={c.code}
              disabled={isUnavailable}
              textValue={textValue}
            >
              {/* Children = what shows in the DROPDOWN (not the trigger).
                  SelectValue in the trigger uses textValue, not children.
                  Wait — Radix actually renders children in SelectValue.
                  So we must NOT put Flag here. Text only. */}
              <span className={cn(isUnavailable && "text-muted-foreground/50")}>
                {c.code} {c.symbol}
              </span>
              {isDefault && (
                <span className="type-label-sm text-muted-foreground/70 ml-1">
                  ({t("default")})
                </span>
              )}
              {isUnavailable && (
                <span className="type-label-sm text-muted-foreground/50 ml-auto italic">
                  {t("unavailable")}
                </span>
              )}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
