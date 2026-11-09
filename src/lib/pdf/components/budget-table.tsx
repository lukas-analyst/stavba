// =====================================================================
// BudgetTable — extracted from the monolithic pdf-components.tsx
// ---------------------------------------------------------------------
// This file contains the `BudgetTable` component, which renders the
// table of all budget items with parent→child hierarchy, optional
// columns (phase, plan cost, actual cost, status, dates, supplier),
// and support for both "minimal" (monochrome) and "colorful"
// (MD3-accented) report styles.
//
// Extracted as part of the refactor that splits the original 2234-line
// pdf-components.tsx into smaller, focused modules under
// src/lib/pdf/components/. Shared styles live in ../styles, shared
// helpers live in ../helpers, and types live in ../pdf-types.
// =====================================================================

import { View, Text } from "@react-pdf/renderer";
import type {
  PdfBudgetItem,
  PdfReportData,
  PdfSectionId,
  PdfReportStyle,
  TableSort,
} from "../pdf-types";
import { styles, PHASE_COLORS } from "../styles";
import { formatCurrency, formatDate, getStatusIcon, sortItems } from "../helpers";

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

  // ─── Group parents by category ───────────────────────────────
  // Each category is rendered ONCE as a full-width band; under it,
  // the Položky (parents) and their Úkoly (children). This avoids
  // repeating the category on every parent row.
  //
  // Category group ordering (3 cases):
  //   1. No sort (default)         → groups alphabetical asc.
  //                                  Parents & children keep app order
  //                                  (sortOrder). This is the clean,
  //                                  predictable default for PDF reports.
  //   2. Sort by "category"        → groups alphabetical asc/desc per
  //                                  user choice. Parents & children keep
  //                                  app order within each group.
  //   3. Sort by any other field   → groups in first-occurrence order
  //                                  (reflecting the sorted parent order,
  //                                  so e.g. sorting by planCost desc puts
  //                                  the highest-cost category first).
  //                                  Parents & children sorted by the field.
  const isCategorySort = sort && sort.field === "category";

  const categoryGroups: { category: string; parents: PdfBudgetItem[] }[] = [];
  const groupIndex = new Map<string, number>();
  for (const parent of parents) {
    const cat = parent.category || "—";
    const idx = groupIndex.get(cat);
    if (idx !== undefined) {
      categoryGroups[idx].parents.push(parent);
    } else {
      groupIndex.set(cat, categoryGroups.length);
      categoryGroups.push({ category: cat, parents: [parent] });
    }
  }

  // Apply category group ordering for cases 1 & 2 (default + explicit
  // category sort). Case 3 keeps first-occurrence order.
  if (!sort || isCategorySort) {
    const direction = isCategorySort ? sort.direction : "asc";
    categoryGroups.sort((a, b) => {
      const cmp = a.category.localeCompare(b.category, locale);
      return direction === "desc" ? -cmp : cmp;
    });
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
  const categoryBandStyle = isColorful
    ? styles.colorfulCategoryBand
    : styles.minimalCategoryBand;
  const categoryBandTextStyle = isColorful
    ? styles.colorfulCategoryBandText
    : styles.minimalCategoryBandText;

  // Render a single row (parent or child) with all optional columns.
  const renderRow = (item: PdfBudgetItem, isParent: boolean) => {
    const rowStyle = isParent ? parentRowStyle : childRowStyle;
    const cellStyle = isParent ? parentCellStyle : childCellStyle;

    return (
      <View key={item.id} style={rowStyle} wrap={false}>
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
        // Render hierarchy: category band → Položky → Úkoly.
        // Each category appears once as a full-width band; under it,
        // parent items (Položky) with their child tasks (Úkoly).
        categoryGroups.map((group, groupIdx) => (
          <View key={`cat-${groupIdx}`}>
            <View style={categoryBandStyle} wrap={false}>
              <Text style={categoryBandTextStyle}>{group.category}</Text>
            </View>
            {group.parents.map((parent) => {
              const children = childrenByParentId.get(parent.id) ?? [];
              return (
                <View key={parent.id}>
                  {renderRow(parent, true)}
                  {children.map((child) => renderRow(child, false))}
                </View>
              );
            })}
          </View>
        ))
      )}
    </View>
  );
}
