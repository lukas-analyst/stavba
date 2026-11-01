import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

// Edit mode lock — acquire + release.
// Stub — return 501. Will be implemented in Fáze 4.

// POST /api/projects/[id]/floorplan/lock — acquire
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, "owner");
  if (!access.ok) return access.response;
  return NextResponse.json(
    { error: "Edit lock not implemented yet (Fáze 4)" },
    { status: 501 },
  );
}

// DELETE /api/projects/[id]/floorplan/lock — release (user clicked "Save")
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, "owner");
  if (!access.ok) return access.response;
  return NextResponse.json(
    { error: "Edit lock release not implemented yet (Fáze 4)" },
    { status: 501 },
  );
}
