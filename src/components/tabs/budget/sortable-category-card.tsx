"use client";

import { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, GripVertical, PiggyBank, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import type { BudgetItem } from "@/lib/api";

// =====================================================================
// CategorySelectAllCheckbox — rendered in the table header of each
// category when selectionMode is on. Toggles all visible top-level
// items in this category (children are not toggled here — they have
// their own per-row checkbox). Shows indeterminate state when only
// some items are selected.
// =====================================================================
export function CategorySelectAllCheckbox({
  catItems,
  selectedIds,
  onToggleAll,
}: {
  catItems: BudgetItem[];
  selectedIds: Set<string>;
  onToggleAll: (ids: string[]) => void;
}) {
  const t = useTranslations("tabs.budget.row");
  const ids = useMemo(() => catItems.map((it) => it.id), [catItems]);
  const selectedCount = ids.filter((id) => selectedIds.has(id)).length;
  const allSelected = ids.length > 0 && selectedCount === ids.length;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <Checkbox
      checked={allSelected}
      indeterminate={someSelected}
      onCheckedChange={() => onToggleAll(ids)}
      aria-label={t("aria.selectAllInCategory")}
      className="mx-auto"
    />
  );
}

// =====================================================================
// SortableCategoryCard — wraps a Collapsible category with DnD
// =====================================================================
export function SortableCategoryCard({
  id,
  categoryName,
  collapsed,
  onToggle,
  totals,
  burn,
  onCategoryDragEnd,
  onAddItem,
  projectCurrency,
  children,
}: {
  id: string;
  categoryName: string;
  collapsed: boolean;
  onToggle: () => void;
  totals: { plan: number; actual: number; count: number; saved: number };
  burn: number;
  onCategoryDragEnd: (oldIndex: number, newIndex: number) => void;
  onAddItem?: () => void;
  projectCurrency: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("tabs.budget.category");
  const locale = useLocale() as Locale;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data: { type: "category", categoryName } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      id={`category-${categoryName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`}
      className={cn(
        "rounded-lg border border-outline-variant bg-card shadow-sm",
        isDragging && "shadow-xl ring-2 ring-primary/30",
      )}
    >
      <Collapsible
        open={!collapsed}
        onOpenChange={onToggle}
      >
        <CollapsibleTrigger asChild>
          <button
            className="group flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/50"
            {...attributes}
          >
            {/* Drag handle — larger touch target on mobile (32px → 20px on desktop) */}
            <span
              {...listeners}
              className="flex h-8 w-8 cursor-grab items-center justify-center rounded text-muted-foreground/40 hover:bg-muted hover:text-foreground active:cursor-grabbing md:h-5 md:w-5"
              aria-label={t("aria.drag")}
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-4 w-4" />
            </span>
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            <span className="text-sm font-bold">{categoryName}</span>
            <Badge variant="secondary" className="type-label-sm">
              {totals.count}
            </Badge>
            {totals.saved > 0 && (
              <Badge variant="outline" className="type-label-sm text-success">
                <PiggyBank className="mr-1 h-2.5 w-2.5" />
                {formatCurrency(totals.saved, projectCurrency, locale)}
              </Badge>
            )}
            {/* Add item to this category (green plus) — span instead of button
                to avoid nested <button> inside CollapsibleTrigger */}
            {onAddItem && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddItem();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onAddItem();
                  }
                }}
                title={t("addItem.title", { name: categoryName })}
                aria-label={t("addItem.aria")}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-success transition-colors hover:bg-success-soft hover:text-success-strong dark:text-success dark:hover:bg-success-soft sm:h-5 sm:w-5"
              >
                <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              </span>
            )}
            <div className="ml-auto flex items-center gap-4 text-xs">
              <span className="text-muted-foreground">
                {formatCurrency(totals.actual, projectCurrency, locale)} / {formatCurrency(totals.plan, projectCurrency, locale)}
              </span>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    burn > 100
                      ? "bg-danger"
                      : burn > 80
                        ? "bg-warning"
                        : "bg-success",
                  )}
                  style={{ width: `${Math.min(burn, 100)}%` }}
                />
              </div>
              <span
                className={cn(
                  "font-semibold",
                  burn > 100
                    ? "text-danger"
                    : burn > 80
                      ? "text-warning"
                      : "text-success",
                )}
              >
                {burn.toFixed(0)}%
              </span>
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>{children}</CollapsibleContent>
      </Collapsible>
    </div>
  );
}
