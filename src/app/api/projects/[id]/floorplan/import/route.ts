import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

// POST /api/projects/[id]/floorplan/import
// Upload + parse DXF file, create FloorplanElement records.
// Stub — returns 501 Not Implemented. Will be implemented in Fáze 1.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireProjectAccess(id, "owner");
  if (!access.ok) return access.response;

  // TODO Fáze 1: Implement DXF import
  // 1. Parse multipart/form-data
  // 2. Upload DXF to Vercel Blob
  // 3. Parse with dxf-parser
  // 4. Layer mapping (default + user override)
  // 5. Create FloorplanFloor + FloorplanElement[]
  // 6. Save FloorplanSource
  return NextResponse.json(
    { error: "DXF import not implemented yet (Fáze 1)" },
    { status: 501 },
  );
}
