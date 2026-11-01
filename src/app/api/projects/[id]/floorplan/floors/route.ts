import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

// Floor management — create / list / delete floors.
// Stub — return 501. Will be implemented in Fáze 1.

// POST /api/projects/[id]/floorplan/floors
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, "owner");
  if (!access.ok) return access.response;
  return NextResponse.json(
    { error: "Floor creation not implemented yet (Fáze 1)" },
    { status: 501 },
  );
}
