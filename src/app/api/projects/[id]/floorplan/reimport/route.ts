import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

// DXF re-import — replace / new-version / merge.
// Stub — return 501. Will be implemented in Fáze 1+.

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, "owner");
  if (!access.ok) return access.response;
  return NextResponse.json(
    { error: "Re-import not implemented yet (Fáze 1+)" },
    { status: 501 },
  );
}
