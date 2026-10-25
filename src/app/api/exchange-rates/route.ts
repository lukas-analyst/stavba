import { NextResponse } from "next/server";
import { dbRead } from "@/lib/db";
import { requireUser } from "@/lib/authz";

// =====================================================================
// GET /api/exchange-rates?date=YYYY-MM-DD
// ---------------------------------------------------------------------
// Returns the available exchange rates for a given date (or today if
// no date provided). Used by the CurrencySelect component to determine
// which currencies are available (have a rate) for the payment date.
//
// Returns: 200 Array<{ currency: string, rate: number, date: string }>
//          401 if not authenticated
// =====================================================================

export async function GET(request: Request) {
  const { response } = await requireUser();
  if (response) return response;

  try {
    const url = new URL(request.url);
    const dateParam = url.searchParams.get("date");
    const targetDate = dateParam ? new Date(dateParam) : new Date();

    if (isNaN(targetDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format" },
        { status: 400 },
      );
    }

    // Find the most recent rate for each currency on or before the target date.
    // We query distinct currencies first, then fetch the latest rate for each.
    const currencies = await dbRead.exchangeRate.findMany({
      where: { date: { lte: targetDate } },
      distinct: ["currency"],
      orderBy: { date: "desc" },
      select: { currency: true, rate: true, date: true },
    });

    return NextResponse.json(
      currencies.map((r) => ({
        currency: r.currency,
        rate: r.rate,
        date: r.date.toISOString(),
      })),
    );
  } catch (error) {
    console.error("GET /api/exchange-rates error:", error);
    return NextResponse.json(
      { error: "Failed to fetch exchange rates" },
      { status: 500 },
    );
  }
}
