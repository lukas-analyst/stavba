// =====================================================================
// PDF Components — Barrel re-exports
// ---------------------------------------------------------------------
// This file was originally a 2234-line monolithic module. It has been
// split into focused modules for maintainability:
//
//   ./styles.ts              — StyleSheet + Font registration + PHASE_COLORS
//   ./helpers.ts             — formatCurrency, formatDate, getStatusIcon, sortItems
//   ./components/header.tsx  — Header, SummaryKPI, PropertyMetadata
//   ./components/budget-table.tsx        — BudgetTable
//   ./components/alerts-section.tsx      — AlertsSection
//   ./components/projection-section.tsx  — ProjectionSection
//   ./components/payments-table.tsx      — PaymentsTable
//   ./components/time-entries-table.tsx  — TimeEntriesTable
//   ./components/contacts-table.tsx      — ContactsTable
//   ./components/report-document.tsx     — ReportDocument (assembles all)
//
// This barrel preserves backward compatibility: existing imports like
//   `import { ReportDocument } from "./pdf-components"`
// continue to work unchanged. New code should import from the focused
// modules directly for better tree-shaking.
// =====================================================================

// Helpers (locale-aware formatting + sorting)
export { formatCurrency, formatDate, getStatusIcon, sortItems, toBcp47 } from "./helpers";

// Styles + colors
export { styles, PHASE_COLORS } from "./styles";

// Components
export { Header, SummaryKPI, PropertyMetadata } from "./components/header";
export { BudgetTable } from "./components/budget-table";
export { AlertsSection } from "./components/alerts-section";
export { ProjectionSection } from "./components/projection-section";
export { PaymentsTable } from "./components/payments-table";
export { TimeEntriesTable } from "./components/time-entries-table";
export { ContactsTable } from "./components/contacts-table";
export { ReportDocument } from "./components/report-document";
