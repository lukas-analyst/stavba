import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";

// GET /api/contacts/[id]/persons — list all persons for a contact
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const persons = await db.contactPerson.findMany({
      where: { contactId: id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(persons);
  } catch (error) {
    console.error("GET contact persons error:", error);
    return NextResponse.json({ error: "Failed to fetch persons" }, { status: 500 });
  }
}

// POST /api/contacts/[id]/persons — create a new person for a contact
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Validate contact exists
    const contact = await db.contact.findUnique({ where: { id } });
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    if (!body.firstName || typeof body.firstName !== "string" || !body.firstName.trim()) {
      return NextResponse.json({ error: "First name is required" }, { status: 400 });
    }
    if (!body.lastName || typeof body.lastName !== "string" || !body.lastName.trim()) {
      return NextResponse.json({ error: "Last name is required" }, { status: 400 });
    }

    // Get next sortOrder
    const maxOrder = await db.contactPerson.aggregate({
      where: { contactId: id },
      _max: { sortOrder: true },
    });

    const person = await db.contactPerson.create({
      data: {
        contactId: id,
        firstName: String(body.firstName).trim(),
        lastName: String(body.lastName).trim(),
        phone: body.phone?.trim() || null,
        email: body.email?.trim() || null,
        role: body.role?.trim() || null,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });

    // Log creation to audit log. `contact.projectId` is the parent project
    // (ContactPerson is a grandchild of Project: Person → Contact → Project).
    await logChanges(
      contact.projectId,
      "ContactPerson",
      person.id,
      "create",
      null,
      {
        firstName: person.firstName,
        lastName: person.lastName,
        role: person.role,
      },
      `${person.firstName} ${person.lastName}`,
    );

    return NextResponse.json(person, { status: 201 });
  } catch (error) {
    console.error("POST contact person error:", error);
    return NextResponse.json({ error: "Failed to create person" }, { status: 500 });
  }
}
