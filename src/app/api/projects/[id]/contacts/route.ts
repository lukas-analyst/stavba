import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/projects/[id]/contacts - list all contacts for a project
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const contacts = await db.contact.findMany({
      where: { projectId: id },
      orderBy: [{ name: "asc" }],
      include: {
        _count: { select: { timeEntries: true, payments: true } },
      },
    });
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

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error("POST contact error:", error);
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
  }
}
