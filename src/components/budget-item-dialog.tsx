"use client";

import { useState, useMemo } from "react";
import { AddDialogShell } from "@/components/ui/add-dialog-shell";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PHASES } from "@/lib/format";
import { useTranslations } from "next-intl";
import {
  useBudgetItems,
  useContacts,
  useCreateBudgetItem,
  useUpdateBudgetItem,
  type BudgetItem,
} from "@/lib/api";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  X,
  HandCoins,
  Link as LinkIcon,
  Plus,
  ExternalLink,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  item?: BudgetItem | null;
  parentId?: string;
  defaultCategory?: string;
  defaultPhase?: string;
  defaultSubcategory?: string;
  parentItemName?: string;
  defaultDateFrom?: string;
  defaultDateTo?: string;
  onSubmitted?: (item: BudgetItem, isNew: boolean) => void;
};

export function BudgetItemDialog({
  open,
  onOpenChange,
  projectId,
  item,
  parentId,
  defaultCategory,
  defaultPhase,
  parentItemName,
  defaultDateFrom,
  defaultDateTo,
  onSubmitted,
}: Props) {
  if (!open) return null;
  return (
    <BudgetItemForm
      key={item?.id ?? parentId ?? "new"}
      open={open}
      onOpenChange={onOpenChange}
      projectId={projectId}
      item={item}
      parentId={parentId}
      defaultCategory={defaultCategory}
      defaultPhase={defaultPhase}
      parentItemName={parentItemName}
      defaultDateFrom={defaultDateFrom}
      defaultDateTo={defaultDateTo}
      onSubmitted={onSubmitted}
    />
  );
}

