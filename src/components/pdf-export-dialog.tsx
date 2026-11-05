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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ALL_SECTIONS,
  SUB_SECTIONS,
  ORIENTABLE_SECTION_IDS,
  SORTABLE_TABLE_IDS,
  SORTABLE_FIELDS_BY_TABLE,
  DEFAULT_SORT_FIELD,
  type PdfSectionId,
  type PdfReportStyle,
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

const CUSTOM_CURRENCY_VALUE = "__custom__";

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
const TOP_LEVEL_SECTION_IDS: PdfSectionId[] = [
  "header",
  "summary",
  "property",
  "alerts",
  "projection",
  "budget_items",
  "payments",
  "time",
  "contacts",
];

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
  const [customCurrency, setCustomCurrency] = useState<string>("");
  const [isCustomCurrency, setIsCustomCurrency] = useState<boolean>(false);

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

  // Per-table sort (Phase 4+). Keys are table section IDs.
  // Absent entries = default ordering (sortOrder / date / name).
  const [tableSorts, setTableSorts] = useState<
    Partial<Record<string, { field: string; direction: "asc" | "desc" }>>
  >({});

  // Active tab in the dialog (Phase 3B).
  const [activeTab, setActiveTab] = useState<"content" | "format" | "templates">("content");

  const [isExporting, setIsExporting] = useState(false);
  const [templates, setTemplates] = useState<ExportTemplateData[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(
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
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    setSelectedSections(new Set(DEFAULT_SECTIONS));
    setLocale(currentLocale);
    setCurrency("CZK");
    setCustomCurrency("");
    setIsCustomCurrency(false);
    setSectionOrientations({});
    setReportStyle("minimal");
    setTableSorts({});
    setActiveTab("content");
    setNewTemplateName("");
    void fetchTemplates();
  }, [open, currentLocale, fetchTemplates]);

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
  const effectiveCurrency = (isCustomCurrency
    ? customCurrency.toUpperCase().trim()
    : currency) || "CZK";

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
        `&${orientationParams.toString()}` +
        `&${sortParams.toString()}`;

      // Use a hidden iframe instead of window.open — avoids the popup
      // blocker that triggers on some browsers (especially Safari/iOS)
      // and prevents the "new tab" flash on desktop.
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = url;
      document.body.appendChild(iframe);

      // Clean up the iframe after a generous delay — long enough for the
      // server to start streaming the PDF, short enough not to litter
      // the DOM with orphaned iframes on repeated exports.
      window.setTimeout(() => {
        iframe.remove();
      }, 60_000);

      // Give the browser a beat to start the download, then notify.
      window.setTimeout(() => {
        toast.success(t("toasts.success"), { id: "pdf-export" });
        setIsExporting(false);
      }, 1500);
    } catch {
      toast.error(t("toasts.error"), { id: "pdf-export" });
      setIsExporting(false);
    }
  }, [selectedSections, projectId, locale, effectiveCurrency, sectionOrientations, reportStyle, tableSorts, t]);

  // ---------------------------------------------------------------
  // Save current selection as a template
  // ---------------------------------------------------------------
  const handleSaveTemplate = useCallback(async () => {
    const name = newTemplateName.trim();
    if (!name) {
      toast.error(t("toasts.error"));
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
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? "Failed to save template");
      }
      toast.success(t("toasts.templateSaved"));
      setNewTemplateName("");
      await fetchTemplates();
    } catch {
      toast.error(t("toasts.error"));
    } finally {
      setIsSavingTemplate(false);
    }
  }, [newTemplateName, selectedSections, locale, effectiveCurrency, t, fetchTemplates]);

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
        if (!res.ok) throw new Error("Failed to delete template");
        toast.success(t("toasts.templateDeleted"));
        await fetchTemplates();
      } catch {
        toast.error(t("toasts.error"));
      } finally {
        setDeletingTemplateId(null);
      }
    },
    [t, fetchTemplates],
  );

  // ---------------------------------------------------------------
  // Apply a template's selection to the current state
  // ---------------------------------------------------------------
  const handleLoadTemplate = useCallback((tpl: ExportTemplateData) => {
    setSelectedSections(new Set(tpl.sections as PdfSectionId[]));
    setLocale(tpl.locale);
    // If the template's currency is in our common list, use the dropdown,
    // otherwise switch to "custom" mode with the code pre-filled.
    const isCommon = COMMON_CURRENCIES.some((c) => c.code === tpl.currency);
    if (isCommon) {
      setIsCustomCurrency(false);
      setCurrency(tpl.currency);
    } else {
      setIsCustomCurrency(true);
      setCurrency(CUSTOM_CURRENCY_VALUE);
      setCustomCurrency(tpl.currency);
    }
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
      currency={currency}
      onCurrencyChange={(v) => {
        if (v === CUSTOM_CURRENCY_VALUE) {
          setIsCustomCurrency(true);
          setCurrency(CUSTOM_CURRENCY_VALUE);
        } else {
          setIsCustomCurrency(false);
          setCurrency(v);
        }
      }}
      isCustomCurrency={isCustomCurrency}
      customCurrency={customCurrency}
      onCustomCurrencyChange={setCustomCurrency}
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
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
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
      onDeleteTemplate={handleDeleteTemplate}
      onLoadTemplate={handleLoadTemplate}
    />
  );

  const footer = (
    <PdfExportFooter
      isExporting={isExporting}
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
  isCustomCurrency: boolean;
  customCurrency: string;
  onCustomCurrencyChange: (v: string) => void;
  sectionOrientations: Partial<Record<string, "portrait" | "landscape">>;
  onSectionOrientationChange: (
    sectionId: string,
    value: "auto" | "portrait" | "landscape",
  ) => void;
  onSetAllOrientations: (value: "auto" | "portrait" | "landscape") => void;
  reportStyle: PdfReportStyle;
  onReportStyleChange: (style: PdfReportStyle) => void;
  activeTab: "content" | "format" | "templates";
  onActiveTabChange: (tab: "content" | "format" | "templates") => void;
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
  onDeleteTemplate: (id: string) => void;
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
  isCustomCurrency,
  customCurrency,
  onCustomCurrencyChange,
  sectionOrientations,
  onSectionOrientationChange,
  onSetAllOrientations,
  reportStyle,
  onReportStyleChange,
  activeTab,
  onActiveTabChange,
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
  onDeleteTemplate,
  onLoadTemplate,
}: BodyProps) {
  const t = useTranslations("dialogs.pdfExport");

  // Count of selected top-level sections.
  const selectedCount = useMemo(
    () => TOP_LEVEL_SECTION_IDS.filter((id) => selectedSections.has(id)).length,
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
              enabled, checked sections. Unchecked sections don't need
              orientation (no page = no orientation to set). */}
          {isTopLevel && !disabled && checked ? (
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
        <TabsList className="grid w-full grid-cols-3">
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
          <TabsTrigger value="templates">
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("tabs.templates")}</span>
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* Tab 1: Obsah — section picker + inline orientation toggles    */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="content" className="space-y-5 pt-6">
          {/* Presets placeholder */}
          <div className="rounded-xl border border-dashed border-muted-foreground/30 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <h3 className="type-overline text-muted-foreground">
                {t("presets.title")}
              </h3>
              <Badge variant="outline" className="h-4 px-1.5 type-label-sm">
                {t("presets.comingSoon")}
              </Badge>
            </div>
            <p className="mt-1.5 type-label-sm text-muted-foreground">
              {t("presets.description")}
            </p>
          </div>

          {/* Section picker */}
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
                      selectedCount === TOP_LEVEL_SECTION_IDS.length
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
                    total: TOP_LEVEL_SECTION_IDS.length,
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
                    <SelectItem
                      value={CUSTOM_CURRENCY_VALUE}
                      textValue={t("locale.currency")}
                    >
                      <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-muted-foreground italic">
                        ISO 4217…
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isCustomCurrency && (
              <div className="space-y-2">
                <Label htmlFor="pdf-currency-custom">
                  ISO 4217
                </Label>
                <Input
                  id="pdf-currency-custom"
                  value={customCurrency}
                  onChange={(e) =>
                    onCustomCurrencyChange(
                      e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z]/g, "")
                        .slice(0, 3),
                    )
                  }
                  placeholder="JPY"
                  maxLength={3}
                  className="w-24 font-mono uppercase"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-3 type-label text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t("locale.conversionHint")}</span>
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
            <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-3 type-label text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {reportStyle === "minimal"
                  ? t("style.hints.minimal")
                  : t("style.hints.colorful")}
              </span>
            </div>
          </section>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* Tab 3: Šablony                                                */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="templates" className="space-y-4 pt-6">
          <div className="flex items-center gap-2">
            <Save className="h-4 w-4 text-primary" />
            <h3 className="type-overline text-muted-foreground">
              {t("templates.title")}
            </h3>
          </div>

          {/* Save new template */}
          <div className="space-y-2">
            <Label htmlFor="pdf-template-name">
              {t("templates.saveAs")}
            </Label>
            <div className="flex gap-2">
              <Input
                id="pdf-template-name"
                value={newTemplateName}
                onChange={(e) => onNewTemplateNameChange(e.target.value)}
                placeholder={t("templates.namePlaceholder")}
                maxLength={100}
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
                onClick={onSaveTemplate}
                disabled={isSavingTemplate || !newTemplateName.trim()}
                className="shrink-0"
              >
                {isSavingTemplate ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t("templates.save")}
              </Button>
            </div>
          </div>

          {/* Templates list */}
          <div className="space-y-2">
            <div className="type-label font-medium text-muted-foreground">
              {t("templates.myTemplates")}
            </div>

            {isLoadingTemplates ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-20 animate-pulse rounded-lg border bg-muted/40"
                  />
                ))}
              </div>
            ) : templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed py-8 text-center">
                <FolderOpen className="h-5 w-5 text-muted-foreground/50" />
                <p className="type-label text-muted-foreground">
                  {t("templates.empty")}
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {templates.map((tpl) => (
                  <li
                    key={tpl.id}
                    className="rounded-xl border p-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate type-body font-medium">
                          {tpl.name}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 type-label text-muted-foreground">
                          <Badge
                            variant="outline"
                            className="h-4 px-1.5 type-label-sm"
                          >
                            {tpl.locale.toUpperCase()}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="h-4 px-1.5 type-label-sm"
                          >
                            {tpl.currency}
                          </Badge>
                          <span>
                            {t("templates.sectionsCount", {
                              count: tpl.sections.length,
                            })}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onLoadTemplate(tpl)}
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          {t("templates.load")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => onDeleteTemplate(tpl.id)}
                          disabled={deletingTemplateId === tpl.id}
                          aria-label={t("templates.delete")}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          {deletingTemplateId === tpl.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
  onCancel: () => void;
  onExport: () => void;
  cancelLabel: string;
  exportLabel: string;
  exportingLabel: string;
};

function PdfExportFooter({
  isExporting,
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
        disabled={isExporting}
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
