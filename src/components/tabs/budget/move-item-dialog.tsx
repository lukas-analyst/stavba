"use client";

import { useState, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowRightLeft, CornerUpRight, Loader2 } from "lucide-react";
import type { BudgetItem } from "@/lib/api";

// MoveItemDialog — re-parent a budget item (task) to a different parent.
//
// Lets the user move a child task under a different top-level item, or
// promote it to a top-level item (parentId = null). Excludes the item
// itself and all its descendants (so you can't create a cycle), and
// only shows top-level items as candidates (you can't nest under
// another task — the UI only supports 2 levels for now).
export function MoveItemDialog({
  open,
  onOpenChange,
  item,
  projectId,
  allItems,
  onMove,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: BudgetItem;
  projectId: string;
  allItems: BudgetItem[];
  onMove: (newParentId: string | null) => Promise<void>;
}) {
  const t = useTranslations("tabs.budget.moveDialog");
  const tCommon = useTranslations("common");
  // Collect descendants of `item` so we can exclude them from the target
  // list (cycle prevention). We only need direct children here because
  // candidates are top-level items — a descendant of `item` can only be
  // a top-level item if `item` itself is top-level AND the descendant was
  // promoted. To be safe, walk the full subtree.
  const descendantIds = useMemo(() => {
    const ids = new Set<string>();
    const queue: string[] = [item.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const it of allItems) {
        if (it.parentId === current && !ids.has(it.id)) {
          ids.add(it.id);
          queue.push(it.id);
        }
      }
    }
    return ids;
  }, [item.id, allItems]);

  // Candidate targets: top-level items (parentId == null) in the same
  // project, excluding self and descendants. Grouped by category for
  // easier scanning when there are many items.
  const candidates = useMemo(() => {
    return allItems
      .filter(
        (it) =>
          it.id !== item.id &&
          !it.parentId &&
          !descendantIds.has(it.id) &&
          it.projectId === projectId,
      )
      .sort((a, b) => {
        // Group by category, then by sortOrder
        if (a.category !== b.category) {
          return a.category.localeCompare(b.category, "cs");
        }
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });
  }, [allItems, item.id, descendantIds, projectId]);

  const [selectedParentId, setSelectedParentId] = useState<string | null>(
    item.parentId ?? null,
  );

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) setSelectedParentId(item.parentId ?? null);
  }, [open, item.parentId]);

  const [moving, setMoving] = useState(false);

  const currentParent = allItems.find((it) => it.id === item.parentId);

  const handleConfirm = async () => {
    if ((selectedParentId ?? null) === (item.parentId ?? null)) {
      onOpenChange(false);
      return;
    }
    setMoving(true);
    try {
      await onMove(selectedParentId);
      toast.success(
        selectedParentId
          ? t("toasts.movedToParent")
          : t("toasts.movedToTop"),
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.error"));
    } finally {
      setMoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t.rich("description", {
              name: item.subcategory || item.category,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {currentParent && (
            <div className="rounded-md border border-muted bg-muted/40 px-3 py-2 type-label text-muted-foreground">
              {t("currentParent", { name: currentParent.subcategory || currentParent.category })}
            </div>
          )}

          {candidates.length === 0 ? (
            <p className="rounded-md border border-dashed border-muted px-3 py-4 text-center type-body text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <Select
              value={selectedParentId ?? "__top__"}
              onValueChange={(v) =>
                setSelectedParentId(v === "__top__" ? null : v)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("placeholder.select")} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__top__">
                  <span className="flex items-center gap-2">
                    <CornerUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                    {t("topLevel")}
                  </span>
                </SelectItem>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">{c.category}</span>
                      <span className="text-muted-foreground/50">›</span>
                      <span className="font-medium">
                        {c.subcategory || t("placeholder.noName")}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              moving ||
              candidates.length === 0 ||
              (selectedParentId ?? null) === (item.parentId ?? null)
            }
          >
            {moving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
