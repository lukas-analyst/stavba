// =====================================================================
// PaymentsTable — extracted from the monolithic pdf-components.tsx
// ---------------------------------------------------------------------
// This file contains the `PaymentsTable` component, which renders the
// table of all payments with optional columns (type, invoice), a
// summary total row, and support for both "minimal" (monochrome) and
// "colorful" (MD3-accented) report styles.
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
import { formatCurrency, formatDate, sortItems } from "../helpers";

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
  const showInvoiceUrl = sections.includes("invoice_url");
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
                {showInvoiceUrl && payment.invoiceUrl ? ` (${payment.invoiceUrl})` : ""}
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
