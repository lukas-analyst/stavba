import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { db, dbRead } from "@/lib/db";
import { logChanges } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/authz";

// Explicit field selection — fetch only what the frontend uses.
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
  // Associated persons (1:N) — ordered by sortOrder for stable display.
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

// Cached version of the contacts list query — keyed by projectId (passed
// as the function argument, which Next.js includes in the cache key
// automatically), tagged "contacts" with a 30s TTL. Contacts change less
// often than budget/payments/time. Contact mutations (incl. person edits)
// bust this tag via `bustServerCache(projectId, [...])` in src/lib/api.ts.
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
  {
    tags: ["contacts"],
    revalidate: 30, // 30 seconds — contacts change less often
  }
);

// GET /api/projects/[id]/contacts - list all contacts for a project
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireProjectAccess(id, "viewer");
    if (!access.ok) return access.response;
    const contacts = await getCachedContacts(id);
    return NextResponse.json(contacts);
  } catch (error) {
    console.error("GET contacts error:", error);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }
}

// POST /api/projects/[id]/contacts - create a contact
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireProjectAccess(id, "editor");
    if (!access.ok) return access.response;
    const body = await request.json();
    const { name, type, role, phone, email, company, ico, dic, website, notes, rating } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const contact = await db.contact.create({
      data: {
        projectId: id,
        name: name.trim(),
        type: type || "company",
        role: role?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        company: company?.trim() || null,
        ico: ico?.trim() || null,
        dic: dic?.trim() || null,
        website: website?.trim() || null,
        notes: notes?.trim() || null,
        rating: rating !== undefined && rating !== null ? Number(rating) : null,
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
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
  }
}
