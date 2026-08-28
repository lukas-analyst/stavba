import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH /api/contacts/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.contact.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const updated = await db.contact.update({
      where: { id },
      data: {
        name: body.name !== undefined ? String(body.name).trim() : undefined,
        type: body.type !== undefined ? body.type : undefined,
        role: body.role !== undefined ? (body.role?.trim() || null) : undefined,
        phone: body.phone !== undefined ? (body.phone?.trim() || null) : undefined,
        email: body.email !== undefined ? (body.email?.trim() || null) : undefined,
        company: body.company !== undefined ? (body.company?.trim() || null) : undefined,
        ico: body.ico !== undefined ? (body.ico?.trim() || null) : undefined,
        dic: body.dic !== undefined ? (body.dic?.trim() || null) : undefined,
        website: body.website !== undefined ? (body.website?.trim() || null) : undefined,
        notes: body.notes !== undefined ? (body.notes?.trim() || null) : undefined,
        rating:
          body.rating !== undefined
            ? body.rating === null
              ? null
              : Number(body.rating)
            : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH contact error:", error);
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
  }
}

// DELETE /api/contacts/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await db.contact.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    await db.contact.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE contact error:", error);
    return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 });
  }
}
