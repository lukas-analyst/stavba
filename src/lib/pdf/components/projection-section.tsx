// =====================================================================
// ProjectionSection — projected final cost + estimated overrun
// =====================================================================

import { View, Text } from "@react-pdf/renderer";
import type { PdfReportData, PdfReportStyle } from "../pdf-types";
import { styles } from "../styles";
import { formatCurrency } from "../helpers";

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
