"use client";

// =====================================================================
// PdfExportBody — extracted from /src/components/pdf-export-dialog.tsx
//
// This module contains the body of the PDF export dialog, which renders
// the Tabs (Obsah / Formát) layout — section picker with inline
// orientation toggles, sortable table controls, presets, templates, and
// the format tab (language/currency/style/margins). Extracted as part
// of the monolithic component split (Task R10a).
// =====================================================================
import { useMemo } from "react";
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
  Save,
  Trash2,
  Lock,
  FolderOpen,
  Globe,
  Coins,
  Files,
  LayoutPanelLeft,
  RectangleVertical,
  RectangleHorizontal,
  Sparkles,
  ListChecks,
  ListX,
  Layers,
  Palette,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
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
import { locales, LOCALE_META } from "@/i18n/config";
import { SegmentedButton } from "@/components/ui/segmented-button";
import { OrientationToggle } from "./orientation-toggle";
import {
  SECTION_ICONS,
  SECTION_CATEGORIES,
  COMMON_CURRENCIES,
  PRESETS,
  type PresetConfig,
} from "./constants";

// =====================================================================
// Body — Tabs (Obsah / Formát / Šablony) + sticky summary bar
// =====================================================================
export type BodyProps = {
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

export function PdfExportBody({
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
