import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db, dbRead } from "@/lib/db";
import { requireUser } from "@/lib/require-user";

// =====================================================================
// /api/analytics — internal telemetry endpoint
// ---------------------------------------------------------------------
// POST — log an analytics event (called from the client on every
//        tracked interaction: page_view, add_payment, …).
// GET  — retrieve paginated analytics events + aggregated summary
//        (used by the Telemetry tab in the UI).
//
// No third-party data sharing, no cookies, no PII beyond the user ID.
// =====================================================================

// POST /api/analytics
// Body: { eventType, pageUrl?, timeSpent?, metadata? }
// Returns: 201 { id } on success, 400 if `eventType` is missing.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const { eventType, pageUrl, timeSpent, metadata } = body as {
      eventType?: string;
      pageUrl?: string;
      timeSpent?: number;
      metadata?: unknown;
    };

    if (!eventType || typeof eventType !== "string" || eventType.length === 0) {
      return NextResponse.json(
        { error: "eventType is required" },
        { status: 400 },
      );
    }

    // Attribute events to the authenticated user
    const { user, response } = await requireUser();
    if (response) return response;
    if (!user) return NextResponse.json({ error: "Nejste přihlášen." }, { status: 401 });
    const userId = user.id;

    const event = await db.analyticsEvent.create({
      data: {
        userId,
        eventType: eventType.slice(0, 100), // bound length to avoid abuse
        pageUrl: typeof pageUrl === "string" ? pageUrl.slice(0, 500) : null,
        timeSpent:
          typeof timeSpent === "number" && Number.isFinite(timeSpent)
            ? Math.max(0, Math.round(timeSpent))
            : null,
        metadata:
          metadata !== undefined && metadata !== null
            ? JSON.stringify(metadata).slice(0, 4000)
            : null,
      },
    });

    return NextResponse.json({ id: event.id }, { status: 201 });
  } catch (error) {
    console.error("POST analytics error:", error);
    return NextResponse.json(
      { error: "Failed to log analytics event" },
      { status: 500 },
    );
  }
}

