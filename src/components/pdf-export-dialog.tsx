"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  FileDown,
  Save,
  Trash2,
  Lock,
  FolderOpen,
  Globe,
  Coins,
  Info,
  Files,
  LayoutPanelLeft,
  RectangleVertical,
  RectangleHorizontal,
  Sparkles,
  ListChecks,
  ListX,
  Layers,
  Palette,
  Home,
  ChartColumnBig,
  Building2,
  TriangleAlert,
  TrendingUp,
  ClipboardList,
  CreditCard,
  Clock,
  Users,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ALL_SECTIONS,
  SUB_SECTIONS,
  ORIENTABLE_SECTION_IDS,
  OVERVIEW_SECTION_IDS,
  SORTABLE_TABLE_IDS,
  SORTABLE_FIELDS_BY_TABLE,
  DEFAULT_SORT_FIELD,
  type PdfSectionId,
  type PdfReportStyle,
  type PdfPageMargin,
  type ExportTemplateData,
} from "@/lib/pdf/pdf-types";
import { locales, LOCALE_META, type Locale } from "@/i18n/config";
import { SegmentedButton } from "@/components/ui/segmented-button";

// =====================================================================
// PdfExportDialog
// ---------------------------------------------------------------------
// Responsive dialog (Drawer on mobile, Dialog on desktop) for exporting
// a PDF report of a construction project. Lets the user pick:
//   ① Report sections (with sub-sections under budget_items)
//   ② Output language + currency
//   ③ Save/load/delete named export templates
//
// The PDF is generated server-side by GET /api/projects/[id]/export-pdf
// and downloaded via a hidden iframe (avoids navigation away from the
// current page, and works for both desktop and mobile).
//
// Templates are persisted to the user profile via:
//   - GET    /api/users/profile/export-templates
//   - POST   /api/users/profile/export-templates
//   - DELETE /api/users/profile/export-templates/[templateId]
// =====================================================================

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
};

// Common currencies offered in the dropdown. VND is included for the
// Vietnamese audience even though ČNB doesn't publish its rate — the
// backend will fall back to the project's currency if conversion fails.
const COMMON_CURRENCIES = [
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
type PresetConfig = {
  id: string;
  labelKey: string;
  descKey: string;
  icon: React.ComponentType<{ className?: string }>;
  sections: PdfSectionId[];
  reportStyle: PdfReportStyle;
};

const PRESETS: PresetConfig[] = [
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
const STORAGE_KEY = "pdf-export-settings";

type SavedSettings = {
  sections: PdfSectionId[];
  locale: string;
  currency: string;
  reportStyle: PdfReportStyle;
  pageMargin: PdfPageMargin;
  sectionOrientations: Partial<Record<string, "portrait" | "landscape">>;
  tableSorts: Partial<Record<string, { field: string; direction: "asc" | "desc" }>>;
};

function loadSavedSettings(): SavedSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedSettings;
  } catch {
    return null;
  }
}

function saveSettings(settings: SavedSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota errors
  }
}

