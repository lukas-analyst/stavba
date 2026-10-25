"use client";

import { useTranslations, useLocale } from "next-intl";
import { formatCurrency, toBcp47 } from "@/lib/format";
import type { Locale } from "@/i18n/config";

// =====================================================================
// CurrencyConversionPreview — small muted text shown below an amount
// field when the user picks a foreign currency.
// ---------------------------------------------------------------------
// Renders something like:
//   "200 € → 5 041 Kč (kurz 25.21)"
//
// Used in the payment dialog and the budget-item dialog. Both dialogs
// fetch the exchange rates via `useExchangeRates()` (passing the
// payment/date field as the date param) and compute the converted
// amount client-side via `convertClientSide()`.
//
// When the conversion is unavailable (rate missing, amount empty,
// currencies equal), nothing is rendered.
// =====================================================================

type Props = {
  /** Raw amount string from the input (may contain comma as decimal sep). */
  amountStr: string;
  /** Source currency ISO code (e.g. "EUR"). */
  fromCurrency: string;
  /** Target currency ISO code (e.g. "CZK" — the project's default). */
  toCurrency: string;
  /** Exchange-rate map from useExchangeRates(). */
  rates: Map<string, number> | undefined;
  /** When true, rates are still being fetched (shows a muted "loading"). */
  isLoading?: boolean;
};

export function CurrencyConversionPreview({
  amountStr,
  fromCurrency,
  toCurrency,
  rates,
  isLoading,
}: Props) {
  const t = useTranslations("currency");
  const locale = useLocale() as Locale;

  // Same currency → no conversion needed, hide preview.
  if (fromCurrency === toCurrency) return null;

  // Parse amount (allow comma as decimal separator — Czech convention).
  const trimmed = amountStr.trim();
  if (trimmed === "") return null;
  const num = Number(trimmed.replace(",", "."));
  if (isNaN(num)) return null;

  // Rates not loaded yet — show a tiny "loading" hint instead of nothing
  // so the user knows a preview is coming.
  if (!rates || isLoading) {
    return (
      <p className="text-[11px] text-muted-foreground/70 italic">
        {t("loadingRate")}
      </p>
    );
  }

  const fromRate = rates.get(fromCurrency);
  const toRate = rates.get(toCurrency);

  if (fromRate === undefined || toRate === undefined) {
    // Rate missing — show the "rate unavailable" message so the user
    // knows to either switch currency or proceed anyway.
    return (
      <p className="text-[11px] text-warning-strong italic dark:text-warning">
        {t("rateUnavailable")}
      </p>
    );
  }

  // Cross-rate: amount_in_CZK = amount * fromRate, then / toRate.
  const converted = (num * fromRate) / toRate;
  const crossRate = fromRate / toRate;

  const fromFormatted = formatCurrency(num, fromCurrency, locale);
  const toFormatted = formatCurrency(converted, toCurrency, locale);
  // Format the cross-rate with up to 4 decimals (e.g. 25.2050 → "25,2050").
  const rateFormatted = new Intl.NumberFormat(toBcp47(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(crossRate);

  return (
    <p className="text-[11px] text-muted-foreground tabular-nums">
      {t("conversionPreview", {
        fromAmount: fromFormatted,
        toAmount: toFormatted,
        rate: rateFormatted,
      })}
    </p>
  );
}
