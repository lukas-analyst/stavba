import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

// POST /api/projects/[id]/floorplan/elements/[elementId]/links
// Create a link between a floorplan element and a BudgetItem (N:M).
//
// Body:
//   { budgetItemId: string, role: "primary"|"layer"|"appliance"|"connection",
//     metadata?: string }
//
// Response 201: { link }
// Response 400: { error: "Invalid input" }
// Response 404: { error: "Element or BudgetItem not found" }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; elementId: string }> },
) {
  const { id: projectId, elementId } = await params;
  const access = await requireProjectAccess(projectId, "owner");
  if (!access.ok) return access.response;

  try {
    const body = await request.json();
    const { budgetItemId, role, metadata } = body as {
      budgetItemId?: string;
      role?: string;
      metadata?: string;
    };

    if (!budgetItemId || typeof budgetItemId !== "string") {
      return NextResponse.json(
        { error: "budgetItemId is required" },
        { status: 400 },
      );
    }

    const validRoles = ["primary", "layer", "appliance", "connection"];
    const linkRole = validRoles.includes(role ?? "") ? role! : "primary";

    // Verify element belongs to this project
    const element = await db.floorplanElement.findFirst({
      where: { id: elementId, projectId },
      select: { id: true },
    });
    if (!element) {
      return NextResponse.json(
        { error: "Element not found" },
        { status: 404 },
      );
    }

    // Verify BudgetItem belongs to this project
    const budgetItem = await db.budgetItem.findFirst({
      where: { id: budgetItemId, projectId },
      select: { id: true },
    });
    if (!budgetItem) {
      return NextResponse.json(
        { error: "BudgetItem not found" },
        { status: 404 },
      );
    }

    // Create the link (upsert — if same element+item+role exists, update metadata)
    const link = await db.floorplanElementBudgetItem.upsert({
      where: {
        elementId_budgetItemId_role: {
          elementId,
          budgetItemId,
          role: linkRole,
        },
      },
      create: {
        elementId,
        budgetItemId,
        role: linkRole,
        metadata: metadata ?? null,
      },
      update: {
        metadata: metadata ?? null,
      },
      include: {
        budgetItem: {
          select: {
            id: true,
            category: true,
            subcategory: true,
            phase: true,
            completed: true,
            rejected: true,
          },
        },
      },
    });

    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    console.error("POST /floorplan/links error:", error);
    return NextResponse.json(
      { error: "Failed to create link" },
      { status: 500 },
    );
  }
}
