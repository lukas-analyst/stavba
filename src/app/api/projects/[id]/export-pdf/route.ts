import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireProjectAccess } from "@/lib/authz";
import { parseParam, cuidSchema } from "@/lib/api-validation";
import { generatePdf, generateFilename } from "@/lib/pdf/pdf-generator";
import type { PdfSectionId } from "@/lib/pdf/pdf-types";

// Route config — PDF generation can be CPU-intensive, give it more time.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Valid section IDs for MVP (future phases will add more).
const validSections = [
  "header", "summary", "budget_items", "status", "plan_cost", "actual_cost",
  "dates", "phase", "property", "alerts", "projection", "payments",
  "payment_type", "invoice", "time", "worker", "hours", "supplier",
  "contacts", "contact_type", "contact_phone", "contact_email", "contact_ico", "contact_notes",
] as const;

// GET /api/projects/[id]/export-pdf
// Generates a PDF report and returns it as a downloadable file.
//
// Query params:
//   ?locale=cs           — PDF content language (cs/en/es/hu/it/pl/vi)
//   ?currency=CZK        — target currency for amount conversion
//   ?sections=header,summary,budget_items,status,costs,dates,property,alerts,projection
//
// Requires editor+ access to the project.
export async function GET(
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

    // Parse query params
    const { searchParams } = new URL(request.url);
    const locale = searchParams.get("locale") || "cs";
    const currency = searchParams.get("currency") || access.project.currency || "CZK";
    const sectionsParam = searchParams.get("sections") || "header,summary,budget_items,status,plan_cost,actual_cost,dates,phase,property,alerts,projection,payments,payment_type,invoice,time,worker,hours,supplier,contacts,contact_type,contact_phone,contact_email,contact_ico";

    // Validate sections
    const requestedSections = sectionsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const sections: PdfSectionId[] = [];
    for (const s of requestedSections) {
      if (validSections.includes(s as (typeof validSections)[number])) {
        sections.push(s as PdfSectionId);
      }
    }

    if (sections.length === 0) {
      return NextResponse.json(
        { error: "No valid sections provided" },
        { status: 400 },
      );
    }

    // Generate PDF
    const buffer = await generatePdf({
      projectId: id,
      locale,
      currency,
      sections,
    });

    const filename = generateFilename(access.project.name, locale);

    // Return as downloadable PDF
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/projects/[id]/export-pdf error:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 },
    );
  }
}
