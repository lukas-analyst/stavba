import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { unstable_cache } from "next/cache";
import { db, dbRead } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/authz";
import {
  parseBody,
  parseParam,
  cuidSchema,
  nonEmptyString,
  optionalNullableString,
  optionalNumOrNull,
} from "@/lib/api-validation";

// Explicit field selection — fetch only what the frontend actually uses.
const CONTACT_SELECT = {
  id: true,
  projectId: true,
  name: true,
  type: true,
  role: true,
  phone: true,
  email: true,
  company: true,
  ico: true,
  dic: true,
  website: true,
  notes: true,
  rating: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { timeEntries: true, payments: true } },
  persons: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      role: true,
      sortOrder: true,
    },
  },
} as const;

// Cached version of the contacts list query
const getCachedContacts = unstable_cache(
  async (projectId: string) => {
    const contacts = await dbRead.contact.findMany({
      where: { projectId },
      orderBy: [{ name: "asc" }],
      select: CONTACT_SELECT,
    });
    return contacts;
  },
  ["contacts"],
  { tags: ["contacts"], revalidate: 30 },
);

// POST body schema — `name` required, rest optional. `type` is a free-form
// string (DB stores it as String, not an enum), max 50 chars. `rating` is
// 0-5 (0 = not rated, 1-5 = stars). All nullable string fields use
// `optionalNullableString` which handles `null`/`""`/`undefined`.
const createContactBodySchema = z.object({
  name: nonEmptyString.max(200, { message: "contact.nameRequired" }),
  type: z.string().max(50).nullish(),
  role: optionalNullableString,
  phone: optionalNullableString,
  email: optionalNullableString,
  company: optionalNullableString,
  ico: optionalNullableString,
  dic: optionalNullableString,
  website: optionalNullableString,
  notes: optionalNullableString,
  rating: z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return null;
      if (typeof v === "string") return Number(v);
      return v;
    },
    z.union([z.number().int().min(0).max(5), z.null()]),
  ),
});

// GET /api/projects/[id]/contacts - list all contacts for a project
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

    const access = await requireProjectAccess(id, "viewer");
    if (!access.ok) return access.response;
    const contacts = await getCachedContacts(id);
    return NextResponse.json(contacts);
  } catch (error) {
    console.error("GET contacts error:", error);
    return NextResponse.json(
      { error: t("contact.fetchFailed") },
      { status: 500 },
    );
  }
}

// POST /api/projects/[id]/contacts - create a contact
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

    const access = await requireProjectAccess(id, "editor");
    if (!access.ok) return access.response;

    // Parse + validate body (Zod).
    const result = await parseBody(createContactBodySchema, request, t);
    if (!result.success) return result.response;
    const { name, type, role, phone, email, company, ico, dic, website, notes, rating } = result.data;

    const contact = await db.contact.create({
      data: {
        projectId: id,
        name: name.trim(),
        type: type ?? "company",
        role: role ?? null,
        phone: phone ?? null,
        email: email ?? null,
        company: company ?? null,
        ico: ico ?? null,
        dic: dic ?? null,
        website: website ?? null,
        notes: notes ?? null,
        rating: rating ?? null,
      },
    });

    // Log creation to audit log
    await logChanges(
      id,
      "Contact",
      contact.id,
      "create",
      null,
      {
        name: contact.name,
        type: contact.type,
        role: contact.role,
      },
      contact.name,
    );

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error("POST contact error:", error);
    return NextResponse.json(
      { error: t("contact.createFailed") },
      { status: 500 },
    );
  }
}
