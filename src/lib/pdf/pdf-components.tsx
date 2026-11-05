// =====================================================================
// PDF Components — for @react-pdf/renderer (server-side rendering)
// ---------------------------------------------------------------------
// IMPORTANT: @react-pdf/renderer uses its own rendering engine. These
// components use <Document>, <Page>, <View>, <Text> primitives — NOT
// HTML/DOM elements, NOT Tailwind, NOT browser APIs.
//
// Styling is via StyleSheet.create (flexbox-based, similar to React
// Native). See https://react-pdf.org/styling for the supported props.
//
// Components exported here are rendered to a PDF Buffer by
// `pdf-generator.ts` via `renderToBuffer(<ReportDocument .../>)`.
// =====================================================================

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import path from "path";
import type {
  PdfReportData,
  PdfSectionId,
  PdfBudgetItem,
  PdfAlertItem,
  PdfExportOptions,
  PdfContact,
} from "./pdf-types";

// =====================================================================
// Font registration — Roboto (Unicode, supports Czech diacritics)
// ---------------------------------------------------------------------
// The built-in Helvetica font only supports Latin-1 (WinAnsi encoding),
// which does NOT include Czech characters like ě, š, č, ř, ž, ý, á, í, é, ů.
// Roboto is a free Google font with full Unicode coverage. We load it
// from the local src/lib/pdf/fonts/ directory for server-side rendering.
// On Vercel, the files are bundled by the standalone build.
// =====================================================================
Font.register({
  family: "Roboto",
  fonts: [
    {
      src: path.join(process.cwd(), "src/lib/pdf/fonts/Roboto-Regular.ttf"),
      fontWeight: "normal",
    },
    {
      src: path.join(process.cwd(), "src/lib/pdf/fonts/Roboto-Bold.ttf"),
      fontWeight: "bold",
    },
  ],
});

// =====================================================================
// Locale helpers
// ---------------------------------------------------------------------
// The `locale` parameter on PdfExportOptions is a short code ("cs", "en")
// matching the values in @/i18n/config. Intl APIs require BCP-47 tags
// ("cs-CZ", "en-GB"). We map the short codes here, falling back to the
// raw string if it already looks like a BCP-47 tag, then to "cs-CZ".
// =====================================================================

const LOCALE_TO_BCP47: Record<string, string> = {
  cs: "cs-CZ",
  en: "en-GB",
  pl: "pl-PL",
  vi: "vi-VN",
  hu: "hu-HU",
  es: "es-ES",
  it: "it-IT",
};

function toBcp47(locale: string): string {
  if (LOCALE_TO_BCP47[locale]) return LOCALE_TO_BCP47[locale];
  // Already looks like a BCP-47 tag (e.g. "cs-CZ") → use as-is.
  if (locale.includes("-")) return locale;
  // Unknown short code → default to Czech (project default locale).
  return "cs-CZ";
}

// =====================================================================
// Formatting helpers — locale-aware
// ---------------------------------------------------------------------
// Used by the components below AND exported for reuse by the generator
// (e.g. for filename building, log messages, …).
// =====================================================================

/**
 * Format a numeric amount with the given currency code + locale.
 *
 * - CZK / HUF / VND → 0 decimal places (high-denomination currencies,
 *   haléře-like subunits are not used in practice).
 * - EUR / USD / GBP / PLN / AUD → 2 decimal places.
 * - null/NaN → "—" (em dash).
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency: string,
  locale: string = "cs",
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return "—";
  }
  const decimals =
    currency === "CZK" || currency === "HUF" || currency === "VND" ? 0 : 2;
  try {
    return new Intl.NumberFormat(toBcp47(locale), {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    // Invalid currency code → fall back to plain number formatting.
    return new Intl.NumberFormat(toBcp47(locale), {
      maximumFractionDigits: decimals,
    }).format(amount);
  }
}

/**
 * Format a date as DD.MM.YYYY in the given locale.
 * Returns "—" for null / invalid dates.
 */
