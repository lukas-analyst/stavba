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
  PdfOrientationMode,
  PdfReportStyle,
  TableSort,
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
// sortItems — generic comparator for table rows
// ---------------------------------------------------------------------
// Sorts an array of objects by a given field + direction.
// - Strings: locale-aware comparison (case-insensitive, accent-insensitive)
// - Numbers: numeric comparison
// - Dates: timestamp comparison (null dates sort last in asc, first in desc)
// - Booleans: false < true (so completed items sort last in asc)
//
// Returns a NEW array (does not mutate the input).
// =====================================================================

function compareValues(a: unknown, b: unknown): number {
  // Null / undefined handling — nulls sort to the end.
  const aIsNull = a === null || a === undefined;
  const bIsNull = b === null || b === undefined;
  if (aIsNull && bIsNull) return 0;
  if (aIsNull) return 1;
  if (bIsNull) return -1;

  // Numbers
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  // Dates (Date objects or date-like strings)
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  // Strings — locale-aware, case-insensitive, accent-insensitive
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  }

  // Booleans (false < true)
  if (typeof a === "boolean" && typeof b === "boolean") {
    return (a ? 1 : 0) - (b ? 1 : 0);
  }

  // Fallback — string coercion
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
}

export function sortItems<T>(items: T[], sort: TableSort | undefined): T[] {
  if (!sort) return items;
  const { field, direction } = sort;
  const sorted = [...items].sort((a, b) => {
    const aVal = (a as Record<string, unknown>)[field];
    const bVal = (b as Record<string, unknown>)[field];
    const cmp = compareValues(aVal, bVal);
    return direction === "desc" ? -cmp : cmp;
  });
  return sorted;
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
    paddingBottom: 75, // leave room for the fixed footer (bottom: 20 + ~16pt height + margin)
    paddingLeft: 40,
    paddingRight: 40,
    lineHeight: 1.4,
  },

  // ----- Generic section wrapper -----
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Roboto", fontWeight: "bold",
    color: "#333333",
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#cccccc",
    borderBottomStyle: "solid",
  },

  // ----- Header -----
  header: {
    marginBottom: 24,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: "#333333",
    borderBottomStyle: "solid",
  },
  headerName: {
    fontSize: 18,
    fontFamily: "Roboto", fontWeight: "bold",
    color: "#333333",
    marginBottom: 6,
  },
  headerMeta: {
    fontSize: 10,
    color: "#555555",
    marginBottom: 3,
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
    marginBottom: 12,
  },
  kpiRow: {
    flexDirection: "row",
  },
  kpiSubItem: {
    flex: 1,
    paddingRight: 16,
  },
  kpiSubLabel: {
    fontSize: 9,
    color: "#777777",
    marginBottom: 3,
  },
  kpiSubValue: {
    fontSize: 12,
    fontFamily: "Roboto", fontWeight: "bold",
    color: "#333333",
  },

  // ----- Property metadata -----
  metaRow: {
    flexDirection: "row",
    marginBottom: 6,
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
    marginBottom: 12,
  },
  alertGroupTitle: {
    fontSize: 11,
    fontFamily: "Roboto", fontWeight: "bold",
    color: "#333333",
    marginBottom: 4,
  },
  alertItem: {
    fontSize: 9,
    color: "#444444",
    marginBottom: 4,
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
    paddingTop: 8,
    paddingBottom: 8,
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

  // ----- Hierarchy (minimal mode) -----
  // Even in the monochrome minimal report, parent (Položka) rows must
  // be visually distinct from child (Úkol) rows so the user can tell
  // which tasks belong to which item. We achieve this with:
  //   - Parent: bold text + thicker top border + light gray bg
  //   - Child: indented with left padding + "•" prefix + lighter text
  // These styles are used in BOTH minimal and colorful modes (the
  // colorful variants override these via the style selectors below).
  minimalParentRow: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 3,
    paddingRight: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#bbbbbb",
    borderBottomStyle: "solid",
    borderTopWidth: 1,
    borderTopColor: "#999999",
    borderTopStyle: "solid",
  },
  minimalParentCell: {
    fontSize: 9,
    fontFamily: "Roboto",
    fontWeight: "bold",
    color: "#1a1a1a",
    paddingRight: 4,
  },
  minimalChildRow: {
    flexDirection: "row",
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 16,  // indent to show hierarchy under parent
    paddingRight: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eeeeee",
    borderBottomStyle: "solid",
  },
  minimalChildCell: {
    fontSize: 8,
    color: "#555555",
    paddingRight: 4,
  },

  // ----- Colorful mode (Phase 4) -----
  // MD3-inspired accent colors. Used only when reportStyle === "colorful".
  // Minimal mode uses the monochrome styles above.
  //
  // Color mapping (matches the web app's semantic palette):
  //   - Primary brand:    #0052CC (deep blue — header bar)
  //   - Surface tint:     #EEF4FF (very light blue — parent row bg)
  //   - Success/positive: #1A7F37 (green — completed)
  //   - Warning:         #B45309 (amber — pending/over-budget)
  //   - Danger:          #B00020 (red — rejected/overdue)
  //   - Phase tints:      see PHASE_COLORS below
  colorfulHeaderBar: {
    backgroundColor: "#0052CC",
    paddingBottom: 12,
    paddingTop: 12,
    paddingLeft: 16,
    paddingRight: 16,
    marginBottom: 16,
    borderRadius: 4,
  },
  colorfulHeaderName: {
    fontSize: 20,
    fontFamily: "Roboto",
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  colorfulHeaderMeta: {
    fontSize: 10,
    color: "#E0EFFF",
    marginBottom: 2,
  },
  colorfulKpiCard: {
    backgroundColor: "#F0F7FF",
    borderRadius: 6,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 16,
    paddingRight: 16,
    marginBottom: 12,
  },
  colorfulKpiLabel: {
    fontSize: 9,
    color: "#0052CC",
    marginBottom: 4,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  colorfulKpiMain: {
    fontSize: 24,
    fontFamily: "Roboto",
    fontWeight: "bold",
    color: "#0052CC",
    marginBottom: 8,
  },
  colorfulKpiSubValue: {
    fontSize: 12,
    fontFamily: "Roboto",
    fontWeight: "bold",
    color: "#0052CC",
  },
  colorfulKpiSubLabel: {
    fontSize: 8,
    color: "#4A6FA5",
    marginBottom: 2,
  },
  colorfulSectionTitle: {
    fontSize: 13,
    fontFamily: "Roboto",
    fontWeight: "bold",
    color: "#0052CC",
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 2,
    borderBottomColor: "#0052CC",
    borderBottomStyle: "solid",
  },
  colorfulTableHeader: {
    flexDirection: "row",
    backgroundColor: "#0052CC",
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 3,
    paddingRight: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#003399",
    borderBottomStyle: "solid",
    borderRadius: 3,
  },
  colorfulTableHeaderText: {
    fontSize: 8,
    fontFamily: "Roboto",
    fontWeight: "bold",
    color: "#FFFFFF",
    paddingRight: 4,
  },
  // Parent row (top-level Položka) — tinted background to group children.
  colorfulParentRow: {
    flexDirection: "row",
    backgroundColor: "#EEF4FF",
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 3,
    paddingRight: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#C5D9F5",
    borderBottomStyle: "solid",
  },
  colorfulParentCell: {
    fontSize: 9,
    fontFamily: "Roboto",
    fontWeight: "bold",
    color: "#003399",
    paddingRight: 4,
  },
  // Child row (task) — indented, lighter background, smaller text.
  colorfulChildRow: {
    flexDirection: "row",
    backgroundColor: "#F7FAFF",
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 3,
    paddingRight: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E0E8F5",
    borderBottomStyle: "solid",
  },
  colorfulChildCell: {
    fontSize: 8,
    color: "#444444",
    paddingRight: 4,
  },
  // Status badges (colorful mode replaces text status with colored dots).
  colorfulStatusOk: {
    fontSize: 9,
    color: "#1A7F37",
    fontWeight: "bold",
  },
  colorfulStatusOver: {
    fontSize: 9,
    color: "#B00020",
    fontWeight: "bold",
  },
  colorfulStatusPending: {
    fontSize: 9,
    color: "#B45309",
  },
  colorfulAlertOverdue: {
    fontSize: 9,
    color: "#B00020",
    marginBottom: 2,
  },
  colorfulAlertUpcoming: {
    fontSize: 9,
    color: "#B45309",
    marginBottom: 2,
  },
  colorfulAlertOverBudget: {
    fontSize: 9,
    color: "#B00020",
    marginBottom: 2,
  },
  // Alert group title — colored badge for each alert type.
  colorfulAlertGroupTitle: {
    fontSize: 11,
    fontFamily: "Roboto",
    fontWeight: "bold",
    color: "#0052CC",
    marginBottom: 4,
  },
  colorfulAlertItem: {
    fontSize: 9,
    color: "#444444",
    marginBottom: 4,
    paddingLeft: 8,
  },
  colorfulAlertEmpty: {
    fontSize: 9,
    color: "#1A7F37",
    fontStyle: "italic",
  },
  // Property metadata — label/value with blue accent.
  colorfulMetaRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  colorfulMetaLabel: {
    fontSize: 9,
    color: "#4A6FA5",
    width: 130,
  },
  colorfulMetaValue: {
    fontSize: 9,
    flex: 1,
    color: "#003399",
    fontWeight: "bold",
  },
  // Projection — colored values for positive/negative overrun.
  colorfulProjectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#C5D9F5",
    borderBottomStyle: "solid",
  },
  colorfulProjectionLabel: {
    fontSize: 10,
    color: "#003399",
    fontWeight: "bold",
  },
  colorfulProjectionValue: {
    fontSize: 12,
    fontFamily: "Roboto",
    fontWeight: "bold",
    color: "#0052CC",
  },
  // Tables (Payments, Time, Contacts) — same colorful style as BudgetTable.
  // Reuses colorfulTableHeader + colorfulTableHeaderText for the header row.
  // Regular rows get a subtle tinted background.
  colorfulTableRow: {
    flexDirection: "row",
    backgroundColor: "#F7FAFF",
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 3,
    paddingRight: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E0E8F5",
    borderBottomStyle: "solid",
  },
  colorfulTableCell: {
    fontSize: 9,
    color: "#333333",
    paddingRight: 4,
  },
  // Total row in tables — bold with tinted background.
  colorfulTotalRow: {
    flexDirection: "row",
    backgroundColor: "#EEF4FF",
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 3,
    paddingRight: 3,
    borderTopWidth: 1,
    borderTopColor: "#0052CC",
    borderTopStyle: "solid",
  },
  colorfulTotalCell: {
    fontSize: 9,
    fontFamily: "Roboto",
    fontWeight: "bold",
    color: "#003399",
    paddingRight: 4,
  },
  colorfulProjectionValuePositive: {
    color: "#B00020",
  },
  colorfulProjectionValueNegative: {
    color: "#1A7F37",
  },
});

