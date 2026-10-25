"use client";

import { useQuery } from "@tanstack/react-query";

// =====================================================================
// useExchangeRates — fetches ČNB exchange rates for a given date
// ---------------------------------------------------------------------
// Returns a Map<currencyCode, rate> where `rate` is "how many CZK = 1 unit
// of this currency" (e.g. EUR → 25.21 means 1 EUR = 25.21 CZK).
//
// CZK is always present with rate 1.0 (reference currency).
//
// Used by the multi-currency UI to compute a live conversion preview
// in the payment/budget-item dialogs ("200 € → 5 041 Kč (kurz 25.21)").
//
// The endpoint /api/exchange-rates?date=YYYY-MM-DD returns the most
// recent rate on or before the target date (handles weekends/holidays).
//
// `date` is optional — when omitted, today's date is used (rates for
// "right now"). When the payment date changes (user edits the date
// field), pass the new date so the preview uses the correct historical
// rate.
//
// Cache: 5 minutes. Exchange rates don't change frequently (ČNB
// publishes once per business day at ~14:30 CET), so this is plenty.
// =====================================================================

export type ExchangeRateMap = Map<string, number>;

type ExchangeRateEntry = {
  currency: string;
  rate: number;
  date: string;
};

/**
 * Fetch exchange rates for a specific date (or today if not provided).
 *
 * @param date  ISO date string "YYYY-MM-DD" (or null/undefined → today)
 * @returns     Map<currencyCode, rate> — always includes CZK → 1.0
 */
export function useExchangeRates(date?: string | null) {
  return useQuery<ExchangeRateMap>({
    queryKey: ["exchange-rates", date ?? "today"],
    queryFn: async () => {
      const url = date
        ? `/api/exchange-rates?date=${encodeURIComponent(date)}`
        : "/api/exchange-rates";
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error("Failed to fetch exchange rates");
      }
      const data = (await res.json()) as ExchangeRateEntry[];
      const map: ExchangeRateMap = new Map();
      // CZK is always 1.0 (reference currency — server may or may not
      // include it in the response, but we always want it available
      // client-side so the conversion helper doesn't need a special case).
      map.set("CZK", 1.0);
      for (const entry of data) {
        map.set(entry.currency, entry.rate);
      }
      return map;
    },
    // 5 minutes — rates are stable within a session
    staleTime: 5 * 60 * 1000,
    // Don't retry aggressively — the UI gracefully degrades when rates
    // aren't available (we just don't show the preview).
    retry: 1,
  });
}

/**
 * Compute a client-side conversion using the rates map.
 *
 * Returns null when either:
 *   - the source currency is the same as the target (rate = 1.0)
 *   - one of the rates is unavailable (e.g. currency not yet fetched
 *     from ČNB — happens for newly-added currencies on the first run).
 *
 * NOTE: The server-side `convertAmount()` is the source of truth —
 * it stores `amountConverted` + `exchangeRateUsed` in the DB. This
 * client helper is only for the live preview shown in the dialog
 * (best-effort; the actual stored conversion may differ slightly if
 * the rate changes between dialog-open and save).
 */
export function convertClientSide(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRateMap | undefined,
): { converted: number; rate: number } | null {
  if (!rates) return null;
  if (fromCurrency === toCurrency) {
    return { converted: amount, rate: 1.0 };
  }
  const fromRate = rates.get(fromCurrency);
  const toRate = rates.get(toCurrency);
  if (fromRate === undefined || toRate === undefined) {
    return null;
  }
  // Cross-rate: amount_in_CZK = amount * fromRate, then amount_in_target = / toRate
  const amountInCzk = amount * fromRate;
  const converted = amountInCzk / toRate;
  return { converted, rate: fromRate / toRate };
}
