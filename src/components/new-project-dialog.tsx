"use client";

import { useState, useMemo } from "react";
import { AddDialogShell } from "@/components/ui/add-dialog-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateProjectFromTemplate, useProjects } from "@/lib/api";
import { PROJECT_TEMPLATES, getTemplate, type TemplateItem } from "@/lib/project-templates";
import { toast } from "sonner";
import { Loader2, Building, Home, Palette, Plus, Copy, FileText, Bath, Warehouse } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { formatCzk } from "@/lib/format";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const TEMPLATE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  reconstruction: Building,
  new_build: Home,
  interior: Palette,
  extension: Plus,
  apartment_2plus1: Home,
  bathroom: Bath,
  roof: Warehouse,
};

type Mode = "blank" | "template" | "copy";

export function NewProjectDialog({ open, onOpenChange }: Props) {
  const createFromTemplate = useCreateProjectFromTemplate();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const t = useTranslations("dialogs.newProject");
  const locale = useLocale() as "cs" | "en";

  const [mode, setMode] = useState<Mode | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [templateType, setTemplateType] = useState("");
  const [scope, setScope] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [copyFromId, setCopyFromId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedTemplate = useMemo(
    () => PROJECT_TEMPLATES.find((t) => t.type === templateType),
    [templateType],
  );
  const needsScope = selectedTemplate?.askScope;

  // Scope-filtered template for the preview — this is exactly what will be
  // created on the server (POST /api/projects/from-template calls
  // getTemplate with the same args).
  const previewTemplate = useMemo(
    () => (templateType ? getTemplate(templateType, scope || undefined) : null),
    [templateType, scope],
  );

  // Group preview items by category → { category, count, sum }.
  // Order is preserved (first-occurrence) so it matches the template flow.
  const categoryGroups = useMemo(() => {
    if (!previewTemplate) return [] as { category: string; count: number; sum: number }[];
    const groups = new Map<string, { count: number; sum: number }>();
    for (const item of previewTemplate.items as TemplateItem[]) {
      const g = groups.get(item.category) ?? { count: 0, sum: 0 };
      g.count += 1;
      g.sum += item.planCost || 0;
      groups.set(item.category, g);
    }
    return Array.from(groups.entries()).map(([category, { count, sum }]) => ({
      category,
      count,
      sum,
    }));
  }, [previewTemplate]);

  const totalPlanSum = useMemo(
    () => previewTemplate?.items.reduce((s, i) => s + (i.planCost || 0), 0) ?? 0,
    [previewTemplate],
  );

  const reset = () => {
    setMode(null);
    setName("");
    setAddress("");
    setDescription("");
    setTemplateType("");
    setScope("");
    setStartDate("");
    setEndDate("");
    setCopyFromId("");
    setIsSubmitting(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  // ===== Submit handlers =====

  const handleCreateBlank = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim() || undefined,
          description: description.trim() || undefined,
          status: "planning",
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create project");
      }
      toast.success(t("toasts.createSuccess"));
      qc.invalidateQueries({ queryKey: ["projects"] });
      reset();
      handleClose(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toasts.createError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateFromTemplate = async () => {
    setIsSubmitting(true);
    try {
      await createFromTemplate.mutateAsync({
        name: name.trim(),
        address: address.trim() || undefined,
        description: description.trim() || undefined,
        templateType,
        scope: scope || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      toast.success(t("toasts.templateCreateSuccess"));
      reset();
      handleClose(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toasts.createError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyProject = async () => {
    if (!copyFromId) return;
    setIsSubmitting(true);
    try {
      const source = projects?.find((p) => p.id === copyFromId);
      if (!source) throw new Error(t("toasts.sourceNotFound"));

      // Create new project
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim() || source.address || undefined,
          description: description.trim() || source.description || undefined,
          status: "planning",
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create project");
      }
      const newProject = await res.json();

      // Copy budget items from source project. We need to preserve the
      // parent/child hierarchy (parentId), so we:
      //   1. Fetch all source items.
      //   2. Create top-level items first (parentId === null), tracking
      //      old → new id mapping as we go.
      //   3. Create children with parentId remapped using the map.
      // We use Promise.allSettled (instead of Promise.all) so that a
      // single failed creation does not reject the whole batch and
      // silently swallow the rest. We then report how many items were
      // copied vs. how many failed.
      const budgetRes = await fetch(`/api/projects/${copyFromId}/budget`);
      let copiedCount = 0;
      let failedCount = 0;

      if (budgetRes.ok) {
        const items: Array<Record<string, unknown>> = await budgetRes.json();
        const idMap = new Map<string, string>();

        const buildBody = (item: Record<string, unknown>, parentId: string | null) => ({
          category: item.category,
          subcategory: item.subcategory,
          element: item.element,
          phase: item.phase,
          required: item.required,
          completed: false,
          rejected: false,
          note: item.note,
          planCost: item.planCost,
          flexibilityPercent: item.flexibilityPercent,
          planDays: item.planDays,
          parentId,
        });

        // Phase 1 — top-level items (parentId is null/undefined).
        const topLevel = items.filter((i) => !i.parentId);
        const topLevelResults = await Promise.allSettled(
          topLevel.map((item) =>
            fetch(`/api/projects/${newProject.id}/budget`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(buildBody(item, null)),
            }).then(async (r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              const created = await r.json();
              idMap.set(item.id as string, created.id);
              return created;
            }),
          ),
        );

        // Phase 2 — child items, with parentId remapped old → new.
        const children = items.filter((i) => !!i.parentId);
        const childResults = await Promise.allSettled(
          children.map((item) => {
            const newParentId = idMap.get(item.parentId as string) ?? null;
            return fetch(`/api/projects/${newProject.id}/budget`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(buildBody(item, newParentId)),
            }).then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              return r.json();
            });
          }),
        );

        const allResults = [...topLevelResults, ...childResults];
        for (const r of allResults) {
          if (r.status === "fulfilled") copiedCount++;
          else failedCount++;
        }
      }

      // Report outcome — show a partial-failure toast if some items
      // couldn't be copied, otherwise a clean success toast.
      if (failedCount > 0 && copiedCount > 0) {
        toast.warning(
          t("toasts.copyPartial", { sourceName: source.name, copied: copiedCount, failed: failedCount }),
        );
      } else if (failedCount > 0 && copiedCount === 0) {
        toast.error(
          t("toasts.copyAllFailed", { failed: failedCount }),
        );
      } else {
        toast.success(
          t("toasts.copySuccess", { sourceName: source.name, copied: copiedCount }),
        );
      }
      qc.invalidateQueries({ queryKey: ["projects"] });
      reset();
      handleClose(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toasts.copyError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error(t("toasts.nameRequired"));
      return;
    }
    if (mode === "blank") handleCreateBlank();
    else if (mode === "template") {
      if (!templateType) {
        toast.error(t("toasts.typeRequired"));
        return;
      }
      if (needsScope && !scope) {
        toast.error(t("toasts.scopeRequired"));
        return;
      }
      handleCreateFromTemplate();
    } else if (mode === "copy") {
      if (!copyFromId) {
        toast.error(t("toasts.sourceRequired"));
        return;
      }
      handleCopyProject();
    }
  };

  const canSubmit =
    !!name.trim() &&
    mode !== null &&
    (mode === "blank" ||
      (mode === "template" && templateType && (!needsScope || scope)) ||
      (mode === "copy" && copyFromId)) &&
    !isSubmitting;

  const submitLabel = !mode
    ? t("submit.selectType")
    : mode === "blank"
      ? t("submit.createBlank")
      : mode === "template"
        ? t("submit.createFromTemplate")
        : t("submit.copyExisting");

  return (
    <AddDialogShell
      open={open}
      onOpenChange={handleClose}
      titleValue={name}
      onTitleChange={setName}
      titlePlaceholder={mode ? t("placeholder.projectName") : t("placeholder.selectTypeHint")}
      descriptionValue={mode ? description : undefined}
      onDescriptionChange={mode ? setDescription : undefined}
      descriptionPlaceholder={mode ? t("placeholder.description") : undefined}
      contextText={mode === "blank" ? t("context.blank") : mode === "template" ? t("context.template") : mode === "copy" ? t("context.copy") : t("context.new")}
      submitLabel={submitLabel}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitDisabled={!canSubmit}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        {/* ===== Mode selection (3 cards) ===== */}
        {!mode && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Blank project */}
            <button
              onClick={() => setMode("blank")}
              className="flex flex-col items-center gap-2 rounded-lg border p-5 text-center transition-all hover:border-primary hover:bg-primary/5 hover:shadow-sm"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div className="text-sm font-semibold">{t("mode.blank.title")}</div>
              <p className="text-[11px] text-muted-foreground">
                {t("mode.blank.description")}
              </p>
            </button>

            {/* From template */}
            <button
              onClick={() => setMode("template")}
              className="flex flex-col items-center gap-2 rounded-lg border p-5 text-center transition-all hover:border-primary hover:bg-primary/5 hover:shadow-sm"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Home className="h-6 w-6 text-primary" />
              </div>
              <div className="text-sm font-semibold">{t("mode.template.title")}</div>
              <p className="text-[11px] text-muted-foreground">
                {t("mode.template.description")}
              </p>
            </button>

            {/* Copy existing */}
            <button
              onClick={() => setMode("copy")}
              disabled={!projects || projects.length === 0}
              className="flex flex-col items-center gap-2 rounded-lg border p-5 text-center transition-all hover:border-primary hover:bg-primary/5 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Copy className="h-6 w-6 text-primary" />
              </div>
              <div className="text-sm font-semibold">{t("mode.copy.title")}</div>
              <p className="text-[11px] text-muted-foreground">
                {t("mode.copy.description")}
              </p>
            </button>
          </div>
        )}

        {/* ===== Back button + form ===== */}
        {mode && (
          <>
            <button
              onClick={() => setMode(null)}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("back")}
            </button>

            {/* ===== Template mode: select template type + scope ===== */}
            {mode === "template" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("template.typeLabel")}</Label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {PROJECT_TEMPLATES.map((tpl) => {
                      const Icon = TEMPLATE_ICONS[tpl.type] ?? Building;
                      return (
                        <button
                          key={tpl.type}
                          onClick={() => {
                            setTemplateType(tpl.type);
                            setScope("");
                          }}
                          className={cn(
                            "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                            templateType === tpl.type
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "hover:bg-muted/50",
                          )}
                        >
                          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold">{t(`templates.${tpl.type}.label`)}</div>
                            <p className="text-[11px] text-muted-foreground">{t(`templates.${tpl.type}.description`)}</p>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {t("template.itemsPlan", {
                                count: tpl.items.length,
                                sum: tpl.items.reduce((s, i) => s + (i.planCost || 0), 0).toLocaleString(locale === "cs" ? "cs-CZ" : "en-US"),
                              })}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Scope selection (for reconstruction) */}
                {needsScope && templateType && (
                  <div className="space-y-2">
                    <Label>{t("template.scopeLabel")}</Label>
                    <div className="grid grid-cols-1 gap-2">
                      {selectedTemplate?.scopeOptions?.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setScope(opt.id)}
                          className={cn(
                            "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                            scope === opt.id
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "hover:bg-muted/50",
                          )}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold">{t(`templates.${templateType}.scopeOptions.${opt.id}.label`)}</div>
                            <p className="text-[11px] text-muted-foreground">{t(`templates.${templateType}.scopeOptions.${opt.id}.description`)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Template preview — grouped by category */}
                {templateType && selectedTemplate && (!needsScope || scope) && previewTemplate && (
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("template.preview")}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {categoryGroups.map(({ category, count, sum }) => (
                        <div key={category} className="flex items-center gap-2 text-[11px]">
                          <Badge variant="secondary" className="font-medium">{category}</Badge>
                          <span className="text-muted-foreground">
                            {t("template.itemsCount", { count })}
                          </span>
                          <span className="ml-auto font-medium tabular-nums">
                            {formatCzk(sum, locale)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 border-t pt-2 text-[11px] font-semibold">
                      {t("template.total", {
                        count: previewTemplate.items.length,
                        sum: formatCzk(totalPlanSum, locale),
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ===== Copy mode: select source project ===== */}
            {mode === "copy" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>{t("copy.sourceLabel")}</Label>
                  <Select value={copyFromId} onValueChange={setCopyFromId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("placeholder.selectProjectCopy")} />
                    </SelectTrigger>
                    <SelectContent>
                      {projects?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}{p.address ? ` — ${p.address}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {copyFromId && (
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-[11px] text-muted-foreground">
                      {t("copy.description")}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ===== Common fields (address, dates) ===== */}
            {mode && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="proj-address">{t("field.address")}</Label>
                  <Input
                    id="proj-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={t("placeholder.address")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="proj-start">{t("field.startDate")}</Label>
                  <Input
                    id="proj-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
              </div>
            )}
            {mode && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="proj-end">{t("field.endDate")}</Label>
                  <Input
                    id="proj-end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AddDialogShell>
  );
}
