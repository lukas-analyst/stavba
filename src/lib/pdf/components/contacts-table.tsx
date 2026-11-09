// =====================================================================
// ContactsTable — extracted from the monolithic pdf-components.tsx
// ---------------------------------------------------------------------
// This file contains the `ContactsTable` component, which renders a
// directory of suppliers / contractors on the project with optional
// columns (type, phone, email, IČO/DIČ, notes) and a summary row showing
// the total payment + time-entry counts across all listed contacts.
//
// Extracted as part of the refactor that splits the original 2234-line
// pdf-components.tsx into smaller, focused modules under
// src/lib/pdf/components/. Shared styles live in ../styles, shared
// helpers live in ../helpers, and types live in ../pdf-types.
// =====================================================================

import { View, Text } from "@react-pdf/renderer";
import type {
  PdfContact,
  PdfReportData,
  PdfSectionId,
  PdfReportStyle,
  TableSort,
} from "../pdf-types";
import { styles } from "../styles";
import { sortItems } from "../helpers";

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
