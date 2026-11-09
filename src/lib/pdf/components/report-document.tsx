// =====================================================================
// ReportDocument — the top-level <Document> that assembles all PDF
// sections into the final report. Extracted from the monolithic
// pdf-components.tsx as part of the modularization refactor.
// ---------------------------------------------------------------------
// This file contains:
//   - `countBudgetColumns` (private helper): count visible BudgetTable
//     columns from the selected sections array.
//   - `countContactsColumns` (private helper): count visible ContactsTable
//     columns from the selected sections array.
//   - `resolveOrientation` (private helper): resolve the effective
//     "portrait" | "landscape" orientation for a section, honoring the
//     user's `orientationMode` choice (auto / all-portrait / all-landscape
//     / custom).
//   - `ReportDocument` (exported): the top-level <Document> rendered by
//     `pdf-generator.ts` via `renderToBuffer(<ReportDocument .../>)`.
//
// Shared styles live in ../styles, shared helpers live in ../helpers,
// types live in ../pdf-types, and sibling section components live
// alongside this file in ./components/.
// =====================================================================

import { Document, Page, View, Text } from "@react-pdf/renderer";
import type {
  PdfReportData,
  PdfSectionId,
  PdfOrientationMode,
  PdfReportStyle,
  TableSorts,
  TableSort,
  PdfExportOptions,
} from "../pdf-types";
import { OVERVIEW_SECTION_IDS } from "../pdf-types";
import { styles } from "../styles";
import { Header } from "./header";
import { SummaryKPI } from "./header";
import { PropertyMetadata } from "./header";
import { BudgetTable } from "./budget-table";
import { AlertsSection } from "./alerts-section";
import { ProjectionSection } from "./projection-section";
import { PaymentsTable } from "./payments-table";
import { TimeEntriesTable } from "./time-entries-table";
import { ContactsTable } from "./contacts-table";

// =====================================================================
// Wide-table detection helpers
// ---------------------------------------------------------------------
// Tables with too many columns for portrait A4 (≈515pt content width)
// get rendered on a dedicated landscape page (≈762pt content width) for
// readability. Threshold = minimum column count that triggers landscape.
//
// Column counts:
//   BudgetTable: 2 base (category + name) + up to 7 sub-section columns
//     = max 9 columns (with phase + plan + actual + status + 2 dates + supplier)
//   ContactsTable: 4 base (name + role + payments + timeEntry counts)
//     + up to 5 sub-section columns
//     = max 9 columns (with type + phone + email + ico + notes)
//
// At 7+ columns on portrait, individual cells get cramped (~73pt each)
// and long category/role text wraps awkwardly. Landscape gives ~108pt
// per cell, which is much more comfortable.
// =====================================================================

const WIDE_BUDGET_THRESHOLD = 7;
const WIDE_CONTACTS_THRESHOLD = 7;

function countBudgetColumns(sections: PdfSectionId[]): number {
  let count = 2; // category + name (always shown)
  if (sections.includes("phase")) count++;
  if (sections.includes("plan_cost")) count++;
  if (sections.includes("actual_cost")) count++;
  if (sections.includes("status")) count++;
  if (sections.includes("dates")) count += 2; // from + to
  if (sections.includes("supplier")) count++;
  return count;
}

function countContactsColumns(sections: PdfSectionId[]): number {
  let count = 4; // name + role + paymentCount + timeEntryCount (always)
  if (sections.includes("contact_type")) count++;
  if (sections.includes("contact_phone")) count++;
  if (sections.includes("contact_email")) count++;
  if (sections.includes("contact_ico")) count++;
  if (sections.includes("contact_notes")) count++;
  return count;
}

/**
 * Resolve the effective page orientation for a given section,
 * honoring the user's `orientationMode` choice.
 *
 * - "auto": wide-table detection (>= WIDE_*_THRESHOLD columns) → landscape
 *   for budget/contacts; portrait for all other sections.
 * - "all-portrait": always "portrait".
 * - "all-landscape": always "landscape".
 * - "custom": look up `sectionOrientations[sectionId]`, fall back to
 *   auto-detection when not specified (lets users override only what
 *   they care about and inherit sensible defaults otherwise).
 */
function resolveOrientation(
  sectionId: PdfSectionId,
  sections: PdfSectionId[],
  mode: PdfOrientationMode | undefined,
  sectionOrientations: Partial<Record<PdfSectionId, "portrait" | "landscape">> | undefined,
): "portrait" | "landscape" {
  // Mode takes precedence.
  if (mode === "all-portrait") return "portrait";
  if (mode === "all-landscape") return "landscape";

  // Custom: per-section override wins; absent → fall through to auto.
  if (mode === "custom") {
    const override = sectionOrientations?.[sectionId];
    if (override === "portrait" || override === "landscape") return override;
  }

  // Auto (default + custom fallback): wide-table detection for budget
  // and contacts; portrait for all other sections (they're short or
  // always-fit content that doesn't benefit from landscape).
  if (sectionId === "budget_items") {
    return countBudgetColumns(sections) >= WIDE_BUDGET_THRESHOLD
      ? "landscape"
      : "portrait";
  }
  if (sectionId === "contacts") {
    return countContactsColumns(sections) >= WIDE_CONTACTS_THRESHOLD
      ? "landscape"
      : "portrait";
  }
  return "portrait";
}