// ============================================================
// ToggleChip — Material Design 3 filter chip
// ============================================================
function ToggleChip({
  active,
  onClick,
  icon: Icon,
  label,
  token,
  title,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  token: "warning" | "success" | "danger" | "subsidy";
  title?: string;
}) {
  const activeClasses: Record<string, string> = {
    warning: "border-warning bg-warning-soft text-warning-strong",
    success: "border-success bg-success-soft text-success-strong",
    danger: "border-danger bg-danger-soft text-danger-strong",
    subsidy: "border-subsidy bg-subsidy-soft text-subsidy-strong",
  };
  const hoverClasses: Record<string, string> = {
    warning: "hover:border-warning/50 hover:bg-warning-soft/50",
    success: "hover:border-success/50 hover:bg-success-soft/50",
    danger: "hover:border-danger/50 hover:bg-danger-soft/50",
    subsidy: "hover:border-subsidy/50 hover:bg-subsidy-soft/50",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "flex h-10 items-center justify-center gap-1.5 rounded-2xl border px-3 text-xs font-medium transition-all",
        active
          ? activeClasses[token]
          : cn("border-border text-muted-foreground", hoverClasses[token]),
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

function BudgetItemForm({
  open,
  onOpenChange,
  projectId,
  item,
  parentId,
  defaultCategory,
  defaultPhase,
  parentItemName,
  defaultDateFrom,
  defaultDateTo,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  item?: BudgetItem | null;
  parentId?: string;
  defaultCategory?: string;
  defaultPhase?: string;
  parentItemName?: string;
  defaultDateFrom?: string;
  defaultDateTo?: string;
  onSubmitted?: (item: BudgetItem, isNew: boolean) => void;
}) {
  const { data: items } = useBudgetItems(projectId);
  const { data: contacts } = useContacts(projectId);
  const createItem = useCreateBudgetItem(projectId);
  const updateItem = useUpdateBudgetItem(projectId);

  const topLevelItems = useMemo(
    () => (items ?? []).filter((i) => !i.parentId),
    [items],
  );

  const existingCategories = useMemo(
    () => Array.from(new Set(topLevelItems.map((i) => i.category))).sort(),
    [topLevelItems],
  );

  const isTaskMode = (!!item && !!item.parentId) || (!item && !!parentId);

  const parentName = parentItemName
    ?? (item?.parentId ? (items ?? []).find((i) => i.id === item.parentId)?.subcategory ?? "" : "");

  const t = useTranslations("dialogs.budgetItem");
  const tPhases = useTranslations("phases");

  const [category, setCategory] = useState(item?.category ?? defaultCategory ?? "");
  const [customCategory, setCustomCategory] = useState(
    item && !existingCategories.includes(item.category) ? item.category : "",
  );
  const [isCustomCat, setIsCustomCat] = useState(
    item ? !existingCategories.includes(item.category) : false,
  );
  const [subcategory, setSubcategory] = useState(item?.subcategory ?? "");
  const [phase, setPhase] = useState(item?.phase ?? defaultPhase ?? "unspecified");
  const [required, setRequired] = useState(item ? item.required : true);
  const [completed, setCompleted] = useState(item?.completed ?? false);
  const [rejected, setRejected] = useState(item?.rejected ?? false);
  const [subsidyEligible, setSubsidyEligible] = useState(item?.subsidyEligible ?? false);
  const [subsidyAmount, setSubsidyAmount] = useState(item?.subsidyAmount?.toString() ?? "");
  const [links, setLinks] = useState<{ id?: string; label: string; url: string }[]>(
    item?.links?.map((l) => ({ id: l.id, label: l.label, url: l.url })) ?? [],
  );
  const [note, setNote] = useState(item?.note ?? "");
  const [planCost, setPlanCost] = useState(item?.planCost?.toString() ?? "");
  const [flexibility, setFlexibility] = useState(item?.flexibilityPercent?.toString() ?? "");
  const [planDays, setPlanDays] = useState(item?.planDays?.toString() ?? "");
  const [dateFrom, setDateFrom] = useState(
    item?.dateFrom ? item.dateFrom.substring(0, 10) : (defaultDateFrom ?? ""),
  );
  const [dateTo, setDateTo] = useState(
    item?.dateTo ? item.dateTo.substring(0, 10) : (defaultDateTo ?? ""),
  );
  const [dependsOnId, setDependsOnId] = useState<string>(item?.dependsOnId ?? "__none__");
  const [contactId, setContactId] = useState<string>(item?.contactId ?? "__none__");

  const dependsOnOptions = useMemo(
    () => topLevelItems.filter((i) => i.id !== item?.id),
    [topLevelItems, item?.id],
  );

  const handleDependsOnChange = (value: string) => {
    setDependsOnId(value);
    if (value === "__none__") return;
    const ref = topLevelItems.find((i) => i.id === value);
    if (!ref) return;
    // Only auto-fill Datum od if it's not already set — don't overwrite
    // an existing date the user may have entered manually.
    const refName = ref.subcategory || ref.category;
    if (ref.dateTo && !dateFrom) {
      setDateFrom(ref.dateTo.substring(0, 10));
      toast.success(t("toasts.dateFromSetByRef", { name: refName }));
    } else if (ref.dateTo && dateFrom) {
      toast.info(t("toasts.dateFromAlreadySet"));
    } else {
      toast.info(t("toasts.dateFromNotChanged", { name: refName }));
    }
  };

  const existingSubcategories = useMemo(() => {
    const chosen = isTaskMode
      ? (defaultCategory ?? "")
      : isCustomCat
        ? customCategory.trim()
        : category;
    if (!chosen) return [];
    return Array.from(
      new Set(
        topLevelItems
          .filter((i) => i.category === chosen)
          .map((i) => i.subcategory)
          .filter((s): s is string => !!s && s.trim() !== ""),
      ),
    ).sort();
  }, [topLevelItems, category, customCategory, isCustomCat, isTaskMode, defaultCategory]);

  // Auto-fill link label from URL hostname when label is empty
  const handleUrlChange = (idx: number, url: string) => {
    setLinks((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const updated = { ...l, url };
        // Auto-fill label from hostname if label is empty
        if (!l.label.trim() && url.trim()) {
          try {
            const hostname = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
            // Remove www. prefix and TLD
            const cleanName = hostname.replace(/^www\./, "").split(".")[0];
            if (cleanName) {
              // Capitalize first letter
              updated.label = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
            }
          } catch {
            // invalid URL, don't auto-fill
          }
        }
        return updated;
      }),
    );
  };

  const handleSubmit = async () => {
    const finalCategory = isTaskMode
      ? (item?.category ?? defaultCategory ?? "")
      : isCustomCat
        ? customCategory.trim()
        : category;
    if (!finalCategory) {
      toast.error(t("toasts.categoryRequired"));
      return;
    }
    try {
      const data: Partial<BudgetItem> = {
        category: finalCategory,
        subcategory: subcategory.trim() || null,
        phase,
        required,
        completed,
        rejected,
        note,
        planCost: planCost === "" ? null : Number(planCost.replace(",", ".")),
        flexibilityPercent: flexibility === "" ? null : Number(flexibility.replace(",", ".")),
        planDays: planDays === "" ? null : Number(planDays.replace(",", ".")),
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        subsidyEligible,
        subsidyAmount: subsidyAmount === "" ? null : Number(subsidyAmount.replace(",", ".")),
        links: links.map((l) => ({ id: l.id, label: l.label.trim(), url: l.url.trim() })).filter(
          (l) => l.label !== "" && l.url !== "",
        ),
        dependsOnId: isTaskMode
          ? (item?.dependsOnId ?? null)
          : dependsOnId === "__none__"
            ? null
            : dependsOnId,
        contactId: contactId === "__none__" ? null : contactId,
      };
      if (!item && parentId) {
        data.parentId = parentId;
      }
      if (item) {
        const updated = await updateItem.mutateAsync({ id: item.id, data });
        toast.success(isTaskMode ? t("toasts.taskUpdated") : t("toasts.itemUpdated"));
        onSubmitted?.(updated as BudgetItem, false);
      } else {
        const created = await createItem.mutateAsync(data);
        toast.success(isTaskMode ? t("toasts.taskAdded") : t("toasts.itemAdded"));
        onSubmitted?.(created as BudgetItem, true);
      }
      onOpenChange(false);
    } catch {
      toast.error(t("toasts.saveError"));
    }
  };

  const submitLabel = item
    ? isTaskMode ? t("submit.editTask") : t("submit.editItem")
    : isTaskMode ? t("submit.addTask") : t("submit.addItem");

  return (
    <AddDialogShell
      open={open}
      onOpenChange={onOpenChange}
      titleValue={subcategory}
      onTitleChange={setSubcategory}
      titlePlaceholder={isTaskMode ? t("placeholder.taskName") : t("placeholder.itemName")}
      descriptionValue={isTaskMode ? undefined : note}
      onDescriptionChange={isTaskMode ? undefined : setNote}
      descriptionPlaceholder={isTaskMode ? undefined : t("placeholder.note")}
      contextText={isTaskMode ? t("context.taskUnderItem", { name: parentName }) : undefined}
      submitLabel={submitLabel}
      onSubmit={handleSubmit}
      isSubmitting={createItem.isPending || updateItem.isPending}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4">
        <datalist id="existing-subcategories">
          {existingSubcategories.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

        {/* ===== KATEGORIE + FÁZE (vedle sebe) ===== */}
        {!isTaskMode && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">{t("label.category")}</Label>
              {!isCustomCat ? (
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder={t("placeholder.selectCategory")} />
                  </SelectTrigger>
                  <SelectContent>
                    {existingCategories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder={t("placeholder.newCategory")}
                />
              )}
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => setIsCustomCat(!isCustomCat)}
              >
                {isCustomCat ? t("label.selectExisting") : t("label.addNewCategory")}
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phase">{t("label.phase")}</Label>
              <Select value={phase} onValueChange={setPhase}>
                <SelectTrigger id="phase">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHASES.map((p) => (
                    <SelectItem key={p} value={p}>{tPhases(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* MD3 Toggle Chips — 2-col grid */}
        <div className="grid grid-cols-2 gap-2">
          <ToggleChip
            active={required}
            onClick={() => setRequired(!required)}
            icon={AlertTriangle}
            label={t("label.required")}
            token="warning"
            title={t("title.requiredHint")}
          />
          <ToggleChip
            active={completed}
            onClick={() => setCompleted(!completed)}
            icon={completed ? CheckCircle2 : Circle}
            label={t("label.completed")}
            token="success"
          />
          <ToggleChip
            active={rejected}
            onClick={() => setRejected(!rejected)}
            icon={X}
            label={t("label.rejected")}
            token="danger"
          />
          <ToggleChip
            active={subsidyEligible}
            onClick={() => setSubsidyEligible(!subsidyEligible)}
            icon={HandCoins}
            label={t("label.subsidy")}
            token="subsidy"
            title={t("title.subsidyHint")}
          />
        </div>
        {subsidyEligible && (
          <div className="space-y-2">
            <Label htmlFor="subsidyAmount">{t("label.subsidyAmount")}</Label>
            <Input
              id="subsidyAmount"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={subsidyAmount}
              onChange={(e) => setSubsidyAmount(e.target.value)}
              placeholder={t("placeholder.subsidyAmount")}
            />
          </div>
        )}

        {/* ===== DATUM (volitelné) — MD3 tonal section ===== */}
        <CollapsibleSection title={t("section.date")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dateFrom">{t("label.dateFrom")}</Label>
              <Input id="dateFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo">{t("label.dateTo")}</Label>
              <Input id="dateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="planDays">{t("label.planDays")}</Label>
            <Input id="planDays" value={planDays} onChange={(e) => setPlanDays(e.target.value)} placeholder="21" inputMode="decimal" />
          </div>
          {!isTaskMode && (
            <div className="space-y-2">
              <Label htmlFor="dependsOn">{t("label.dependsOn")}</Label>
              <SearchableSelect
                id="dependsOn"
                options={[
                  { value: "__none__", label: t("label.noDependency"), hint: "" },
                  ...dependsOnOptions.map((i) => ({
                    value: i.id,
                    label: i.subcategory || i.category,
                    hint: `${i.category}${i.dateTo ? ` · ${i.dateTo.substring(0, 10)}` : ""}`,
                  })),
                ]}
                value={dependsOnId}
                onChange={(v) => handleDependsOnChange(v)}
                placeholder={t("label.noDependency")}
                searchPlaceholder={t("placeholder.searchItem")}
                emptyText={t("empty.items")}
              />
            </div>
          )}
        </CollapsibleSection>

        {/* ===== PENÍZE (volitelné) — MD3 tonal section ===== */}
        <CollapsibleSection title={t("section.money")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="planCost">{t("label.planCost")}</Label>
              <Input id="planCost" value={planCost} onChange={(e) => setPlanCost(e.target.value)} placeholder="25000" inputMode="decimal" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="flexibility">{t("label.flexibility")}</Label>
              <Input id="flexibility" value={flexibility} onChange={(e) => setFlexibility(e.target.value)} placeholder="50" inputMode="decimal" />
            </div>
          </div>
        </CollapsibleSection>

        {/* ===== KONTAKT (volitelné) — přiřazená osoba/firma ===== */}
        <CollapsibleSection title={t("section.contact")}>
          <Label className="flex items-center gap-1.5 text-xs">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            {t("label.contactHint")}
          </Label>
          <SearchableSelect
            options={[
              { value: "__none__", label: t("label.noContact"), hint: "" },
              ...((contacts ?? []).map((c) => ({
                value: c.id,
                label: c.name,
                hint: [c.role, c.company].filter(Boolean).join(" · "),
              }))),
            ]}
            value={contactId}
            onChange={setContactId}
            placeholder={t("label.noContact")}
            searchPlaceholder={t("placeholder.searchContact")}
            emptyText={t("empty.contacts")}
          />
          {(contacts ?? []).length === 0 && (
            <p className="text-[10px] text-muted-foreground">
              {t("empty.noContactsHint")}
            </p>
          )}
        </CollapsibleSection>

        {/* ===== ODKAZY (volitelné) — MD3 tonal section ===== */}
        <CollapsibleSection title={t("section.links")} badge={links.length}>
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-xs">
              <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
              {t("label.links")}
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => setLinks((prev) => [...prev, { id: undefined, label: "", url: "" }])}
            >
              <Plus className="h-3 w-3" /> {t("button.add")}
            </Button>
          </div>
          {links.length > 0 && (
            <div className="space-y-1.5">
              {links.map((link, idx) => (
                <div
                  key={link.id ?? `new-${idx}`}
                  className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-card/50 p-1.5"
                >
                  <Input
                    value={link.label}
                    onChange={(e) =>
                      setLinks((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, label: e.target.value } : l)),
                      )
                    }
                    placeholder={t("placeholder.linkLabel")}
                    className="h-7 flex-1 min-w-[120px] text-xs"
                  />
                  <div className="relative flex-1 min-w-[140px]">
                    <Input
                      value={link.url}
                      onChange={(e) => handleUrlChange(idx, e.target.value)}
                      placeholder={t("placeholder.linkUrl")}
                      className="h-7 pr-7 text-xs"
                      inputMode="url"
                    />
                    {link.url.trim() !== "" && (
                      <a
                        href={link.url.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title={t("title.openInNewWindow")}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setLinks((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label={t("title.deleteLink")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      </div>
    </AddDialogShell>
  );
}
