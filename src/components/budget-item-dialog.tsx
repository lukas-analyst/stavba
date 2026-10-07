"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
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
  type BudgetItemLink,
} from "@/lib/api";
import {
  ChevronDown,
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
} from "lucide-react";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  item?: BudgetItem | null;
  /** If set, opens dialog in "new task" mode for the given parent item. */
  parentId?: string;
  defaultCategory?: string;
  defaultPhase?: string;
  defaultSubcategory?: string;
  parentItemName?: string;
  /** Default dateFrom — pre-filled from parent item (only for task mode) */
  defaultDateFrom?: string;
  /** Default dateTo — pre-filled from parent item (only for task mode) */
  defaultDateTo?: string;
  /** Called with the newly-created or updated item after a successful submit. */
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
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} className="max-w-2xl">
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

  // Only top-level items (parentId === null) contribute to existing categories/subcategories
  // suggestions (we don't want children's categories leaking up).
  const topLevelItems = useMemo(
    () => (items ?? []).filter((i) => !i.parentId),
    [items],
  );

  const existingCategories = useMemo(
    () => Array.from(new Set(topLevelItems.map((i) => i.category))).sort(),
    [topLevelItems],
  );

  // Determine "task mode": editing an existing child item, or creating a new
  // child item with a parentId prop set. In task mode, category & phase are
  // inherited from the parent (locked) and we don't show the dependsOn picker.
  const isTaskMode = (!!item && !!item.parentId) || (!item && !!parentId);

  // Find parent item name for the dialog description
  const parentName = parentItemName
    ?? (item?.parentId ? (items ?? []).find((i) => i.id === item.parentId)?.subcategory ?? "" : "");

  const [category, setCategory] = useState(
    item?.category ?? defaultCategory ?? "",
  );
  const [customCategory, setCustomCategory] = useState(
    item && !existingCategories.includes(item.category) ? item.category : "",
  );
  const [isCustomCat, setIsCustomCat] = useState(
    item ? !existingCategories.includes(item.category) : false,
  );
  // For Položka: subcategory is the item name (label "Název položky").
  // For Úkol: subcategory is the task name (label "Název úkolu").
  const [subcategory, setSubcategory] = useState(item?.subcategory ?? "");
  const [phase, setPhase] = useState(item?.phase ?? defaultPhase ?? "Neurčeno");
  const [required, setRequired] = useState(item ? item.required : true);
  const [completed, setCompleted] = useState(item?.completed ?? false);
  const [rejected, setRejected] = useState(item?.rejected ?? false);
  const [subsidyEligible, setSubsidyEligible] = useState(item?.subsidyEligible ?? false);
  const [subsidyAmount, setSubsidyAmount] = useState(item?.subsidyAmount?.toString() ?? "");
  // External hyperlinks — editable list. Each entry is {id?, label, url}.
  // id is set for links that already exist in DB (so backend can update);
  // new links have id = undefined and will be created on save.
  const [links, setLinks] = useState<{ id?: string; label: string; url: string }[]>(
    item?.links?.map((l) => ({ id: l.id, label: l.label, url: l.url })) ?? [],
  );
  const [note, setNote] = useState(item?.note ?? "");
  const [planCost, setPlanCost] = useState(item?.planCost?.toString() ?? "");
  const [flexibility, setFlexibility] = useState(
    item?.flexibilityPercent?.toString() ?? "",
  );
  const [planDays, setPlanDays] = useState(item?.planDays?.toString() ?? "");
  const [dateFrom, setDateFrom] = useState(
    item?.dateFrom ? item.dateFrom.substring(0, 10) : (defaultDateFrom ?? ""),
  );
  const [dateTo, setDateTo] = useState(
    item?.dateTo ? item.dateTo.substring(0, 10) : (defaultDateTo ?? ""),
  );
  // Optional dependency on another top-level item — used to auto-fill dateFrom
  // from the referenced item's dateTo. Sentinel "__none__" represents "no dep".
  // Only relevant for Položka (top-level) mode — tasks inherit it from parent.
  const [dependsOnId, setDependsOnId] = useState<string>(
    item?.dependsOnId ?? "__none__",
  );

  // Top-level items available for the "Navazuje na" dropdown.
  // Excludes the item currently being edited (to prevent self-reference).
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
      const next = ref.dateTo.substring(0, 10);
      setDateFrom(next);
      toast.success(
        `Datum od nastaveno podle „${ref.subcategory || ref.category}"`,
      );
    } else {
      toast.info(
        `„${ref.subcategory || ref.category}" nemá Datum do — Datum od nebylo změněno.`,
      );
    }
  };

  // Existing subcategories in the chosen category (for datalist suggestions)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // In task mode, always use the parent's category (defaultCategory)
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
        flexibilityPercent:
          flexibility === "" ? null : Number(flexibility.replace(",", ".")),
        planDays: planDays === "" ? null : Number(planDays.replace(",", ".")),
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        subsidyEligible,
        subsidyAmount: subsidyAmount === "" ? null : Number(subsidyAmount.replace(",", ".")),
        // Send full links array — backend performs atomic replace (delete + create)
        links: links.map((l) => ({ id: l.id, label: l.label.trim(), url: l.url.trim() })).filter(
          (l) => l.label !== "" && l.url !== "",
        ),
        dependsOnId: isTaskMode
          ? (item?.dependsOnId ?? null)
          : dependsOnId === "__none__"
            ? null
            : dependsOnId,
      };
      // Set parentId only when creating new (not when editing — preserve existing)
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
    ? isTaskMode
      ? "Uložit úkol"
      : "Uložit změny"
    : isTaskMode
      ? "Přidat úkol"
      : "Přidat položku";

  return (
    <>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>
          {isTaskMode
            ? item
              ? "Upravit úkol"
              : "Nový úkol"
            : item
              ? "Upravit položku"
              : "Nová položka"}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          {isTaskMode
            ? `Úkol pod položkou „${parentName}"`
            : "Přidejte novou položku do rozpočtu projektu."}
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        {isTaskMode ? (
          // ===== Task mode: flat layout, no collapsible sections =====
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subcategory">Název úkolu *</Label>
              <Input
                id="subcategory"
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                placeholder="např. Vyklízení sklepa"
                list="existing-subcategories"
                autoFocus
              />
              <datalist id="existing-subcategories">
                {existingSubcategories.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            {/* Hotovo + Zavrženo + Dotace as toggle buttons */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCompleted(!completed)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                    completed
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-border text-muted-foreground hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:border-emerald-800",
                  )}
                >
                  {completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                  Hotovo
                </button>
                <button
                  type="button"
                  onClick={() => setRejected(!rejected)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                    rejected
                      ? "border-rose-500 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                      : "border-border text-muted-foreground hover:border-rose-300 hover:bg-rose-50/50 dark:hover:border-rose-800",
                  )}
                >
                  <X className="h-3.5 w-3.5" />
                  Zavrženo
                </button>
                <button
                  type="button"
                  onClick={() => setSubsidyEligible(!subsidyEligible)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                    subsidyEligible
                      ? "border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-600 dark:bg-teal-950/40 dark:text-teal-300"
                      : "border-border text-muted-foreground hover:border-teal-300 hover:bg-teal-50/50 dark:hover:border-teal-800",
                  )}
                  title="Dotace — pro tento úkol lze čerpat dotaci"
                >
                  <HandCoins className="h-3.5 w-3.5" />
                  Dotace
                </button>
              </div>
              {subsidyEligible && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="subsidyAmountTask" className="text-[11px] text-muted-foreground">
                    Částka dotace (Kč)
                  </Label>
                  <Input
                    id="subsidyAmountTask"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    value={subsidyAmount}
                    onChange={(e) => setSubsidyAmount(e.target.value)}
                    placeholder="např. 15000"
                    className="h-8 w-40 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Odhadovaná výše dotace pro tento úkol.
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Poznámka</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Doplňující informace, jednotkové ceny, postup…"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="planCost">Plán (Kč)</Label>
                <Input
                  id="planCost"
                  value={planCost}
                  onChange={(e) => setPlanCost(e.target.value)}
                  placeholder="25000"
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="flexibility">Vůle (%)</Label>
                <Input
                  id="flexibility"
                  value={flexibility}
                  onChange={(e) => setFlexibility(e.target.value)}
                  placeholder="50"
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="planDays">Plán (dní)</Label>
                <Input
                  id="planDays"
                  value={planDays}
                  onChange={(e) => setPlanDays(e.target.value)}
                  placeholder="21"
                  inputMode="decimal"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="dateFrom">Datum od</Label>
                <Input
                  id="dateFrom"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateTo">Datum do</Label>
                <Input
                  id="dateTo"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>

            {/* External hyperlinks */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-xs">
                  <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  Odkazy
                  {links.length > 0 && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {links.length}
                    </span>
                  )}
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-[11px]"
                  onClick={() => setLinks((prev) => [...prev, { id: undefined, label: "", url: "" }])}
                >
                  <Plus className="h-3 w-3" /> Přidat odkaz
                </Button>
              </div>
              {links.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Žádné odkazy. Přidejte např. odkaz na výrobce, dokumentaci, e-shop…
                </p>
              ) : (
                <div className="space-y-1.5">
                  {links.map((link, idx) => (
                    <div
                      key={link.id ?? `new-${idx}`}
                      className="flex flex-wrap items-center gap-1.5 rounded-md border bg-card/50 p-1.5"
                    >
                      <Input
                        value={link.label}
                        onChange={(e) =>
                          setLinks((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, label: e.target.value } : l)),
                          )
                        }
                        placeholder="Hezký název (např. Výrobce)"
                        className="h-7 flex-1 min-w-[120px] text-xs"
                      />
                      <div className="relative flex-1 min-w-[140px]">
                        <Input
                          value={link.url}
                          onChange={(e) =>
                            setLinks((prev) =>
                              prev.map((l, i) => (i === idx ? { ...l, url: e.target.value } : l)),
                            )
                          }
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
                            title="Otevřít odkaz v novém okně"
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
                        title="Smazat odkaz"
                        aria-label="Smazat odkaz"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Odkazy se zobrazí pouze po rozkliknutí detailu položky/úkolu.
                Hezký název bude vidět v přehledu, URL se otevírá v novém okně.
              </p>
            </div>
          </div>
        ) : (
          // ===== Item mode: 4 sections (3 collapsible) =====
          <div className="space-y-4">
            {/* Section 1: Základ — always open, NOT collapsible */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="category">Kategorie *</Label>
                {!isCustomCat ? (
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Vyberte kategorii" />
                    </SelectTrigger>
                    <SelectContent>
                      {existingCategories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="Nová kategorie"
                    autoFocus
                  />
                )}
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => setIsCustomCat(!isCustomCat)}
                >
                  {isCustomCat ? "Vybrat existující" : "+ Vytvořit novou kategorii"}
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subcategory">Název položky</Label>
                {/* Use datalist to allow free typing + autocomplete from existing subcategories */}
                <Input
                  id="subcategory"
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                  placeholder="např. Hydroizolace - projekt"
                  list="existing-subcategories"
                />
                <datalist id="existing-subcategories">
                  {existingSubcategories.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                {existingSubcategories.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    {existingSubcategories.length} existujících podkategorií v této kategorii —
                    začněte psát pro návrhy.
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="phase">Fáze</Label>
                <Select value={phase} onValueChange={setPhase}>
                  <SelectTrigger id="phase">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PHASES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-2 pb-1">
                <button
                  type="button"
                  onClick={() => setRequired(!required)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all",
                    required
                      ? "border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                      : "border-border text-muted-foreground hover:border-amber-300 hover:bg-amber-50/50 dark:hover:border-amber-800",
                  )}
                  title="Nutné — položka je povinná pro dokončení projektu"
                >
                  <AlertTriangle className="h-3 w-3" />
                  Nutné
                </button>
                <button
                  type="button"
                  onClick={() => setCompleted(!completed)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all",
                    completed
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-border text-muted-foreground hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:border-emerald-800",
                  )}
                >
                  {completed ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                  Hotovo
                </button>
                <button
                  type="button"
                  onClick={() => setRejected(!rejected)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all",
                    rejected
                      ? "border-rose-500 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                      : "border-border text-muted-foreground hover:border-rose-300 hover:bg-rose-50/50 dark:hover:border-rose-800",
                  )}
                >
                  <X className="h-3 w-3" />
                  Zavrženo
                </button>
                <button
                  type="button"
                  onClick={() => setSubsidyEligible(!subsidyEligible)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all",
                    subsidyEligible
                      ? "border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-600 dark:bg-teal-950/40 dark:text-teal-300"
                      : "border-border text-muted-foreground hover:border-teal-300 hover:bg-teal-50/50 dark:hover:border-teal-800",
                  )}
                  title="Dotace — pro tuto položku/úkol lze čerpat dotaci"
                >
                  <HandCoins className="h-3 w-3" />
                  Dotace
                </button>
              </div>
              {subsidyEligible && (
                <div className="flex items-center gap-2 pb-1">
                  <Label htmlFor="subsidyAmount" className="text-[11px] text-muted-foreground">
                    Částka dotace (Kč)
                  </Label>
                  <Input
                    id="subsidyAmount"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    value={subsidyAmount}
                    onChange={(e) => setSubsidyAmount(e.target.value)}
                    placeholder="např. 15000"
                    className="h-8 w-40 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Odhadovaná výše dotace, kterou lze na tuto položku získat.
                  </span>
                </div>
              )}
            </div>

            {/* Section 2: Časování (collapsible, default closed) */}
            <Collapsible defaultOpen={false}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm font-medium hover:bg-muted/50"
                >
                  <span>Časování (volitelné)</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="dateFrom">Datum od</Label>
                    <Input
                      id="dateFrom"
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dateTo">Datum do</Label>
                    <Input
                      id="dateTo"
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </div>

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
                  <p className="text-[10px] text-muted-foreground">
                    Při výběru se Datum od automaticky doplní z Datum do vybrané položky.
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Section 3: Peníze (collapsible, default closed) */}
            <Collapsible defaultOpen={false}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm font-medium hover:bg-muted/50"
                >
                  <span>Peníze (volitelné)</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="planCost">Plán (Kč)</Label>
                    <Input
                      id="planCost"
                      value={planCost}
                      onChange={(e) => setPlanCost(e.target.value)}
                      placeholder="25000"
                      inputMode="decimal"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="flexibility">Vůle (%)</Label>
                    <Input
                      id="flexibility"
                      value={flexibility}
                      onChange={(e) => setFlexibility(e.target.value)}
                      placeholder="50"
                      inputMode="decimal"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="planDays">Plán (dní)</Label>
                    <Input
                      id="planDays"
                      value={planDays}
                      onChange={(e) => setPlanDays(e.target.value)}
                      placeholder="21"
                      inputMode="decimal"
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Section 4: Odkazy & poznámky (collapsible, default closed) */}
            <Collapsible defaultOpen={false}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm font-medium hover:bg-muted/50"
                >
                  <span>Odkazy &amp; poznámky (volitelné)</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-3">
                {/* External hyperlinks — editable list */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 text-xs">
                      <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      Odkazy
                      {links.length > 0 && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                          {links.length}
                        </span>
                      )}
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-[11px]"
                      onClick={() => setLinks((prev) => [...prev, { id: undefined, label: "", url: "" }])}
                    >
                      <Plus className="h-3 w-3" /> Přidat odkaz
                    </Button>
                  </div>
                  {links.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      Žádné odkazy. Přidejte např. odkaz na výrobce, dokumentaci, e-shop…
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {links.map((link, idx) => (
                        <div
                          key={link.id ?? `new-${idx}`}
                          className="flex flex-wrap items-center gap-1.5 rounded-md border bg-card/50 p-1.5"
                        >
                          <Input
                            value={link.label}
                            onChange={(e) =>
                              setLinks((prev) =>
                                prev.map((l, i) => (i === idx ? { ...l, label: e.target.value } : l)),
                              )
                            }
                            placeholder="Hezký název (např. Výrobce)"
                            className="h-7 flex-1 min-w-[120px] text-xs"
                          />
                          <div className="relative flex-1 min-w-[140px]">
                            <Input
                              value={link.url}
                              onChange={(e) =>
                                setLinks((prev) =>
                                  prev.map((l, i) => (i === idx ? { ...l, url: e.target.value } : l)),
                                )
                              }
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
                                title="Otevřít odkaz v novém okně"
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
                            title="Smazat odkaz"
                            aria-label="Smazat odkaz"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Odkazy se zobrazí pouze po rozkliknutí detailu položky/úkolu.
                    Hezký název bude vidět v přehledu, URL se otevírá v novém okně.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="note">Poznámka</Label>
                  <Textarea
                    id="note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Doplňující informace, jednotkové ceny, postup…"
                    rows={2}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        <ResponsiveDialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Zrušit
          </Button>
          <Button
            type="submit"
            disabled={createItem.isPending || updateItem.isPending}
          >
            {(createItem.isPending || updateItem.isPending) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {submitLabel}
          </Button>
        </ResponsiveDialogFooter>
      </form>
    </>
  );
}
