import { db } from "@/lib/db";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/currency-config";

// =====================================================================
// Exchange rate fetching + conversion helpers
// ---------------------------------------------------------------------
// Fetches daily exchange rates from the Czech National Bank (ČNB) and
// converts amounts between currencies using stored rates.
//
// ČNB publishes rates at ~14:30 CET on business days. The API is a
// plain-text file (not JSON) — we parse it to extract rate per currency.
//
// CZK is the reference currency (rate = 1.0). Other currencies are
// expressed as "how many CZK = 1 unit" (or per 100 units for HUF, JPY).
// =====================================================================

const CNB_API_URL =
  "https://www.cnb.cz/cs/financni_trhy/devizovy_trh/denni_kurz_jnp.txt";

type CnbRate = {
  currency: string;     // e.g. "euro"
  code: string;         // e.g. "EUR"
  amount: number;       // e.g. 1 or 100
  rate: number;         // e.g. 25.205
};

/**
 * Fetch + parse the ČNB daily exchange rate file.
 * Returns an array of rates for all published currencies.
 */
async function fetchCnbRates(date?: Date): Promise<{ rates: CnbRate[]; date: Date }> {
  // Format date as DD.MM.YYYY for ČNB URL (if provided)
  const targetDate = date ?? new Date();
  const dateStr = targetDate
    .toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric" })
    .replace(/\s/g, "");

  const url = `${CNB_API_URL}?datum=${dateStr}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`ČNB API returned ${res.status}`);
  }
  const text = await res.text();

  // Parse the text file:
  // Line 1: "23.10.2024 #112"
  // Line 2: "země|měna|množství|kód|kurz"
  // Line 3+: "EMU|euro|1|EUR|25,2050"
  const lines = text.trim().split("\n");
  if (lines.length < 2) {
    throw new Error("ČNB API returned empty or malformed response");
  }

  // Parse the date from line 1
  const dateMatch = lines[0].match(/^(\d{2}\.\d{2}\.\d{4})/);
  const parsedDate = dateMatch
    ? new Date(dateMatch[1].split(".").reverse().join("-"))
    : targetDate;

  const rates: CnbRate[] = [];
  // Skip header lines (0 = date, 1 = column names)
  for (let i = 2; i < lines.length; i++) {
    const parts = lines[i].split("|");
    if (parts.length < 5) continue;
    const [country, currency, amount, code, rateStr] = parts;
    const amountNum = parseInt(amount, 10);
    const rateNum = parseFloat(rateStr.replace(",", "."));
    if (isNaN(amountNum) || isNaN(rateNum)) continue;
    rates.push({ currency, code, amount: amountNum, rate: rateNum });
  }

  return { rates, date: parsedDate };
}

/**
 * Fetch ČNB rates + upsert into the ExchangeRate table.
 * Called by the cron job (`/api/cron/fetch-exchange-rates`) daily.
 *
 * Idempotent: if rates for this date already exist, they're skipped
 * (unique constraint on [currency, date]).
 */
export async function syncExchangeRates(date?: Date): Promise<{
  synced: number;
  skipped: number;
  date: Date;
}> {
  const { rates, date: parsedDate } = await fetchCnbRates(date);

  // Always insert CZK with rate = 1.0 (reference currency)
  const allRates = [
    { code: "CZK", amount: 1, rate: 1.0, currency: "Česká republika" },
    ...rates,
  ];

  // Filter to only supported currencies
  const supportedCodes = new Set(SUPPORTED_CURRENCIES.map((c) => c.cnbCode));
  const filtered = allRates.filter((r) => supportedCodes.has(r.code));

  let synced = 0;
  let skipped = 0;

  for (const r of filtered) {
    // Normalize rate to "per 1 unit" (ČNB quotes HUF, JPY per 100 units)
    const normalizedRate = r.rate / r.amount;

    try {
      await db.exchangeRate.upsert({
        where: {
          currency_date: {
            currency: r.code,
            date: parsedDate,
          },
        },
        update: { rate: normalizedRate, source: "cnb" },
        create: {
          currency: r.code,
          rate: normalizedRate,
          date: parsedDate,
          source: "cnb",
        },
      });
      synced++;
    } catch {
      // Likely unique constraint violation (already exists) — skip
      skipped++;
    }
  }

  return { synced, skipped, date: parsedDate };
}

/**
 * Get the exchange rate for a currency on a specific date.
 * Falls back to the most recent rate before the target date
 * (handles weekends/holidays when ČNB doesn't publish).
 *
 * Returns 1.0 for CZK (reference currency).
 * Returns null if no rate is available (currency not supported or
 * no historical data).
 */
export async function getExchangeRate(
  currency: string,
  date: Date,
): Promise<{ rate: number; date: Date } | null> {
  // CZK is always 1.0
  if (currency === "CZK") {
    return { rate: 1.0, date };
  }

  // Find the most recent rate on or before the target date
  const rate = await db.exchangeRate.findFirst({
    where: {
      currency,
      date: { lte: date },
    },
    orderBy: { date: "desc" },
  });

  if (!rate) return null;
  return { rate: rate.rate, date: rate.date };
}

/**
 * Convert an amount from one currency to the project's default currency.
 *
 * @param amount       The amount in the source currency
 * @param fromCurrency Source currency code (e.g. "EUR")
 * @param projectCurrency  Target currency code (e.g. "CZK")
 * @param date         The date to use for the exchange rate
 * @returns            The converted amount + the rate used, or null
 *                     if no rate is available
 */
export async function convertAmount(
  amount: number,
  fromCurrency: string,
  projectCurrency: string,
  date: Date,
): Promise<{ converted: number; rate: number; rateDate: Date } | null> {
  // Same currency — no conversion needed
  if (fromCurrency === projectCurrency) {
    return { converted: amount, rate: 1.0, rateDate: date };
  }

  // Both currencies need a rate to CZK (ČNB always quotes to CZK)
  const fromRate = await getExchangeRate(fromCurrency, date);
  const toRate = await getExchangeRate(projectCurrency, date);

  if (!fromRate || !toRate) {
    return null;
  }

  // Convert: amount_in_CZK = amount * fromRate.rate
  // Then: amount_in_target = amount_in_CZK / toRate.rate
  const amountInCzk = amount * fromRate.rate;
  const converted = amountInCzk / toRate.rate;

  return {
    converted,
    rate: fromRate.rate / toRate.rate, // cross-rate
    rateDate: fromRate.date,
  };
}
