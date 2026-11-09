// =====================================================================
// PDF Styles + Font Registration
// ---------------------------------------------------------------------
// Shared stylesheet for all PDF components. Extracted from the
// original monolithic pdf-components.tsx for maintainability.
//
// A4 page = 595.28 × 841.89 points. With 40pt margins on all sides,
// the content area is 515.28 × 761.89 points.
//
// Color palette (minimal mode):
//   - Primary text:   #333333 (dark gray)
//   - Muted text:    #555555 / #777777
//   - Borders:        #cccccc (light gray) / #eeeeee (very light)
//   - Header bg:     #f5f5f5
//   - Positive:      #1a7f37 (green)
//   - Negative:       #b00020 (red)
//
// Color palette (colorful mode — MD3-inspired):
//   - Primary brand:    #0052CC (deep blue — header bar)
//   - Surface tint:     #EEF4FF (very light blue — parent row bg)
//   - Success/positive: #1A7F37 (green — completed)
//   - Warning:         #B45309 (amber — pending/over-budget)
//   - Danger:          #B00020 (red — rejected/overdue)
//   - Phase tints:      see PHASE_COLORS below
// =====================================================================

import { StyleSheet, Font } from "@react-pdf/renderer";
import path from "path";

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
// Styles
// =====================================================================
const styles = StyleSheet.create({
  // ----- Page chrome -----
  page: {
    fontSize: 10,
    fontFamily: "Roboto",
    color: "#333333",
    backgroundColor: "#ffffff",
    paddingTop: 40,
    paddingBottom: 40, // no fixed footer — symmetric with paddingTop
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

  // ----- Category band (minimal mode) -----
  // Full-width group header showing the category ONCE per group,
  // replacing the per-row Category column. Položky and Úkoly under
  // the band no longer repeat the category value.
  minimalCategoryBand: {
    flexDirection: "row",
    backgroundColor: "#e8e8e8",
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 6,
    paddingRight: 6,
    marginTop: 5,
    borderTopWidth: 1,
    borderTopColor: "#888888",
    borderTopStyle: "solid",
    borderBottomWidth: 0.5,
    borderBottomColor: "#888888",
    borderBottomStyle: "solid",
  },
  minimalCategoryBandText: {
    fontSize: 9,
    fontFamily: "Roboto",
    fontWeight: "bold",
    color: "#1a1a1a",
  },

  // ----- Colorful mode (Phase 4) -----
  // MD3-inspired accent colors. Used only when reportStyle === "colorful".
  // Minimal mode uses the monochrome styles above.
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
  // Category band (colorful mode) — MD3-accented full-width group header.
  colorfulCategoryBand: {
    flexDirection: "row",
    backgroundColor: "#DCE8FF",
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 6,
    paddingRight: 6,
    marginTop: 5,
    borderRadius: 3,
  },
  colorfulCategoryBandText: {
    fontSize: 9,
    fontFamily: "Roboto",
    fontWeight: "bold",
    color: "#003399",
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

export { styles, PHASE_COLORS };
