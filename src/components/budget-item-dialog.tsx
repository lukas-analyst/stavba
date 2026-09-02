"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { PHASES } from "@/lib/format";
import {
  useBudgetItems,
  useCreateBudgetItem,
  useUpdateBudgetItem,
  type BudgetItem,
} from "@/lib/api";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
  onSubmitted,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {open && (
          <BudgetItemForm
            key={item?.id ?? parentId ?? "new"}
            projectId={projectId}
            item={item}
            parentId={parentId}
            defaultCategory={defaultCategory}
            defaultPhase={defaultPhase}
            parentItemName={parentItemName}
            onDone={() => onOpenChange(false)}
            onSubmitted={onSubmitted}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BudgetItemForm({
  projectId,
  item,
  parentId,
  defaultCategory,
  defaultPhase,
  parentItemName,
  onDone,
  onSubmitted,
}: {
  projectId: string;
  item?: BudgetItem | null;
  parentId?: string;
  defaultCategory?: string;
  defaultPhase?: string;
  parentItemName?: string;
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
  const [required, setRequired] = useState(item?.required ?? false);
  const [completed, setCompleted] = useState(item?.completed ?? false);
  const [rejected, setRejected] = useState(item?.rejected ?? false);
  const [note, setNote] = useState(item?.note ?? "");
  const [planCost, setPlanCost] = useState(item?.planCost?.toString() ?? "");
  const [flexibility, setFlexibility] = useState(
    item?.flexibilityPercent?.toString() ?? "",
  );
  const [planDays, setPlanDays] = useState(item?.planDays?.toString() ?? "");
  const [dateFrom, setDateFrom] = useState(
    item?.dateFrom ? item.dateFrom.substring(0, 10) : "",
  );
  const [dateTo, setDateTo] = useState(
    item?.dateTo ? item.dateTo.substring(0, 10) : "",
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
        // The `element` field is no longer used in the UI — Položky don't have
        // it, and Úkoly use `subcategory` as their name. Always null it out
        // to keep the database consistent.
        element: null,
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
      <DialogHeader>
        <DialogTitle>
          {isTaskMode
            ? item
              ? "Upravit úkol"
              : "Nový úkol"
            : item
              ? "Upravit položku"
              : "Nová položka"}
        </DialogTitle>
        <DialogDescription>
          {isTaskMode
            ? `Úkol pod položkou „${parentName}"`
            : "Přidejte novou položku do rozpočtu projektu."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        {isTaskMode ? (
          // ===== Task mode: only the task name (subcategory) =====
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
        ) : (
          // ===== Item mode: category + subcategory (název položky) =====
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
        )}

        {isTaskMode ? (
          // ===== Task mode: only Hotovo + Zavrženo (no Fáze, no Nutné) =====
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="completed"
                checked={completed}
                onCheckedChange={(v) => setCompleted(v === true)}
              />
              <Label htmlFor="completed" className="cursor-pointer">
                Hotovo
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="rejected"
                checked={rejected}
                onCheckedChange={(v) => setRejected(v === true)}
              />
              <Label htmlFor="rejected" className="cursor-pointer text-rose-700 dark:text-rose-400">
                Zavrženo
              </Label>
            </div>
          </div>
        ) : (
          // ===== Item mode: Fáze + Nutné/Hotovo/Zavrženo =====
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
            <div className="flex flex-col justify-end gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="required"
                  checked={required}
                  onCheckedChange={(v) => setRequired(v === true)}
                />
                <Label htmlFor="required" className="cursor-pointer">
                  Nutné
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="completed"
                  checked={completed}
                  onCheckedChange={(v) => setCompleted(v === true)}
                />
                <Label htmlFor="completed" className="cursor-pointer">
                  Hotovo
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="rejected"
                  checked={rejected}
                  onCheckedChange={(v) => setRejected(v === true)}
                />
                <Label htmlFor="rejected" className="cursor-pointer text-rose-700 dark:text-rose-400">
                  Zavrženo
                </Label>
              </div>
            </div>
          </div>
        )}

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

        {!isTaskMode && (
          <div className="space-y-2">
            <Label htmlFor="dependsOn">Navazuje na</Label>
            <Select value={dependsOnId} onValueChange={handleDependsOnChange}>
              <SelectTrigger id="dependsOn">
                <SelectValue placeholder="— žádná závislost —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— žádná závislost —</SelectItem>
                {dependsOnOptions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.subcategory || i.category}
                    {i.dateTo ? ` (do ${i.dateTo.substring(0, 10)})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Při výběru se Datum od automaticky doplní z Datum do vybrané položky.
            </p>
          </div>
        )}

        <DialogFooter>
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
        </DialogFooter>
      </form>
    </>
  );
}
