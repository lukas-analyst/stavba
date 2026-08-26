import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/export
// Returns the full application state (all projects, budget items, payments,
// contacts, time entries) as a downloadable JSON file.
export async function GET() {
  try {
    const [projects, budgetItems, payments, contacts, timeEntries] =
      await Promise.all([
        db.project.findMany({ orderBy: { createdAt: "asc" } }),
        db.budgetItem.findMany({ orderBy: { createdAt: "asc" } }),
        db.payment.findMany({ orderBy: { createdAt: "asc" } }),
        db.contact.findMany({ orderBy: { createdAt: "asc" } }),
        db.timeEntry.findMany({ orderBy: { createdAt: "asc" } }),
      ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      projects,
      budgetItems,
      payments,
      contacts,
      timeEntries,
    };

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `stavba-export-${today}.json`;

    return NextResponse.json(payload, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/export error:", error);
    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 },
    );
  }
}
