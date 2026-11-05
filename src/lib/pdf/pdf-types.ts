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
  | "contact_type"
  | "contact_phone"
  | "contact_email"
  | "contact_ico"
  | "contact_notes"
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
  { id: "contacts", labelKey: "sections.contacts", enabled: true },
  { id: "contact_type", labelKey: "sections.contactType", enabled: true },
  { id: "contact_phone", labelKey: "sections.contactPhone", enabled: true },
  { id: "contact_email", labelKey: "sections.contactEmail", enabled: true },
  { id: "contact_ico", labelKey: "sections.contactIco", enabled: true },
  { id: "contact_notes", labelKey: "sections.contactNotes", enabled: true },
  { id: "workers", labelKey: "sections.workers", enabled: false },
  { id: "audit", labelKey: "sections.audit", enabled: false },
  { id: "trend", labelKey: "sections.trend", enabled: false },
];

export const SUB_SECTIONS: Record<string, PdfSectionId[]> = {
  budget_items: ["status", "plan_cost", "actual_cost", "dates", "phase", "supplier"],
  payments: ["payment_type", "invoice"],
  time: ["worker", "hours"],
  contacts: ["contact_type", "contact_phone", "contact_email", "contact_ico", "contact_notes"],
};

export type PdfExportOptions = {
  projectId: string;
  locale: string;
  currency: string;
  sections: PdfSectionId[];
  /**
   * Page orientation strategy. Default = "auto".
   *
   * - "auto": wide tables (Budget/Contacts with 7+ columns) render on
   *   landscape pages, narrow content stays on portrait. Recommended.
   * - "all-portrait": force every page to portrait orientation.
   * - "all-landscape": force every page to landscape orientation.
   * - "custom": per-section orientation taken from `sectionOrientations`.
   */
  orientationMode?: PdfOrientationMode;
  /**
   * Per-section orientation override. Only consulted when
   * `orientationMode === "custom"`. Keys are section IDs from the
   * `sections` array; absent entries fall back to "auto" detection.
   */
  sectionOrientations?: Partial<Record<PdfSectionId, "portrait" | "landscape">>;
  /**
   * Report visual style. Default = "minimal".
   *
   * - "minimal": clean monochrome report (current look). Recommended for
   *   bank / mortgage applications.
   * - "colorful": MD3-accented report with colored section headers, KPI
   *   tiles, phase badges, and status indicators. More visually engaging
   *   for personal use / presentations.
   */
  reportStyle?: PdfReportStyle;
};

/** Page orientation strategy for PDF export. */
export type PdfOrientationMode =
  | "auto"
  | "all-portrait"
  | "all-landscape"
  | "custom";

/** Report visual style — controls color usage in the PDF. */
export type PdfReportStyle = "minimal" | "colorful";

/** Sections whose orientation can be overridden via `sectionOrientations`.
 *  Every top-level section gets its own <Page> in the PDF, and each page's
 *  orientation can be individually controlled by the user.
 *
 *  Sub-sections (status, plan_cost, contact_type, etc.) are NOT here —
 *  they're rendered as columns within their parent's table, not as
 *  separate pages. */
export const ORIENTABLE_SECTION_IDS = [
  "header",
  "summary",
  "property",
  "alerts",
  "projection",
  "budget_items",
  "payments",
  "time",
  "contacts",
] as const;

export type OrientableSectionId = (typeof ORIENTABLE_SECTION_IDS)[number];

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
  contacts: PdfContact[];
  /** Translated phase names keyed by the raw DB phase value. */
  phaseTranslations: Record<string, string>;
  /** Translated payment type names keyed by the raw DB value. */
  paymentTypeTranslations: Record<string, string>;
  /** Translated contact type names keyed by the raw DB value. */
  contactTypeTranslations: Record<string, string>;
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
    contacts: string;
    contactsCount: string;
    noContacts: string;
    contactType: string;
    contactName: string;
    company: string;
    role: string;
    phone: string;
    email: string;
    ico: string;
    dic: string;
    website: string;
    rating: string;
    contactNotes: string;
    paymentCount: string;
    timeEntryCount: string;
    totalContacts: string;
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

export type PdfContact = {
  id: string;
  name: string;
  type: string;
  role: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  ico: string | null;
  dic: string | null;
  notes: string | null;
  rating: number | null;
  /** Number of payments linked to this contact (denormalized for display). */
  paymentCount: number;
  /** Number of time entries linked to this contact (denormalized for display). */
  timeEntryCount: number;
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
