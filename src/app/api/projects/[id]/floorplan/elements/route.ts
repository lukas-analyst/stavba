import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

// Floorplan element CRUD routes.
// Stubs — return 501 Not Implemented. Will be implemented in Fáze 1-4.

// POST /api/projects/[id]/floorplan/elements
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, "owner");
  if (!access.ok) return access.response;
  return NextResponse.json(
    { error: "Element creation not implemented yet" },
    { status: 501 },
  );
}
