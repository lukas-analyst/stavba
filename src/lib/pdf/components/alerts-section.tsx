// =====================================================================
// AlertsSection — list of overdue, upcoming, and overBudget items.
// Each group is only rendered when it has at least one item.
// =====================================================================

import { View, Text } from "@react-pdf/renderer";
import type { StyleProp } from "@react-pdf/stylesheet";
import type { PdfAlertItem, PdfReportData, PdfReportStyle } from "../pdf-types";
import { styles } from "../styles";
import { formatCurrency, formatDate } from "../helpers";

function AlertRow({
  alert,
  currency,
  locale,
  style,
}: {
  alert: PdfAlertItem;
  currency: string;
  locale: string;
  style?: StyleProp;
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
