import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

// Floorplan element by ID — PATCH (update) + DELETE.
// Stub — return 501 Not Implemented. Will be implemented in Fáze 2-4.

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string; elementId: string }> },
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, "owner");
  if (!access.ok) return access.response;
  return NextResponse.json(
    { error: "Element update not implemented yet" },
    { status: 501 },
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; elementId: string }> },
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, "owner");
  if (!access.ok) return access.response;
  return NextResponse.json(
    { error: "Element deletion not implemented yet" },
    { status: 501 },
  );
}
