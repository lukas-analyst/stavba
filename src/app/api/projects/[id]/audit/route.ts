import { NextResponse } from "next/server";
import { dbRead } from "@/lib/db";

// GET /api/projects/[id]/audit
// Returns audit log entries for the project, most recent first.
// Supports optional ?limit=50 query param.
// Uses `dbRead` (read replica if configured, falls back to primary).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

    const logs = await dbRead.auditLog.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error("GET audit error:", error);
    return NextResponse.json({ error: "Failed to fetch audit log" }, { status: 500 });
  }
}
