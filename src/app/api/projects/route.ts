import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/projects - list all projects
export async function GET() {
  try {
    const projects = await db.project.findMany({
      orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
      include: {
        _count: {
          select: { budgetItems: true, contacts: true },
        },
      },
    });

    // For each project, compute summary stats
    const withStats = await Promise.all(
      projects.map(async (p) => {
        const items = await db.budgetItem.findMany({
          where: { projectId: p.id },
          select: { planCost: true, actualCost: true, actualHours: true, planDays: true },
        });
        const planTotal = items.reduce((s, i) => s + (i.planCost || 0), 0);
        const actualTotal = items.reduce((s, i) => s + (i.actualCost || 0), 0);
        const hoursTotal = items.reduce((s, i) => s + (i.actualHours || 0), 0);
        const daysPlanned = items.reduce((s, i) => s + (i.planDays || 0), 0);
        return {
          ...p,
          stats: {
            planTotal,
            actualTotal,
            remaining: planTotal - actualTotal,
            burnRate: planTotal > 0 ? (actualTotal / planTotal) * 100 : 0,
            hoursTotal,
            daysPlanned,
            itemCount: items.length,
          },
        };
      }),
    );

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
  try {
    const body = await request.json();
    const { name, address, description, starred, status, currency, startDate, endDate } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const project = await db.project.create({
      data: {
        name: name.trim(),
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
