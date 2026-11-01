import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

// GET /api/projects/[id]/floorplan
// Returns floorplan data (floors + elements + sources).
// Stub — returns empty data structure. Will be implemented in Fáze 1.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, "viewer");
  if (!access.ok) return access.response;

  // Stub: return empty floorplan data
  return NextResponse.json({
    floors: [],
    elements: [],
    sources: [],
    layerMappings: {},
  });
}
