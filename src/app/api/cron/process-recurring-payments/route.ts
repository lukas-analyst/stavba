import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { convertAmount } from "@/lib/currency";
import {
  normalizeRecurringInterval,
  computeNextRecurringDate,
} from "@/lib/recurring";

// =====================================================================
// GET /api/cron/process-recurring-payments — daily recurring-payment cron
// ---------------------------------------------------------------------
// Finds all "recurring template" payments whose `recurringNextDate` has
// passed, and creates a one-time clone payment dated at that next-date.
//
// A "recurring template" is a Payment row with:
//   - recurringInterval  set ("weekly" | "monthly" | "quarterly" | "yearly")
//   - recurringNextDate   set
//
// For each due template:
//   1. Clone the template into a new Payment:
//        - date               = template.recurringNextDate
//        - recurringInterval  = null       (clone is one-time)
//        - recurringNextDate  = null
//        - recurringParentId  = template.id
//      All other fields (amount, currency, contact, vendor, invoiceNumber,
//      description, vatRate, invoiceTotal, installmentOf, type, budgetItem)
//      are copied verbatim.
//   2. Recompute the clone's currency conversion (amountConverted /
//      exchangeRateUsed) since the date has changed — the rate for the
//      next-date might differ from the template's original date.
//   3. Recompute the budgetItem.actualCost aggregate (sum of converted
//      amounts) for the clone's budgetItem.
//   4. Advance the template's `recurringNextDate` to the next interval.
//
// Protected by CRON_SECRET (same pattern as finalize-deletions +
// fetch-exchange-rates). Vercel Cron calls this daily at 04:00 UTC.
// =====================================================================

export async function GET(request: Request) {
  // Verify CRON_SECRET to prevent unauthorized access.
  // Vercel Cron sends the secret in the `Authorization: Bearer <secret>`
  // header. We also accept `?secret=<secret>` query param for manual
  // testing / alternative cron providers.
  const authHeader = request.headers.get("authorization");
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error(
      "CRON_SECRET env var is not set — skipping process-recurring-payments",
    );
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
    const now = new Date();

    // Find all due recurring templates (recurringNextDate is set AND <= now).
    // `recurringInterval` is implicitly not-null because we set both fields
    // together in the API routes, but we add the filter defensively.
    const dueTemplates = await db.payment.findMany({
      where: {
        recurringInterval: { not: null },
        recurringNextDate: { lte: now, not: null },
      },
      // We need the parent BudgetItem (for projectId + currency) and the
      // Project (for default currency). Both are joined here so the loop
      // below doesn't have to issue one extra query per template.
      include: {
        budgetItem: {
          select: {
            id: true,
            projectId: true,
            actualCost: true,
            project: { select: { currency: true } },
          },
        },
      },
    });

    if (dueTemplates.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: "No recurring payments due",
      });
    }

    let processed = 0;
    for (const template of dueTemplates) {
      const interval = normalizeRecurringInterval(template.recurringInterval);
      if (interval === null) continue;

      const cloneDate = template.recurringNextDate!; // asserted by query filter
      const projectCurrency = template.budgetItem?.project?.currency ?? "CZK";
      const paymentCurrency = template.currency ?? projectCurrency;

      // Currency conversion: recompute against the clone's date (which is
      // `recurringNextDate`). The template's `amountConverted` was computed
      // for the template's own date — the rate for the next interval's date
      // might be different.
      let amountConverted = template.amount;
      let exchangeRateUsed: number | null = template.exchangeRateUsed ?? null;

      if (paymentCurrency !== projectCurrency) {
        const conversion = await convertAmount(
          template.amount,
          paymentCurrency,
          projectCurrency,
          cloneDate,
        );
        if (conversion) {
          amountConverted = conversion.converted;
          exchangeRateUsed = conversion.rate;
        }
        // If no rate available, amountConverted falls back to template.amount
        // (best-effort — matches the behavior of the POST endpoint).
      } else {
        exchangeRateUsed = null;
      }

      // Recompute VAT amount for the clone (in case amount is the same but
      // we want a clean snapshot for the new payment record).
      const vatRate = template.vatRate;
      const vatAmount =
        vatRate !== null && vatRate !== undefined && vatRate > 0
          ? (template.amount * vatRate) / (100 + vatRate)
          : null;

      // 1. Create the clone (one-time payment, linked back to the template).
      const clone = await db.payment.create({
        data: {
          budgetItemId: template.budgetItemId,
          contactId: template.contactId,
          amount: template.amount,
          currency: template.currency,
          amountConverted,
          exchangeRateUsed,
          invoiceTotal: template.invoiceTotal,
          installmentOf: template.installmentOf,
          vatRate,
          vatAmount,
          date: cloneDate,
          type: template.type,
          vendor: template.vendor,
          invoiceNumber: template.invoiceNumber,
          description: template.description,
          // The clone is a one-time payment, NOT a new template:
          recurringInterval: null,
          recurringNextDate: null,
          recurringParentId: template.id,
        },
      });

      // 2. Recompute the budgetItem.actualCost aggregate so the cloned
      //    payment is reflected in the parent item's running total.
      const agg = await db.payment.aggregate({
        where: { budgetItemId: template.budgetItemId },
        _sum: { amountConverted: true },
      });
      await db.budgetItem.update({
        where: { id: template.budgetItemId },
        data: { actualCost: agg._sum.amountConverted ?? 0 },
      });

      // 3. Audit log the clone creation. `budgetItem.projectId` is the
      //    parent project (validated by the join above).
      const projectId = template.budgetItem?.projectId;
      if (projectId) {
        await logChanges(
          projectId,
          "Payment",
          clone.id,
          "create",
          null,
          {
            amount: clone.amount,
            type: clone.type,
            budgetItemId: clone.budgetItemId,
            recurringParentId: template.id,
            recurringInterval: interval,
          },
          clone.description || clone.vendor,
        );
      }

      // 4. Advance the template's recurringNextDate to the next interval.
      const nextNext = computeNextRecurringDate(cloneDate, interval);
      await db.payment.update({
        where: { id: template.id },
        data: { recurringNextDate: nextNext },
      });

      processed++;
    }

    // Bust server-side caches so the user sees the cloned payments on the
    // next refresh (15s TTL would catch it eventually, but a proactive
    // bust keeps dashboards + payment tables in sync immediately).
    try {
      revalidateTag("payments");
      revalidateTag("dashboards");
      revalidateTag("budgets");
    } catch {
      // Non-fatal — caches will expire via TTL anyway.
    }

    console.log(
      `[process-recurring-payments] Processed ${processed} recurring template(s)`,
    );

    return NextResponse.json({
      success: true,
      processed,
      message: `Created ${processed} recurring payment clone(s)`,
    });
  } catch (error) {
    console.error("GET /api/cron/process-recurring-payments error:", error);
    return NextResponse.json(
      { error: "Failed to process recurring payments" },
      { status: 500 },
    );
  }
}
