import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

// Floor by ID — PATCH (rename/reorder) + DELETE.
// Stub — return 501. Will be implemented in Fáze 1.

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string; floorId: string }> },
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, "owner");
  if (!access.ok) return access.response;
  return NextResponse.json(
    { error: "Floor update not implemented yet (Fáze 1)" },
    { status: 501 },
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; floorId: string }> },
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, "owner");
  if (!access.ok) return access.response;
  return NextResponse.json(
    { error: "Floor deletion not implemented yet (Fáze 1)" },
    { status: 501 },
  );
}
