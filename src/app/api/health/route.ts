import { NextResponse } from "next/server";
import { dbRead } from "@/lib/db";

export async function GET() {
  try {
    // Simple DB connectivity check
    await dbRead.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      db: "ok",
    });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        db: "error",
        error: "Database connection failed",
      },
      { status: 503 },
    );
  }
}
