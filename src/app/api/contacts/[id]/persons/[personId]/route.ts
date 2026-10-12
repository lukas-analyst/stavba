import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";

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

    // Fetch parent contact to resolve projectId (ContactPerson is a grandchild
    // of Project: Person → Contact → Project).
    const contact = await db.contact.findUnique({
      where: { id },
      select: { projectId: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
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

    // Log update to audit log
    await logChanges(
      contact.projectId,
      "ContactPerson",
      personId,
      "update",
      existing as unknown as Record<string, unknown>,
      body,
      null,
    );

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

    // Fetch parent contact to resolve projectId (ContactPerson is a grandchild
    // of Project: Person → Contact → Project).
    const contact = await db.contact.findUnique({
      where: { id },
      select: { projectId: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Log deletion before deleting (entity is gone after delete)
    await logChanges(
      contact.projectId,
      "ContactPerson",
      personId,
      "delete",
      existing as unknown as Record<string, unknown>,
      null,
      `${existing.firstName} ${existing.lastName}`,
    );

    await db.contactPerson.delete({ where: { id: personId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE contact person error:", error);
    return NextResponse.json({ error: "Failed to delete person" }, { status: 500 });
  }
}
