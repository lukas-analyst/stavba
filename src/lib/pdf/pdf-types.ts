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
  | "trend"
  | "payments"
  | "payment_type"
  | "invoice"
  | "time"
  | "worker"
  | "hours"
  | "supplier";

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
  { id: "payments", labelKey: "sections.payments", enabled: true },
  { id: "payment_type", labelKey: "sections.paymentType", enabled: true },
  { id: "invoice", labelKey: "sections.invoice", enabled: true },
  { id: "time", labelKey: "sections.time", enabled: true },
  { id: "worker", labelKey: "sections.worker", enabled: true },
  { id: "hours", labelKey: "sections.hours", enabled: true },
  { id: "supplier", labelKey: "sections.supplier", enabled: true },
  { id: "workers", labelKey: "sections.workers", enabled: false },
  { id: "contacts", labelKey: "sections.contacts", enabled: false },
  { id: "audit", labelKey: "sections.audit", enabled: false },
  { id: "trend", labelKey: "sections.trend", enabled: false },
];

export const SUB_SECTIONS: Record<string, PdfSectionId[]> = {
  budget_items: ["status", "plan_cost", "actual_cost", "dates", "phase", "supplier"],
  payments: ["payment_type", "invoice"],
  time: ["worker", "hours"],
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
  payments: PdfPayment[];
  timeEntries: PdfTimeEntry[];
  /** Translated phase names keyed by the raw DB phase value. */
  phaseTranslations: Record<string, string>;
  /** Translated payment type names keyed by the raw DB value. */
  paymentTypeTranslations: Record<string, string>;
  /** UI labels translated to the target locale (for PDF text). */
  labels: {
    generated: string;
    startDate: string;
    endDate: string;
    expectedTotal: string;
    plan: string;
    actual: string;
    remaining: string;
    propertyInfo: string;
    fullAddress: string;
    address: string;
    floorArea: string;
    floors: string;
    energyRating: string;
    heatLoss: string;
    propertyNote: string;
    budgetItems: string;
    items: string;
    item: string;
    category: string;
    name: string;
    phase: string;
    planCost: string;
    actualCost: string;
    status: string;
    from: string;
    to: string;
    noItems: string;
    alerts: string;
    noAlerts: string;
    overdue: string;
    upcoming: string;
    overBudget: string;
    projection: string;
    plannedBudget: string;
    expectedTotalCosts: string;
    estimatedOverrun: string;
    expectedSavings: string;
    page: string;
    of: string;
    payments: string;
    paymentsCount: string;
    date: string;
    vendor: string;
    type: string;
    amount: string;
    invoiceNumber: string;
    noPayments: string;
    vatRate: string;
    vatAmount: string;
    paymentType: string;
    invoice: string;
    description: string;
    vatSummary: string;
    vatBase: string;
    totalPayments: string;
    timeEntries: string;
    timeEntriesCount: string;
    worker: string;
    workerType: string;
    hours: string;
    workerCount: string;
    totalHours: string;
    noTimeEntries: string;
    supplier: string;
  };
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
  contactName: string | null;
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

export type PdfPayment = {
  id: string;
  date: Date;
  amount: number;
  amountConverted: number;
  currency: string | null;
  type: string;
  vendor: string | null;
  invoiceNumber: string | null;
  vatRate: number | null;
  vatAmount: number | null;
  description: string | null;
  budgetItemCategory: string | null;
  budgetItemSubcategory: string | null;
  contactName: string | null;
};

export type PdfTimeEntry = {
  id: string;
  workerName: string;
  workerType: string;
  date: Date;
  dateTo: Date | null;
  hours: number;
  workerCount: number;
  description: string | null;
  budgetItemCategory: string | null;
  budgetItemSubcategory: string | null;
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
