"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { PHASES } from "@/lib/format";
import {
  useBudgetItems,
  useCreateBudgetItem,
  useUpdateBudgetItem,
  type BudgetItem,
} from "@/lib/api";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Circle,
  X,
  HandCoins,
  Link as LinkIcon,
  Plus,
  ExternalLink,
  Trash2,
  ChevronDown,
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
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} className="max-w-3xl">
      {open && (
        <BudgetItemForm
          key={item?.id ?? parentId ?? "new"}
          projectId={projectId}
          item={item}
          parentId={parentId}
          defaultCategory={defaultCategory}
          defaultPhase={defaultPhase}
          parentItemName={parentItemName}
          defaultDateFrom={defaultDateFrom}
          defaultDateTo={defaultDateTo}
          onDone={() => onOpenChange(false)}
          onSubmitted={onSubmitted}
        />
      )}
    </ResponsiveDialog>
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

// ============================================================
// CollapsibleSection — MD3 tonal container for grouped fields
// ============================================================
function CollapsibleSection({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: number;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  // On desktop, sections are open by default; on mobile, collapsed (to save space)
  return (
    <Collapsible defaultOpen={!isMobile}>
      <div className="rounded-2xl border bg-muted/20">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/40 rounded-2xl"
          >
            <span className="flex items-center gap-1.5">
              {title}
              {badge != null && badge > 0 && (
                <span className="rounded bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                  {badge}
                </span>
              )}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 p-4 pt-0">
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function BudgetItemForm({
  projectId,
  item,
  parentId,
  defaultCategory,
  defaultPhase,
  parentItemName,
  defaultDateFrom,
  defaultDateTo,
  onDone,
  onSubmitted,
}: {
  projectId: string;
  item?: BudgetItem | null;
  parentId?: string;
  defaultCategory?: string;
  defaultPhase?: string;
  parentItemName?: string;
  defaultDateFrom?: string;
  defaultDateTo?: string;
  onDone: () => void;
  onSubmitted?: (item: BudgetItem, isNew: boolean) => void;
}) {
  const { data: items } = useBudgetItems(projectId);
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

  const [category, setCategory] = useState(item?.category ?? defaultCategory ?? "");
  const [customCategory, setCustomCategory] = useState(
    item && !existingCategories.includes(item.category) ? item.category : "",
  );
  const [isCustomCat, setIsCustomCat] = useState(
    item ? !existingCategories.includes(item.category) : false,
  );
  const [subcategory, setSubcategory] = useState(item?.subcategory ?? "");
  const [phase, setPhase] = useState(item?.phase ?? defaultPhase ?? "Neurčeno");
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

  const dependsOnOptions = useMemo(
    () => topLevelItems.filter((i) => i.id !== item?.id),
    [topLevelItems, item?.id],
  );

  const handleDependsOnChange = (value: string) => {
    setDependsOnId(value);
    if (value === "__none__") return;
    const ref = topLevelItems.find((i) => i.id === value);
    if (!ref) return;
    if (ref.dateTo) {
      setDateFrom(ref.dateTo.substring(0, 10));
      toast.success(`Datum od nastaveno podle „${ref.subcategory || ref.category}"`);
    } else {
      toast.info(`„${ref.subcategory || ref.category}" nemá Datum do — Datum od nebylo změněno.`);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = isTaskMode
      ? (item?.category ?? defaultCategory ?? "")
      : isCustomCat
        ? customCategory.trim()
        : category;
    if (!finalCategory) {
      toast.error("Kategorie je povinná");
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
      };
      if (!item && parentId) {
        data.parentId = parentId;
      }
      if (item) {
        const updated = await updateItem.mutateAsync({ id: item.id, data });
        toast.success(isTaskMode ? "Úkol upraven" : "Položka upravena");
        onSubmitted?.(updated as BudgetItem, false);
      } else {
        const created = await createItem.mutateAsync(data);
        toast.success(isTaskMode ? "Úkol přidán" : "Položka přidána");
        onSubmitted?.(created as BudgetItem, true);
      }
      onDone();
    } catch {
      toast.error("Nepodařilo se uložit položku");
    }
  };

  const submitLabel = item
    ? isTaskMode ? "Uložit úkol" : "Uložit změny"
    : isTaskMode ? "Přidat úkol" : "Přidat položku";

  return (
    <>
      {isTaskMode && (
        <ResponsiveDialogHeader>
          <ResponsiveDialogDescription>
            Úkol pod položkou „{parentName}"
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
      )}

      <ResponsiveDialogBody>
        <form id="budget-item-form" onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
          {/* ===== NÁZEV + POZNÁMKA (borderless, na top) ===== */}
          {!isTaskMode ? (
            <>
              <Input
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                placeholder="Název položky…"
                className="border-0 px-0 text-xl font-bold shadow-none focus-visible:ring-0"
                list="existing-subcategories"
                autoFocus
              />
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Poznámka…"
                rows={2}
                className="border-0 px-0 text-sm text-muted-foreground shadow-none focus-visible:ring-0 resize-none"
              />
            </>
          ) : (
            <Input
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              placeholder="Název úkolu…"
              className="border-0 px-0 text-xl font-bold shadow-none focus-visible:ring-0"
              list="existing-subcategories"
              autoFocus
            />
          )}
          <datalist id="existing-subcategories">
            {existingSubcategories.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>

          {/* ===== KATEGORIE + FÁZE (vedle sebe) ===== */}
          {!isTaskMode && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category">Kategorie *</Label>
                {!isCustomCat ? (
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Vyberte kategorii" />
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
                    placeholder="Nová kategorie"
                  />
                )}
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => setIsCustomCat(!isCustomCat)}
                >
                  {isCustomCat ? "Vybrat existující" : "+ Nová kategorie"}
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phase">Fáze</Label>
                <Select value={phase} onValueChange={setPhase}>
                  <SelectTrigger id="phase">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PHASES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
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
              label="Nutné"
              token="warning"
              title="Položka je povinná pro dokončení projektu"
            />
            <ToggleChip
              active={completed}
              onClick={() => setCompleted(!completed)}
              icon={completed ? CheckCircle2 : Circle}
              label="Hotovo"
              token="success"
            />
            <ToggleChip
              active={rejected}
              onClick={() => setRejected(!rejected)}
              icon={X}
              label="Zavrženo"
              token="danger"
            />
            <ToggleChip
              active={subsidyEligible}
              onClick={() => setSubsidyEligible(!subsidyEligible)}
              icon={HandCoins}
              label="Dotace"
              token="subsidy"
              title="Pro tuto položku lze čerpat dotaci"
            />
          </div>
          {subsidyEligible && (
            <div className="space-y-2">
              <Label htmlFor="subsidyAmount">Částka dotace (Kč)</Label>
              <Input
                id="subsidyAmount"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={subsidyAmount}
                onChange={(e) => setSubsidyAmount(e.target.value)}
                placeholder="např. 15000"
              />
            </div>
          )}

          {/* ===== DATUM (volitelné) — MD3 tonal section ===== */}
          <CollapsibleSection title="Datum (volitelné)">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dateFrom">Datum od</Label>
                <Input id="dateFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateTo">Datum do</Label>
                <Input id="dateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="planDays">Plán (dní)</Label>
              <Input id="planDays" value={planDays} onChange={(e) => setPlanDays(e.target.value)} placeholder="21" inputMode="decimal" />
            </div>
            {!isTaskMode && (
              <div className="space-y-2">
                <Label htmlFor="dependsOn">Navazuje na</Label>
                <SearchableSelect
                  id="dependsOn"
                  options={[
                    { value: "__none__", label: "— žádná závislost —", hint: "" },
                    ...dependsOnOptions.map((i) => ({
                      value: i.id,
                      label: i.subcategory || i.category,
                      hint: `${i.category}${i.dateTo ? ` · do ${i.dateTo.substring(0, 10)}` : ""}`,
                    })),
                  ]}
                  value={dependsOnId}
                  onChange={(v) => handleDependsOnChange(v)}
                  placeholder="— žádná závislost —"
                  searchPlaceholder="Hledat položku…"
                  emptyText="Žádné položky nenalezeny"
                />
              </div>
            )}
          </CollapsibleSection>

          {/* ===== PENÍZE (volitelné) — MD3 tonal section ===== */}
          <CollapsibleSection title="Peníze (volitelné)">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="planCost">Plán (Kč)</Label>
                <Input id="planCost" value={planCost} onChange={(e) => setPlanCost(e.target.value)} placeholder="25000" inputMode="decimal" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="flexibility">Vůle (%)</Label>
                <Input id="flexibility" value={flexibility} onChange={(e) => setFlexibility(e.target.value)} placeholder="50" inputMode="decimal" />
              </div>
            </div>
          </CollapsibleSection>

          {/* ===== ODKAZY (volitelné) — MD3 tonal section ===== */}
          <CollapsibleSection title="Odkazy (volitelné)" badge={links.length}>
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-xs">
                <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                Odkazy
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px]"
                onClick={() => setLinks((prev) => [...prev, { id: undefined, label: "", url: "" }])}
              >
                <Plus className="h-3 w-3" /> Přidat
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
                      placeholder="Název"
                      className="h-7 flex-1 min-w-[120px] text-xs"
                    />
                    <div className="relative flex-1 min-w-[140px]">
                      <Input
                        value={link.url}
                        onChange={(e) => handleUrlChange(idx, e.target.value)}
                        placeholder="https://…"
                        className="h-7 pr-7 text-xs"
                        inputMode="url"
                      />
                      {link.url.trim() !== "" && (
                        <a
                          href={link.url.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="Otevřít v novém okně"
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
                      title="Smazat"
                      aria-label="Smazat odkaz"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>
        </form>
      </ResponsiveDialogBody>

      <ResponsiveDialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Zrušit
        </Button>
        <Button
          type="submit"
          form="budget-item-form"
          disabled={createItem.isPending || updateItem.isPending}
        >
          {(createItem.isPending || updateItem.isPending) && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {submitLabel}
        </Button>
      </ResponsiveDialogFooter>
    </>
  );
}
