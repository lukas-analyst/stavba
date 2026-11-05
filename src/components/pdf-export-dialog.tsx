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
  SlidersHorizontal,
  Sparkles,
  RotateCcw,
  Copy,
  ListChecks,
  ListX,
  Layers,
  Palette,
  Eye,
  Home,
  ChartColumnBig,
  Building2,
  TriangleAlert,
  TrendingUp,
  ClipboardList,
  CreditCard,
  Clock,
  Users,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ALL_SECTIONS,
  SUB_SECTIONS,
  ORIENTABLE_SECTION_IDS,
  type PdfSectionId,
  type PdfOrientationMode,
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
// Page-preview computation (Phase 3C)
// ---------------------------------------------------------------------
// Mirrors the orientation logic in pdf-components.tsx's resolveOrientation.
// Used by the PagePreview component to show portrait/landscape thumbnails
// before the user exports the PDF.
// =====================================================================

const WIDE_BUDGET_THRESHOLD = 7;
const WIDE_CONTACTS_THRESHOLD = 7;

function countBudgetColumns(sections: PdfSectionId[]): number {
  let count = 2;
  if (sections.includes("phase")) count++;
  if (sections.includes("plan_cost")) count++;
  if (sections.includes("actual_cost")) count++;
  if (sections.includes("status")) count++;
  if (sections.includes("dates")) count += 2;
  if (sections.includes("supplier")) count++;
  return count;
}

function countContactsColumns(sections: PdfSectionId[]): number {
  let count = 4;
  if (sections.includes("contact_type")) count++;
  if (sections.includes("contact_phone")) count++;
  if (sections.includes("contact_email")) count++;
  if (sections.includes("contact_ico")) count++;
  if (sections.includes("contact_notes")) count++;
  return count;
}

/**
 * Resolve the effective page orientation for a given section, mirroring
 * the server-side resolveOrientation logic. Returns "portrait" or "landscape".
 */
