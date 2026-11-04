import { NextResponse } from "next/server";
import { syncExchangeRates } from "@/lib/currency";
import { verifyCronSecret } from "@/lib/cron-auth";

// =====================================================================
// GET /api/cron/fetch-exchange-rates — daily ČNB rate sync
// ---------------------------------------------------------------------
// Called by Vercel Cron daily at 15:00 CET (after ČNB publishes at
// ~14:30). Fetches the day's exchange rates from the ČNB text API,
// parses them, and upserts into the `exchange_rates` table.
//
// Protected by CRON_SECRET (see `verifyCronSecret` in @/lib/cron-auth).
// SECURITY (audit fix M1): comparison now uses `crypto.timingSafeEqual`
// and the `?secret=` query-param fallback has been removed (it leaked
// the secret into Vercel / proxy logs).
// =====================================================================

export async function GET(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return auth.response;

  try {
    const result = await syncExchangeRates();

    console.log(
      `[fetch-exchange-rates] Synced ${result.synced} rates, skipped ${result.skipped} (date: ${result.date.toISOString().split("T")[0]})`,
    );

    return NextResponse.json({
      success: true,
      synced: result.synced,
      skipped: result.skipped,
      date: result.date.toISOString(),
    });
  } catch (error) {
    console.error("GET /api/cron/fetch-exchange-rates error:", error);
    return NextResponse.json(
      { error: "Failed to fetch exchange rates" },
      { status: 500 },
    );
  }
}
