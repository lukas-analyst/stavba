"use client";

// =====================================================================
// PdfExportDialog — main dialog component
// ---------------------------------------------------------------------
// Responsive dialog (Drawer on mobile, Dialog on desktop) for exporting
// a PDF report of a construction project. Lets the user pick:
//   ① Report sections (with sub-sections under budget_items)
//   ② Output language + currency
//   ③ Save/load/delete named export templates
//
// This file was originally 1681 lines. It has been split into focused
// modules under ./pdf-export/ for maintainability:
//   ./constants.ts            — COMMON_CURRENCIES, PRESETS, DEFAULT_SECTIONS, types
//   ./settings-storage.ts     — loadSavedSettings, saveSettings (localStorage)
//   ./orientation-toggle.tsx  — OrientationToggle component
//   ./pdf-export-body.tsx     — PdfExportBody (tabs: Content + Format)
//   ./pdf-export-footer.tsx   — PdfExportFooter (Cancel + Export buttons)
//
// The PDF is generated server-side by GET /api/projects/[id]/export-pdf
// and downloaded via fetch → Blob → <a> element.
// =====================================================================

import { useState, useEffect, useCallback } from "react";
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
import { FileDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ALL_SECTIONS,
  SUB_SECTIONS,
  ORIENTABLE_SECTION_IDS,
  type PdfSectionId,
  type PdfReportStyle,
  type PdfPageMargin,
  type ExportTemplateData,
} from "@/lib/pdf/pdf-types";
import { type Locale } from "@/i18n/config";
import {
  DEFAULT_SECTIONS,
  type PresetConfig,
  type SavedSettings,
} from "./pdf-export/constants";
import { loadSavedSettings, saveSettings } from "./pdf-export/settings-storage";
import { PdfExportBody } from "./pdf-export/pdf-export-body";
import { PdfExportFooter } from "./pdf-export/pdf-export-footer";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
};

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
