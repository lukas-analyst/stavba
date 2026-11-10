import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz";
import { DEFAULT_LAYER_MAPPING } from "@/lib/floorplan/layer-mapping";

export const dynamic = "force-dynamic";

// Layer mapping — GET (default + user overrides) + PATCH (save overrides).
// GET returns the default mapping (user overrides will be added in Fáze 1).

// GET /api/projects/[id]/floorplan/layer-mappings
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, "viewer");
  if (!access.ok) return access.response;

  // Return default mapping (user overrides will be added in Fáze 1)
  return NextResponse.json({
    mappings: DEFAULT_LAYER_MAPPING,
  });
}

// PATCH /api/projects/[id]/floorplan/layer-mappings
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, "owner");
  if (!access.ok) return access.response;

  // TODO Fáze 1: Save user overrides to project settings
  return NextResponse.json(
    { error: "Layer mapping override not implemented yet (Fáze 1)" },
    { status: 501 },
  );
}
