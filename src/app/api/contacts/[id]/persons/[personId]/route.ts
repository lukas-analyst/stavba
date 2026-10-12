import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH /api/contacts/[id]/persons/[personId] — update a person
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; personId: string }> },
) {
  try {
    const { id, personId } = await params;
    const body = await request.json();

    const existing = await db.contactPerson.findFirst({
      where: { id: personId, contactId: id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const updated = await db.contactPerson.update({
      where: { id: personId },
      data: {
        firstName: body.firstName !== undefined ? String(body.firstName).trim() : undefined,
        lastName: body.lastName !== undefined ? String(body.lastName).trim() : undefined,
        phone: body.phone !== undefined ? (body.phone?.trim() || null) : undefined,
        email: body.email !== undefined ? (body.email?.trim() || null) : undefined,
        role: body.role !== undefined ? (body.role?.trim() || null) : undefined,
        sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH contact person error:", error);
    return NextResponse.json({ error: "Failed to update person" }, { status: 500 });
  }
}

// DELETE /api/contacts/[id]/persons/[personId] — delete a person
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; personId: string }> },
) {
  try {
    const { id, personId } = await params;

    const existing = await db.contactPerson.findFirst({
      where: { id: personId, contactId: id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    await db.contactPerson.delete({ where: { id: personId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE contact person error:", error);
    return NextResponse.json({ error: "Failed to delete person" }, { status: 500 });
  }
}