// =====================================================================
// Phase colors (colorful mode only)
// ---------------------------------------------------------------------
// Maps raw DB phase values to tint colors. Used to color phase badges
// in the BudgetTable when reportStyle === "colorful".
// =====================================================================
const PHASE_COLORS: Record<string, string> = {
  "Příprava": "#6B7280",      // gray
  "Demolice": "#DC2626",      // red
  "Hrubá stavba": "#D97706",  // amber
  "Zabydlování": "#059669",   // emerald
  "Do budoucna": "#7C3AED",  // violet
  "Neurčeno": "#6B7280",      // gray
};

// =====================================================================
// Header — project name, address, description, generated/startDate/endDate
// =====================================================================

export function Header({
  project,
  locale,
  labels,
  reportStyle = "minimal",
}: {
  project: PdfReportData["project"];
  locale: string;
  labels: PdfReportData["labels"];
  reportStyle?: PdfReportStyle;
}) {
  const generatedAt = formatDate(new Date(), locale);
  const hasStartDate = project.startDate != null;
  const hasEndDate = project.endDate != null;
  const isColorful = reportStyle === "colorful";

  const headerStyle = isColorful ? styles.colorfulHeaderBar : styles.header;
  const nameStyle = isColorful ? styles.colorfulHeaderName : styles.headerName;
  const metaStyle = isColorful ? styles.colorfulHeaderMeta : styles.headerMeta;

  return (
    <View style={headerStyle} wrap={false}>
      <Text style={nameStyle}>{project.name}</Text>
      {project.address ? (
        <Text style={metaStyle}>{project.address}</Text>
      ) : null}
      {project.fullAddress ? (
        <Text style={metaStyle}>{project.fullAddress}</Text>
      ) : null}
      {project.description ? (
        <Text style={metaStyle}>{project.description}</Text>
      ) : null}
      <Text style={metaStyle}>{labels.generated}: {generatedAt}</Text>
      {hasStartDate || hasEndDate ? (
        <Text style={metaStyle}>
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
  reportStyle = "minimal",
}: {
  totals: PdfReportData["totals"];
  currency: string;
  locale: string;
  labels: PdfReportData["labels"];
  reportStyle?: PdfReportStyle;
}) {
  const isColorful = reportStyle === "colorful";

  const wrapperStyle = isColorful ? styles.colorfulKpiCard : styles.section;
  const titleStyle = isColorful ? styles.colorfulSectionTitle : styles.sectionTitle;
  const mainStyle = isColorful ? styles.colorfulKpiMain : styles.kpiMain;
  const subLabelStyle = isColorful ? styles.colorfulKpiSubLabel : styles.kpiSubLabel;
  const subValueStyle = isColorful ? styles.colorfulKpiSubValue : styles.kpiSubValue;

  return (
    <View style={wrapperStyle} wrap={false}>
      <Text style={titleStyle}>{labels.summary}</Text>
      <Text style={mainStyle}>
        {formatCurrency(totals.projectedFinal, currency, locale)}
      </Text>
      <View style={styles.kpiRow}>
        <View style={styles.kpiSubItem}>
          <Text style={subLabelStyle}>{labels.plan}</Text>
          <Text style={subValueStyle}>
            {formatCurrency(totals.planTotal, currency, locale)}
          </Text>
        </View>
        <View style={styles.kpiSubItem}>
          <Text style={subLabelStyle}>{labels.actual}</Text>
          <Text style={subValueStyle}>
            {formatCurrency(totals.actualTotal, currency, locale)}
          </Text>
        </View>
        <View style={styles.kpiSubItem}>
          <Text style={subLabelStyle}>{labels.remaining}</Text>
          <Text style={subValueStyle}>
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
  reportStyle = "minimal",
}: {
  project: PdfReportData["project"];
  locale: string;
  labels: PdfReportData["labels"];
  reportStyle?: PdfReportStyle;
}) {
  const isColorful = reportStyle === "colorful";
  // Build a list of [label, value] pairs for all non-null fields.
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

  const titleStyle = isColorful ? styles.colorfulSectionTitle : styles.sectionTitle;
  const rowStyle = isColorful ? styles.colorfulMetaRow : styles.metaRow;
  const labelStyle = isColorful ? styles.colorfulMetaLabel : styles.metaLabel;
  const valueStyle = isColorful ? styles.colorfulMetaValue : styles.metaValue;

  return (
    <View style={styles.section} wrap={false}>
      <Text style={titleStyle}>{labels.propertyInfo}</Text>
      {rows.map((row, idx) => (
        <View key={idx} style={rowStyle}>
          <Text style={labelStyle}>{row.label}</Text>
          <Text style={valueStyle}>{row.value}</Text>
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

// =====================================================================
// BudgetTable — table of all budget items with hierarchy.
//
// Phase 4: items are grouped into a hierarchy:
//   - Top-level items (parentId = null) = "Položky" (categories)
//   - Child items (parentId set) = "Úkoly" (tasks) under their parent
//
// In the table, parents are rendered as bold header rows with a tinted
// background, and children are indented underneath with a lighter style.
// Items without a parent are rendered flat (no hierarchy).
//
// `reportStyle` controls the visual treatment:
//   - "minimal": monochrome (existing styles, for banks/mortgages)
//   - "colorful": MD3-accented (colored header, tinted rows, status colors)
// =====================================================================

export function BudgetTable({
  items,
  sections,
  currency,
  locale,
  labels,
  phaseTranslations,
  reportStyle = "minimal",
  sort,
}: {
  items: PdfBudgetItem[];
  sections: PdfSectionId[];
  currency: string;
  locale: string;
  labels: PdfReportData["labels"];
  phaseTranslations: PdfReportData["phaseTranslations"];
  reportStyle?: PdfReportStyle;
  sort?: TableSort;
}) {
  const showPlanCost = sections.includes("plan_cost");
  const showActualCost = sections.includes("actual_cost");
  const showStatus = sections.includes("status");
  const showDates = sections.includes("dates");
  const showPhase = sections.includes("phase");
  const showSupplier = sections.includes("supplier");
  const isColorful = reportStyle === "colorful";

  // Effective plan cost (in target currency) for display.
  const planCostOf = (item: PdfBudgetItem) =>
    item.planCostConverted ?? item.planCost;

  // Translate a raw DB phase value to the localized display name.
  const translatePhase = (phase: string) =>
    phaseTranslations[phase] || phase;

  // Get the phase color for colorful mode (falls back to gray).
  const phaseColor = (phase: string) =>
    PHASE_COLORS[phase] || PHASE_COLORS["Neurčeno"] || "#6B7280";

  // ─── Build hierarchy ───────────────────────────────────────────
  // Split items into parents (parentId = null) and children (parentId set).
  // Then group children by their parentId for O(1) lookup.
  //
  // Sorting (Phase 4+): when `sort` is provided, parents are sorted by
  // the chosen field, and children within each parent are sorted by the
  // same field. This preserves the parent→child grouping while letting
  // the user reorder rows. When sort is absent, items keep their
  // original sortOrder (as fetched from the DB).
  const parentsRaw = items.filter((item) => !item.parentId);
  const childrenRaw = items.filter((item) => item.parentId);

  // Sort parents and children independently.
  const parents = sort ? sortItems(parentsRaw, sort) : parentsRaw;
  const childrenSorted = sort ? sortItems(childrenRaw, sort) : childrenRaw;

  const childrenByParentId = new Map<string, PdfBudgetItem[]>();
  for (const item of childrenSorted) {
    if (item.parentId) {
      const existing = childrenByParentId.get(item.parentId) ?? [];
      existing.push(item);
      childrenByParentId.set(item.parentId, existing);
    }
  }

  // Style selectors based on reportStyle.
  // In BOTH modes, parents and children get distinct styles so the
  // hierarchy is always visible — even in the monochrome minimal report.
  const sectionTitleStyle = isColorful ? styles.colorfulSectionTitle : styles.sectionTitle;
  const tableHeaderStyle = isColorful ? styles.colorfulTableHeader : styles.tableHeader;
  const tableHeaderTextStyle = isColorful
    ? styles.colorfulTableHeaderText
    : styles.tableHeaderText;
  const parentRowStyle = isColorful ? styles.colorfulParentRow : styles.minimalParentRow;
  const parentCellStyle = isColorful ? styles.colorfulParentCell : styles.minimalParentCell;
  const childRowStyle = isColorful ? styles.colorfulChildRow : styles.minimalChildRow;
  const childCellStyle = isColorful ? styles.colorfulChildCell : styles.minimalChildCell;

  // Render a single row (parent or child) with all optional columns.
  const renderRow = (item: PdfBudgetItem, isParent: boolean) => {
    const rowStyle = isParent ? parentRowStyle : childRowStyle;
    const cellStyle = isParent ? parentCellStyle : childCellStyle;

    return (
      <View key={item.id} style={rowStyle} wrap={false}>
        <Text style={[cellStyle, styles.colCategory]}>
          {isParent ? item.category : `• ${item.subcategory || item.category}`}
        </Text>
        <Text style={[cellStyle, styles.colName]}>
          {isParent
            ? (item.subcategory || item.category)
            : (item.element || item.subcategory || item.category)}
        </Text>
        {showPhase ? (
          <Text style={[cellStyle, styles.colPhase]}>
            {isColorful ? (
              <Text style={{ color: phaseColor(item.phase) }}>
                {translatePhase(item.phase)}
              </Text>
            ) : (
              translatePhase(item.phase)
            )}
          </Text>
        ) : null}
        {showPlanCost ? (
          <Text style={[cellStyle, styles.colCost]}>
            {formatCurrency(planCostOf(item), currency, locale)}
          </Text>
        ) : null}
        {showActualCost ? (
          <Text style={[cellStyle, styles.colCost]}>
            {formatCurrency(item.actualCost, currency, locale)}
          </Text>
        ) : null}
        {showStatus ? (
          <Text style={[cellStyle, styles.colStatus]}>
            {getStatusIcon(item)}
          </Text>
        ) : null}
        {showDates ? (
          <>
            <Text style={[cellStyle, styles.colDate]}>
              {formatDate(item.dateFrom, locale)}
            </Text>
            <Text style={[cellStyle, styles.colDate]}>
              {formatDate(item.dateTo, locale)}
            </Text>
          </>
        ) : null}
        {showSupplier ? (
          <Text style={[cellStyle, { flex: 1.2 }]}>
            {item.contactName || "-"}
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.section}>
      <Text style={sectionTitleStyle}>
        {labels.budgetItems} ({items.length}{" "}
        {items.length === 1 ? labels.item : labels.items})
      </Text>

      <View style={tableHeaderStyle} fixed>
        <Text style={[tableHeaderTextStyle, styles.colCategory]}>
          {labels.category}
        </Text>
        <Text style={[tableHeaderTextStyle, styles.colName]}>{labels.name}</Text>
        {showPhase ? (
          <Text style={[tableHeaderTextStyle, styles.colPhase]}>{labels.phase}</Text>
        ) : null}
        {showPlanCost ? (
          <Text style={[tableHeaderTextStyle, styles.colCost]}>{labels.planCost}</Text>
        ) : null}
        {showActualCost ? (
          <Text style={[tableHeaderTextStyle, styles.colCost]}>{labels.actualCost}</Text>
        ) : null}
        {showStatus ? (
          <Text style={[tableHeaderTextStyle, styles.colStatus]}>{labels.status}</Text>
        ) : null}
        {showDates ? (
          <>
            <Text style={[tableHeaderTextStyle, styles.colDate]}>{labels.from}</Text>
            <Text style={[tableHeaderTextStyle, styles.colDate]}>{labels.to}</Text>
          </>
        ) : null}
        {showSupplier ? (
          <Text style={[tableHeaderTextStyle, { flex: 1.2 }]}>
            {labels.supplier}
          </Text>
        ) : null}
      </View>

      {items.length === 0 ? (
        <Text style={styles.tableEmpty}>{labels.noItems}</Text>
      ) : (
        // Render hierarchy: parents with their children indented underneath.
        parents.map((parent) => {
          const children = childrenByParentId.get(parent.id) ?? [];
          return (
            <View key={parent.id}>
              {renderRow(parent, true)}
              {children.map((child) => renderRow(child, false))}
            </View>
          );
        })
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
  style,
}: {
  alert: PdfAlertItem;
  currency: string;
  locale: string;
  style?: object;
}) {
  const name = alert.subcategory || alert.category;
  return (
    <Text style={style ?? styles.alertItem}>
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
  reportStyle = "minimal",
}: {
  alerts: PdfReportData["alerts"];
  currency: string;
  locale: string;
  labels: PdfReportData["labels"];
  reportStyle?: PdfReportStyle;
}) {
  const isColorful = reportStyle === "colorful";
  const total =
    alerts.overdue.length +
    alerts.upcoming.length +
    alerts.overBudget.length;

  const titleStyle = isColorful ? styles.colorfulSectionTitle : styles.sectionTitle;
  const groupTitleStyle = isColorful ? styles.colorfulAlertGroupTitle : styles.alertGroupTitle;
  const itemStyle = isColorful ? styles.colorfulAlertItem : styles.alertItem;
  const emptyStyle = isColorful ? styles.colorfulAlertEmpty : styles.alertEmpty;

  if (total === 0) {
    return (
      <View style={styles.section}>
        <Text style={titleStyle}>{labels.alerts}</Text>
        <Text style={emptyStyle}>{labels.noAlerts}</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={titleStyle}>{labels.alerts}</Text>

      {alerts.overdue.length > 0 ? (
        <View style={styles.alertGroup}>
          <Text style={groupTitleStyle}>
            {labels.overdue} ({alerts.overdue.length})
          </Text>
          {alerts.overdue.map((a, idx) => (
            <AlertRow
              key={`overdue-${idx}`}
              alert={a}
              currency={currency}
              locale={locale}
              style={itemStyle}
            />
          ))}
        </View>
      ) : null}

      {alerts.upcoming.length > 0 ? (
        <View style={styles.alertGroup}>
          <Text style={groupTitleStyle}>
            {labels.upcoming} ({alerts.upcoming.length})
          </Text>
          {alerts.upcoming.map((a, idx) => (
            <AlertRow
              key={`upcoming-${idx}`}
              alert={a}
              currency={currency}
              locale={locale}
              style={itemStyle}
            />
          ))}
        </View>
      ) : null}

      {alerts.overBudget.length > 0 ? (
        <View style={styles.alertGroup}>
          <Text style={groupTitleStyle}>
            {labels.overBudget} ({alerts.overBudget.length})
          </Text>
          {alerts.overBudget.map((a, idx) => (
            <AlertRow
              key={`overbudget-${idx}`}
              alert={a}
              currency={currency}
              locale={locale}
              style={itemStyle}
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
  reportStyle = "minimal",
}: {
  totals: PdfReportData["totals"];
  currency: string;
  locale: string;
  labels: PdfReportData["labels"];
  reportStyle?: PdfReportStyle;
}) {
  const isColorful = reportStyle === "colorful";
  const isOver = totals.projectedOverrun > 0;
  const overrunLabel = isOver
    ? labels.estimatedOverrun
    : labels.expectedSavings;

  // Style selectors based on reportStyle.
  const titleStyle = isColorful ? styles.colorfulSectionTitle : styles.sectionTitle;
  const rowStyle = isColorful ? styles.colorfulProjectionRow : styles.projectionRow;
  const labelStyle = isColorful ? styles.colorfulProjectionLabel : styles.projectionLabel;
  const valueStyle = isColorful ? styles.colorfulProjectionValue : styles.projectionValue;
  const positiveStyle = isColorful
    ? styles.colorfulProjectionValuePositive
    : styles.projectionValuePositive;
  const negativeStyle = isColorful
    ? styles.colorfulProjectionValueNegative
    : styles.projectionValueNegative;
  const overrunValueStyle = isOver
    ? [valueStyle, positiveStyle]
    : [valueStyle, negativeStyle];

  const overrunDisplay = `${isOver ? "+" : ""}${formatCurrency(
    totals.projectedOverrun,
    currency,
    locale,
  )}`;

  return (
    <View style={styles.section} wrap={false}>
      <Text style={titleStyle}>{labels.projection}</Text>
      <View style={rowStyle}>
        <Text style={labelStyle}>{labels.plannedBudget}</Text>
        <Text style={valueStyle}>
          {formatCurrency(totals.planTotal, currency, locale)}
        </Text>
      </View>
      <View style={rowStyle}>
        <Text style={labelStyle}>{labels.expectedTotalCosts}</Text>
        <Text style={valueStyle}>
          {formatCurrency(totals.projectedFinal, currency, locale)}
        </Text>
      </View>
      <View style={rowStyle}>
        <Text style={labelStyle}>{overrunLabel}</Text>
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
  sort,
  reportStyle = "minimal",
}: {
  payments: PdfReportData["payments"];
  sections: PdfSectionId[];
  currency: string;
  locale: string;
  labels: PdfReportData["labels"];
  paymentTypeTranslations: Record<string, string>;
  sort?: TableSort;
  reportStyle?: PdfReportStyle;
}) {
  const showPaymentType = sections.includes("payment_type");
  const showInvoice = sections.includes("invoice");
  const isColorful = reportStyle === "colorful";

  // Style selectors based on reportStyle.
  const titleStyle = isColorful ? styles.colorfulSectionTitle : styles.sectionTitle;
  const headerStyle = isColorful ? styles.colorfulTableHeader : styles.tableHeader;
  const headerTextStyle = isColorful ? styles.colorfulTableHeaderText : styles.tableHeaderText;
  const rowStyle = isColorful ? styles.colorfulTableRow : styles.tableRow;
  const cellStyle = isColorful ? styles.colorfulTableCell : styles.tableCellText;
  const totalRowStyle = isColorful ? styles.colorfulTotalRow : styles.tableRow;
  const totalCellStyle = isColorful ? styles.colorfulTotalCell : styles.tableCellText;

  // Apply user-selected sort (default = date desc, as fetched from DB).
  const sortedPayments = sort ? sortItems(payments, sort) : payments;

  if (!sortedPayments || sortedPayments.length === 0) {
    return (
      <View style={styles.section} wrap={false}>
        <Text style={titleStyle}>{labels.payments}</Text>
        <Text style={styles.tableEmpty}>{labels.noPayments}</Text>
      </View>
    );
  }

  // Calculate total for summary row
  const totalAmount = sortedPayments.reduce(
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
      <Text style={titleStyle}>
        {labels.payments} ({sortedPayments.length} {labels.paymentsCount})
      </Text>

      <View style={headerStyle} fixed>
        <Text style={[headerTextStyle, colDate]}>
          {labels.date}
        </Text>
        <Text style={[headerTextStyle, colCategory]}>
          {labels.category}
        </Text>
        <Text style={[headerTextStyle, colVendor]}>
          {labels.vendor}
        </Text>
        <Text style={[headerTextStyle, colAmount]}>
          {labels.amount}
        </Text>
        {showPaymentType ? (
          <Text style={[headerTextStyle, colType]}>
            {labels.type}
          </Text>
        ) : null}
        {showInvoice ? (
          <Text style={[headerTextStyle, colInvoice]}>
            {labels.invoice}
          </Text>
        ) : null}
      </View>

      {sortedPayments.map((payment) => {
        const itemLabel = [
          payment.budgetItemCategory,
          payment.budgetItemSubcategory,
        ]
          .filter(Boolean)
          .join(" / ");
        const vendor = payment.vendor || payment.contactName || "";
        return (
          <View key={payment.id} style={rowStyle} wrap={false}>
            <Text style={[cellStyle, colDate]}>
              {formatDate(payment.date, locale)}
            </Text>
            <Text style={[cellStyle, colCategory]}>
              {itemLabel || "-"}
            </Text>
            <Text style={[cellStyle, colVendor]}>
              {vendor || "-"}
            </Text>
            <Text style={[cellStyle, colAmount]}>
              {formatCurrency(payment.amountConverted, currency, locale)}
            </Text>
            {showPaymentType ? (
              <Text style={[cellStyle, colType]}>
                {paymentTypeTranslations[payment.type] || payment.type || "-"}
              </Text>
            ) : null}
            {showInvoice ? (
              <Text style={[cellStyle, colInvoice]}>
                {payment.invoiceNumber || "-"}
              </Text>
            ) : null}
          </View>
        );
      })}

      {/* Total row */}
      <View
        style={[
          totalRowStyle,
          {
            borderTopWidth: 1,
            borderTopColor: isColorful ? "#0052CC" : "#cccccc",
            borderTopStyle: "solid",
            marginTop: 2,
          },
        ]}
        wrap={false}
      >
        <Text style={[totalCellStyle, colDate]}>
          {labels.totalPayments}:
        </Text>
        <Text style={[totalCellStyle, colCategory]}> </Text>
        <Text style={[totalCellStyle, colVendor]}> </Text>
        <Text
          style={[
            totalCellStyle,
            colAmount,
            { fontFamily: "Roboto", fontWeight: "bold" },
          ]}
        >
          {formatCurrency(totalAmount, currency, locale)}
        </Text>
        {showPaymentType ? (
          <Text style={[totalCellStyle, colType]}> </Text>
        ) : null}
        {showInvoice ? (
          <Text style={[totalCellStyle, colInvoice]}> </Text>
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
  sort,
  reportStyle = "minimal",
}: {
  timeEntries: PdfReportData["timeEntries"];
  sections: PdfSectionId[];
  locale: string;
  labels: PdfReportData["labels"];
  sort?: TableSort;
  reportStyle?: PdfReportStyle;
}) {
  const showWorker = sections.includes("worker");
  const showHours = sections.includes("hours");
  const isColorful = reportStyle === "colorful";

  // Style selectors based on reportStyle.
  const titleStyle = isColorful ? styles.colorfulSectionTitle : styles.sectionTitle;
  const headerStyle = isColorful ? styles.colorfulTableHeader : styles.tableHeader;
  const headerTextStyle = isColorful ? styles.colorfulTableHeaderText : styles.tableHeaderText;
  const rowStyle = isColorful ? styles.colorfulTableRow : styles.tableRow;
  const cellStyle = isColorful ? styles.colorfulTableCell : styles.tableCellText;
  const totalRowStyle = isColorful ? styles.colorfulTotalRow : styles.tableRow;
  const totalCellStyle = isColorful ? styles.colorfulTotalCell : styles.tableCellText;

  // Apply user-selected sort (default = date desc, as fetched from DB).
  const sortedTimeEntries = sort ? sortItems(timeEntries, sort) : timeEntries;

  if (!sortedTimeEntries || sortedTimeEntries.length === 0) {
    return (
      <View style={styles.section} wrap={false}>
        <Text style={titleStyle}>{labels.timeEntries}</Text>
        <Text style={styles.tableEmpty}>{labels.noTimeEntries}</Text>
      </View>
    );
  }

  const totalHours = sortedTimeEntries.reduce(
    (sum, te) => sum + (te.hours * (te.workerCount || 1)),
    0,
  );

  const colDate = { flex: 1 };
  const colItem = { flex: 1.5 };
  const colWorker = { flex: 1.5 };
  const colHours = { flex: 0.8, textAlign: "right" as const };

  return (
    <View style={styles.section}>
      <Text style={titleStyle}>
        {labels.timeEntries} ({sortedTimeEntries.length} {labels.timeEntriesCount})
      </Text>

      <View style={headerStyle} fixed>
        <Text style={[headerTextStyle, colDate]}>
          {labels.date}
        </Text>
        <Text style={[headerTextStyle, colItem]}>
          {labels.category}
        </Text>
        {showWorker ? (
          <Text style={[headerTextStyle, colWorker]}>
            {labels.worker}
          </Text>
        ) : null}
        {showHours ? (
          <Text style={[headerTextStyle, colHours]}>
            {labels.hours}
          </Text>
        ) : null}
      </View>

      {sortedTimeEntries.map((te) => {
        const itemLabel = [
          te.budgetItemCategory,
          te.budgetItemSubcategory,
        ]
          .filter(Boolean)
          .join(" / ");
        return (
          <View key={te.id} style={rowStyle} wrap={false}>
            <Text style={[cellStyle, colDate]}>
              {formatDate(te.date, locale)}
            </Text>
            <Text style={[cellStyle, colItem]}>
              {itemLabel || "-"}
            </Text>
            {showWorker ? (
              <Text style={[cellStyle, colWorker]}>
                {te.workerName || "-"}
              </Text>
            ) : null}
            {showHours ? (
              <Text style={[cellStyle, colHours]}>
                {te.hours} h
              </Text>
            ) : null}
          </View>
        );
      })}

      {/* Total row */}
      <View
        style={[
          totalRowStyle,
          {
            borderTopWidth: 1,
            borderTopColor: isColorful ? "#0052CC" : "#cccccc",
            borderTopStyle: "solid",
            marginTop: 2,
          },
        ]}
        wrap={false}
      >
        <Text style={[totalCellStyle, colDate]}>
          {labels.totalHours}:
        </Text>
        <Text style={[totalCellStyle, colItem]}> </Text>
        {showWorker ? (
          <Text style={[totalCellStyle, colWorker]}> </Text>
        ) : null}
        {showHours ? (
          <Text
            style={[
              totalCellStyle,
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
  sort,
  reportStyle = "minimal",
}: {
  contacts: PdfContact[];
  sections: PdfSectionId[];
  locale: string;
  labels: PdfReportData["labels"];
  contactTypeTranslations: Record<string, string>;
  sort?: TableSort;
  reportStyle?: PdfReportStyle;
}) {
  const showType = sections.includes("contact_type");
  const showPhone = sections.includes("contact_phone");
  const showEmail = sections.includes("contact_email");
  const showIco = sections.includes("contact_ico");
  const showNotes = sections.includes("contact_notes");
  const isColorful = reportStyle === "colorful";

  // Style selectors based on reportStyle.
  const titleStyle = isColorful ? styles.colorfulSectionTitle : styles.sectionTitle;
  const headerStyle = isColorful ? styles.colorfulTableHeader : styles.tableHeader;
  const headerTextStyle = isColorful ? styles.colorfulTableHeaderText : styles.tableHeaderText;
  const rowStyle = isColorful ? styles.colorfulTableRow : styles.tableRow;
  const cellStyle = isColorful ? styles.colorfulTableCell : styles.tableCellText;
  const totalRowStyle = isColorful ? styles.colorfulTotalRow : styles.tableRow;
  const totalCellStyle = isColorful ? styles.colorfulTotalCell : styles.tableCellText;

  // Apply user-selected sort (default = name asc, as fetched from DB).
  const sortedContacts = sort ? sortItems(contacts, sort) : contacts;

  if (!sortedContacts || sortedContacts.length === 0) {
    return (
      <View style={styles.section} wrap={false}>
        <Text style={titleStyle}>{labels.contacts}</Text>
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
      <Text style={titleStyle}>
        {labels.contacts} ({sortedContacts.length} {labels.contactsCount})
      </Text>

      <View style={headerStyle} fixed>
        <Text style={[headerTextStyle, colName]}>
          {labels.contactName}
        </Text>
        {showType ? (
          <Text style={[headerTextStyle, colType]}>
            {labels.contactType}
          </Text>
        ) : null}
        <Text style={[headerTextStyle, colRole]}>
          {labels.role}
        </Text>
        {showPhone ? (
          <Text style={[headerTextStyle, colPhone]}>
            {labels.phone}
          </Text>
        ) : null}
        {showEmail ? (
          <Text style={[headerTextStyle, colEmail]}>
            {labels.email}
          </Text>
        ) : null}
        {showIco ? (
          <Text style={[headerTextStyle, colIco]}>
            {labels.ico}
          </Text>
        ) : null}
        <Text style={[headerTextStyle, colCount]}>
          {labels.paymentCount}
        </Text>
        <Text style={[headerTextStyle, colCount]}>
          {labels.timeEntryCount}
        </Text>
        {showNotes ? (
          <Text style={[headerTextStyle, colNotes]}>
            {labels.contactNotes}
          </Text>
        ) : null}
      </View>

      {sortedContacts.map((contact) => {
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
          <View key={contact.id} style={rowStyle} wrap={false}>
            <Text style={[cellStyle, colName]}>
              {nameLine}
              {companyLine ? `\n${companyLine}` : ""}
              {ratingLine ? `\n${ratingLine}` : ""}
            </Text>
            {showType ? (
              <Text style={[cellStyle, colType]}>
                {translateType(contact.type)}
              </Text>
            ) : null}
            <Text style={[cellStyle, colRole]}>
              {contact.role || "-"}
            </Text>
            {showPhone ? (
              <Text style={[cellStyle, colPhone]}>
                {contact.phone || "-"}
              </Text>
            ) : null}
            {showEmail ? (
              <Text style={[cellStyle, colEmail]}>
                {contact.email || "-"}
              </Text>
            ) : null}
            {showIco ? (
              <Text style={[cellStyle, colIco]}>
                {icoDicText}
              </Text>
            ) : null}
            <Text style={[cellStyle, colCount]}>
              {String(contact.paymentCount)}
            </Text>
            <Text style={[cellStyle, colCount]}>
              {String(contact.timeEntryCount)}
            </Text>
            {showNotes ? (
              <Text style={[cellStyle, colNotes]}>
                {contact.notes || "-"}
              </Text>
            ) : null}
          </View>
        );
      })}

      {/* Total row */}
      <View
        style={[
          totalRowStyle,
          {
            borderTopWidth: 1,
            borderTopColor: isColorful ? "#0052CC" : "#cccccc",
            borderTopStyle: "solid",
            marginTop: 2,
          },
        ]}
        wrap={false}
      >
        <Text style={[totalCellStyle, colName]}>
          {labels.totalContacts}:
        </Text>
        {showType ? (
          <Text style={[totalCellStyle, colType]}> </Text>
        ) : null}
        <Text style={[totalCellStyle, colRole]}> </Text>
        {showPhone ? (
          <Text style={[totalCellStyle, colPhone]}> </Text>
        ) : null}
        {showEmail ? (
          <Text style={[totalCellStyle, colEmail]}> </Text>
        ) : null}
        {showIco ? (
          <Text style={[totalCellStyle, colIco]}> </Text>
        ) : null}
        <Text
          style={[
            totalCellStyle,
            colCount,
            { fontFamily: "Roboto", fontWeight: "bold" },
          ]}
        >
          {String(sortedContacts.reduce((s, c) => s + c.paymentCount, 0))}
        </Text>
        <Text
          style={[
            totalCellStyle,
            colCount,
            { fontFamily: "Roboto", fontWeight: "bold" },
          ]}
        >
          {String(sortedContacts.reduce((s, c) => s + c.timeEntryCount, 0))}
        </Text>
        {showNotes ? (
          <Text style={[totalCellStyle, colNotes]}> </Text>
        ) : null}
      </View>
    </View>
  );
}

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

// IDs of "overview" sections that share a single page.
const OVERVIEW_SECTION_IDS: PdfSectionId[] = [
  "header",
  "summary",
  "property",
  "alerts",
  "projection",
];

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
  const { locale, sections, currency, orientationMode, sectionOrientations } = options;

  // Helper: resolve the orientation for a given section based on user prefs.
  const orient = (sectionId: PdfSectionId): "portrait" | "landscape" =>
    resolveOrientation(sectionId, sections, orientationMode, sectionOrientations);

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
          style={styles.page}
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

          <Footer project={data.project} locale={locale} labels={data.labels} />
        </Page>
      ) : null}

      {/* ─── Table sections — each on its own page ─────────────────── */}

      {/* Budget items table */}
      {sections.includes("budget_items") ? (
        <Page size="A4" orientation={orient("budget_items")} style={styles.page} experimentalPagination>
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
          <Footer project={data.project} locale={locale} labels={data.labels} />
        </Page>
      ) : null}

      {/* Payments table */}
      {sections.includes("payments") ? (
        <Page size="A4" orientation={orient("payments")} style={styles.page} experimentalPagination>
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
          <Footer project={data.project} locale={locale} labels={data.labels} />
        </Page>
      ) : null}

      {/* Time entries table */}
      {sections.includes("time") ? (
        <Page size="A4" orientation={orient("time")} style={styles.page} experimentalPagination>
          <TimeEntriesTable
            timeEntries={data.timeEntries}
            sections={sections}
            locale={locale}
            labels={data.labels}
            sort={options.tableSorts?.time}
            reportStyle={options.reportStyle}
          />
          <Footer project={data.project} locale={locale} labels={data.labels} />
        </Page>
      ) : null}

      {/* Contacts table */}
      {sections.includes("contacts") ? (
        <Page size="A4" orientation={orient("contacts")} style={styles.page} experimentalPagination>
          <ContactsTable
            contacts={data.contacts}
            sections={sections}
            locale={locale}
            labels={data.labels}
            contactTypeTranslations={data.contactTypeTranslations}
            sort={options.tableSorts?.contacts}
            reportStyle={options.reportStyle}
          />
          <Footer project={data.project} locale={locale} labels={data.labels} />
        </Page>
      ) : null}
    </Document>
  );
}
