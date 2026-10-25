import { NextResponse } from "next/server";
import { syncExchangeRates } from "@/lib/currency";

// =====================================================================
// GET /api/cron/fetch-exchange-rates — daily ČNB rate sync
// ---------------------------------------------------------------------
// Called by Vercel Cron daily at 15:00 CET (after ČNB publishes at
// ~14:30). Fetches the day's exchange rates from the ČNB text API,
// parses them, and upserts into the `exchange_rates` table.
//
// Protected by CRON_SECRET (same as finalize-deletions).
// =====================================================================

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET env var is not set — skipping fetch-exchange-rates");
    return NextResponse.json(
      { error: "Cron secret not configured" },
      { status: 500 },
    );
  }

  const isValid = authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret;
  if (!isValid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
