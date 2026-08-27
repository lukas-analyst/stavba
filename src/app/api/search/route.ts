import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/search?q=query
// Global search across projects, budget items, and contacts.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";

    if (q.length < 2) {
      return NextResponse.json({ projects: [], items: [], contacts: [] });
    }

    const [projects, items, contacts] = await Promise.all([
      db.project.findMany({
        where: {
          OR: [
            { name: { contains: q } },
            { address: { contains: q } },
            { description: { contains: q } },
          ],
        },
        take: 5,
        select: {
          id: true,
          name: true,
          address: true,
          status: true,
          starred: true,
        },
        orderBy: [{ starred: "desc" }, { name: "asc" }],
      }),
      db.budgetItem.findMany({
        where: {
          OR: [
            { category: { contains: q } },
            { subcategory: { contains: q } },
            { element: { contains: q } },
            { note: { contains: q } },
          ],
        },
        take: 8,
        select: {
          id: true,
          projectId: true,
          category: true,
          subcategory: true,
          phase: true,
          planCost: true,
        },
        orderBy: { sortOrder: "asc" },
      }),
      db.contact.findMany({
        where: {
          OR: [
            { name: { contains: q } },
            { role: { contains: q } },
            { company: { contains: q } },
            { email: { contains: q } },
            { phone: { contains: q } },
          ],
        },
        take: 5,
        select: {
          id: true,
          projectId: true,
          name: true,
          type: true,
          role: true,
          phone: true,
        },
        orderBy: { name: "asc" },
      }),
    ]);

    return NextResponse.json({ projects, items, contacts });
  } catch (error) {
    console.error("GET search error:", error);
    return NextResponse.json({ error: "Failed to search" }, { status: 500 });
  }
}
