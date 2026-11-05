import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireProjectAccess } from "@/lib/authz";
import { parseParam, cuidSchema } from "@/lib/api-validation";
import { generatePdf, generateFilename } from "@/lib/pdf/pdf-generator";
import type {
  PdfSectionId,
  PdfOrientationMode,
  PdfReportStyle,
  PdfPageMargin,
  OrientableSectionId,
  TableSort,
  TableSorts,
} from "@/lib/pdf/pdf-types";
import {
  ORIENTABLE_SECTION_IDS,
  SORTABLE_TABLE_IDS,
  SORTABLE_FIELDS_BY_TABLE,
} from "@/lib/pdf/pdf-types";

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

// Valid orientation modes — parsed from `?orientationMode=...`.
const validOrientationModes = [
  "auto", "all-portrait", "all-landscape", "custom",
] as const;

// Valid report styles — parsed from `?reportStyle=...`.
const validReportStyles = ["minimal", "colorful"] as const;

// Valid page margins — parsed from `?pageMargin=...`.
const validPageMargins = ["narrow", "normal", "wide"] as const;

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

    // ─── Orientation mode (Phase 2G+) ───────────────────────────────
    // ?orientationMode=auto|all-portrait|all-landscape|custom (default: auto)
    // ?orientation-budget_items=portrait|landscape (only when orientationMode=custom)
    // ?orientation-contacts=portrait|landscape (only when orientationMode=custom)
    const rawMode = searchParams.get("orientationMode") || "auto";
    const orientationMode: PdfOrientationMode = (
      validOrientationModes.includes(rawMode as (typeof validOrientationModes)[number])
        ? (rawMode as PdfOrientationMode)
        : "auto"
    );

    let sectionOrientations:
      | Partial<Record<OrientableSectionId, "portrait" | "landscape">>
      | undefined;
    if (orientationMode === "custom") {
      sectionOrientations = {};
      for (const sectionId of ORIENTABLE_SECTION_IDS) {
        const v = searchParams.get(`orientation-${sectionId}`);
        if (v === "portrait" || v === "landscape") {
          sectionOrientations[sectionId] = v;
        }
      }
    }

    // ─── Report visual style (Phase 3) ──────────────────────────────
    // ?reportStyle=minimal|colorful (default: minimal)
    // - minimal: clean monochrome report (bank / mortgage applications)
    // - colorful: MD3-accented report (personal use / presentations)
    const rawStyle = searchParams.get("reportStyle") || "minimal";
    const reportStyle: PdfReportStyle = (
      validReportStyles.includes(rawStyle as (typeof validReportStyles)[number])
        ? (rawStyle as PdfReportStyle)
        : "minimal"
    );

    // ─── Page margins (F2) ───────────────────────────────────────────
    // ?pageMargin=narrow|normal|wide (default: normal)
    const rawMargin = searchParams.get("pageMargin") || "normal";
    const pageMargin: PdfPageMargin = (
      validPageMargins.includes(rawMargin as (typeof validPageMargins)[number])
        ? (rawMargin as PdfPageMargin)
        : "normal"
    );

    // ─── Per-table sort (Phase 4+) ─────────────────────────────────
    // ?sort-budget_items=category&sortDir-budget_items=asc
    // ?sort-payments=date&sortDir-payments=desc
    // ?sort-time=workerName&sortDir-time=asc
    // ?sort-contacts=name&sortDir-contacts=asc
    //
    // When a sort field is provided, it's validated against the
    // table's allowed fields. Invalid fields are silently ignored.
    const tableSorts: TableSorts = {};
    for (const tableId of SORTABLE_TABLE_IDS) {
      const field = searchParams.get(`sort-${tableId}`);
      if (!field) continue;
      const allowedFields = SORTABLE_FIELDS_BY_TABLE[tableId];
      if (!allowedFields.some((f) => f.id === field)) continue;
      const dir = searchParams.get(`sortDir-${tableId}`);
      const direction: "asc" | "desc" = dir === "desc" ? "desc" : "asc";
      tableSorts[tableId] = { field, direction } as TableSort;
    }

    // Generate PDF
    const buffer = await generatePdf({
      projectId: id,
      locale,
      currency,
      sections,
      orientationMode,
      sectionOrientations,
      reportStyle,
      pageMargin,
      tableSorts,
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
