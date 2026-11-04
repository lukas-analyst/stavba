import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/authz";
import {
  parseBody,
  parseParam,
  cuidSchema,
  nonEmptyString,
  optionalNullableString,
} from "@/lib/api-validation";

// POST body schema for creating a contact person.
const createPersonBodySchema = z.object({
  firstName: nonEmptyString.max(100, { message: "contact.firstNameRequired" }),
  lastName: nonEmptyString.max(100, { message: "contact.lastNameRequired" }),
  phone: optionalNullableString,
  email: optionalNullableString,
  role: optionalNullableString,
});

// GET /api/contacts/[id]/persons — list all persons for a contact
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    // IDOR fix: resolve the contact's projectId and verify viewer access
    // before returning its persons.
    const contact = await db.contact.findUnique({
      where: { id },
      select: { projectId: true },
    });
    if (!contact) {
      return NextResponse.json(
        { error: t("contact.notFound") },
        { status: 404 },
      );
    }
    const access = await requireProjectAccess(contact.projectId, "viewer");
    if (!access.ok) return access.response;

    const persons = await db.contactPerson.findMany({
      where: { contactId: id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(persons);
  } catch (error) {
    console.error("GET contact persons error:", error);
    return NextResponse.json(
      { error: t("contact.personFetchFailed") },
      { status: 500 },
    );
  }
}

// POST /api/contacts/[id]/persons — create a new person for a contact
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("api.errors");
  try {
    const { id: rawId } = await params;
    const idResult = parseParam(cuidSchema, rawId, t);
    if (!idResult.success) return idResult.response;
    const id = idResult.data;

    // Validate contact exists
    const contact = await db.contact.findUnique({ where: { id } });
    if (!contact) {
      return NextResponse.json(
        { error: t("contact.notFound") },
        { status: 404 },
      );
    }

    // IDOR fix: require editor access to the project that owns the contact.
    const access = await requireProjectAccess(contact.projectId, "editor");
    if (!access.ok) return access.response;

    // Parse + validate body (Zod).
    const result = await parseBody(createPersonBodySchema, request, t);
    if (!result.success) return result.response;
    const { firstName, lastName, phone, email, role } = result.data;

    // Get next sortOrder
    const maxOrder = await db.contactPerson.aggregate({
      where: { contactId: id },
      _max: { sortOrder: true },
    });

    const person = await db.contactPerson.create({
      data: {
        contactId: id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone ?? null,
        email: email ?? null,
        role: role ?? null,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });

    // Log creation to audit log.
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
    return NextResponse.json(
      { error: t("contact.personCreateFailed") },
      { status: 500 },
    );
  }
}