export function formatDate(
  date: Date | string | null | undefined,
  locale: string = "cs",
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (d instanceof Date === false || Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(toBcp47(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/**
 * Status icon for a budget item row in the table.
 * Uses ASCII-safe characters that work with any font:
 *   - "OK" — completed
 *   - "!" — over budget (actualCost > planCost, planCost > 0)
 *   - "-" — pending (everything else, including rejected items)
 */
export function getStatusIcon(item: PdfBudgetItem): string {
  if (item.completed) return "OK";
  const plan = item.planCostConverted ?? item.planCost ?? 0;
  if (plan > 0 && item.actualCost > plan) return "!";
  return "-";
}

// =====================================================================
// Styles
// ---------------------------------------------------------------------
// A4 page = 595.28 × 841.89 points. With 40pt margins on all sides,
// the content area is 515.28 × 761.89 points.
//
// Color palette:
//   - Primary text:   #333333 (dark gray)
//   - Muted text:    #555555 / #777777
//   - Borders:        #cccccc (light gray) / #eeeeee (very light)
//   - Header bg:     #f5f5f5
//   - Positive:      #1a7f37 (green)
//   - Negative:       #b00020 (red)
// =====================================================================

const styles = StyleSheet.create({
  // ----- Page chrome -----
  page: {
    fontSize: 10,
    fontFamily: "Roboto",
    color: "#333333",
    backgroundColor: "#ffffff",
    paddingTop: 40,
    paddingBottom: 60, // leave room for the fixed footer
    paddingLeft: 40,
    paddingRight: 40,
    lineHeight: 1.4,
  },

  // ----- Generic section wrapper -----
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Roboto", fontWeight: "bold",
    color: "#333333",
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#cccccc",
    borderBottomStyle: "solid",
  },

  // ----- Header -----
  header: {
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: "#333333",
    borderBottomStyle: "solid",
  },
  headerName: {
    fontSize: 18,
    fontFamily: "Roboto", fontWeight: "bold",
    color: "#333333",
    marginBottom: 4,
  },
  headerMeta: {
    fontSize: 10,
    color: "#555555",
    marginBottom: 2,
  },

  // ----- Summary KPI -----
  kpiLabel: {
    fontSize: 9,
    color: "#777777",
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  kpiMain: {
    fontSize: 24,
    fontFamily: "Roboto", fontWeight: "bold",
    color: "#333333",
    marginBottom: 8,
  },
  kpiRow: {
    flexDirection: "row",
  },
  kpiSubItem: {
    flex: 1,
    paddingRight: 12,
  },
  kpiSubLabel: {
    fontSize: 8,
    color: "#777777",
    marginBottom: 2,
  },
  kpiSubValue: {
    fontSize: 12,
    fontFamily: "Roboto", fontWeight: "bold",
    color: "#333333",
  },

  // ----- Property metadata -----
  metaRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  metaLabel: {
    fontSize: 9,
    color: "#777777",
    width: 130,
  },
  metaValue: {
    fontSize: 9,
    flex: 1,
    color: "#333333",
  },

  // ----- Budget table -----
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 3,
    paddingRight: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#cccccc",
    borderBottomStyle: "solid",
  },
  tableRow: {
    flexDirection: "row",
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 3,
    paddingRight: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eeeeee",
    borderBottomStyle: "solid",
  },
  tableHeaderText: {
    fontSize: 8,
    fontFamily: "Roboto", fontWeight: "bold",
    color: "#333333",
    paddingRight: 4,
  },
  tableCellText: {
    fontSize: 9,
    color: "#333333",
    // Each cell needs padding so text doesn't bleed into the next column.
    // Without paddingRight, flex children in a row touch edge-to-edge.
    paddingRight: 4,
  },
  tableEmpty: {
    fontSize: 9,
    color: "#888888",
    marginTop: 4,
    fontStyle: "italic",
  },

  // Column widths (flex values). Total = 1.5 + 2 + 1 + 1.1 + 1.1 + 0.5 + 1 + 1 = 9.2
  colCategory: { flex: 1.5 },
  colName: { flex: 2 },
  colPhase: { flex: 1 },
  colCost: { flex: 1.1, textAlign: "right" },
  colStatus: { flex: 0.5, textAlign: "center" },
  colDate: { flex: 1, textAlign: "right" },

  // ----- Alerts -----
  alertGroup: {
    marginBottom: 8,
  },
  alertGroupTitle: {
    fontSize: 10,
    fontFamily: "Roboto", fontWeight: "bold",
    color: "#333333",
    marginBottom: 3,
  },
  alertItem: {
    fontSize: 9,
    color: "#444444",
    marginBottom: 2,
  },
  alertEmpty: {
    fontSize: 9,
    color: "#888888",
    fontStyle: "italic",
  },

  // ----- Projection -----
  projectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 5,
    paddingBottom: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eeeeee",
    borderBottomStyle: "solid",
  },
  projectionLabel: {
    fontSize: 10,
    color: "#333333",
  },
  projectionValue: {
    fontSize: 12,
    fontFamily: "Roboto", fontWeight: "bold",
    color: "#333333",
  },
  projectionValuePositive: {
    color: "#b00020",
  },
  projectionValueNegative: {
    color: "#1a7f37",
  },

  // ----- Footer (repeats on every page) -----
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#888888",
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: "#cccccc",
    borderTopStyle: "solid",
  },
});

// =====================================================================
// Header — project name, address, description, generated/startDate/endDate
// =====================================================================

export function Header({
  project,
  locale,
  labels,
}: {
  project: PdfReportData["project"];
  locale: string;
  labels: PdfReportData["labels"];
}) {
  const generatedAt = formatDate(new Date(), locale);
  const hasStartDate = project.startDate != null;
  const hasEndDate = project.endDate != null;

  return (
    <View style={styles.header} wrap={false}>
      <Text style={styles.headerName}>{project.name}</Text>
      {project.address ? (
        <Text style={styles.headerMeta}>{project.address}</Text>
      ) : null}
      {project.fullAddress ? (
        <Text style={styles.headerMeta}>{project.fullAddress}</Text>
      ) : null}
      {project.description ? (
        <Text style={styles.headerMeta}>{project.description}</Text>
      ) : null}
      <Text style={styles.headerMeta}>{labels.generated}: {generatedAt}</Text>
      {hasStartDate || hasEndDate ? (
        <Text style={styles.headerMeta}>
          {hasStartDate
            ? `${labels.startDate}: ${formatDate(project.startDate, locale)}`
            : ""}
          {hasStartDate && hasEndDate ? "  •  " : ""}
          {hasEndDate ? `${labels.endDate}: ${formatDate(project.endDate, locale)}` : ""}
        </Text>
      ) : null}
    </View>
  );
}

// =====================================================================
// SummaryKPI — projected final + plan/actual/remaining sub-row
// =====================================================================

export function SummaryKPI({
  totals,
  currency,
  locale,
  labels,
}: {
  totals: PdfReportData["totals"];
  currency: string;
  locale: string;
  labels: PdfReportData["labels"];
}) {
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.kpiLabel}>{labels.expectedTotal}</Text>
      <Text style={styles.kpiMain}>
        {formatCurrency(totals.projectedFinal, currency, locale)}
      </Text>
      <View style={styles.kpiRow}>
        <View style={styles.kpiSubItem}>
          <Text style={styles.kpiSubLabel}>{labels.plan}</Text>
          <Text style={styles.kpiSubValue}>
            {formatCurrency(totals.planTotal, currency, locale)}
          </Text>
        </View>
        <View style={styles.kpiSubItem}>
          <Text style={styles.kpiSubLabel}>{labels.actual}</Text>
          <Text style={styles.kpiSubValue}>
            {formatCurrency(totals.actualTotal, currency, locale)}
          </Text>
        </View>
        <View style={styles.kpiSubItem}>
          <Text style={styles.kpiSubLabel}>{labels.remaining}</Text>
          <Text style={styles.kpiSubValue}>
            {formatCurrency(totals.remaining, currency, locale)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// =====================================================================
// PropertyMetadata — floor area, floors, energy rating, heat loss,
// full address, property note. Only non-null fields are shown.
// =====================================================================

export function PropertyMetadata({
  project,
  locale,
  labels,
}: {
  project: PdfReportData["project"];
  locale: string;
  labels: PdfReportData["labels"];
}) {
  // Build a list of [label, value] pairs for all non-null fields.
  // The order matches the project-info-card / property-metadata-card
  // sections in the web UI for consistency.
  const rows: Array<{ label: string; value: string }> = [];

  if (project.fullAddress) {
    rows.push({ label: labels.fullAddress, value: project.fullAddress });
  } else if (project.address) {
    rows.push({ label: labels.address, value: project.address });
  }
  if (project.floorArea != null) {
    rows.push({
      label: labels.floorArea,
      value: `${project.floorArea} m²`,
    });
  }
  if (project.floors != null) {
    rows.push({ label: labels.floors, value: String(project.floors) });
  }
  if (project.energyRating) {
    rows.push({
      label: labels.energyRating,
      value: project.energyRating,
    });
  }
  if (project.heatLoss != null) {
    rows.push({
      label: labels.heatLoss,
      value: `${project.heatLoss} W/K`,
    });
  }
  if (project.propertyNote) {
    rows.push({ label: labels.propertyNote, value: project.propertyNote });
  }

  if (rows.length === 0) return null;

  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>{labels.propertyInfo}</Text>
      {rows.map((row, idx) => (
        <View key={idx} style={styles.metaRow}>
          <Text style={styles.metaLabel}>{row.label}</Text>
          <Text style={styles.metaValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

// =====================================================================
// BudgetTable — table of all budget items.
//
// Columns (controlled by the `sections` array):
//   - Category (always)
//   - Name / subcategory (always)
//   - Phase (always)
//   - Plan cost   (if "costs" in sections)
//   - Actual cost (if "costs" in sections)
//   - Status      (if "status" in sections) — ✓ / ⚠ / ○
//   - Date from   (if "dates" in sections)
//   - Date to     (if "dates" in sections)
//
// The header row uses `fixed` so it repeats on every wrapped page.
// =====================================================================

export function BudgetTable({
  items,
  sections,
  currency,
  locale,
  labels,
  phaseTranslations,
}: {
  items: PdfBudgetItem[];
  sections: PdfSectionId[];
  currency: string;
  locale: string;
  labels: PdfReportData["labels"];
  phaseTranslations: PdfReportData["phaseTranslations"];
}) {
  const showPlanCost = sections.includes("plan_cost");
  const showActualCost = sections.includes("actual_cost");
  const showStatus = sections.includes("status");
  const showDates = sections.includes("dates");
  const showPhase = sections.includes("phase");
  const showSupplier = sections.includes("supplier");

  // Effective plan cost (in target currency) for display.
  const planCostOf = (item: PdfBudgetItem) =>
    item.planCostConverted ?? item.planCost;

  // Translate a raw DB phase value to the localized display name.
  // Falls back to the raw value if no translation is available.
  const translatePhase = (phase: string) =>
    phaseTranslations[phase] || phase;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {labels.budgetItems} ({items.length}{" "}
        {items.length === 1 ? labels.item : labels.items})
      </Text>

      <View style={styles.tableHeader} fixed>
        <Text style={[styles.tableHeaderText, styles.colCategory]}>
          {labels.category}
        </Text>
        <Text style={[styles.tableHeaderText, styles.colName]}>{labels.name}</Text>
        {showPhase ? (
          <Text style={[styles.tableHeaderText, styles.colPhase]}>{labels.phase}</Text>
        ) : null}
        {showPlanCost ? (
          <Text style={[styles.tableHeaderText, styles.colCost]}>{labels.planCost}</Text>
        ) : null}
        {showActualCost ? (
          <Text style={[styles.tableHeaderText, styles.colCost]}>{labels.actualCost}</Text>
        ) : null}
        {showStatus ? (
          <Text style={[styles.tableHeaderText, styles.colStatus]}>{labels.status}</Text>
        ) : null}
        {showDates ? (
          <>
            <Text style={[styles.tableHeaderText, styles.colDate]}>{labels.from}</Text>
            <Text style={[styles.tableHeaderText, styles.colDate]}>{labels.to}</Text>
          </>
        ) : null}
        {showSupplier ? (
          <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>
            {labels.supplier}
          </Text>
        ) : null}
      </View>

      {items.length === 0 ? (
        <Text style={styles.tableEmpty}>{labels.noItems}</Text>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.tableRow} wrap={false}>
            <Text style={[styles.tableCellText, styles.colCategory]}>
              {item.category}
            </Text>
            <Text style={[styles.tableCellText, styles.colName]}>
              {item.subcategory || item.category}
            </Text>
            {showPhase ? (
              <Text style={[styles.tableCellText, styles.colPhase]}>
                {translatePhase(item.phase)}
              </Text>
            ) : null}
            {showPlanCost ? (
              <Text style={[styles.tableCellText, styles.colCost]}>
                {formatCurrency(planCostOf(item), currency, locale)}
              </Text>
            ) : null}
            {showActualCost ? (
              <Text style={[styles.tableCellText, styles.colCost]}>
                {formatCurrency(item.actualCost, currency, locale)}
              </Text>
            ) : null}
            {showStatus ? (
              <Text style={[styles.tableCellText, styles.colStatus]}>
                {getStatusIcon(item)}
              </Text>
            ) : null}
            {showDates ? (
              <>
                <Text style={[styles.tableCellText, styles.colDate]}>
                  {formatDate(item.dateFrom, locale)}
                </Text>
                <Text style={[styles.tableCellText, styles.colDate]}>
                  {formatDate(item.dateTo, locale)}
                </Text>
              </>
            ) : null}
            {showSupplier ? (
              <Text style={[styles.tableCellText, { flex: 1.2 }]}>
                {item.contactName || "-"}
              </Text>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

// =====================================================================
// AlertsSection — list of overdue, upcoming, and overBudget items.
// Each group is only rendered when it has at least one item.
// =====================================================================

function AlertRow({
  alert,
  currency,
  locale,
}: {
  alert: PdfAlertItem;
  currency: string;
  locale: string;
}) {
  const name = alert.subcategory || alert.category;
  return (
    <Text style={styles.alertItem}>
      {alert.category}
      {alert.subcategory ? ` / ${alert.subcategory}` : ""} — {name}
      {alert.dateTo ? ` • termín ${formatDate(alert.dateTo, locale)}` : ""}
      {" • plán "}
      {formatCurrency(alert.planCost, currency, locale)}
      {" • skut. "}
      {formatCurrency(alert.actualCost, currency, locale)}
    </Text>
  );
}

export function AlertsSection({
  alerts,
  currency,
  locale,
  labels,
}: {
  alerts: PdfReportData["alerts"];
  currency: string;
  locale: string;
  labels: PdfReportData["labels"];
}) {
  const total =
    alerts.overdue.length +
    alerts.upcoming.length +
    alerts.overBudget.length;

  if (total === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{labels.alerts}</Text>
        <Text style={styles.alertEmpty}>{labels.noAlerts}</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{labels.alerts}</Text>

      {alerts.overdue.length > 0 ? (
        <View style={styles.alertGroup}>
          <Text style={styles.alertGroupTitle}>
            {labels.overdue} ({alerts.overdue.length})
          </Text>
          {alerts.overdue.map((a, idx) => (
            <AlertRow
              key={`overdue-${idx}`}
              alert={a}
              currency={currency}
              locale={locale}
            />
          ))}
        </View>
      ) : null}

      {alerts.upcoming.length > 0 ? (
        <View style={styles.alertGroup}>
          <Text style={styles.alertGroupTitle}>
            {labels.upcoming} ({alerts.upcoming.length})
          </Text>
          {alerts.upcoming.map((a, idx) => (
            <AlertRow
              key={`upcoming-${idx}`}
              alert={a}
              currency={currency}
              locale={locale}
            />
          ))}
        </View>
      ) : null}

      {alerts.overBudget.length > 0 ? (
        <View style={styles.alertGroup}>
          <Text style={styles.alertGroupTitle}>
            {labels.overBudget} ({alerts.overBudget.length})
          </Text>
          {alerts.overBudget.map((a, idx) => (
            <AlertRow
              key={`overbudget-${idx}`}
              alert={a}
              currency={currency}
              locale={locale}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// =====================================================================
// ProjectionSection — projected final cost + estimated overrun
// =====================================================================

export function ProjectionSection({
  totals,
  currency,
  locale,
  labels,
}: {
  totals: PdfReportData["totals"];
  currency: string;
  locale: string;
  labels: PdfReportData["labels"];
}) {
  const isOver = totals.projectedOverrun > 0;
  const overrunLabel = isOver
    ? labels.estimatedOverrun
    : labels.expectedSavings;
  const overrunValueStyle = isOver
    ? [styles.projectionValue, styles.projectionValuePositive]
    : [styles.projectionValue, styles.projectionValueNegative];
  const overrunDisplay = `${isOver ? "+" : ""}${formatCurrency(
    totals.projectedOverrun,
    currency,
    locale,
  )}`;

  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>{labels.projection}</Text>
      <View style={styles.projectionRow}>
        <Text style={styles.projectionLabel}>{labels.plannedBudget}</Text>
        <Text style={styles.projectionValue}>
          {formatCurrency(totals.planTotal, currency, locale)}
        </Text>
      </View>
      <View style={styles.projectionRow}>
        <Text style={styles.projectionLabel}>{labels.expectedTotalCosts}</Text>
        <Text style={styles.projectionValue}>
          {formatCurrency(totals.projectedFinal, currency, locale)}
        </Text>
      </View>
      <View style={styles.projectionRow}>
        <Text style={styles.projectionLabel}>{overrunLabel}</Text>
        <Text style={overrunValueStyle}>{overrunDisplay}</Text>
      </View>
    </View>
  );
}

// =====================================================================
// Footer — appears on every page via the `fixed` prop.
// Project name + generated date + "Strana X z Y"
// =====================================================================

export function Footer({
  project,
  locale,
  labels,
}: {
  project: PdfReportData["project"];
  locale: string;
  labels: PdfReportData["labels"];
}) {
  const generatedDate = formatDate(new Date(), locale);
  return (
    <View style={styles.footer} fixed>
      <Text>{project.name}</Text>
      <Text>{labels.generated}: {generatedDate}</Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `${labels.page} ${pageNumber} ${labels.of} ${totalPages}`
        }
      />
    </View>
  );
}

// =====================================================================
// PaymentsTable — table of all payments.
// =====================================================================

export function PaymentsTable({
  payments,
  sections,
  currency,
  locale,
  labels,
  paymentTypeTranslations,
}: {
  payments: PdfReportData["payments"];
  sections: PdfSectionId[];
  currency: string;
  locale: string;
  labels: PdfReportData["labels"];
  paymentTypeTranslations: Record<string, string>;
}) {
  const showPaymentType = sections.includes("payment_type");
  const showInvoice = sections.includes("invoice");

  if (!payments || payments.length === 0) {
    return (
      <View style={styles.section} wrap={false}>
        <Text style={styles.sectionTitle}>{labels.payments}</Text>
        <Text style={styles.tableEmpty}>{labels.noPayments}</Text>
      </View>
    );
  }

  // Calculate total for summary row
  const totalAmount = payments.reduce(
    (sum, p) => sum + (p.amountConverted || 0),
    0,
  );

  // Column widths adapt based on which columns are visible.
  // Base: Date(1) + Category(1.5) + Vendor(1.5) + Amount(1.2) = 5.2
  // + Type(0.8) if showPaymentType
  // + Invoice(1) if showInvoice
  const colDate = { flex: 1 };
  const colCategory = { flex: 1.5 };
  const colVendor = { flex: 1.5 };
  const colAmount = { flex: 1.2, textAlign: "right" as const };
  const colType = { flex: 0.8 };
  const colInvoice = { flex: 1 };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {labels.payments} ({payments.length} {labels.paymentsCount})
      </Text>

      <View style={styles.tableHeader} fixed>
        <Text style={[styles.tableHeaderText, colDate]}>
          {labels.date}
        </Text>
        <Text style={[styles.tableHeaderText, colCategory]}>
          {labels.category}
        </Text>
        <Text style={[styles.tableHeaderText, colVendor]}>
          {labels.vendor}
        </Text>
        <Text style={[styles.tableHeaderText, colAmount]}>
          {labels.amount}
        </Text>
        {showPaymentType ? (
          <Text style={[styles.tableHeaderText, colType]}>
            {labels.type}
          </Text>
        ) : null}
        {showInvoice ? (
          <Text style={[styles.tableHeaderText, colInvoice]}>
            {labels.invoice}
          </Text>
        ) : null}
      </View>

      {payments.map((payment) => {
        const itemLabel = [
          payment.budgetItemCategory,
          payment.budgetItemSubcategory,
        ]
          .filter(Boolean)
          .join(" / ");
        const vendor = payment.vendor || payment.contactName || "";
        return (
          <View key={payment.id} style={styles.tableRow} wrap={false}>
            <Text style={[styles.tableCellText, colDate]}>
              {formatDate(payment.date, locale)}
            </Text>
            <Text style={[styles.tableCellText, colCategory]}>
              {itemLabel || "-"}
            </Text>
            <Text style={[styles.tableCellText, colVendor]}>
              {vendor || "-"}
            </Text>
            <Text style={[styles.tableCellText, colAmount]}>
              {formatCurrency(payment.amountConverted, currency, locale)}
            </Text>
            {showPaymentType ? (
              <Text style={[styles.tableCellText, colType]}>
                {paymentTypeTranslations[payment.type] || payment.type || "-"}
              </Text>
            ) : null}
            {showInvoice ? (
              <Text style={[styles.tableCellText, colInvoice]}>
                {payment.invoiceNumber || "-"}
              </Text>
            ) : null}
          </View>
        );
      })}

      {/* Total row */}
      <View
        style={[
          styles.tableRow,
          {
            borderTopWidth: 1,
            borderTopColor: "#cccccc",
            borderTopStyle: "solid",
            marginTop: 2,
          },
        ]}
        wrap={false}
      >
        <Text style={[styles.tableCellText, colDate]}>
          {labels.totalPayments}:
        </Text>
        <Text style={[styles.tableCellText, colCategory]}> </Text>
        <Text style={[styles.tableCellText, colVendor]}> </Text>
        <Text
          style={[
            styles.tableCellText,
            colAmount,
            { fontFamily: "Roboto", fontWeight: "bold" },
          ]}
        >
          {formatCurrency(totalAmount, currency, locale)}
        </Text>
        {showPaymentType ? (
          <Text style={[styles.tableCellText, colType]}> </Text>
        ) : null}
        {showInvoice ? (
          <Text style={[styles.tableCellText, colInvoice]}> </Text>
        ) : null}
      </View>
    </View>
  );
}

// =====================================================================
// TimeEntriesTable — table of all time entries.
// Columns: Date, Item (category/subcategory), Worker, Hours, Workers
// Sub-sections: worker (show/hide worker name), hours (show/hide hours)
// =====================================================================

export function TimeEntriesTable({
  timeEntries,
  sections,
  locale,
  labels,
}: {
  timeEntries: PdfReportData["timeEntries"];
  sections: PdfSectionId[];
  locale: string;
  labels: PdfReportData["labels"];
}) {
  const showWorker = sections.includes("worker");
  const showHours = sections.includes("hours");

  if (!timeEntries || timeEntries.length === 0) {
    return (
      <View style={styles.section} wrap={false}>
        <Text style={styles.sectionTitle}>{labels.timeEntries}</Text>
        <Text style={styles.tableEmpty}>{labels.noTimeEntries}</Text>
      </View>
    );
  }

  const totalHours = timeEntries.reduce(
    (sum, te) => sum + (te.hours * (te.workerCount || 1)),
    0,
  );

  const colDate = { flex: 1 };
  const colItem = { flex: 1.5 };
  const colWorker = { flex: 1.5 };
  const colHours = { flex: 0.8, textAlign: "right" as const };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {labels.timeEntries} ({timeEntries.length} {labels.timeEntriesCount})
      </Text>

      <View style={styles.tableHeader} fixed>
        <Text style={[styles.tableHeaderText, colDate]}>
          {labels.date}
        </Text>
        <Text style={[styles.tableHeaderText, colItem]}>
          {labels.category}
        </Text>
        {showWorker ? (
          <Text style={[styles.tableHeaderText, colWorker]}>
            {labels.worker}
          </Text>
        ) : null}
        {showHours ? (
          <Text style={[styles.tableHeaderText, colHours]}>
            {labels.hours}
          </Text>
        ) : null}
      </View>

      {timeEntries.map((te) => {
        const itemLabel = [
          te.budgetItemCategory,
          te.budgetItemSubcategory,
        ]
          .filter(Boolean)
          .join(" / ");
        return (
          <View key={te.id} style={styles.tableRow} wrap={false}>
            <Text style={[styles.tableCellText, colDate]}>
              {formatDate(te.date, locale)}
            </Text>
            <Text style={[styles.tableCellText, colItem]}>
              {itemLabel || "-"}
            </Text>
            {showWorker ? (
              <Text style={[styles.tableCellText, colWorker]}>
                {te.workerName || "-"}
              </Text>
            ) : null}
            {showHours ? (
              <Text style={[styles.tableCellText, colHours]}>
                {te.hours} h
              </Text>
            ) : null}
          </View>
        );
      })}

      {/* Total row */}
      <View
        style={[
          styles.tableRow,
          {
            borderTopWidth: 1,
            borderTopColor: "#cccccc",
            borderTopStyle: "solid",
            marginTop: 2,
          },
        ]}
        wrap={false}
      >
        <Text style={[styles.tableCellText, colDate]}>
          {labels.totalHours}:
        </Text>
        <Text style={[styles.tableCellText, colItem]}> </Text>
        {showWorker ? (
          <Text style={[styles.tableCellText, colWorker]}> </Text>
        ) : null}
        {showHours ? (
          <Text
            style={[
              styles.tableCellText,
              colHours,
              { fontFamily: "Roboto", fontWeight: "bold" },
            ]}
          >
            {totalHours.toFixed(1)} h
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// =====================================================================
// ContactsTable — directory of suppliers / contractors on the project.
//
// Columns (controlled by the `sections` array):
//   - Name (always)
//   - Type      (if "contact_type" in sections)
//   - Phone     (if "contact_phone" in sections)
//   - Email     (if "contact_email" in sections)
//   - IČO/DIČ   (if "contact_ico" in sections)
//   - Notes     (if "contact_notes" in sections)
//
// Each row also shows the contact's role (if any) and denormalized
// counts of payments + time entries referencing the contact — handy
// for spotting the most-active suppliers at a glance.
// =====================================================================

export function ContactsTable({
  contacts,
  sections,
  locale: _locale,
  labels,
  contactTypeTranslations,
}: {
  contacts: PdfContact[];
  sections: PdfSectionId[];
  locale: string;
  labels: PdfReportData["labels"];
  contactTypeTranslations: Record<string, string>;
}) {
  const showType = sections.includes("contact_type");
  const showPhone = sections.includes("contact_phone");
  const showEmail = sections.includes("contact_email");
  const showIco = sections.includes("contact_ico");
  const showNotes = sections.includes("contact_notes");

  if (!contacts || contacts.length === 0) {
    return (
      <View style={styles.section} wrap={false}>
        <Text style={styles.sectionTitle}>{labels.contacts}</Text>
        <Text style={styles.tableEmpty}>{labels.noContacts}</Text>
      </View>
    );
  }

  // Translate a raw DB contact type value to the localized display name.
  const translateType = (type: string) =>
    contactTypeTranslations[type] || type;

  // Render the contact's rating as ★ characters (1-5).
  const renderRating = (rating: number | null) => {
    if (rating == null || rating <= 0) return "";
    const clamped = Math.max(1, Math.min(5, Math.round(rating)));
    return "★".repeat(clamped);
  };

  // Column widths adapt based on which columns are visible.
  // Base: Name(2) + Role(1) + Payments(0.6) + Time(0.6) = 4.2
  // + Type(0.9) if showType
  // + Phone(1.2) if showPhone
  // + Email(1.5) if showEmail
  // + IČO/DIČ(1.2) if showIco
  // + Notes(1.8) if showNotes
  const colName = { flex: 2 };
  const colRole = { flex: 1 };
  const colType = { flex: 0.9 };
  const colPhone = { flex: 1.2 };
  const colEmail = { flex: 1.5 };
  const colIco = { flex: 1.2 };
  const colNotes = { flex: 1.8 };
  const colCount = { flex: 0.6, textAlign: "center" as const };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {labels.contacts} ({contacts.length} {labels.contactsCount})
      </Text>

      <View style={styles.tableHeader} fixed>
        <Text style={[styles.tableHeaderText, colName]}>
          {labels.contactName}
        </Text>
        {showType ? (
          <Text style={[styles.tableHeaderText, colType]}>
            {labels.contactType}
          </Text>
        ) : null}
        <Text style={[styles.tableHeaderText, colRole]}>
          {labels.role}
        </Text>
        {showPhone ? (
          <Text style={[styles.tableHeaderText, colPhone]}>
            {labels.phone}
          </Text>
        ) : null}
        {showEmail ? (
          <Text style={[styles.tableHeaderText, colEmail]}>
            {labels.email}
          </Text>
        ) : null}
        {showIco ? (
          <Text style={[styles.tableHeaderText, colIco]}>
            {labels.ico}
          </Text>
        ) : null}
        <Text style={[styles.tableHeaderText, colCount]}>
          {labels.paymentCount}
        </Text>
        <Text style={[styles.tableHeaderText, colCount]}>
          {labels.timeEntryCount}
        </Text>
        {showNotes ? (
          <Text style={[styles.tableHeaderText, colNotes]}>
            {labels.contactNotes}
          </Text>
        ) : null}
      </View>

      {contacts.map((contact) => {
        // Build the IČO/DIČ cell content. When DIČ is present it is
        // shown on the same line, separated by " / ".
        const icoDicParts: string[] = [];
        if (contact.ico) icoDicParts.push(`IČO ${contact.ico}`);
        if (contact.dic) icoDicParts.push(`DIČ ${contact.dic}`);
        const icoDicText = icoDicParts.join("  •  ") || "-";

        // For the Name column we also show the company name on a second
        // line when the contact has one (helps distinguish "Pavel Novák"
        // the person from "Pavel Novák — Hrázek s.r.o.").
        const nameLine = contact.name;
        const companyLine = contact.company || "";
        const ratingLine = renderRating(contact.rating);

        return (
          <View key={contact.id} style={styles.tableRow} wrap={false}>
            <Text style={[styles.tableCellText, colName]}>
              {nameLine}
              {companyLine ? `\n${companyLine}` : ""}
              {ratingLine ? `\n${ratingLine}` : ""}
            </Text>
            {showType ? (
              <Text style={[styles.tableCellText, colType]}>
                {translateType(contact.type)}
              </Text>
            ) : null}
            <Text style={[styles.tableCellText, colRole]}>
              {contact.role || "-"}
            </Text>
            {showPhone ? (
              <Text style={[styles.tableCellText, colPhone]}>
                {contact.phone || "-"}
              </Text>
            ) : null}
            {showEmail ? (
              <Text style={[styles.tableCellText, colEmail]}>
                {contact.email || "-"}
              </Text>
            ) : null}
            {showIco ? (
              <Text style={[styles.tableCellText, colIco]}>
                {icoDicText}
              </Text>
            ) : null}
            <Text style={[styles.tableCellText, colCount]}>
              {String(contact.paymentCount)}
            </Text>
            <Text style={[styles.tableCellText, colCount]}>
              {String(contact.timeEntryCount)}
            </Text>
            {showNotes ? (
              <Text style={[styles.tableCellText, colNotes]}>
                {contact.notes || "-"}
              </Text>
            ) : null}
          </View>
        );
      })}

      {/* Total row */}
      <View
        style={[
          styles.tableRow,
          {
            borderTopWidth: 1,
            borderTopColor: "#cccccc",
            borderTopStyle: "solid",
            marginTop: 2,
          },
        ]}
        wrap={false}
      >
        <Text style={[styles.tableCellText, colName]}>
          {labels.totalContacts}:
        </Text>
        {showType ? (
          <Text style={[styles.tableCellText, colType]}> </Text>
        ) : null}
        <Text style={[styles.tableCellText, colRole]}> </Text>
        {showPhone ? (
          <Text style={[styles.tableCellText, colPhone]}> </Text>
        ) : null}
        {showEmail ? (
          <Text style={[styles.tableCellText, colEmail]}> </Text>
        ) : null}
        {showIco ? (
          <Text style={[styles.tableCellText, colIco]}> </Text>
        ) : null}
        <Text
          style={[
            styles.tableCellText,
            colCount,
            { fontFamily: "Roboto", fontWeight: "bold" },
          ]}
        >
          {String(contacts.reduce((s, c) => s + c.paymentCount, 0))}
        </Text>
        <Text
          style={[
            styles.tableCellText,
            colCount,
            { fontFamily: "Roboto", fontWeight: "bold" },
          ]}
        >
          {String(contacts.reduce((s, c) => s + c.timeEntryCount, 0))}
        </Text>
        {showNotes ? (
          <Text style={[styles.tableCellText, colNotes]}> </Text>
        ) : null}
      </View>
    </View>
  );
}

// =====================================================================
// ReportDocument — the top-level <Document> that assembles all sections
// based on the `sections` array from `options`.
//
// A single <Page> wraps all section content; react-pdf paginates
// automatically when content overflows. The fixed Footer repeats on
// every generated page. `experimentalPagination` is enabled to make
// `totalPages` accurate (without it, totalPages is unreliable).
// =====================================================================

export function ReportDocument({
  data,
  options,
}: {
  data: PdfReportData;
  options: PdfExportOptions;
}) {
  const { locale, sections, currency } = options;
  const showHeader = sections.includes("header");
  const showSummary = sections.includes("summary");
  const showProperty = sections.includes("property");
  const showBudget = sections.includes("budget_items");
  const showAlerts = sections.includes("alerts");
  const showProjection = sections.includes("projection");
  const showPayments = sections.includes("payments");
  const showTime = sections.includes("time");
  const showContacts = sections.includes("contacts");

  return (
    <Document
      title={data.project.name}
      author="Rozpočet Stavby"
      subject="Rozpočtová sestava projektu"
      language={locale}
    >
      <Page
        size="A4"
        style={styles.page}
        experimentalPagination
      >
        {showHeader ? (
          <Header project={data.project} locale={locale} labels={data.labels} />
        ) : null}

        {showSummary ? (
          <SummaryKPI
            totals={data.totals}
            currency={currency}
            locale={locale}
            labels={data.labels}
          />
        ) : null}

        {showProperty ? (
          <PropertyMetadata
            project={data.project}
            locale={locale}
            labels={data.labels}
          />
        ) : null}

        {showBudget ? (
          <BudgetTable
            items={data.budgetItems}
            sections={sections}
            currency={currency}
            locale={locale}
            labels={data.labels}
            phaseTranslations={data.phaseTranslations}
          />
        ) : null}

        {showAlerts ? (
          <AlertsSection
            alerts={data.alerts}
            currency={currency}
            locale={locale}
            labels={data.labels}
          />
        ) : null}

        {showProjection ? (
          <ProjectionSection
            totals={data.totals}
            currency={currency}
            locale={locale}
            labels={data.labels}
          />
        ) : null}

        {showPayments ? (
          <PaymentsTable
            payments={data.payments}
            sections={sections}
            currency={currency}
            locale={locale}
            labels={data.labels}
            paymentTypeTranslations={data.paymentTypeTranslations}
          />
        ) : null}

        {showTime ? (
          <TimeEntriesTable
            timeEntries={data.timeEntries}
            sections={sections}
            locale={locale}
            labels={data.labels}
          />
        ) : null}

        {showContacts ? (
          <ContactsTable
            contacts={data.contacts}
            sections={sections}
            locale={locale}
            labels={data.labels}
            contactTypeTranslations={data.contactTypeTranslations}
          />
        ) : null}

        <Footer project={data.project} locale={locale} labels={data.labels} />
      </Page>
    </Document>
  );
}
