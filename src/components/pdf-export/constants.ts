// =====================================================================
// PDF Export Dialog — Constants & Types
// ---------------------------------------------------------------------
// Shared constants and type definitions for the PDF export dialog.
// Extracted from the monolithic pdf-export-dialog.tsx.
// =====================================================================

import {
  Home,
  ChartColumnBig,
  ClipboardList,
  Coins,
  Clock,
  Layers,
  Building2,
  TriangleAlert,
  TrendingUp,
  CreditCard,
  FileDown,
  ExternalLink,
  Users,
  Info,
  ListChecks,
} from "lucide-react";
import type {
  PdfSectionId,
  PdfReportStyle,
  PdfPageMargin,
} from "@/lib/pdf/pdf-types";

// =====================================================================
// Common currencies offered in the dropdown
// =====================================================================

export const COMMON_CURRENCIES = [
  { code: "CZK", label: "CZK · Kč" },
  { code: "EUR", label: "EUR · €" },
  { code: "USD", label: "USD · $" },
  { code: "HUF", label: "HUF · Ft" },
  { code: "PLN", label: "PLN · zł" },
  { code: "AUD", label: "AUD · A$" },
  { code: "VND", label: "VND · ₫" },
] as const;

// =====================================================================
// PRESETS — 3 predefined configurations for common use cases.
// =====================================================================

export type PresetConfig = {
  id: string;
  labelKey: string;
  descKey: string;
  icon: React.ComponentType<{ className?: string }>;
  sections: PdfSectionId[];
  reportStyle: PdfReportStyle;
};

export const PRESETS: PresetConfig[] = [
  {
    id: "mortgage",
    labelKey: "presets.mortgage.label",
    descKey: "presets.mortgage.desc",
    icon: Home,
    sections: [
      "header", "summary", "property", "alerts", "projection",
      "budget_items", "plan_cost", "actual_cost", "status", "dates", "phase",
      "payments", "invoice", "invoice_url",
    ],
    reportStyle: "minimal",
  },
  {
    id: "summary",
    labelKey: "presets.summary.label",
    descKey: "presets.summary.desc",
    icon: ChartColumnBig,
    sections: [
      "header", "summary", "property", "projection",
      "budget_items", "plan_cost", "actual_cost", "phase",
    ],
    reportStyle: "colorful",
  },
  {
    id: "complete",
    labelKey: "presets.complete.label",
    descKey: "presets.complete.desc",
    icon: ClipboardList,
    sections: [
      "header", "summary", "property", "alerts", "projection",
      "budget_items", "status", "plan_cost", "actual_cost", "dates", "phase", "supplier",
      "payments", "payment_type", "invoice", "invoice_url",
      "time", "worker", "hours",
      "contacts", "contact_type", "contact_phone", "contact_email", "contact_ico",
    ],
    reportStyle: "colorful",
  },
];

// =====================================================================
// localStorage persistence — remember user's last settings
// =====================================================================

export const STORAGE_KEY = "pdf-export-settings";

export type SavedSettings = {
  sections: PdfSectionId[];
  locale: string;
  currency: string;
  reportStyle: PdfReportStyle;
  pageMargin: PdfPageMargin;
  sectionOrientations: Partial<Record<string, "portrait" | "landscape">>;
  tableSorts: Partial<Record<string, { field: string; direction: "asc" | "desc" }>>;
};

// Default sections selected when the dialog opens. Matches the MVP set
// supported by the backend (see export-pdf/route.ts validSections).
export const DEFAULT_SECTIONS: PdfSectionId[] = [
  "header",
  "summary",
  "budget_items",
  "status",
  "plan_cost",
  "actual_cost",
  "dates",
  "phase",
  "supplier",
  "property",
  "alerts",
  "projection",
  "payments",
  "payment_type",
  "invoice",
  "invoice_url",
  "time",
  "worker",
  "hours",
  "contacts",
  "contact_type",
  "contact_phone",
  "contact_email",
  "contact_ico",
];

// =====================================================================
// Section metadata — icons + categories for the UI
// =====================================================================

export type SectionIcon = React.ComponentType<{ className?: string }>;

export const SECTION_ICONS: Record<PdfSectionId, SectionIcon> = {
  header: Home,
  summary: ChartColumnBig,
  budget_items: ClipboardList,
  status: ListChecks,
  plan_cost: Coins,
  actual_cost: Coins,
  dates: Clock,
  phase: Layers,
  property: Building2,
  alerts: TriangleAlert,
  projection: TrendingUp,
  payments: CreditCard,
  payment_type: CreditCard,
  invoice: FileDown,
  invoice_url: ExternalLink,
  time: Clock,
  worker: Users,
  hours: Clock,
  supplier: Users,
  contacts: Users,
  contact_type: Users,
  contact_phone: Users,
  contact_email: Users,
  contact_ico: Building2,
  contact_notes: Info,
  workers: Users,
  audit: ListChecks,
  trend: TrendingUp,
};

// Display order of categories on the "Obsah" tab.
export const SECTION_CATEGORIES = [
  {
    id: "overview",
    labelKey: "categories.overview",
    sectionIds: ["header", "summary", "property", "alerts", "projection"] as PdfSectionId[],
  },
  {
    id: "tables",
    labelKey: "categories.tables",
    sectionIds: ["budget_items", "payments", "time", "contacts"] as PdfSectionId[],
  },
] as const;