// Default sections selected when the dialog opens. Matches the MVP set
// supported by the backend (see export-pdf/route.ts validSections).
const DEFAULT_SECTIONS: PdfSectionId[] = [
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
// Section metadata — icons + categories for the new UI
// ---------------------------------------------------------------------
// `SECTION_ICONS` maps each top-level section to a lucide icon component.
// `SECTION_CATEGORIES` groups sections into 2 visual categories for the
// "Obsah" tab (Overview / Tables). Sub-sections inherit their parent's
// icon (rendered indented under it).
// =====================================================================

type SectionIcon = React.ComponentType<{ className?: string }>;

const SECTION_ICONS: Record<PdfSectionId, SectionIcon> = {
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
const SECTION_CATEGORIES = [
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

// Top-level sections (excluding sub-sections — they're rendered under parents).
// (TOP_LEVEL_SECTION_IDS was here — now unified with ORIENTABLE_SECTION_IDS
//  from pdf-types.ts, which is the same 9 top-level sections.)

// =====================================================================
// OrientationToggle — compact 3-way icon-only segmented control
// ---------------------------------------------------------------------
// Used inline next to each top-level section row in the Content tab.
// Icons stay visible even when active (unlike SegmentedButton which
// swaps in a Check icon), so the user always sees which orientation
// each option represents.
//
//   [✨ Auto]  [▭ Portrait]  [▭ Landscape]
//
// The active segment gets a MD3 tonal fill (secondary-container).
// =====================================================================

function OrientationToggle({
  value,
  onChange,
  labels,
}: {
  value: "auto" | "portrait" | "landscape";
  onChange: (v: "auto" | "portrait" | "landscape") => void;
  labels: {
    auto: string;
    portrait: string;
    landscape: string;
  };
}) {
  const options: Array<{
    value: "auto" | "portrait" | "landscape";
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }> = [
    { value: "auto", icon: Sparkles, label: labels.auto },
    { value: "portrait", icon: RectangleVertical, label: labels.portrait },
    { value: "landscape", icon: RectangleHorizontal, label: labels.landscape },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={labels.auto}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-outline-variant bg-surface-container-low p-0.5"
    >
      {options.map((opt) => {
        const isActive = value === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            title={opt.label}
            onClick={() => onChange(opt.value)}
            className={cn(
              // h-8 (32px) matches SegmentedButton's sm size — meets MD3
              // touch target floor and stays visually consistent with the
              // rest of the app's small controls.
              "inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors",
              isActive
                ? "bg-secondary-container text-secondary-container-foreground"
                : "text-on-surface-variant hover:bg-surface-container-high",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

export function PdfExportDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
}: Props) {
  const isMobile = useIsMobile();
  const t = useTranslations("dialogs.pdfExport");

  const currentLocale = useLocale() as Locale;

  const [selectedSections, setSelectedSections] = useState<Set<PdfSectionId>>(
    new Set(DEFAULT_SECTIONS),
  );
  const [locale, setLocale] = useState<string>(currentLocale);
  const [currency, setCurrency] = useState<string>("CZK");

  // Page orientation — always "custom" mode now (Phase 3 revision).
  // Per-section orientation toggles live inline in the Content tab.
  // The orientationMode is sent to the API as "custom" so the server
  // respects per-section overrides; sections without an override fall
  // back to auto-detection (wide-table threshold).
  const [sectionOrientations, setSectionOrientations] = useState<
    Partial<Record<string, "portrait" | "landscape">>
  >({});

  // Bulk set all section orientations at once (quick action buttons).
  const setAllOrientations = useCallback(
    (value: "auto" | "portrait" | "landscape") => {
      if (value === "auto") {
        setSectionOrientations({});
      } else {
        const next: Record<string, "portrait" | "landscape"> = {};
        for (const id of ORIENTABLE_SECTION_IDS) {
          next[id] = value;
        }
        setSectionOrientations(next);
      }
    },
    [],
  );

  // Report visual style (Phase 3). Default = "minimal".
  // "colorful" enables MD3-accented headers, KPI tiles, badges.
  const [reportStyle, setReportStyle] = useState<PdfReportStyle>("minimal");

  // Page margin preset (F2). Default = "normal".
  const [pageMargin, setPageMargin] = useState<PdfPageMargin>("normal");

  // Per-table sort (Phase 4+). Keys are table section IDs.
  // Absent entries = default ordering (sortOrder / date / name).
  const [tableSorts, setTableSorts] = useState<
    Partial<Record<string, { field: string; direction: "asc" | "desc" }>>
  >({});

  // Active tab in the dialog (Phase 3B). 2 tabs: Content + Format.
  // (Templates integrated into Content tab — no separate tab.)
  const [activeTab, setActiveTab] = useState<"content" | "format">("content");

  const [isExporting, setIsExporting] = useState(false);
  const [templates, setTemplates] = useState<ExportTemplateData[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(
    null,
  );
  const [updatingTemplateId, setUpdatingTemplateId] = useState<string | null>(
    null,
  );

  // ---------------------------------------------------------------
  // Templates — fetched from the user profile whenever the dialog opens.
  // Defined with `useCallback` so it can be safely used as a dependency
  // in the open-effect below and in the save/delete callbacks.
  // ---------------------------------------------------------------
  const fetchTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      const res = await fetch("/api/users/profile/export-templates", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load templates");
      const data = (await res.json()) as { templates: ExportTemplateData[] };
      setTemplates(data.templates ?? []);
    } catch {
      // Silent fail — empty state will show, no intrusive toast on open
      setTemplates([]);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, []);

  // ---------------------------------------------------------------
  // Reset to defaults + fetch templates every time dialog opens.
  // Loads saved settings from localStorage if available.
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    const saved = loadSavedSettings();
    if (saved) {
      setSelectedSections(new Set(saved.sections));
      setLocale(saved.locale);
      setCurrency(saved.currency);
      setSectionOrientations(saved.sectionOrientations ?? {});
      setReportStyle(saved.reportStyle ?? "minimal");
      setPageMargin(saved.pageMargin ?? "normal");
      setTableSorts(saved.tableSorts ?? {});
    } else {
      setSelectedSections(new Set(DEFAULT_SECTIONS));
      setLocale(currentLocale);
      setCurrency("CZK");
      setSectionOrientations({});
      setReportStyle("minimal");
      setPageMargin("normal");
      // Default sort matches server-side defaults:
      // payments/time = date desc (as fetched from DB),
      // budget_items = sortOrder asc, contacts = name asc.
      setTableSorts({
        budget_items: { field: "sortOrder", direction: "asc" },
        payments: { field: "date", direction: "desc" },
        time: { field: "date", direction: "desc" },
        contacts: { field: "name", direction: "asc" },
      });
    }
    setActiveTab("content");
    setNewTemplateName("");
    void fetchTemplates();
  }, [open, currentLocale, fetchTemplates]);

  // ---------------------------------------------------------------
  // Save settings to localStorage whenever they change (debounced
  // via the open state — only saves while dialog is open).
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    const settings: SavedSettings = {
      sections: Array.from(selectedSections),
      locale,
      currency: currency,
      reportStyle,
      pageMargin,
      sectionOrientations,
      tableSorts,
    };
    saveSettings(settings);
  }, [open, selectedSections, locale, currency, reportStyle, pageMargin, sectionOrientations, tableSorts]);

  // ---------------------------------------------------------------
  // Apply a preset configuration
  // ---------------------------------------------------------------
  const applyPreset = useCallback((preset: PresetConfig) => {
    setSelectedSections(new Set(preset.sections));
    setReportStyle(preset.reportStyle);
    setSectionOrientations({});
    setTableSorts({});
  }, []);

  // ---------------------------------------------------------------
  // Section toggle handlers
  // ---------------------------------------------------------------
  const toggleSection = useCallback((id: PdfSectionId) => {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // If parent (budget_items or payments) is unchecked, remove
        // its sub-sections too so they don't persist as "phantom checked".
        if (SUB_SECTIONS[id]) {
          for (const subId of SUB_SECTIONS[id]) {
            next.delete(subId);
          }
        }
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Phase 3A: bulk select / deselect all sections.
  const selectAllSections = useCallback(() => {
    setSelectedSections(() => {
      const next = new Set<PdfSectionId>();
      for (const s of ALL_SECTIONS) {
        if (s.enabled) next.add(s.id);
      }
      return next;
    });
  }, []);

  const selectNoSections = useCallback(() => {
    setSelectedSections(new Set());
  }, []);

  // The currently effective currency: either from the dropdown or the
  // custom ISO code entered by the user.
  const effectiveCurrency = currency || "CZK";

  // ---------------------------------------------------------------
  // Export PDF — open the backend URL in a new tab. The browser will
  // trigger a download via Content-Disposition: attachment.
  // ---------------------------------------------------------------
  const handleExport = useCallback(async () => {
    if (selectedSections.size === 0) {
      toast.error(t("toasts.error"));
      return;
    }

    setIsExporting(true);
    toast.loading(t("toasts.generating"), { id: "pdf-export" });

    try {
      const sections = Array.from(selectedSections).join(",");
      const orientationParams = new URLSearchParams();
      // Always "custom" — per-section overrides are the sole UI for
      // orientation now (Phase 3 revision). Sections without an explicit
      // override fall back to server-side auto-detection.
      orientationParams.set("orientationMode", "custom");
      for (const sectionId of ORIENTABLE_SECTION_IDS) {
        const v = sectionOrientations[sectionId];
        if (v === "portrait" || v === "landscape") {
          orientationParams.set(`orientation-${sectionId}`, v);
        }
      }
      // Per-table sort params (Phase 4+).
      const sortParams = new URLSearchParams();
      for (const [tableId, sort] of Object.entries(tableSorts)) {
        if (sort) {
          sortParams.set(`sort-${tableId}`, sort.field);
          sortParams.set(`sortDir-${tableId}`, sort.direction);
        }
      }
      const url =
        `/api/projects/${projectId}/export-pdf` +
        `?locale=${encodeURIComponent(locale)}` +
        `&currency=${encodeURIComponent(effectiveCurrency)}` +
        `&sections=${encodeURIComponent(sections)}` +
        `&reportStyle=${encodeURIComponent(reportStyle)}` +
        `&pageMargin=${encodeURIComponent(pageMargin)}` +
        `&${orientationParams.toString()}` +
        `&${sortParams.toString()}`;

      // Use fetch() instead of hidden iframe — this lets us detect
      // HTTP errors (500, timeout, etc.) and show appropriate toasts.
      // On success, we create a Blob URL and trigger download.
      const response = await fetch(url, { method: "GET" });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMsg = errorData?.error || `HTTP ${response.status}`;
        throw new Error(errorMsg);
      }

      // Get the PDF as a Blob and trigger download via <a> element.
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;

      // Extract filename from Content-Disposition header, or fall back.
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
      a.download = filenameMatch?.[1] || "report.pdf";

      document.body.appendChild(a);
      a.click();
      a.remove();

      // Clean up the Blob URL after a delay.
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);

      toast.success(t("toasts.success"), { id: "pdf-export" });
      setIsExporting(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("toasts.error");
      toast.error(`${t("toasts.error")} — ${message}`, { id: "pdf-export" });
      setIsExporting(false);
    }
  }, [selectedSections, projectId, locale, effectiveCurrency, sectionOrientations, reportStyle, tableSorts, t]);

  // ---------------------------------------------------------------
  // Save current selection as a template
  // ---------------------------------------------------------------
  const handleSaveTemplate = useCallback(async () => {
    const name = newTemplateName.trim();
    if (!name) {
      toast.error(t("toasts.templateNameRequired"));
      return;
    }
    if (selectedSections.size === 0) return;

    setIsSavingTemplate(true);
    try {
      const res = await fetch("/api/users/profile/export-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sections: Array.from(selectedSections),
          locale,
          currency: effectiveCurrency,
          sectionOrientations: Object.keys(sectionOrientations).length > 0
            ? sectionOrientations
            : undefined,
          tableSorts: Object.keys(tableSorts).length > 0
            ? tableSorts
            : undefined,
          reportStyle,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        // 409 = duplicate name
        if (res.status === 409) {
          toast.error(t("toasts.templateDuplicateName"));
          return;
        }
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      toast.success(t("toasts.templateSaved"));
      setNewTemplateName("");
      await fetchTemplates();
    } catch (err) {
      // Show the localized error label + the actual error detail from
      // the backend (which is now more specific — includes Prisma error
      // codes for schema mismatches, not just "Failed to create template").
      const message = err instanceof Error ? err.message : "";
      if (message) {
        // Don't concatenate two languages — just show the detail.
        // The backend now returns helpful, actionable messages.
        toast.error(message, { duration: 8000 });
      } else {
        toast.error(t("toasts.templateSaveError"));
      }
    } finally {
      setIsSavingTemplate(false);
    }
  }, [newTemplateName, selectedSections, locale, effectiveCurrency, sectionOrientations, tableSorts, reportStyle, t, fetchTemplates]);

  // ---------------------------------------------------------------
  // Delete a template
  // ---------------------------------------------------------------
  const handleDeleteTemplate = useCallback(
    async (templateId: string) => {
      setDeletingTemplateId(templateId);
      try {
        const res = await fetch(
          `/api/users/profile/export-templates/${templateId}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast.success(t("toasts.templateDeleted"));
        await fetchTemplates();
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message) {
          toast.error(message, { duration: 8000 });
        } else {
          toast.error(t("toasts.templateDeleteError"));
        }
      } finally {
        setDeletingTemplateId(null);
      }
    },
    [t, fetchTemplates],
  );

  // ---------------------------------------------------------------
  // Update an existing template with the current selection
  // ---------------------------------------------------------------
  const handleUpdateTemplate = useCallback(
    async (templateId: string) => {
      if (selectedSections.size === 0) return;
      setUpdatingTemplateId(templateId);
      try {
        const res = await fetch(
          `/api/users/profile/export-templates/${templateId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sections: Array.from(selectedSections),
              locale,
              currency: effectiveCurrency,
              sectionOrientations:
                Object.keys(sectionOrientations).length > 0
                  ? sectionOrientations
                  : undefined,
              tableSorts:
                Object.keys(tableSorts).length > 0
                  ? tableSorts
                  : undefined,
              reportStyle,
            }),
          },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        toast.success(t("toasts.templateUpdated"));
        await fetchTemplates();
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message) {
          toast.error(message, { duration: 8000 });
        } else {
          toast.error(t("toasts.templateUpdateError"));
        }
      } finally {
        setUpdatingTemplateId(null);
      }
    },
    [selectedSections, locale, effectiveCurrency, sectionOrientations, tableSorts, reportStyle, t, fetchTemplates],
  );

  // ---------------------------------------------------------------
  // Apply a template's selection to the current state
  // ---------------------------------------------------------------
  const handleLoadTemplate = useCallback((tpl: ExportTemplateData) => {
    setSelectedSections(new Set(tpl.sections as PdfSectionId[]));
    setLocale(tpl.locale);
    setCurrency(tpl.currency);
    setSectionOrientations(tpl.sectionOrientations ?? {});
    setTableSorts(tpl.tableSorts ?? {});
    setReportStyle(tpl.reportStyle ?? "minimal");
  }, []);

  // ---------------------------------------------------------------
  // Inner content — shared between Dialog and Drawer
  // ---------------------------------------------------------------
  const body = (
    <PdfExportBody
      selectedSections={selectedSections}
      onToggleSection={toggleSection}
      onSelectAll={selectAllSections}
      onSelectNone={selectNoSections}
      locale={locale}
      onLocaleChange={setLocale}
      onCurrencyChange={setCurrency}
      currency={currency}
      sectionOrientations={sectionOrientations}
      onSectionOrientationChange={(sectionId, value) => {
        if (value === "auto") {
          // "Auto" = remove from map → falls back to auto-detection
          setSectionOrientations((prev) => {
            const next = { ...prev };
            delete next[sectionId];
            return next;
          });
        } else {
          setSectionOrientations((prev) => ({
            ...prev,
            [sectionId]: value,
          }));
        }
      }}
      onSetAllOrientations={setAllOrientations}
      reportStyle={reportStyle}
      onReportStyleChange={setReportStyle}
      pageMargin={pageMargin}
      onPageMarginChange={setPageMargin}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      onApplyPreset={applyPreset}
      tableSorts={tableSorts}
      onTableSortChange={(tableId, field, direction) => {
        setTableSorts((prev) => ({
          ...prev,
          [tableId]: { field, direction },
        }));
      }}
      onTableSortClear={(tableId) => {
        setTableSorts((prev) => {
          const next = { ...prev };
          delete next[tableId];
          return next;
        });
      }}
      templates={templates}
      isLoadingTemplates={isLoadingTemplates}
      newTemplateName={newTemplateName}
      onNewTemplateNameChange={setNewTemplateName}
      isSavingTemplate={isSavingTemplate}
      onSaveTemplate={handleSaveTemplate}
      deletingTemplateId={deletingTemplateId}
      updatingTemplateId={updatingTemplateId}
      onDeleteTemplate={handleDeleteTemplate}
      onUpdateTemplate={handleUpdateTemplate}
      onLoadTemplate={handleLoadTemplate}
    />
  );

  const footer = (
    <PdfExportFooter
      isExporting={isExporting}
      isExportDisabled={selectedSections.size === 0}
      onCancel={() => onOpenChange(false)}
      onExport={handleExport}
      cancelLabel={t("button.cancel")}
      exportLabel={t("button.export")}
      exportingLabel={t("button.exporting")}
    />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92dvh] flex flex-col">
          <DrawerHeader className="shrink-0 px-5 pb-3 pr-10 text-left">
            <DrawerTitle className="flex items-center gap-2 type-headline">
              <FileDown className="h-5 w-5 text-primary" />
              {t("title")}
            </DrawerTitle>
            <DrawerDescription>{t("description")}</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-5 py-5">
            {body}
          </div>
          <DrawerFooter className="shrink-0 border-t bg-background sticky bottom-0">
            {footer}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 pr-10">
          <DialogTitle className="flex items-center gap-2 type-headline">
            <FileDown className="h-5 w-5 text-primary" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-6 py-5">
          {body}
        </div>
        <DialogFooter className="shrink-0 border-t bg-background px-6 py-3 sm:justify-between">
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Body — Tabs (Obsah / Formát / Šablony) + sticky summary bar
// =====================================================================
type BodyProps = {
  selectedSections: Set<PdfSectionId>;
  onToggleSection: (id: PdfSectionId) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  locale: string;
  onLocaleChange: (v: string) => void;
  currency: string;
  onCurrencyChange: (v: string) => void;
  sectionOrientations: Partial<Record<string, "portrait" | "landscape">>;
  onSectionOrientationChange: (
    sectionId: string,
    value: "auto" | "portrait" | "landscape",
  ) => void;
  onSetAllOrientations: (value: "auto" | "portrait" | "landscape") => void;
  reportStyle: PdfReportStyle;
  onReportStyleChange: (style: PdfReportStyle) => void;
  pageMargin: PdfPageMargin;
  onPageMarginChange: (margin: PdfPageMargin) => void;
  activeTab: "content" | "format";
  onActiveTabChange: (tab: "content" | "format") => void;
  onApplyPreset: (preset: PresetConfig) => void;
  tableSorts: Partial<Record<string, { field: string; direction: "asc" | "desc" }>>;
  onTableSortChange: (
    tableId: string,
    field: string,
    direction: "asc" | "desc",
  ) => void;
  onTableSortClear: (tableId: string) => void;
  templates: ExportTemplateData[];
  isLoadingTemplates: boolean;
  newTemplateName: string;
  onNewTemplateNameChange: (v: string) => void;
  isSavingTemplate: boolean;
  onSaveTemplate: () => void;
  deletingTemplateId: string | null;
  updatingTemplateId: string | null;
  onDeleteTemplate: (id: string) => void;
  onUpdateTemplate: (id: string) => void;
  onLoadTemplate: (tpl: ExportTemplateData) => void;
};

function PdfExportBody({
  selectedSections,
  onToggleSection,
  onSelectAll,
  onSelectNone,
  locale,
  onLocaleChange,
  currency,
  onCurrencyChange,
  sectionOrientations,
  onSectionOrientationChange,
  onSetAllOrientations,
  reportStyle,
  onReportStyleChange,
  pageMargin,
  onPageMarginChange,
  activeTab,
  onActiveTabChange,
  onApplyPreset,
  tableSorts,
  onTableSortChange,
  onTableSortClear,
  templates,
  isLoadingTemplates,
  newTemplateName,
  onNewTemplateNameChange,
  isSavingTemplate,
  onSaveTemplate,
  deletingTemplateId,
  updatingTemplateId,
  onDeleteTemplate,
  onUpdateTemplate,
  onLoadTemplate,
}: BodyProps) {
  const t = useTranslations("dialogs.pdfExport");

  // Count of selected top-level sections.
  const selectedCount = useMemo(
    () => ORIENTABLE_SECTION_IDS.filter((id) => selectedSections.has(id)).length,
    [selectedSections],
  );

  // Count of sections with a non-auto orientation override.
  const customOrientationCount = Object.keys(sectionOrientations).length;

  // -----------------------------------------------------------------
  // renderSection — one row in the section picker.
  // Top-level sections get an inline OrientationToggle (3-way icon
  // button) on the right. Sub-sections are indented without a toggle.
  // Table sections (budget_items, payments, time, contacts) also get
  // a SortControl row below when selected — lets the user pick which
  // column to sort by + direction.
  // -----------------------------------------------------------------
  const isSortableTable = (id: PdfSectionId): boolean =>
    (SORTABLE_TABLE_IDS as readonly string[]).includes(id);

  const renderSection = (
    section: { id: PdfSectionId; labelKey: string; enabled: boolean },
    indent = false,
  ) => {
    const checked = selectedSections.has(section.id);
    const isTopLevel = !indent;
    const disabled = !section.enabled;
    const Icon = SECTION_ICONS[section.id] ?? Files;
    const sortable = isTopLevel && !disabled && checked && isSortableTable(section.id);

    // Can orient? Table sections always can. Overview sections can only
    // if this is the FIRST selected overview section (overview sections
    // share one page, so only the first one's orientation is honored).
    const isOverviewSection = (OVERVIEW_SECTION_IDS as readonly string[]).includes(section.id);
    const firstSelectedOverview = OVERVIEW_SECTION_IDS.find((id) => selectedSections.has(id));
    const canOrient = !isOverviewSection || section.id === firstSelectedOverview;

    // Current orientation override for this section (if any).
    const explicit = sectionOrientations[section.id];
    const currentOrientation: "auto" | "portrait" | "landscape" =
      explicit === "portrait" || explicit === "landscape" ? explicit : "auto";

    // Current sort for this table (if any).
    const currentSort = tableSorts[section.id];

    return (
      <div
        key={section.id}
        className={indent ? "ml-8 border-l border-outline-variant pl-4" : ""}
      >
        <div className="flex items-start gap-2 rounded-lg p-3 transition-colors hover:bg-muted/40 has-disabled:cursor-not-allowed has-disabled:hover:bg-transparent">
          {/* Left: checkbox + icon + label — clickable to toggle the section */}
          <Label
            htmlFor={`pdf-section-${section.id}`}
            className="flex flex-1 cursor-pointer items-start gap-3 has-disabled:cursor-not-allowed"
          >
            <Checkbox
              id={`pdf-section-${section.id}`}
              checked={checked}
              disabled={disabled}
              onCheckedChange={() => onToggleSection(section.id)}
              className="mt-0.5"
            />
            {isTopLevel ? (
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            ) : null}
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={
                    isTopLevel
                      ? "type-body font-medium"
                      : "type-label font-medium"
                  }
                >
                  {t(section.labelKey as never)}
                </span>
                {disabled && (
                  <>
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    <Badge
                      variant="secondary"
                      className="h-4 px-1.5 type-label-sm"
                    >
                      {t("sections.comingSoon")}
                    </Badge>
                  </>
                )}
              </div>
              {isTopLevel && (
                <p className="type-label text-muted-foreground">
                  {t(`${section.labelKey}Desc` as never)}
                </p>
              )}
            </div>
          </Label>

          {/* Right: inline orientation toggle — only for top-level,
              enabled, checked sections that are NOT non-first overview
              sections (overview sections share one page, so only the
              first selected overview section's orientation matters). */}
          {isTopLevel && !disabled && checked && canOrient ? (
            <OrientationToggle
              value={currentOrientation}
              onChange={(v) => onSectionOrientationChange(section.id, v)}
              labels={{
                auto: t("orientation.modes.auto"),
                portrait: t("orientation.portrait"),
                landscape: t("orientation.landscape"),
              }}
            />
          ) : null}
        </div>

        {/* Sort control row — only for sortable table sections when checked. */}
        {sortable ? (
          <div className="ml-8 mt-1 flex items-center gap-2 rounded-md border border-outline-variant bg-surface-container-low/50 px-3 py-2">
            <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="type-label-sm text-muted-foreground">
              {t("sort.label")}:
            </span>
            <Select
              value={currentSort?.field ?? DEFAULT_SORT_FIELD[section.id as "budget_items" | "payments" | "time" | "contacts"]}
              onValueChange={(field) => {
                onTableSortChange(
                  section.id,
                  field,
                  currentSort?.direction ?? "asc",
                );
              }}
            >
              <SelectTrigger className="h-7 flex-1 gap-1 type-label-sm" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTABLE_FIELDS_BY_TABLE[section.id as "budget_items" | "payments" | "time" | "contacts"].map((f) => (
                  <SelectItem key={f.id} value={f.id} className="type-label-sm">
                    {t(f.labelKey as never)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Direction toggle */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 p-0"
              onClick={() => {
                const dir = currentSort?.direction === "asc" ? "desc" : "asc";
                onTableSortChange(
                  section.id,
                  currentSort?.field ?? DEFAULT_SORT_FIELD[section.id as "budget_items" | "payments" | "time" | "contacts"],
                  dir,
                );
              }}
              title={currentSort?.direction === "desc" ? t("sort.descending") : t("sort.ascending")}
            >
              {currentSort?.direction === "desc" ? (
                <ArrowDown className="h-3.5 w-3.5" />
              ) : (
                <ArrowUp className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        ) : null}

        {/* Sub-sections (indented, no orientation toggle) */}
        {isTopLevel && checked && SUB_SECTIONS[section.id]
          ? SUB_SECTIONS[section.id].map((subId) => {
              const sub = ALL_SECTIONS.find((s) => s.id === subId);
              return sub ? renderSection(sub, true) : null;
            })
          : null}
      </div>
    );
  };

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------
  return (
    <div className="space-y-0 pb-2 pt-0">
      <Tabs
        value={activeTab}
        onValueChange={(v) => onActiveTabChange(v as typeof activeTab)}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="content">
            <Files className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("tabs.content")}</span>
            <Badge
              variant="secondary"
              className="ml-1 h-4 px-1.5 type-label-sm"
            >
              {selectedCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="format">
            <LayoutPanelLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("tabs.format")}</span>
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* Tab 1: Obsah — section picker + inline orientation toggles    */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="content" className="space-y-5 pt-6">
          {/* ① Šablony — user's saved templates (first, most personal) */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Save className="h-4 w-4 text-primary" />
                <h3 className="type-overline text-muted-foreground">
                  {t("templates.title")}
                </h3>
              </div>
              {/* Inline save template input */}
              <div className="flex gap-1.5">
                <Input
                  value={newTemplateName}
                  onChange={(e) => onNewTemplateNameChange(e.target.value)}
                  placeholder={t("templates.namePlaceholder")}
                  maxLength={100}
                  className="h-8 w-32 type-label-sm"
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !isSavingTemplate &&
                      newTemplateName.trim()
                    ) {
                      e.preventDefault();
                      onSaveTemplate();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={onSaveTemplate}
                  disabled={isSavingTemplate || !newTemplateName.trim()}
                >
                  {isSavingTemplate ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>

            {/* Templates list — horizontal scroll on mobile, grid on desktop */}
            {isLoadingTemplates ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-20 w-48 shrink-0 animate-pulse rounded-lg border bg-muted/40"
                  />
                ))}
              </div>
            ) : templates.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-center">
                <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                <p className="type-label-sm text-muted-foreground">
                  {t("templates.empty")}
                </p>
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="group flex w-48 shrink-0 flex-col gap-1.5 rounded-lg border border-outline-variant bg-surface-container-low p-2.5 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="truncate type-label font-medium leading-tight">
                        {tpl.name}
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteTemplate(tpl.id)}
                        disabled={deletingTemplateId === tpl.id}
                        className="shrink-0 text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        aria-label={t("templates.delete")}
                      >
                        {deletingTemplateId === tpl.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 type-label-sm text-muted-foreground">
                      <Badge variant="outline" className="h-4 px-1 type-label-sm">
                        {tpl.locale.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="h-4 px-1 type-label-sm">
                        {tpl.currency}
                      </Badge>
                      <span>{t("templates.sectionsCount", { count: tpl.sections.length })}</span>
                    </div>
                    {/* Action buttons — Load + Update side by side */}
                    <div className="mt-auto flex gap-1 pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 flex-1 gap-1 type-label-sm"
                        onClick={() => onLoadTemplate(tpl)}
                      >
                        <FolderOpen className="h-3 w-3" />
                        {t("templates.load")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 shrink-0 gap-0 p-0"
                        onClick={() => onUpdateTemplate(tpl.id)}
                        disabled={updatingTemplateId === tpl.id}
                        title={t("templates.update")}
                      >
                        {updatingTemplateId === tpl.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ② Rychlé Presety — 3 predefined configurations (horizontal scroll) */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="type-overline text-muted-foreground">
                {t("presets.title")}
              </h3>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onApplyPreset(preset)}
                  className="flex w-44 shrink-0 flex-col gap-1.5 rounded-lg border border-outline-variant bg-surface-container-low p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
                >
                  <preset.icon className="h-4 w-4 text-primary" />
                  <div className="type-label font-medium">
                    {t(preset.labelKey as never)}
                  </div>
                  <div className="type-label-sm text-muted-foreground">
                    {t(preset.descKey as never)}
                  </div>
                  <div className="mt-1 flex items-center gap-1 type-label-sm text-muted-foreground">
                    <Badge variant="outline" className="h-4 px-1.5 type-label-sm">
                      {preset.sections.length}
                    </Badge>
                    <span>{t("sections.count", { count: preset.sections.length })}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* ③ Section picker */}
          <section className="space-y-4">
            {/* Header: title + count + bulk actions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Files className="h-4 w-4 text-primary" />
                  <h3 className="type-overline text-muted-foreground">
                    {t("sections.title")}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onSelectAll}
                    disabled={
                      selectedCount === ORIENTABLE_SECTION_IDS.length
                    }
                  >
                    <ListChecks className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">
                      {t("sections.selectAll")}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onSelectNone}
                    disabled={selectedCount === 0}
                  >
                    <ListX className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">
                      {t("sections.selectNone")}
                    </span>
                  </Button>
                </div>
              </div>

              {/* Count + quick orientation actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2">
                <span className="type-label-sm text-muted-foreground">
                  {t("sections.countSelected", {
                    selected: selectedCount,
                    total: ORIENTABLE_SECTION_IDS.length,
                  })}
                </span>
                {/* Quick orientation: set all at once */}
                <div className="flex items-center gap-1">
                  <span className="mr-1 type-label-sm text-muted-foreground">
                    {t("orientation.quickActions")}:
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onSetAllOrientations("auto")}
                    disabled={customOrientationCount === 0}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">
                      {t("orientation.modes.auto")}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onSetAllOrientations("portrait")}
                  >
                    <RectangleVertical className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">
                      {t("orientation.portrait")}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onSetAllOrientations("landscape")}
                  >
                    <RectangleHorizontal className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">
                      {t("orientation.landscape")}
                    </span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Categorized section list */}
            <div className="space-y-5">
              {SECTION_CATEGORIES.map((category) => (
                <div key={category.id} className="space-y-2">
                  <div className="flex items-center gap-1.5 type-overline text-muted-foreground/80">
                    <Layers className="h-3.5 w-3.5" />
                    {t(category.labelKey as never)}
                  </div>
                  <div className="space-y-1 rounded-xl border bg-muted/20 p-1.5">
                    {category.sectionIds.map((sectionId) => {
                      const meta = ALL_SECTIONS.find(
                        (s) => s.id === sectionId,
                      );
                      if (!meta) return null;
                      return renderSection(meta);
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* Tab 2: Formát — language + currency + visual style           */}
        {/* (Page orientation moved to Content tab — inline per section)  */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="format" className="space-y-5 pt-6">
          {/* Language + currency */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <h3 className="type-overline text-muted-foreground">
                {t("locale.title")}
              </h3>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pdf-locale">
                  {t("locale.language")}
                </Label>
                <Select value={locale} onValueChange={onLocaleChange}>
                  <SelectTrigger id="pdf-locale" className="w-full gap-2">
                    <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {locales.map((loc) => {
                      const meta = LOCALE_META[loc];
                      return (
                        <SelectItem
                          key={loc}
                          value={loc}
                          textValue={meta.name}
                        >
                          <span>
                            {meta.flag} {meta.name}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pdf-currency">
                  {t("locale.currency")}
                </Label>
                <Select value={currency} onValueChange={onCurrencyChange}>
                  <SelectTrigger id="pdf-currency" className="w-full gap-2">
                    <Coins className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_CURRENCIES.map((c) => (
                      <SelectItem
                        key={c.code}
                        value={c.code}
                        textValue={c.label}
                      >
                        <span>{c.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <Separator />

          {/* Report visual style */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              <h3 className="type-overline text-muted-foreground">
                {t("style.title")}
              </h3>
            </div>
            <SegmentedButton
              value={reportStyle}
              onChange={(v) => onReportStyleChange(v as PdfReportStyle)}
              className="w-full"
              options={[
                {
                  value: "minimal",
                  label: t("style.modes.minimal"),
                  icon: Files,
                },
                {
                  value: "colorful",
                  label: t("style.modes.colorful"),
                  icon: Palette,
                },
              ]}
            />
          </section>

          <Separator />

          {/* Page margins */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <LayoutPanelLeft className="h-4 w-4 text-primary" />
              <h3 className="type-overline text-muted-foreground">
                {t("margins.title")}
              </h3>
            </div>
            <SegmentedButton
              value={pageMargin}
              onChange={(v) => onPageMarginChange(v as PdfPageMargin)}
              className="w-full"
              options={[
                {
                  value: "narrow",
                  label: t("margins.narrow"),
                  icon: RectangleVertical,
                },
                {
                  value: "normal",
                  label: t("margins.normal"),
                  icon: RectangleVertical,
                },
                {
                  value: "wide",
                  label: t("margins.wide"),
                  icon: RectangleVertical,
                },
              ]}
            />
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================================
// Footer — Cancel + Export buttons
// =====================================================================
type FooterProps = {
  isExporting: boolean;
  isExportDisabled?: boolean;
  onCancel: () => void;
  onExport: () => void;
  cancelLabel: string;
  exportLabel: string;
  exportingLabel: string;
};

function PdfExportFooter({
  isExporting,
  isExportDisabled = false,
  onCancel,
  onExport,
  cancelLabel,
  exportLabel,
  exportingLabel,
}: FooterProps) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={onCancel}
        disabled={isExporting}
        className="sm:mr-auto"
      >
        {cancelLabel}
      </Button>
      <Button
        type="button"
        onClick={onExport}
        disabled={isExporting || isExportDisabled}
        className="sm:flex-1 sm:max-w-[16rem]"
      >
        {isExporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileDown className="h-4 w-4" />
        )}
        {isExporting ? exportingLabel : exportLabel}
      </Button>
    </>
  );
}
