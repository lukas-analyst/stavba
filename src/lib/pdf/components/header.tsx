// =====================================================================
// PDF Header Components
// ---------------------------------------------------------------------
// Header, SummaryKPI, and PropertyMetadata components for PDF reports.
// Extracted from the original monolithic pdf-components.tsx.
// =====================================================================

import { View, Text } from "@react-pdf/renderer";
import type { PdfReportData, PdfReportStyle } from "../pdf-types";
import { styles } from "../styles";
import { formatCurrency, formatDate } from "../helpers";

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
  const subLabelStyle = isColorful ? styles.colorfulKpiSubLabel : styles.kpiSubLabel;
  const subValueStyle = isColorful ? styles.colorfulKpiSubValue : styles.kpiSubValue;

  return (
    <View style={wrapperStyle} wrap={false}>
      <Text style={titleStyle}>{labels.summary}</Text>
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
