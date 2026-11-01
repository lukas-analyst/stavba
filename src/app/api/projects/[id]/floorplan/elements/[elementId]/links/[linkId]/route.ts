import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

// Element ↔ BudgetItem link by ID — DELETE (unlink).
// Stub — return 501. Will be implemented in Fáze 2.

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; elementId: string; linkId: string }> },
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, "owner");
  if (!access.ok) return access.response;
  return NextResponse.json(
    { error: "Link deletion not implemented yet (Fáze 2)" },
    { status: 501 },
  );
}
