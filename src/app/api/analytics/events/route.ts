import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { dbRead } from "@/lib/db";
import { requireUser } from "@/lib/require-user";

// =====================================================================
// /api/analytics/events — paginated recent-events table
// ---------------------------------------------------------------------
// This endpoint is a clean, focused replacement for the entries slice of
// the old monolithic /api/analytics GET handler. It returns ONLY the
// paginated rows for the "Poslední události" table — no summary
// aggregations, no chart data, no topPages. Those live in
// /api/analytics (summary) and are fetched once per filter change.
//
// Why a separate endpoint?
//   1. Pagination changes frequently (every "Next" click) — the
//      response must be small and fast. The old endpoint recomputed
//      ~10 aggregations on every page change, which was wasteful.
//   2. The pagination math (total / totalPages) was previously tangled
//      with the summary's `totalEvents` field, causing the "108 pages"
//      bug (total included page_view, entries didn't → mismatch).
//      Here `total` always matches the entries filter — no ambiguity.
//   3. Easier to reason about and test in isolation.
//
// Auth: requires a logged-in user (requireUser). The telemetry tab is
// gated behind project "owner" role in the sidebar, but the API itself
// only checks authentication — any logged-in user can read analytics.
//
// Query params:
//   ?type=page_view      — filter by event type (verbatim, no exclusion)
//   ?userId=clxxx        — filter by specific user
//   ?pageUrl=/budget     — filter by page URL
//   ?projectId=clxxx     — filter by projectId (stored in metadata JSON)
//   ?from=2024-01-01     — date range start (ISO date string)
//   ?to=2024-12-31       — date range end (ISO date string)
//   ?page=1              — page number (1-indexed, default 1)
//   ?pageSize=20          — items per page (max 100, default 20)
//
// Default exclusion: when no explicit `type` filter is set, high-volume
// `page_view` events are excluded from BOTH the entries query and the
// total count. They would otherwise drown out meaningful interactions
// and inflate the page count to ~108. When the user explicitly selects
// any type (including "page_view"), we honor it verbatim.
//
// Returns:
//   {
//     entries: AnalyticsEvent[],   // paginated, with user info
//     total: number,               // count matching the SAME filter as entries
//     page: number,
//     pageSize: number,
//     totalPages: number
//   }
// =====================================================================

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Auth — any logged-in user can view analytics
  const { user, response } = await requireUser();
  if (response) return response;
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);

    // Parse filters
    const typeFilter = searchParams.get("type");
    const userIdFilter = searchParams.get("userId");
    const pageUrlFilter = searchParams.get("pageUrl");
    const projectIdFilter = searchParams.get("projectId");
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)),
    );

    // Build the SINGLE where clause used for BOTH findMany and count.
    // This guarantees `total` always matches the entries filter — no
    // more "108 pages but only 2 entries" mismatch.
    const where: Prisma.AnalyticsEventWhereInput = {};

    // Event type filter.
    // - If the user explicitly picked a type (including "page_view"),
    //   honor it verbatim.
    // - If no type filter is set, return ALL event types (including
    //   page_view). The default exclusion was removed temporarily so we
    //   can verify that page_view events are being recorded correctly
    //   for all users (including Google OAuth users).
    //
    // TODO: Once verification is done, restore the default exclusion:
    //   } else {
    //     where.eventType = { not: "page_view" };
    //   }
    if (typeFilter) {
      where.eventType = typeFilter;
    }

    if (userIdFilter) where.userId = userIdFilter;
    if (pageUrlFilter) where.pageUrl = pageUrlFilter;

    // projectId is stored inside metadata JSON string — substring search.
    if (projectIdFilter) {
      where.metadata = { contains: `"projectId":"${projectIdFilter}"` };
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) {
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        where.createdAt.lte = endOfDay;
      }
    }

    // Run paginated fetch + total count in parallel using the SAME
    // where clause. This is the critical correctness invariant.
    const [entries, total] = await Promise.all([
      dbRead.analyticsEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      }),
      dbRead.analyticsEvent.count({ where }),
    ]);

    return NextResponse.json({
      entries,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    console.error("GET /api/analytics/events error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics events" },
      { status: 500 },
    );
  }
}
