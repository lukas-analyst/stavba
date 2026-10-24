import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { db, dbRead } from "@/lib/db";
import { requireUser } from "@/lib/require-user";

// GET /api/projects - list all projects
// Performance: instead of N+1 queries (one per project to fetch budget items
// and aggregate in JS), we run a single GROUP BY query that returns
// pre-aggregated stats per project. This is ~10× faster for 5+ projects.
// Uses `dbRead` (read replica if configured, falls back to primary).
export async function GET() {
  const t = await getTranslations("api.errors");
  try {
    // Require authentication — show projects owned by the logged-in user
    // OR where the user is a member (shared projects)
    const { user, response } = await requireUser();
    if (response) return response;
    if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

    // If user.isAdmin, return ALL projects (admin bypass — no ownerId
    // filter and no membership lookup). Useful for the admin UI / super-
    // user view of the whole instance.
    let projects;
    if (user.isAdmin) {
      projects = await dbRead.project.findMany({
        orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          name: true,
          slug: true,
          address: true,
          description: true,
          starred: true,
          isPublic: true,
          ownerId: true,
          owner: { select: { deletedAt: true } },
          status: true,
          currency: true,
          totalBudget: true,
          startDate: true,
          endDate: true,
          categoryOrder: true,
          notes: true,
          fullAddress: true,
          studyUrl: true,
          documentationUrl: true,
          heatLoss: true,
          energyRating: true,
          floorArea: true,
          floors: true,
          propertyNote: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { budgetItems: true, contacts: true } },
        },
      });
    } else {
      // Find project IDs where the user is a member
      const memberships = await dbRead.projectMember.findMany({
        where: { userId: user.id },
        select: { projectId: true },
      });
      const memberProjectIds = memberships.map((m) => m.projectId);

      projects = await dbRead.project.findMany({
        where: {
          OR: [
            { ownerId: user.id },
            { id: { in: memberProjectIds } },
          ],
        },
        orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          name: true,
          slug: true,
          address: true,
          description: true,
          starred: true,
          isPublic: true,
          ownerId: true,
          owner: { select: { deletedAt: true } },
          status: true,
          currency: true,
          totalBudget: true,
          startDate: true,
          endDate: true,
          categoryOrder: true,
          notes: true,
          fullAddress: true,
          studyUrl: true,
          documentationUrl: true,
          heatLoss: true,
          energyRating: true,
          floorArea: true,
          floors: true,
          propertyNote: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { budgetItems: true, contacts: true } },
        },
      });
    }

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
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 },
    );
  }
}

// POST /api/projects - create a project
export async function POST(request: Request) {
  const t = await getTranslations("api.errors");
  try {
    const body = await request.json();
    const { name, address, description, starred, status, currency, startDate, endDate } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Generate slug from name (lowercase, kebab-case, no diacritics)
    const baseSlug = name.trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove diacritics
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');

    // If name produced empty slug (e.g., name was only emojis/symbols),
    // generate a fallback slug from timestamp
    const slug = baseSlug || `projekt-${Date.now().toString(36)}`;

    // Ensure uniqueness
    let finalSlug = slug;
    let suffix = 1;
    while (await dbRead.project.findUnique({ where: { slug: finalSlug } })) {
      finalSlug = `${slug}-${suffix++}`;
    }

    // Require authentication — projects are owned by the logged-in user
    const { user, response } = await requireUser();
    if (response) return response;
    if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
    const ownerId = user.id;

    const project = await db.project.create({
      data: {
        name: name.trim(),
        slug: finalSlug,
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
