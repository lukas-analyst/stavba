import { NextResponse } from "next/server";
import { db, dbRead, Prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/authz";

// GET /api/projects/[id]/audit
// Returns audit log entries with server-side filtering, sorting, pagination.
//
// Query params:
//   ?action=create       — filter by action (create/update/delete)
//   ?entity=BudgetItem   — filter by entityType
//   ?userId=xxx          — filter by author (B7)
//   ?search=keyword      — full-text search in oldValue/newValue/entityLabel (B1)
//   ?from=2024-01-01     — date range start (B2, ISO date string)
//   ?to=2024-12-31       — date range end (B2, ISO date string)
//   ?page=1              — page number (1-indexed)
//   ?pageSize=50         — items per page (10/50/100)
//   ?sort=desc           — sort by createdAt: desc or asc
//
// Returns: { entries, total, page, pageSize, totalPages, users }
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireProjectAccess(id, "viewer");
    if (!access.ok) return access.response;
    const { searchParams } = new URL(request.url);

    // Parse query params
    const actionFilter = searchParams.get("action");
    const entityFilter = searchParams.get("entity");
    const userIdFilter = searchParams.get("userId");
    const searchQuery = searchParams.get("search")?.trim();
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(10, parseInt(searchParams.get("pageSize") || "50", 10)));
    const sort = searchParams.get("sort") === "asc" ? "asc" : "desc";

    // Build where clause with Prisma typing
    const where: Prisma.AuditLogWhereInput = { projectId: id };

    if (actionFilter && actionFilter !== "all") {
      where.action = actionFilter;
    }
    if (entityFilter && entityFilter !== "all") {
      where.entityType = entityFilter;
    }
    if (userIdFilter && userIdFilter !== "all") {
      where.userId = userIdFilter;
    }

    // B1: Full-text search in oldValue, newValue, entityLabel
    if (searchQuery) {
      where.OR = [
        { oldValue: { contains: searchQuery, mode: "insensitive" } },
        { newValue: { contains: searchQuery, mode: "insensitive" } },
        { entityLabel: { contains: searchQuery, mode: "insensitive" } },
        { field: { contains: searchQuery, mode: "insensitive" } },
      ];
    }

    // B2: Date range filter
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate);
      }
      if (toDate) {
        // Set to end of day for inclusive range
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        where.createdAt.lte = endOfDay;
      }
    }

    // Get total count + distinct users (for B7 filter dropdown) in parallel
    const [total, users] = await Promise.all([
      dbRead.auditLog.count({ where }),
      dbRead.auditLog.findMany({
        where: { projectId: id, userId: { not: null } },
        select: { userId: true },
        distinct: ["userId"],
      }),
    ]);

    // Fetch user details for the filter dropdown
    const userIds = users.map((u) => u.userId).filter((uid): uid is string => uid !== null);
    const userDetails = userIds.length > 0
      ? await dbRead.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true, image: true },
        })
      : [];

    // Fetch paginated entries
    const entries = await dbRead.auditLog.findMany({
      where,
      orderBy: { createdAt: sort },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    return NextResponse.json({
      entries,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      users: userDetails,
    });
  } catch (error) {
    console.error("GET audit error:", error);
    return NextResponse.json({ error: "Failed to fetch audit log" }, { status: 500 });
  }
}

// POST /api/projects/[id]/audit
// Manually create an audit log entry (used for export logging, etc.)
// Body: { entityType: string, action: string, entityLabel?: string }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { entityType, action, entityLabel } = body;

    if (!entityType || !action) {
      return NextResponse.json({ error: "entityType and action are required" }, { status: 400 });
    }

    // Attribute audit entry to the authenticated user with project access
    const access = await requireProjectAccess(id, "editor");
    if (!access.ok) return access.response;
    const userId = access.user.id;

    const entry = await db.auditLog.create({
      data: {
        projectId: id,
        userId,
        entityType,
        entityId: id,
        entityLabel: entityLabel ?? null,
        action,
        field: null,
        oldValue: null,
        newValue: entityLabel ?? null,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("POST audit error:", error);
    return NextResponse.json({ error: "Failed to create audit entry" }, { status: 500 });
  }
}
