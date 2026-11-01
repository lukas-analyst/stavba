import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

// Element ↔ BudgetItem link routes (N:M junction).
// Stub — return 501. Will be implemented in Fáze 2.

// POST /api/projects/[id]/floorplan/elements/[elementId]/links
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; elementId: string }> },
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, "owner");
  if (!access.ok) return access.response;
  return NextResponse.json(
    { error: "Link creation not implemented yet (Fáze 2)" },
    { status: 501 },
  );
}
