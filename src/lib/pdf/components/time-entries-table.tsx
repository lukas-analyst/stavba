// =====================================================================
// TimeEntriesTable — extracted from the monolithic pdf-components.tsx
// ---------------------------------------------------------------------
// This file contains the `TimeEntriesTable` component, which renders the
// table of all time entries with optional columns (worker, hours) and
// a summary total row showing the project-wide hour count.
//
// Extracted as part of the refactor that splits the original 2234-line
// pdf-components.tsx into smaller, focused modules under
// src/lib/pdf/components/. Shared styles live in ../styles, shared
// helpers live in ../helpers, and types live in ../pdf-types.
// =====================================================================

import { View, Text } from "@react-pdf/renderer";
import type {
  PdfReportData,
  PdfSectionId,
  PdfReportStyle,
  TableSort,
} from "../pdf-types";
import { styles } from "../styles";
import { formatDate, sortItems } from "../helpers";

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