// =====================================================================
// ReportDocument — the top-level <Document> that assembles all sections
// based on the `sections` array from `options`.
//
// LAYOUT (Phase 3 revision):
//   Overview sections (header, summary, property, alerts, projection) are
//   grouped onto a SINGLE <Page> — they're short text content that flows
//   naturally together, so a separate page for each would waste paper.
//   The overview page's orientation = the resolved orientation of the
//   FIRST selected overview section (typically "header" → portrait).
//
//   Table sections (budget_items, payments, time, contacts) each get
//   their OWN <Page> — tables can be long and benefit from dedicated
//   pages with individual orientation control.
//
//   Sections that are disabled in `options.sections` are omitted entirely
//   (no empty page is emitted).
//
//   Page orientation is resolved via `resolveOrientation()` which honors:
//   - orientationMode: "auto" | "all-portrait" | "all-landscape" | "custom"
//   - sectionOrientations: per-section overrides (only in "custom" mode)
//
// `experimentalPagination` is enabled on every page to make `totalPages`
// accurate in the footer.
// =====================================================================

// IDs of "table" sections that each get their own page.
const TABLE_SECTION_IDS: PdfSectionId[] = [
  "budget_items",
  "payments",
  "time",
  "contacts",
];

export function ReportDocument({
  data,
  options,
}: {
  data: PdfReportData;
  options: PdfExportOptions;
}) {
  const { locale, sections, currency, orientationMode, sectionOrientations, pageMargin } = options;

  // Helper: resolve the orientation for a given section based on user prefs.
  const orient = (sectionId: PdfSectionId): "portrait" | "landscape" =>
    resolveOrientation(sectionId, sections, orientationMode, sectionOrientations);

  // Page margin override — replaces the default 40pt with the user's choice.
  const marginValue =
    pageMargin === "narrow" ? 20 :
    pageMargin === "wide" ? 60 :
    40; // normal (default)
  const pageStyle = {
    ...styles.page,
    paddingTop: marginValue,
    paddingBottom: marginValue,
    paddingLeft: marginValue,
    paddingRight: marginValue,
  };

  // Which overview sections are actually selected? (determines whether
  // the overview page is emitted at all)
  const selectedOverviewSections = OVERVIEW_SECTION_IDS.filter((id) =>
    sections.includes(id),
  );
  const hasOverviewContent = selectedOverviewSections.length > 0;

  // The overview page's orientation = orientation of the FIRST selected
  // overview section. This way, if the user explicitly sets "header =
  // landscape", the whole overview page is landscape. Most users will
  // leave overview sections on "auto" → portrait (they're text content).
  const overviewOrientation = hasOverviewContent
    ? orient(selectedOverviewSections[0])
    : "portrait";

  return (
    <Document
      title={data.project.name}
      author="Rozpočet Stavby"
      subject="Rozpočtová sestava projektu"
      language={locale}
    >
      {/* ─── Overview page (header + summary + property + alerts + projection) ───
          All overview sections share ONE page — they're short text content
          that flows together. react-pdf paginates automatically if the
          content overflows to a second page. */}
      {hasOverviewContent ? (
        <Page
          size="A4"
          orientation={overviewOrientation}
          style={pageStyle}
          experimentalPagination
        >
          {sections.includes("header") ? (
            <Header
              project={data.project}
              locale={locale}
              labels={data.labels}
              reportStyle={options.reportStyle}
            />
          ) : null}

          {sections.includes("summary") ? (
            <SummaryKPI
              totals={data.totals}
              currency={currency}
              locale={locale}
              labels={data.labels}
              reportStyle={options.reportStyle}
            />
          ) : null}

          {sections.includes("property") ? (
            <PropertyMetadata
              project={data.project}
              locale={locale}
              labels={data.labels}
              reportStyle={options.reportStyle}
            />
          ) : null}

          {sections.includes("alerts") ? (
            <AlertsSection
              alerts={data.alerts}
              currency={currency}
              locale={locale}
              labels={data.labels}
              reportStyle={options.reportStyle}
            />
          ) : null}

          {sections.includes("projection") ? (
            <ProjectionSection
              totals={data.totals}
              currency={currency}
              locale={locale}
              labels={data.labels}
              reportStyle={options.reportStyle}
            />
          ) : null}

        </Page>
      ) : null}

      {/* ─── Table sections — each on its own page ─────────────────── */}

      {/* Budget items table */}
      {sections.includes("budget_items") ? (
        <Page size="A4" orientation={orient("budget_items")} style={pageStyle} experimentalPagination>
          <BudgetTable
            items={data.budgetItems}
            sections={sections}
            currency={currency}
            locale={locale}
            labels={data.labels}
            phaseTranslations={data.phaseTranslations}
            reportStyle={options.reportStyle}
            sort={options.tableSorts?.budget_items}
          />
        </Page>
      ) : null}

      {/* Payments table */}
      {sections.includes("payments") ? (
        <Page size="A4" orientation={orient("payments")} style={pageStyle} experimentalPagination>
          <PaymentsTable
            payments={data.payments}
            sections={sections}
            currency={currency}
            locale={locale}
            labels={data.labels}
            paymentTypeTranslations={data.paymentTypeTranslations}
            sort={options.tableSorts?.payments}
            reportStyle={options.reportStyle}
          />
        </Page>
      ) : null}

      {/* Time entries table */}
      {sections.includes("time") ? (
        <Page size="A4" orientation={orient("time")} style={pageStyle} experimentalPagination>
          <TimeEntriesTable
            timeEntries={data.timeEntries}
            sections={sections}
            locale={locale}
            labels={data.labels}
            sort={options.tableSorts?.time}
            reportStyle={options.reportStyle}
          />
        </Page>
      ) : null}

      {/* Contacts table */}
      {sections.includes("contacts") ? (
        <Page size="A4" orientation={orient("contacts")} style={pageStyle} experimentalPagination>
          <ContactsTable
            contacts={data.contacts}
            sections={sections}
            locale={locale}
            labels={data.labels}
            contactTypeTranslations={data.contactTypeTranslations}
            sort={options.tableSorts?.contacts}
            reportStyle={options.reportStyle}
          />
        </Page>
      ) : null}
    </Document>
  );
}
