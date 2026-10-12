import { NextResponse } from "next/server";
import { db, dbRead } from "@/lib/db";

// GET /api/projects/[id]/audit
// Returns audit log entries for the project with server-side filtering,
// sorting, and pagination.
//
// Query params:
//   ?limit=100       — max entries to return (capped at 500)
//   ?action=create   — filter by action (create/update/delete)
//   ?entity=BudgetItem — filter by entityType
//   ?page=1          — page number (1-indexed)
//   ?pageSize=50      — items per page (10/50/100, default 50)
//   ?sort=desc        — sort by createdAt: desc (newest) or asc (oldest)
//
// Returns: { entries: [...], total: number, page: number, pageSize: number }
// Uses `dbRead` (read replica if configured, falls back to primary).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    // Parse query params
    const actionFilter = searchParams.get("action");
    const entityFilter = searchParams.get("entity");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(10, parseInt(searchParams.get("pageSize") || "50", 10)),
    );
    const sort = searchParams.get("sort") === "asc" ? "asc" : "desc";

    // Build where clause
    const where: {
      projectId: string;
      action?: string;
      entityType?: string;
    } = { projectId: id };
    if (actionFilter && actionFilter !== "all") {
      where.action = actionFilter;
    }
    if (entityFilter && entityFilter !== "all") {
      where.entityType = entityFilter;
    }

    // Get total count for pagination
    const total = await dbRead.auditLog.count({ where });

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
    });
  } catch (error) {
    console.error("GET audit error:", error);
    return NextResponse.json({ error: "Failed to fetch audit log" }, { status: 500 });
  }
}
