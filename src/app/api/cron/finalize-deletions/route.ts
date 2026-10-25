import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// =====================================================================
// GET /api/cron/finalize-deletions — permanently anonymize expired
// soft-deleted accounts (called by Vercel Cron daily)
// ---------------------------------------------------------------------
// After the 7-day cooling-off period, accounts are permanently
// anonymized:
//   - email → `deleted_<userId>_<originalEmail>` (frees the email
//     for new registrations)
//   - name → "Smazaný uživatel"
//   - image → null
//
// Projects owned by the user remain in the DB (orphaned) — they're
// accessible to other members who see a "Bez vlastníka" badge.
//
// CRON_SECRET: protects this endpoint from unauthorized access.
// Set via Vercel Cron + env var.
// =====================================================================

const COOLING_OFF_DAYS = 7;

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
    console.error("CRON_SECRET env var is not set — skipping finalize-deletions");
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
    const cutoff = new Date(
      Date.now() - COOLING_OFF_DAYS * 24 * 60 * 60 * 1000,
    );

    // Find all users whose cooling-off period has expired
    const expiredUsers = await db.user.findMany({
      where: {
        deletedAt: { lt: cutoff, not: null },
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
      },
    });

    if (expiredUsers.length === 0) {
      return NextResponse.json({
        success: true,
        finalized: 0,
        message: "No accounts to finalize",
      });
    }

    // Anonymize each user
    let finalized = 0;
    for (const user of expiredUsers) {
      // Skip if already anonymized (email starts with "deleted_")
      if (user.email.startsWith("deleted_")) continue;

      const anonymizedEmail = `deleted_${user.id}_${user.email}`;

      await db.user.update({
        where: { id: user.id },
        data: {
          email: anonymizedEmail,
          name: "Smazaný uživatel",
          image: null,
        },
      });
      finalized++;
    }

    console.log(
      `[finalize-deletions] Anonymized ${finalized} account(s)`,
    );

    return NextResponse.json({
      success: true,
      finalized,
      message: `Anonymized ${finalized} account(s)`,
    });
  } catch (error) {
    console.error("GET /api/cron/finalize-deletions error:", error);
    return NextResponse.json(
      { error: "Failed to finalize deletions" },
      { status: 500 },
    );
  }
}
