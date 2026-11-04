// =====================================================================
// PDF Export — Type definitions
// =====================================================================

/** Section IDs that can be included in a PDF export. */
export type PdfSectionId =
  | "header"
  | "summary"
  | "budget_items"
  | "status"
  | "plan_cost"
  | "actual_cost"
  | "dates"
  | "phase"
  | "property"
  | "alerts"
  | "projection"
  | "time"
  | "workers"
  | "contacts"
  | "audit"
  | "trend";

/** All available sections in display order. */
export const ALL_SECTIONS: { id: PdfSectionId; labelKey: string; enabled: boolean }[] = [
  { id: "header", labelKey: "sections.header", enabled: true },
  { id: "summary", labelKey: "sections.summary", enabled: true },
  { id: "budget_items", labelKey: "sections.budgetItems", enabled: true },
  { id: "status", labelKey: "sections.status", enabled: true },
  { id: "plan_cost", labelKey: "sections.planCost", enabled: true },
  { id: "actual_cost", labelKey: "sections.actualCost", enabled: true },
  { id: "dates", labelKey: "sections.dates", enabled: true },
  { id: "phase", labelKey: "sections.phase", enabled: true },
  { id: "property", labelKey: "sections.property", enabled: true },
  { id: "alerts", labelKey: "sections.alerts", enabled: true },
  { id: "projection", labelKey: "sections.projection", enabled: true },
  { id: "time", labelKey: "sections.time", enabled: false },
  { id: "workers", labelKey: "sections.workers", enabled: false },
  { id: "contacts", labelKey: "sections.contacts", enabled: false },
  { id: "audit", labelKey: "sections.audit", enabled: false },
  { id: "trend", labelKey: "sections.trend", enabled: false },
];

export const SUB_SECTIONS: Record<string, PdfSectionId[]> = {
  budget_items: ["status", "plan_cost", "actual_cost", "dates", "phase"],
};

export type PdfExportOptions = {
  projectId: string;
  locale: string;
  currency: string;
  sections: PdfSectionId[];
};

export type PdfReportData = {
  project: {
    name: string;
    address: string | null;
    fullAddress: string | null;
    description: string | null;
    status: string;
    currency: string;
    startDate: Date | null;
    endDate: Date | null;
    totalBudget: number;
    heatLoss: number | null;
    energyRating: string | null;
    floorArea: number | null;
    floors: number | null;
    propertyNote: string | null;
  };
  budgetItems: PdfBudgetItem[];
  totals: {
    planTotal: number;
    actualTotal: number;
    remaining: number;
    completedCount: number;
    itemCount: number;
    savedTotal: number;
    hoursTotal: number;
    projectedFinal: number;
    projectedOverrun: number;
  };
  alerts: {
    overdue: PdfAlertItem[];
    upcoming: PdfAlertItem[];
    overBudget: PdfAlertItem[];
  };
  byPhase: PdfPhaseSummary[];
};

export type PdfBudgetItem = {
  id: string;
  category: string;
  subcategory: string | null;
  element: string | null;
  phase: string;
  planCost: number | null;
  actualCost: number;
  planCostCurrency: string | null;
  planCostConverted: number | null;
  completed: boolean;
  rejected: boolean;
  dateFrom: Date | null;
  dateTo: Date | null;
  actualHours: number;
  sortOrder: number;
};

export type PdfAlertItem = {
  category: string;
  subcategory: string | null;
  phase: string;
  planCost: number | null;
  actualCost: number;
  dateFrom: Date | null;
  dateTo: Date | null;
};

export type PdfPhaseSummary = {
  phase: string;
  plan: number;
  actual: number;
  hours: number;
};

export type ExportTemplateData = {
  id: string;
  name: string;
  sections: PdfSectionId[];
  locale: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
};