function resolvePreviewOrientation(
  sectionId: PdfSectionId,
  sections: PdfSectionId[],
  mode: PdfOrientationMode,
  sectionOrientations: Partial<Record<string, "portrait" | "landscape">>,
): "portrait" | "landscape" {
  if (mode === "all-portrait") return "portrait";
  if (mode === "all-landscape") return "landscape";

  if (mode === "custom") {
    const override = sectionOrientations[sectionId];
    if (override === "portrait" || override === "landscape") return override;
  }

  // Auto fallback.
  if (sectionId === "budget_items") {
    return countBudgetColumns(sections) >= WIDE_BUDGET_THRESHOLD
      ? "landscape"
      : "portrait";
  }
  if (sectionId === "contacts") {
    return countContactsColumns(sections) >= WIDE_CONTACTS_THRESHOLD
      ? "landscape"
      : "portrait";
  }
  return "portrait";
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

  // Page orientation (Phase 2G+). Default = "auto" (wide-table detection).
  // "custom" reveals per-section Portrait/Landscape toggles.
  const [orientationMode, setOrientationMode] = useState<PdfOrientationMode>("auto");
  const [sectionOrientations, setSectionOrientations] = useState<
    Partial<Record<string, "portrait" | "landscape">>
  >({});

  // Report visual style (Phase 3). Default = "minimal".
  // "colorful" enables MD3-accented headers, KPI tiles, badges.
  const [reportStyle, setReportStyle] = useState<PdfReportStyle>("minimal");

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
    setOrientationMode("auto");
    setSectionOrientations({});
    setReportStyle("minimal");
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
      orientationParams.set("orientationMode", orientationMode);
      if (orientationMode === "custom") {
        for (const sectionId of ORIENTABLE_SECTION_IDS) {
          const v = sectionOrientations[sectionId];
          if (v === "portrait" || v === "landscape") {
            orientationParams.set(`orientation-${sectionId}`, v);
          }
        }
      }
      const url =
        `/api/projects/${projectId}/export-pdf` +
        `?locale=${encodeURIComponent(locale)}` +
        `&currency=${encodeURIComponent(effectiveCurrency)}` +
        `&sections=${encodeURIComponent(sections)}` +
        `&reportStyle=${encodeURIComponent(reportStyle)}` +
        `&${orientationParams.toString()}`;

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
  }, [selectedSections, projectId, locale, effectiveCurrency, orientationMode, sectionOrientations, reportStyle, t]);

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
      orientationMode={orientationMode}
      onOrientationModeChange={setOrientationMode}
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
      reportStyle={reportStyle}
      onReportStyleChange={setReportStyle}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
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
          <DrawerHeader className="shrink-0 px-4 pb-2 text-left">
            <DrawerTitle className="flex items-center gap-2">
              <FileDown className="h-5 w-5 text-primary" />
              {t("title")}
            </DrawerTitle>
            <DrawerDescription>{t("description")}</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4">
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
        <DialogHeader className="shrink-0 px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-primary" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-5">
          {body}
        </div>
        <DialogFooter className="shrink-0 border-t bg-background px-5 py-3 sm:justify-between">
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
  orientationMode: PdfOrientationMode;
  onOrientationModeChange: (mode: PdfOrientationMode) => void;
  sectionOrientations: Partial<Record<string, "portrait" | "landscape">>;
  onSectionOrientationChange: (
    sectionId: string,
    value: "auto" | "portrait" | "landscape",
  ) => void;
  reportStyle: PdfReportStyle;
  onReportStyleChange: (style: PdfReportStyle) => void;
  activeTab: "content" | "format" | "templates";
  onActiveTabChange: (tab: "content" | "format" | "templates") => void;
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
  orientationMode,
  onOrientationModeChange,
  sectionOrientations,
  onSectionOrientationChange,
  reportStyle,
  onReportStyleChange,
  activeTab,
  onActiveTabChange,
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

  // Helper: count of selected top-level sections (excluding sub-sections,
  // which are rendered as columns within their parent's table).
  const selectedCount = useMemo(
    () => TOP_LEVEL_SECTION_IDS.filter((id) => selectedSections.has(id)).length,
    [selectedSections],
  );

  // Compute the list of pages that will appear in the PDF (one per selected
  // top-level section, in canonical order). Used by the page-preview panel.
  const previewPages = useMemo(() => {
    return TOP_LEVEL_SECTION_IDS.filter((id) => selectedSections.has(id)).map(
      (id) => ({
        id,
        orientation: resolvePreviewOrientation(
          id,
          Array.from(selectedSections),
          orientationMode,
          sectionOrientations,
        ),
      }),
    );
  }, [selectedSections, orientationMode, sectionOrientations]);

  // Translate a section ID to its display label.
  const sectionLabel = (id: PdfSectionId) => {
    const meta = ALL_SECTIONS.find((s) => s.id === id);
    return meta ? t(meta.labelKey as never) : id;
  };

  // Render a single section row (top-level or sub-section, controlled by `indent`).
  const renderSection = (
    section: { id: PdfSectionId; labelKey: string; enabled: boolean },
    indent = false,
  ) => {
    const checked = selectedSections.has(section.id);
    const isSubSection = indent;
    const disabled = !section.enabled;
    const Icon = SECTION_ICONS[section.id] ?? Files;

    return (
      <div
        key={section.id}
        className={indent ? "ml-6 border-l border-outline-variant pl-3" : ""}
      >
        <Label
          htmlFor={`pdf-section-${section.id}`}
          className="flex cursor-pointer items-start gap-3 rounded-md p-2 transition-colors hover:bg-muted/40 has-disabled:cursor-not-allowed has-disabled:hover:bg-transparent"
        >
          <Checkbox
            id={`pdf-section-${section.id}`}
            checked={checked}
            disabled={disabled}
            onCheckedChange={() => onToggleSection(section.id)}
            className="mt-0.5"
          />
          {/* Icon — only for top-level sections (sub-sections inherit their
              parent's icon visually, so we hide the icon for indent rows
              to keep them compact). */}
          {!isSubSection ? (
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          ) : null}
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={
                  isSubSection
                    ? "type-label font-medium"
                    : "type-body font-medium"
                }
              >
                {t(section.labelKey as never)}
              </span>
              {disabled && (
                <>
                  <Lock className="h-3 w-3 text-muted-foreground" />
                  <Badge
                    variant="secondary"
                    className="h-4 px-1.5 type-label-sm"
                  >
                    {t("sections.comingSoon")}
                  </Badge>
                </>
              )}
            </div>
            {!isSubSection && (
              <p className="type-label text-muted-foreground">
                {t(`${section.labelKey}Desc` as never)}
              </p>
            )}
          </div>
        </Label>
      </div>
    );
  };

  // -----------------------------------------------------------------
  // Sticky summary bar — always visible at the top of the body,
  // shows current config at a glance.
  // -----------------------------------------------------------------
  const summaryBar = (
    <div className="sticky top-0 z-10 -mx-5 mb-3 border-b bg-background/95 px-5 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 type-label-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Files className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{selectedCount}</span>
          <span>{t("summaryBar.sections")}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">
            {LOCALE_META[locale as Locale]?.flag ?? "🌐"}{" "}
            {LOCALE_META[locale as Locale]?.name ?? locale}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <Coins className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">
            {isCustomCurrency ? (customCurrency || "—") : currency}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <LayoutPanelLeft className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">
            {orientationMode === "auto" && t("orientation.modes.auto")}
            {orientationMode === "all-portrait" && t("orientation.modes.portrait")}
            {orientationMode === "all-landscape" && t("orientation.modes.landscape")}
            {orientationMode === "custom" && t("orientation.modes.custom")}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <Palette className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">
            {reportStyle === "minimal" ? t("style.modes.minimal") : t("style.modes.colorful")}
          </span>
        </span>
      </div>
    </div>
  );

  // -----------------------------------------------------------------
  // Page-preview panel (Phase 3C) — thumbnails of each PDF page,
  // portrait = narrow, landscape = wide.
  // -----------------------------------------------------------------
  const pagePreview = (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-primary" />
        <h3 className="type-label font-semibold uppercase tracking-wide text-muted-foreground">
          {t("preview.title")}
        </h3>
      </div>
      <p className="type-label text-muted-foreground">
        {t("preview.description")}
      </p>
      {previewPages.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed py-6 text-center">
          <FileDown className="h-5 w-5 text-muted-foreground/50" />
          <p className="type-label text-muted-foreground">
            {t("preview.empty")}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 rounded-md border bg-surface p-3">
          {previewPages.map((page, idx) => {
            const isLandscape = page.orientation === "landscape";
            const Icon = SECTION_ICONS[page.id] ?? Files;
            return (
              <div
                key={page.id}
                className="group flex flex-col items-center gap-1"
                title={sectionLabel(page.id)}
              >
                {/* Thumbnail — aspect ratio mirrors A4 (portrait = 1:1.414,
                    landscape = 1.414:1). Tinted with primary color and
                    showing the section's icon as a visual hint. */}
                <div
                  className={
                    "relative flex items-center justify-center rounded-sm border-2 border-muted-foreground/30 bg-muted/40 transition-colors group-hover:border-primary/50 " +
                    (isLandscape ? "h-12 w-[42px]" : "h-[42px] w-8")
                  }
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />
                  {/* Orientation indicator dot */}
                  <span
                    className={
                      "absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full " +
                      (isLandscape ? "bg-amber-500" : "bg-emerald-500")
                    }
                    title={isLandscape ? t("orientation.landscape") : t("orientation.portrait")}
                  />
                </div>
                <span className="max-w-[60px] truncate type-label-sm text-muted-foreground">
                  {idx + 1}. {sectionLabel(page.id)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------
  return (
    <div className="space-y-0 pb-2 pt-0">
      {summaryBar}

      <Tabs value={activeTab} onValueChange={(v) => onActiveTabChange(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="content">
            <Files className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("tabs.content")}</span>
            <Badge variant="secondary" className="ml-1 h-4 px-1.5 type-label-sm">
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

        {/* ═══ Tab 1: Obsah (sections + categories + select all/none) ═══ */}
        <TabsContent value="content" className="space-y-4 pt-4">
          {/* Presets placeholder — reserved for future use (no hardcoded presets yet). */}
          <div className="rounded-md border border-dashed border-muted-foreground/30 p-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <h3 className="type-label font-semibold uppercase tracking-wide text-muted-foreground">
                {t("presets.title")}
              </h3>
              <Badge variant="outline" className="h-4 px-1.5 type-label-sm">
                {t("presets.comingSoon")}
              </Badge>
            </div>
            <p className="mt-1 type-label-sm text-muted-foreground">
              {t("presets.description")}
            </p>
          </div>

          {/* Section picker — bulk actions + count + categorized list */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Files className="h-4 w-4 text-primary" />
                <h3 className="type-label font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("sections.title")}
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 type-label-sm"
                  onClick={onSelectAll}
                  disabled={selectedCount === TOP_LEVEL_SECTION_IDS.length}
                >
                  <ListChecks className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t("sections.selectAll")}</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 type-label-sm"
                  onClick={onSelectNone}
                  disabled={selectedCount === 0}
                >
                  <ListX className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t("sections.selectNone")}</span>
                </Button>
              </div>
            </div>

            {/* Count badge */}
            <div className="type-label-sm text-muted-foreground">
              {t("sections.countSelected", {
                selected: selectedCount,
                total: TOP_LEVEL_SECTION_IDS.length,
              })}
            </div>

            {/* Categorized section list — Overview + Tables */}
            {SECTION_CATEGORIES.map((category) => (
              <div key={category.id} className="space-y-1">
                <div className="flex items-center gap-1.5 type-label font-semibold uppercase tracking-wide text-muted-foreground/80">
                  <Layers className="h-3 w-3" />
                  {t(category.labelKey as never)}
                </div>
                <div className="space-y-0.5">
                  {category.sectionIds.map((sectionId) => {
                    const meta = ALL_SECTIONS.find((s) => s.id === sectionId);
                    if (!meta) return null;
                    return (
                      <div key={sectionId}>
                        {renderSection(meta)}
                        {/* Render sub-sections when parent is checked */}
                        {selectedSections.has(sectionId) &&
                          SUB_SECTIONS[sectionId]?.map((subId) => {
                            const sub = ALL_SECTIONS.find((s) => s.id === subId);
                            return sub ? renderSection(sub, true) : null;
                          })}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Landscape hint */}
            <div className="flex items-start gap-2 rounded-md bg-muted/40 p-2.5 type-label-sm text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{t("sections.landscapeHint")}</span>
            </div>
          </section>
        </TabsContent>

        {/* ═══ Tab 2: Formát (locale + currency + orientation + style + preview) ═══ */}
        <TabsContent value="format" className="space-y-6 pt-4">
          {/* Language + currency */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <h3 className="type-label font-semibold uppercase tracking-wide text-muted-foreground">
                {t("locale.title")}
              </h3>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pdf-locale" className="type-label">
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
                        <SelectItem key={loc} value={loc} textValue={meta.name}>
                          <span>{meta.flag} {meta.name}</span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pdf-currency" className="type-label">
                  {t("locale.currency")}
                </Label>
                <Select value={currency} onValueChange={onCurrencyChange}>
                  <SelectTrigger id="pdf-currency" className="w-full gap-2">
                    <Coins className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code} textValue={c.label}>
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
              <div className="space-y-1.5">
                <Label htmlFor="pdf-currency-custom" className="type-label">
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

            <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5 type-label text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t("locale.conversionHint")}</span>
            </div>
          </section>

          <Separator />

          {/* Report visual style (Phase 3) — minimal vs colorful */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              <h3 className="type-label font-semibold uppercase tracking-wide text-muted-foreground">
                {t("style.title")}
              </h3>
            </div>
            <SegmentedButton
              value={reportStyle}
              onChange={(v) => onReportStyleChange(v as PdfReportStyle)}
              className="w-full"
              options={[
                { value: "minimal", label: t("style.modes.minimal"), icon: Files },
                { value: "colorful", label: t("style.modes.colorful"), icon: Palette },
              ]}
            />
            <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5 type-label text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {reportStyle === "minimal"
                  ? t("style.hints.minimal")
                  : t("style.hints.colorful")}
              </span>
            </div>
          </section>

          <Separator />

          {/* Page orientation */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <LayoutPanelLeft className="h-4 w-4 text-primary" />
              <h3 className="type-label font-semibold uppercase tracking-wide text-muted-foreground">
                {t("orientation.title")}
              </h3>
            </div>
            <SegmentedButton
              value={orientationMode}
              onChange={(v) => onOrientationModeChange(v as PdfOrientationMode)}
              className="w-full"
              options={[
                { value: "auto", label: t("orientation.modes.auto"), icon: Sparkles },
                { value: "all-portrait", label: t("orientation.modes.portrait"), icon: RectangleVertical },
                { value: "all-landscape", label: t("orientation.modes.landscape"), icon: RectangleHorizontal },
                { value: "custom", label: t("orientation.modes.custom"), icon: SlidersHorizontal },
              ]}
            />
            <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5 type-label text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {orientationMode === "auto" && t("orientation.hints.auto")}
                {orientationMode === "all-portrait" && t("orientation.hints.allPortrait")}
                {orientationMode === "all-landscape" && t("orientation.hints.allLandscape")}
                {orientationMode === "custom" && t("orientation.hints.custom")}
              </span>
            </div>

            {orientationMode === "custom" ? (
              <div className="space-y-2 rounded-md border bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="type-label font-medium text-muted-foreground">
                    {t("orientation.perSectionTitle")}
                  </div>
                  {Object.keys(sectionOrientations).length > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 type-label-sm text-muted-foreground"
                      onClick={() => {
                        for (const id of ORIENTABLE_SECTION_IDS) {
                          onSectionOrientationChange(id, "auto");
                        }
                      }}
                    >
                      <RotateCcw className="h-3 w-3" />
                      {t("orientation.resetAll")}
                    </Button>
                  ) : null}
                </div>
                {ORIENTABLE_SECTION_IDS.filter((id) => selectedSections.has(id)).length === 0 ? (
                  <div className="py-3 text-center type-label text-muted-foreground italic">
                    {t("orientation.noSections")}
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {ORIENTABLE_SECTION_IDS.filter((id) => selectedSections.has(id)).map((sectionId) => {
                      const explicit = sectionOrientations[sectionId];
                      const currentValue: "auto" | "portrait" | "landscape" =
                        explicit === "portrait" || explicit === "landscape"
                          ? explicit
                          : "auto";
                      return (
                        <div
                          key={sectionId}
                          className="flex flex-col gap-1.5 rounded-md border border-outline-variant p-2"
                        >
                          <Label className="type-label-sm font-medium leading-tight">
                            {sectionLabel(sectionId)}
                          </Label>
                          <SegmentedButton
                            value={currentValue}
                            onChange={(v) =>
                              onSectionOrientationChange(
                                sectionId,
                                v as "auto" | "portrait" | "landscape",
                              )
                            }
                            size="sm"
                            className="w-full"
                            options={[
                              { value: "auto", label: t("orientation.modes.auto"), icon: Sparkles },
                              { value: "portrait", label: t("orientation.portrait"), icon: RectangleVertical },
                              { value: "landscape", label: t("orientation.landscape"), icon: RectangleHorizontal },
                            ]}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </section>

          <Separator />

          {/* Page preview (Phase 3C) */}
          {pagePreview}
        </TabsContent>

        {/* ═══ Tab 3: Šablony ═══ */}
        <TabsContent value="templates" className="space-y-3 pt-4">
          <div className="flex items-center gap-2">
            <Save className="h-4 w-4 text-primary" />
            <h3 className="type-label font-semibold uppercase tracking-wide text-muted-foreground">
              {t("templates.title")}
            </h3>
          </div>

          {/* Save new template */}
          <div className="space-y-1.5">
            <Label htmlFor="pdf-template-name" className="type-label">
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
                  if (e.key === "Enter" && !isSavingTemplate && newTemplateName.trim()) {
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
                    className="h-20 animate-pulse rounded-md border bg-muted/40"
                  />
                ))}
              </div>
            ) : templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed py-6 text-center">
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
                    className="rounded-md border p-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate type-body font-medium">
                          {tpl.name}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 type-label text-muted-foreground">
                          <Badge variant="outline" className="h-4 px-1.5 type-label-sm">
                            {tpl.locale.toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className="h-4 px-1.5 type-label-sm">
                            {tpl.currency}
                          </Badge>
                          <span>
                            {t("templates.sectionsCount", { count: tpl.sections.length })}
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
