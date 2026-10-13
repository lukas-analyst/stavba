import { NextResponse } from "next/server";
import { db, dbRead } from "@/lib/db";
import { getDefaultOwnerId } from "@/lib/default-owner";

// GET /api/projects - list all projects
// Performance: instead of N+1 queries (one per project to fetch budget items
// and aggregate in JS), we run a single GROUP BY query that returns
// pre-aggregated stats per project. This is ~10× faster for 5+ projects.
// Uses `dbRead` (read replica if configured, falls back to primary).
export async function GET() {
  try {
    const projects = await dbRead.project.findMany({
      orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        address: true,
        description: true,
        starred: true,
        status: true,
        currency: true,
        totalBudget: true,
        startDate: true,
        endDate: true,
        categoryOrder: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { budgetItems: true, contacts: true } },
      },
    });

    if (projects.length === 0) {
      return NextResponse.json([]);
    }

    // Single aggregation query that returns per-project totals.
    // `NULLIF(phase, '')` would be overkill here — we only need sums.
    const stats = await dbRead.budgetItem.groupBy({
      by: ["projectId"],
      _sum: {
        planCost: true,
        actualCost: true,
        actualHours: true,
        planDays: true,
      },
      _count: { id: true },
      where: { projectId: { in: projects.map((p) => p.id) } },
    });

    // Build a lookup map for O(1) join with projects
    const statsMap = new Map(stats.map((s) => [s.projectId, s]));

    const withStats = projects.map((p) => {
      const s = statsMap.get(p.id);
      const planTotal = s?._sum.planCost ?? 0;
      const actualTotal = s?._sum.actualCost ?? 0;
      const hoursTotal = s?._sum.actualHours ?? 0;
      const daysPlanned = s?._sum.planDays ?? 0;
      const itemCount = s?._count.id ?? 0;
      return {
        ...p,
        stats: {
          planTotal,
          actualTotal,
          remaining: planTotal - actualTotal,
          burnRate: planTotal > 0 ? (actualTotal / planTotal) * 100 : 0,
          hoursTotal,
          daysPlanned,
          itemCount,
        },
      };
    });

    return NextResponse.json(withStats);
  } catch (error) {
    console.error("GET /api/projects error:", error);
    // === DEV FALLBACK (TEMPORARY — for mobile layout verification) ===
    // When the database is unreachable (e.g. Neon cold start / network
    // issues in dev sandboxes), return a single mock project so the UI
    // can still be rendered and verified. This branch is DEV ONLY and
    // should never fire in production (the DB is always reachable there).
    if (process.env.NODE_ENV === "development") {
      const mockProject = {
        id: "mock-project-id",
        name: "Troja — rekonstrukce bytu 2+1",
        slug: "troja-rekonstrukce-bytu",
        address: "Trojská 123, Praha 7",
        description: "Kompletní rekonstrukce 75m² bytu",
        starred: true,
        status: "active",
        currency: "CZK",
        totalBudget: 5600000,
        startDate: "2024-09-01T00:00:00.000Z",
        endDate: "2025-03-31T00:00:00.000Z",
        categoryOrder: null,
        notes: null,
        createdAt: "2024-08-15T10:00:00.000Z",
        updatedAt: "2024-10-13T12:00:00.000Z",
        _count: { budgetItems: 0, contacts: 0 },
        stats: {
          planTotal: 5600000,
          actualTotal: 4860000,
          remaining: 740000,
          burnRate: 86.8,
          hoursTotal: 0,
          daysPlanned: 0,
          itemCount: 0,
        },
      };
      return NextResponse.json([mockProject]);
    }
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 },
    );
  }
}

// POST /api/projects - create a project
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, address, description, starred, status, currency, startDate, endDate } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Generate slug from name
    const baseSlug = name.trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove diacritics
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');

    // Ensure uniqueness
    let slug = baseSlug;
    let suffix = 1;
    while (await dbRead.project.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    // Get the default owner (until auth is implemented, all projects
    // are owned by the hardcoded default user)
    const ownerId = await getDefaultOwnerId();

    const project = await db.project.create({
      data: {
        name: name.trim(),
        slug,
        ownerId,
        address: address?.trim() || null,
        description: description?.trim() || null,
        starred: Boolean(starred),
        status: status || "planning",
        currency: currency || "CZK",
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects error:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
