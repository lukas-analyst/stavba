// =====================================================================
// Currency configuration — supported currencies + metadata
// ---------------------------------------------------------------------
// Supported currencies for multi-currency support. Each currency has:
//   - code: ISO 4217 (CZK, EUR, USD, …)
//   - name: localized display name (resolved via `currencies.*` messages)
//   - flagCode: maps to SVG flag component
//   - symbol: currency symbol for display (Kč, €, $, …)
//   - cnbCode: ČNB currency code (for API parsing)
//   - cnbAmount: ČNB "množství" (for currencies quoted per 100 units)
//
// CZK is always available (rate = 1.0, reference currency).
// Other currencies are fetched from ČNB daily by the cron job.
// =====================================================================

export type CurrencyCode = "CZK" | "EUR" | "USD" | "GBP" | "HUF" | "PLN" | "AUD" | "VND";

export type CurrencyMeta = {
  code: CurrencyCode;
  flagCode: string;       // maps to Flag component
  symbol: string;         // display symbol
  cnbCode: string;        // ČNB code (e.g. "EUR", "HUF")
  cnbAmount: number;      // ČNB "množství" — 1 or 100 (HUF, JPY are per 100)
  decimals: number;       // number of decimal places for display
};

export const SUPPORTED_CURRENCIES: CurrencyMeta[] = [
  { code: "CZK", flagCode: "CZK", symbol: "Kč",  cnbCode: "CZK", cnbAmount: 1,   decimals: 0 },
  { code: "EUR", flagCode: "EUR", symbol: "€",   cnbCode: "EUR", cnbAmount: 1,   decimals: 2 },
  { code: "USD", flagCode: "USD", symbol: "$",   cnbCode: "USD", cnbAmount: 1,   decimals: 2 },
  { code: "GBP", flagCode: "GBP", symbol: "£",   cnbCode: "GBP", cnbAmount: 1,   decimals: 2 },
  { code: "HUF", flagCode: "HUF", symbol: "Ft",  cnbCode: "HUF", cnbAmount: 100, decimals: 0 },
  { code: "PLN", flagCode: "PLN", symbol: "zł",  cnbCode: "PLN", cnbAmount: 1,   decimals: 2 },
  { code: "AUD", flagCode: "AUD", symbol: "A$",  cnbCode: "AUD", cnbAmount: 1,   decimals: 2 },
  { code: "VND", flagCode: "VND", symbol: "₫",   cnbCode: "VND", cnbAmount: 100, decimals: 0 },
];

export const CURRENCY_MAP: Record<string, CurrencyMeta> = Object.fromEntries(
  SUPPORTED_CURRENCIES.map((c) => [c.code, c]),
);

export function getCurrencyMeta(code: string | null | undefined): CurrencyMeta | null {
  if (!code) return null;
  return CURRENCY_MAP[code] ?? null;
}

export const DEFAULT_CURRENCY: CurrencyCode = "CZK";

/**
 * Check if a currency is supported.
 */
export function isSupportedCurrency(code: string): code is CurrencyCode {
  return code in CURRENCY_MAP;
}