// GET /api/analytics
// Query params:
//   ?from=2024-01-01   — date range start (ISO date string)
//   ?to=2024-12-31     — date range end (ISO date string)
//   ?type=page_view    — filter by event type
//   ?userId=clxxx      — filter by specific user
//   ?pageUrl=budget    — filter by page URL
//   ?projectId=clxxx   — filter by projectId (searches metadata JSON)
//   ?page=1            — page number (1-indexed)
//   ?pageSize=20       — items per page (max 100)
//
// Returns:
//   {
//     entries: AnalyticsEvent[],  // paginated, with user info
//     total: number,
//     page: number,
//     pageSize: number,
//     totalPages: number,
//     projects: Array<{ id, name }>,  // distinct projects from metadata
//     users: Array<{ id, name, email }>,  // users that have logged events
//     pages: string[],  // distinct page URLs seen
//     summary: {
//       totalEvents: number,
//       eventsByType: { [eventType: string]: number },
//       eventsByDay: { [YYYY-MM-DD]: number },   // last 30 days
//       uniqueUsers: number,
//       totalPageViews: number,
//       totalTimeSpent: number,                   // seconds (sum)
//       avgTimePerPage: number,                   // seconds (avg per page_view)
//       topPages: Array<{ pageUrl, views, avgTimeSpent }>,
//       timeByPage: Array<{ pageUrl, totalTime, views, avgTime }>,
//       timeByUser: Array<{ userId, userName, totalTime, views }>,
//       eventsByHour: Record<string, number>,    // hour 0-23 → count (today)
//       topUsersByEvents: Array<{ userId, userName, eventCount, lastActive }>,
//       longestSession: number,                  // max timeSpent single session
//     }
//   }
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse filters
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");
    const typeFilter = searchParams.get("type");
    const userIdFilter = searchParams.get("userId");
    const pageUrlFilter = searchParams.get("pageUrl");
    const projectIdFilter = searchParams.get("projectId");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)),
    );

    // Build where clause
    const where: Prisma.AnalyticsEventWhereInput = {};
    if (typeFilter) where.eventType = typeFilter;
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

    // Run paginated fetch + total count in parallel
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

    // === Compute summary (always over the full filtered range, ignoring pagination) ===
    // For eventsByDay, we only care about the last 30 days — extend where with
    // a createdAt gte = now - 30 days (intersected with any user-provided range).
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dayWhere: Prisma.AnalyticsEventWhereInput = { ...where };
    dayWhere.createdAt = {
      ...(dayWhere.createdAt as Prisma.DateTimeFilter | undefined),
      gte: thirtyDaysAgo,
    };

    // Aggregate counts grouped by eventType (over full filtered range)
    const groupedByType = await dbRead.analyticsEvent.groupBy({
      by: ["eventType"],
      where,
      _count: { _all: true },
    });

    // Aggregate counts grouped by day for the last 30 days
    // Note: Prisma doesn't have a native "group by day" — we fetch raw createdAt
    // values and bucket them in JS. For typical volumes this is fine.
    const recentEvents = await dbRead.analyticsEvent.findMany({
      where: dayWhere,
      select: { createdAt: true },
    });
    const eventsByDay: Record<string, number> = {};
    for (const ev of recentEvents) {
      const d = new Date(ev.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0",
      )}-${String(d.getDate()).padStart(2, "0")}`;
      eventsByDay[key] = (eventsByDay[key] ?? 0) + 1;
    }
    // Fill in any missing days with 0 for a continuous chart
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0",
      )}-${String(d.getDate()).padStart(2, "0")}`;
      if (eventsByDay[key] === undefined) eventsByDay[key] = 0;
    }

    // Unique users (over full filtered range) — also gather user info
    const groupedByUser = await dbRead.analyticsEvent.groupBy({
      by: ["userId"],
      where,
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const uniqueUsers = groupedByUser.length;

    // Page-view-specific stats
    const pageViewWhere: Prisma.AnalyticsEventWhereInput = {
      ...where,
      eventType: "page_view",
    };
    const [totalPageViewsAgg, pageViewTimeAgg, longestSessionAgg] =
      await Promise.all([
        dbRead.analyticsEvent.aggregate({
          where: pageViewWhere,
          _count: { _all: true },
        }),
        dbRead.analyticsEvent.aggregate({
          where: { ...pageViewWhere, timeSpent: { not: null } },
          _sum: { timeSpent: true },
        }),
        dbRead.analyticsEvent.aggregate({
          where: { ...pageViewWhere, timeSpent: { not: null } },
          _max: { timeSpent: true },
        }),
      ]);
    const totalPageViews = totalPageViewsAgg._count._all;
    const totalTimeSpent = pageViewTimeAgg._sum.timeSpent ?? 0;
    const longestSession = longestSessionAgg._max.timeSpent ?? 0;
    const avgTimePerPage =
      totalPageViews > 0 ? Math.round(totalTimeSpent / totalPageViews) : 0;

    // Top pages — group by pageUrl (only non-null), get views + avg time spent
    // Also compute timeByPage (with totalTime) and timeByUser.
    const pageViewEvents = await dbRead.analyticsEvent.findMany({
      where: { ...pageViewWhere, pageUrl: { not: null } },
      select: { pageUrl: true, timeSpent: true, userId: true, createdAt: true },
      // For very large datasets this could be heavy; consider materialised views.
    });
    const pageStats = new Map<
      string,
      { views: number; totalTime: number; timeEntries: number }
    >();
    const userTimeStats = new Map<
      string,
      { views: number; totalTime: number }
    >();
    for (const ev of pageViewEvents) {
      if (ev.pageUrl) {
        const cur = pageStats.get(ev.pageUrl) ?? {
          views: 0,
          totalTime: 0,
          timeEntries: 0,
        };
        cur.views += 1;
        if (ev.timeSpent !== null) {
          cur.totalTime += ev.timeSpent;
          cur.timeEntries += 1;
        }
        pageStats.set(ev.pageUrl, cur);
      }
      const u = userTimeStats.get(ev.userId ?? "__null__") ?? { views: 0, totalTime: 0 };
      u.views += 1;
      if (ev.timeSpent !== null) u.totalTime += ev.timeSpent;
      userTimeStats.set(ev.userId ?? "__null__", u);
    }
    const topPages = Array.from(pageStats.entries())
      .map(([pageUrl, s]) => ({
        pageUrl,
        views: s.views,
        avgTimeSpent: s.timeEntries > 0 ? Math.round(s.totalTime / s.timeEntries) : 0,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 15);
    const timeByPage = Array.from(pageStats.entries())
      .map(([pageUrl, s]) => ({
        pageUrl,
        totalTime: s.totalTime,
        views: s.views,
        avgTime: s.timeEntries > 0 ? Math.round(s.totalTime / s.timeEntries) : 0,
      }))
      .sort((a, b) => b.totalTime - a.totalTime);

    // Build eventsByType map
    const eventsByType: Record<string, number> = {};
    for (const row of groupedByType) {
      eventsByType[row.eventType] = row._count._all;
    }

    // === Hourly activity (today only) ===
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const hourWhere: Prisma.AnalyticsEventWhereInput = { ...where };
    hourWhere.createdAt = {
      ...(hourWhere.createdAt as Prisma.DateTimeFilter | undefined),
      gte: startOfToday,
      lte: endOfToday,
    };
    const todayEvents = await dbRead.analyticsEvent.findMany({
      where: hourWhere,
      select: { createdAt: true },
    });
    const eventsByHour: Record<string, number> = {};
    for (let h = 0; h < 24; h++) eventsByHour[String(h)] = 0;
    for (const ev of todayEvents) {
      const h = new Date(ev.createdAt).getHours();
      eventsByHour[String(h)] = (eventsByHour[String(h)] ?? 0) + 1;
    }

    // === Top users by events (over full filtered range) ===
    // We already have groupedByUser — fetch user names.
    // Filter out null userIds (auth events can have null userId).
    const userIds = groupedByUser
      .map((g) => g.userId)
      .filter((id): id is string => id !== null);
    const usersFromDb =
      userIds.length > 0
        ? await dbRead.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true, image: true },
          })
        : [];
    const userMap = new Map(usersFromDb.map((u) => [u.id, u]));

    const topUsersByEvents = groupedByUser
      .filter((g): g is typeof g & { userId: string } => g.userId !== null)
      .map((g) => {
        const u = userMap.get(g.userId);
        return {
          userId: g.userId,
          userName: u?.name || u?.email || "Neznámý uživatel",
          email: u?.email ?? null,
          image: u?.image ?? null,
          eventCount: g._count._all,
          lastActive: g._max.createdAt?.toISOString() ?? null,
        };
      })
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10);

    // timeByUser — total time per user (page_view events with timeSpent)
    const timeByUser = Array.from(userTimeStats.entries())
      .map(([userId, s]) => {
        const u = userMap.get(userId);
        return {
          userId,
          userName: u?.name || u?.email || "Neznámý uživatel",
          totalTime: s.totalTime,
          views: s.views,
        };
      })
      .sort((a, b) => b.totalTime - a.totalTime)
      .slice(0, 10);

    // === projects array — distinct projectIds parsed from metadata ===
    // We scan events with non-null metadata that contains "projectId".
    // Only fetch metadata column to keep payload small.
    const projectMetaRows = await dbRead.analyticsEvent.findMany({
      where: {
        ...where,
        metadata: { contains: `"projectId"` },
      },
      select: { metadata: true },
      distinct: ["metadata"],
    });
    const projectIds = new Set<string>();
    for (const row of projectMetaRows) {
      if (!row.metadata) continue;
      try {
        const parsed = JSON.parse(row.metadata);
        if (parsed && typeof parsed === "object" && typeof parsed.projectId === "string") {
          projectIds.add(parsed.projectId);
        }
      } catch {
        // ignore malformed JSON
      }
    }
    const projectIdList = Array.from(projectIds);
    const projectRows =
      projectIdList.length > 0
        ? await dbRead.project.findMany({
            where: { id: { in: projectIdList } },
            select: { id: true, name: true },
          })
        : [];
    const projectNameMap = new Map(projectRows.map((p) => [p.id, p.name]));
    const projects = projectIdList
      .map((id) => ({ id, name: projectNameMap.get(id) ?? `Projekt ${id.slice(-8)}` }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // === users & pages list (for filter dropdowns) ===
    // Users who have any events (across ALL data — not just filtered range)
    const allUsersWithEvents = await dbRead.analyticsEvent.groupBy({
      by: ["userId"],
      _count: { _all: true },
    });
    const allUserIds = allUsersWithEvents
      .map((g) => g.userId)
      .filter((id): id is string => id !== null);
    const allUsersDb =
      allUserIds.length > 0
        ? await dbRead.user.findMany({
            where: { id: { in: allUserIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
    const users = allUsersDb
      .map((u) => ({ id: u.id, name: u.name, email: u.email }))
      .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));

    // Distinct page URLs (across ALL data — for the page filter dropdown)
    const pageUrlRows = await dbRead.analyticsEvent.findMany({
      where: { pageUrl: { not: null } },
      select: { pageUrl: true },
      distinct: ["pageUrl"],
    });
    const pages = pageUrlRows
      .map((r) => r.pageUrl)
      .filter((p): p is string => Boolean(p))
      .sort();

    return NextResponse.json({
      entries,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      projects,
      users,
      pages,
      summary: {
        totalEvents: total,
        eventsByType,
        eventsByDay,
        uniqueUsers,
        totalPageViews,
        totalTimeSpent,
        avgTimePerPage,
        longestSession,
        topPages,
        timeByPage,
        timeByUser,
        eventsByHour,
        topUsersByEvents,
      },
    });
  } catch (error) {
    console.error("GET analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 },
    );
  }
}
