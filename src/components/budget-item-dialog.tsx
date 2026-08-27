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
import { CommentSection } from "@/components/comment-section";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  item?: BudgetItem | null;
  /** If set, opens dialog in "new task" mode for the given parent item. */
  parentId?: string;
  defaultCategory?: string;
  defaultPhase?: string;
};

export function BudgetItemDialog({
  open,
  onOpenChange,
  projectId,
  item,
  parentId,
  defaultCategory,
  defaultPhase,
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
            onDone={() => onOpenChange(false)}
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
  onDone,
}: {
  projectId: string;
  item?: BudgetItem | null;
  parentId?: string;
  defaultCategory?: string;
  defaultPhase?: string;
  onDone: () => void;
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

  // Determine "task mode": if parentId is set (and we're not editing an existing item)
  const isTaskMode = !item && !!parentId;

  // In task mode, category is fixed to parent's category
  const [category, setCategory] = useState(
    item?.category ?? defaultCategory ?? "",
  );
  const [customCategory, setCustomCategory] = useState(
    item && !existingCategories.includes(item.category) ? item.category : "",
  );
  const [isCustomCat, setIsCustomCat] = useState(
    item ? !existingCategories.includes(item.category) : false,
  );
  const [subcategory, setSubcategory] = useState(item?.subcategory ?? "");
  const [element, setElement] = useState(item?.element ?? "");
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
      ? (defaultCategory ?? "")
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
        subcategory,
        element,
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
      };
      // Set parentId only when creating new (not when editing — preserve existing)
      if (!item && parentId) {
        data.parentId = parentId;
      }
      if (item) {
        await updateItem.mutateAsync({ id: item.id, data });
        toast.success("Položka upravena");
      } else {
        await createItem.mutateAsync(data);
        toast.success(isTaskMode ? "Úkol přidán" : "Položka přidána");
      }
      onDone();
    } catch {
      toast.error("Nepodařilo se uložit položku");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {item
            ? "Upravit položku rozpočtu"
            : isTaskMode
              ? "Nový úkol"
              : "Nová položka rozpočtu"}
        </DialogTitle>
        <DialogDescription>
          {isTaskMode
            ? `Přidejte úkol pod položku „${defaultCategory ?? ""}".`
            : item?.subcategory || "Přidejte novou položku do rozpočtu projektu."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="category">Kategorie *</Label>
            {isTaskMode ? (
              // In task mode, category is locked to parent's category
              <Input value={defaultCategory ?? ""} disabled />
            ) : !isCustomCat ? (
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
            {!isTaskMode && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => setIsCustomCat(!isCustomCat)}
              >
                {isCustomCat ? "Vybrat existující" : "+ Vytvořit novou kategorii"}
              </Button>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="subcategory">Podkategorie / název</Label>
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

        <div className="space-y-2">
          <Label htmlFor="element">Prvek / Úkol</Label>
          <Input
            id="element"
            value={element}
            onChange={(e) => setElement(e.target.value)}
            placeholder="např. HW Systém / Podřezání / Injektáž"
          />
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

        {/* Comments section (only when editing an existing item) */}
        {item && <CommentSection budgetItemId={item.id} />}

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
            {item
              ? "Uložit změny"
              : isTaskMode
                ? "Přidat úkol"
                : "Přidat položku"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
