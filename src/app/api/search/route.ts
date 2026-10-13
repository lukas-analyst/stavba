import { NextResponse } from "next/server";
import { dbRead } from "@/lib/db";

// GET /api/search?q=query
// Global search across projects, budget items, contacts, payments, and notes.
// Uses `dbRead` (read replica if configured, falls back to primary).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";

    if (q.length < 2) {
      return NextResponse.json({
        projects: [],
        items: [],
        contacts: [],
        payments: [],
        notes: [],
      });
    }

    const [projects, items, contacts, payments, notes] = await Promise.all([
      dbRead.project.findMany({
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
      dbRead.budgetItem.findMany({
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
      dbRead.contact.findMany({
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
      dbRead.payment.findMany({
        where: {
          OR: [
            { description: { contains: q } },
            { vendor: { contains: q } },
            { invoiceNumber: { contains: q } },
          ],
        },
        take: 5,
        select: {
          id: true,
          amount: true,
          type: true,
          description: true,
          vendor: true,
          date: true,
          budgetItem: {
            select: {
              projectId: true,
              category: true,
              subcategory: true,
            },
          },
        },
        orderBy: { date: "desc" },
      }),
      dbRead.note.findMany({
        where: {
          OR: [
            { text: { contains: q } },
            { author: { contains: q } },
          ],
        },
        take: 5,
        select: {
          id: true,
          projectId: true,
          text: true,
          author: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({ projects, items, contacts, payments, notes });
  } catch (error) {
    console.error("GET search error:", error);
    return NextResponse.json({ error: "Failed to search" }, { status: 500 });
  }
}
