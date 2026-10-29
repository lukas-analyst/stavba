"use client";

import { memo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  MoreHorizontal,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Copy,
  X,
  GripVertical,
  HandCoins,
  ArrowRightLeft,
} from "lucide-react";
import {
  formatCurrency,
  formatNumber,
  PHASES,
  PHASE_COLORS,
  PHASE_BG_COLORS,
} from "@/lib/format";
import { CURRENCY_MAP } from "@/lib/currency-config";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Locale } from "@/i18n/config";
import { InlineNumber, InlineDate } from "@/components/ui/inline-editors";
import {
  useUpdateBudgetItem,
  useDeleteBudgetItem,
  useDuplicateBudgetItem,
  type BudgetItem,
} from "@/lib/api";
import { useAnalytics } from "@/hooks/use-analytics";
import type { RolledUp } from "./compute";
import { useRowDragListeners } from "./row-drag-context";
import { MoveItemDialog } from "./move-item-dialog";

// =====================================================================
// BudgetRow — one row in the budget table.
//
// Memoized so it skips re-renders when the parent (BudgetTab) re-renders
// for unrelated reasons (e.g. another row's selection state changing).
// The memoization is effective because:
//   - props are passed down (not pulled from React Query inside the row)
//   - `allItems` + `projectCurrency` are hoisted from the parent so each
//     row doesn't subscribe to the cache
//   - per-row drag listeners come from `useRowDragListeners` (context),
//     which only changes when this row's sortable wrapper actually changes
// =====================================================================
export const BudgetRow = memo(function BudgetRow({
  item,
  projectId,
  onEdit,
  isExpanded,
  onToggleExpand,
  childCount,
  rolled,
  saved,
  overBudget,
  onAddTask,
  isChild,
  highlightId,
  registerRow,
  selectionMode = false,
  selected = false,
  onToggleSelection,
  allItems,
  projectCurrency,
}: {
  item: BudgetItem;
  projectId: string;
  onEdit: (item: BudgetItem) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  childCount: number;
  rolled: RolledUp;
  saved: number | null;
  overBudget: boolean;
  onAddTask?: () => void;
  isChild: boolean;
  highlightId?: string | null;
  registerRow?: (id: string, el: HTMLTableRowElement | null) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelection?: (id: string) => void;
  // Hoisted out of BudgetRow to avoid per-row React Query subscriptions.
  // The parent (BudgetTab) already fetches both via useBudgetItems(projectId)
  // and useProjects(); passing them down as props lets BudgetRow's memo()
  // actually short-circuit when the underlying cache changes don't affect
  // this particular row.
  allItems?: BudgetItem[];
  projectCurrency: string;
}) {
  const updateItem = useUpdateBudgetItem(projectId);
  const deleteItem = useDeleteBudgetItem(projectId);
  const duplicateItem = useDuplicateBudgetItem(projectId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const dragCtx = useRowDragListeners();
  const { trackEvent } = useAnalytics(projectId);
  const t = useTranslations("tabs.budget.row");
  // Column-header translations — used as accessible labels for the inline
  // editors (InlineNumber / InlineDate) so screen-reader users hear the
  // field's purpose rather than just its numeric value.
  const tColumn = useTranslations("tabs.budget.column");
  const tPhases = useTranslations("phases");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;

  const update = (field: keyof BudgetItem, value: unknown) => {
    updateItem.mutate({ id: item.id, data: { [field]: value } });
    trackEvent("edit_budget_item", { field });
  };

  const handleMove = async (newParentId: string | null) => {
    await updateItem.mutateAsync({
      id: item.id,
      data: { parentId: newParentId || null },
    });
    trackEvent("move_budget_item", { toTopLevel: newParentId === null });
  };

  const displayPlanCost = childCount > 0 ? rolled.planCost : item.planCost;
  const displayPlanDays = childCount > 0 ? rolled.planDays : item.planDays;
  const displayActualCost = childCount > 0 ? rolled.actualCost : item.actualCost;
  const displayActualHours = childCount > 0 ? rolled.actualHours : item.actualHours;

  // Multi-currency: when the item has `planCostCurrency` set (foreign currency),
  // the Plán column shows the original amount + the converted amount in
  // parens. Parents aggregate `planCostConverted` from children (all in
  // project currency), so the foreign-currency branch only applies to
  // leaf items (childCount === 0).
  const planCostCurrency = item.planCostCurrency ?? projectCurrency;
  const isForeignPlanCurrency =
    childCount === 0 && !!item.planCostCurrency && item.planCostCurrency !== projectCurrency;
  const planConverted = item.planCostConverted ?? item.planCost ?? 0;
  const projectSymbol = CURRENCY_MAP[projectCurrency]?.symbol ?? projectCurrency;

  const isHighlighted = !!highlightId && highlightId === item.id;

  return (
    <TableRow
      ref={(el) => {
        registerRow?.(item.id, el);
        if (dragCtx) dragCtx.sortableRef(el);
      }}
      style={dragCtx?.sortableStyle}
      {...(dragCtx?.sortableAttributes ?? {})}
      onClick={() => {
        // Disable the edit-dialog shortcut when in selection mode —
        // clicking the row body in selection mode does nothing (the
        // user must use the explicit checkbox to toggle selection).
        if (selectionMode) return;
        onEdit(item);
      }}
      // Accessibility (A3): keyboard users can focus the row and press
      // Enter to open the edit dialog (same as a click). In selection
      // mode the row body is no longer an edit affordance — the
      // checkbox handles selection — so we drop it from the tab order
      // (tabIndex=undefined) to avoid a misleading focusable-but-inert
      // element. aria-label is also omitted in selection mode (the
      // checkbox already announces the row via its own aria-label).
      tabIndex={!selectionMode ? 0 : undefined}
      onKeyDown={
        !selectionMode
          ? (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onEdit(item);
              }
            }
          : undefined
      }
      aria-label={
        !selectionMode
          ? t("aria.editRow", { name: item.subcategory || item.category })
          : undefined
      }
      className={cn(
        "group transition-colors",
        // In selection mode the row body is no longer clickable (the
        // edit dialog is invoked via the actions menu instead), so we
        // drop the `cursor-pointer` hint to avoid misleading the user.
        selectionMode ? "cursor-default" : "cursor-pointer",
        // Virtual paint hint — browser skips painting off-screen rows,
        // dramatically improving scroll perf for 100+ item projects.
        // Children rows inherit from parent's expanded state.
        "cv-row",
        isChild
          ? cn(
              "bg-muted/30 hover:bg-muted/40",
              item.rejected && "opacity-70",
            )
          : cn(
              item.rejected
                ? "opacity-60 bg-danger-soft/30"
                : item.completed
                  ? "bg-success-soft/30"
                  : "hover:bg-muted/30",
            ),
        // Highlight selected rows with a primary tint (in selection mode)
        selected && "bg-primary/10 ring-1 ring-inset ring-primary/40",
        isHighlighted && "stavba-highlight-row",
        dragCtx?.isDragging && "opacity-40",
      )}
    >
      {/* Selection checkbox cell — only rendered when selectionMode is on.
          Placed BEFORE the drag handle so the checkbox is the first
          column (per task spec). Clicking the checkbox toggles the row
          in `selectedIds`; stopPropagation prevents the row's onClick
          (which is disabled in selection mode anyway, but the click
          would still bubble to the drag handle's parent and could
          interfere with DnD activation). */}
      {selectionMode && (
        <TableCell
          className="w-10 text-center align-middle"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelection?.(item.id)}
            aria-label={t("aria.selectRow", { name: item.subcategory || item.category })}
            className="mx-auto"
          />
        </TableCell>
      )}
      {/* Drag handle cell — top-level items AND child tasks.
          Children get a lighter, indented handle to hint at sub-level.
          Cell width is wider on mobile (w-12) to comfortably fit the
          32px touch target; collapses to w-8 on desktop. */}
      {dragCtx?.listeners ? (
        <TableCell className="w-12 align-middle sm:w-8">
          <span
            {...dragCtx.listeners}
            className={cn(
              "flex h-8 w-8 cursor-grab items-center justify-center rounded text-muted-foreground/30 hover:bg-muted hover:text-foreground active:cursor-grabbing md:h-5 md:w-5",
              isChild && "ml-2 opacity-60",
            )}
            aria-label={t("aria.drag")}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </span>
        </TableCell>
      ) : (
        <TableCell className="w-12 sm:w-8" />
      )}

      {/* Expand/collapse toggle (parents) OR gradient bg for children */}
      {isChild ? (
        <TableCell className="relative align-middle pl-8">
          {/* Gradient fade from parent's phase color (left) to transparent (right) */}
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 w-16 pointer-events-none"
            style={{
              background: `linear-gradient(to right, var(--phase-color, transparent) 0%, transparent 100%)`,
              opacity: 0.15,
            }}
            data-phase-color={
              item.rejected ? "rose" : item.phase
            }
            ref={(el) => {
              if (!el) return;
              // Set CSS variable from PHASE_BG_COLORS
              const colorMap: Record<string, string> = {
                "preparation": "#a78bfa",
                "demolition": "#f87171",
                "earthworks": "#8b6f47",
                "foundation": "#6b7280",
                "shell": "#fbbf24",
                "installations": "#3b82f6",
                "finishing": "#34d399",
                "facade": "#f59e0b",
                "roof": "#ef4444",
                "interior": "#10b981",
                "exterior": "#84cc16",
                "final_inspection": "#a855f7",
                "future": "#60a5fa",
                "unspecified": "#a1a1aa",
                "rose": "#f43f5e",
              };
              const key = el.getAttribute("data-phase-color") ?? "";
              el.style.setProperty("--phase-color", colorMap[key] ?? "#a1a1aa");
            }}
          />
          <span aria-hidden className="relative select-none text-muted-foreground/60">
            └
          </span>
        </TableCell>
      ) : (
        <TableCell
          className="relative align-middle cursor-pointer"
          onClick={onToggleExpand}
        >
          <div
            aria-hidden
            className={cn(
              "absolute inset-y-0 left-0 w-1",
              item.rejected
                ? "bg-danger"
                : PHASE_BG_COLORS[item.phase] ?? "bg-muted-foreground/50",
            )}
          />
          <div className="relative flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              className="flex items-center gap-1 rounded-lg px-2 py-1 type-label font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label={isExpanded ? t("aria.collapse") : t("aria.expand")}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {childCount > 0 ? (
                <span className="type-label">
                  {t("childCount", { count: childCount })}
                </span>
              ) : (
                <span className="type-label text-muted-foreground/50">{t("addTask")}</span>
              )}
            </button>
          </div>
        </TableCell>
      )}

      {/* Položka / Úkol */}
      <TableCell
        className={isChild ? "cursor-pointer" : ""}
        onClick={isChild ? () => onEdit(item) : undefined}
      >
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            {item.required && (
              <span
                title={t("required.title")}
                aria-label={t("required.aria")}
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-warning-soft type-label-sm font-bold leading-none text-warning-strong dark:bg-warning-soft/40 dark:text-warning/70"
              >
                !
              </span>
            )}
            <span
              className={cn(
                "type-body text-left font-medium",
                isChild ? "cursor-pointer hover:underline" : "",
                item.rejected
                  ? "line-through decoration-danger/70"
                  : item.completed && "line-through decoration-success/50",
                childCount > 0 && "font-semibold",
              )}
            >
              {item.subcategory || t("placeholder.noName")}
            </span>
            {item.rejected && (
              <Badge variant="outline" className="type-label-sm h-4 px-1 text-danger dark:text-danger/60">
                {t("badge.rejected")}
              </Badge>
            )}
            {item.completed && !item.rejected && (
              <Badge variant="outline" className="type-label-sm h-4 px-1 text-success">
                {t("badge.done")}
              </Badge>
            )}
            {item.subsidyEligible && (
              <Badge
                variant="outline"
                title={
                  item.subsidyAmount != null
                    ? t("badge.subsidyTitleWithAmount", { amount: formatCurrency(item.subsidyAmount, projectCurrency, locale) })
                    : t("badge.subsidyTitleNoAmount")
                }
                className="type-label-sm h-4 gap-0.5 px-1 text-subsidy-strong dark:text-subsidy"
              >
                <HandCoins className="h-2.5 w-2.5" />
                {t("badge.subsidy")}
                {item.subsidyAmount != null && item.subsidyAmount > 0 && (
                  <span className="ml-0.5 tabular-nums">
                    {formatCurrency(item.subsidyAmount, projectCurrency, locale)}
                  </span>
                )}
              </Badge>
            )}
            {!isChild && onAddTask && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddTask();
                }}
                title={t("badge.addTaskTitle")}
                aria-label={t("badge.addTaskAria")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-success transition-colors hover:bg-success-soft hover:text-success-strong dark:text-success dark:hover:bg-success-soft sm:h-6 sm:w-6"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
          {item._count &&
            (item._count.payments > 0 || item._count.timeEntries > 0) && (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {item._count.payments > 0 && (
                  <Badge variant="outline" className="h-4 px-1 type-label-sm text-success">
                    {t("paymentsCount", { count: item._count.payments })}
                  </Badge>
                )}
                {item._count.timeEntries > 0 && (
                  <Badge variant="outline" className="h-4 px-1 type-label-sm text-time">
                    {t("timeCount", { count: item._count.timeEntries })}
                  </Badge>
                )}
              </div>
            )}
        </div>
      </TableCell>

      {/* Fáze */}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Select
          value={item.phase}
          onValueChange={(v) => update("phase", v)}
        >
          <SelectTrigger className="h-7 border-0 px-1 type-label shadow-none hover:bg-muted">
            <Badge
              variant="outline"
              className={cn("h-5 px-1.5 type-label-sm", PHASE_COLORS[item.phase] ?? "")}
            >
              {tPhases(item.phase)}
            </Badge>
          </SelectTrigger>
          <SelectContent>
            {PHASES.map((p) => (
              <SelectItem key={p} value={p}>
                {tPhases(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>

      {/* Plán (Kč) — Variant D:
          • Leaf (no children): own planCost, editable inline.
          • Parent (has children): TOTAL (own + Σ children) shown bold as
            the primary number; the parent's OWN planCost shown below as a
            small muted "+ X Kč" line (editable inline). Hidden when the
            parent's own cost is null/0 to avoid noise.
            Children's planCosts are visible as rows below, so we don't
            repeat them in the breakdown.

          Multi-currency: when a LEAF item has `planCostCurrency` set
          (foreign currency), we display the original amount in that
          currency + the converted amount in the project's currency in
          parens — same pattern as the payment table. Inline editing is
          disabled for foreign-currency rows (the user must open the
          edit dialog). */}
      <TableCell onClick={(e) => e.stopPropagation()} className="text-right">
        {childCount > 0 ? (
          <div className="flex flex-col items-end gap-0.5">
            {/* Total = own + Σ children (read-only display, in project currency) */}
            <span
              className={cn(
                "block w-full rounded px-1 py-0.5 text-right font-semibold tabular-nums",
                "hover:bg-surface-container-high",
              )}
              title={t("tooltip.planTotal", { own: formatCurrency(item.planCost ?? 0, projectCurrency, locale), children: formatCurrency(displayPlanCost - (item.planCost ?? 0), projectCurrency, locale) })}
            >
              {displayPlanCost > 0 ? formatCurrency(displayPlanCost, projectCurrency, locale) : (
                <span className="text-muted-foreground/50">—</span>
              )}
            </span>
            {/* Own cost — editable inline, shown only when there's a value.
                "+" prefix indicates it adds to the total. */}
            {item.planCost != null && item.planCost !== 0 && (
              <span className="flex w-full items-center justify-end gap-0.5 type-label-sm text-muted-foreground tabular-nums">
                <span className="shrink-0 text-muted-foreground/60">+</span>
                <InlineNumber
                  value={item.planCost}
                  onCommit={(v) => update("planCost", v)}
                  className="text-right tabular-nums text-muted-foreground hover:text-foreground"
                  suffix={` ${projectSymbol}`}
                  ariaLabel={tColumn("plan")}
                />
              </span>
            )}
          </div>
        ) : isForeignPlanCurrency ? (
          // Foreign currency leaf: original amount + converted amount in parens.
          // Inline editing is disabled (the currency + amount together determine
          // the converted value, so the user must open the edit dialog).
          <div className="flex flex-col items-end">
            <span className="font-medium tabular-nums">
              {formatCurrency(item.planCost ?? 0, planCostCurrency, locale)}
            </span>
            <span className="type-label text-muted-foreground tabular-nums">
              ({formatCurrency(planConverted, projectCurrency, locale)})
            </span>
          </div>
        ) : (
          <InlineNumber
            value={item.planCost}
            onCommit={(v) => update("planCost", v)}
            className={cn("text-right font-medium")}
            suffix={` ${projectSymbol}`}
            ariaLabel={tColumn("plan")}
          />
        )}
      </TableCell>

      {/* Dny — editable for ALL items */}
      <TableCell onClick={(e) => e.stopPropagation()} className="text-right">
        <InlineNumber
          value={item.planDays}
          onCommit={(v) => update("planDays", v)}
          className={cn("text-right type-label", childCount > 0 && "font-semibold")}
          ariaLabel={tColumn("days")}
        />
      </TableCell>

      {/* Datum od */}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <InlineDate
          value={item.dateFrom}
          onCommit={(v) => update("dateFrom", v)}
          ariaLabel={tColumn("dateFrom")}
        />
      </TableCell>

      {/* Datum do */}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <InlineDate
          value={item.dateTo}
          onCommit={(v) => update("dateTo", v)}
          ariaLabel={tColumn("dateTo")}
        />
      </TableCell>

      {/* Skut. (Kč) — Variant D (same pattern as Plán):
          • Leaf: own actualCost, editable inline.
          • Parent: TOTAL (own + Σ children) bold + "+ X Kč" editable below
            (only when parent's own actualCost is non-null/non-zero).
            actualCost is normally auto-computed from payments, but the
            parent's own actualCost can still be adjusted manually. */}
      <TableCell
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "text-right",
          overBudget && "text-danger",
        )}
      >
        {childCount > 0 ? (
          <div className="flex flex-col items-end gap-0.5">
            <span
              className={cn(
                "block w-full rounded px-1 py-0.5 text-right font-semibold tabular-nums",
                overBudget && "text-danger",
              )}
              title={t("tooltip.actualTotal", { own: formatCurrency(item.actualCost ?? 0, projectCurrency, locale), children: formatCurrency(displayActualCost - (item.actualCost ?? 0), projectCurrency, locale) })}
            >
              {displayActualCost > 0 ? formatCurrency(displayActualCost, projectCurrency, locale) : (
                <span className="text-muted-foreground/50">—</span>
              )}
            </span>
            {item.actualCost != null && item.actualCost !== 0 && (
              <span className="flex w-full items-center justify-end gap-0.5 type-label-sm text-muted-foreground tabular-nums">
                <span className="shrink-0 text-muted-foreground/60">+</span>
                <InlineNumber
                  value={item.actualCost}
                  onCommit={(v) => update("actualCost", v)}
                  className="text-right tabular-nums text-muted-foreground hover:text-foreground"
                  suffix={` ${projectSymbol}`}
                  ariaLabel={tColumn("actual")}
                />
              </span>
            )}
          </div>
        ) : (
          <InlineNumber
            value={item.actualCost}
            onCommit={(v) => update("actualCost", v)}
            className={cn("text-right", overBudget && "font-semibold text-danger")}
            ariaLabel={tColumn("actual")}
          />
        )}
        {overBudget && (
          <span className="ml-1 inline-flex items-center type-label-sm text-danger">
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
      </TableCell>

      {/* Hodiny */}
      <TableCell className="text-right type-label text-time">
        {displayActualHours > 0 ? formatNumber(displayActualHours, " h") : "—"}
      </TableCell>

      {/* Stav: Nutné + Hotovo + Rejected (X) — stopPropagation prevents row edit dialog */}
      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={item.required ? "default" : "outline"}
            onClick={(e) => { e.stopPropagation(); update("required", !item.required); }}
            disabled={updateItem.isPending}
            aria-pressed={item.required}
            aria-label={item.required ? t("required.ariaRequired") : t("required.ariaOptional")}
            className={cn(
              "h-9 w-9 shrink-0 p-0 sm:h-7 sm:w-7",
              item.required
                ? "border-warning bg-warning text-white hover:bg-warning-strong hover:text-white dark:border-warning/60 dark:bg-warning/70 dark:hover:bg-warning/80"
                : "text-warning hover:border-warning/50 hover:bg-warning-soft hover:text-warning-strong dark:text-warning/70 dark:hover:border-warning/40 dark:hover:bg-warning-soft/50",
            )}
            title={
              item.required
                ? t("required.titleRequired")
                : t("required.titleOptional")
            }
          >
            <AlertTriangle className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={item.completed ? "default" : "outline"}
            onClick={(e) => { e.stopPropagation(); update("completed", !item.completed); }}
            disabled={updateItem.isPending || item.rejected}
            aria-pressed={item.completed}
            className={cn(
              "h-9 w-9 p-0 sm:h-7 sm:w-7",
              item.completed
                ? "border-success bg-success text-white hover:bg-success-strong hover:text-white dark:border-success/60 dark:bg-success/70 dark:hover:bg-success/80"
                : "text-success hover:border-success/50 hover:bg-success-soft hover:text-success-strong dark:text-success/70 dark:hover:border-success/40 dark:hover:bg-success-soft/50",
            )}
            title={item.completed ? t("completed.titleDone") : t("completed.titleTodo")}
            aria-label={item.completed ? t("completed.ariaDone") : t("completed.ariaTodo")}
          >
            <CheckCircle2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={item.rejected ? "default" : "outline"}
            onClick={(e) => { e.stopPropagation(); update("rejected", !item.rejected); }}
            disabled={updateItem.isPending}
            aria-pressed={item.rejected}
            className={cn(
              "h-9 w-9 p-0 sm:h-7 sm:w-7",
              item.rejected
                ? "border-danger bg-danger text-white hover:bg-danger-strong hover:text-white dark:border-danger/60 dark:bg-danger/70 dark:hover:bg-danger/80"
                : "text-danger hover:border-danger/50 hover:bg-danger-soft hover:text-danger-strong dark:text-danger/70 dark:hover:border-danger/40 dark:hover:bg-danger-soft/50",
            )}
            title={item.rejected ? t("rejected.titleRejected") : t("rejected.titleNotRejected")}
            aria-label={item.rejected ? t("rejected.ariaRejected") : t("rejected.ariaNotRejected")}
          >
            <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </Button>
        </div>
      </TableCell>

      {/* Akce — stopPropagation prevents row edit dialog when opening menu */}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground opacity-60 transition-opacity hover:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 sm:h-7 sm:w-7"
                title={t("actions.titleMore")}
                aria-label={t("actions.ariaMore")}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(item)}>{t("menu.editDetail")}</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => update("required", !item.required)}
              >
                <AlertTriangle className="mr-2 h-3.5 w-3.5 text-warning" />
                {item.required ? t("menu.markOptional") : t("menu.markRequired")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => update("subsidyEligible", !item.subsidyEligible)}
              >
                <HandCoins className="mr-2 h-3.5 w-3.5 text-subsidy" />
                {item.subsidyEligible ? t("menu.subsidyRemove") : t("menu.subsidyAdd")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => update("completed", !item.completed)}
              >
                {item.completed ? t("menu.markNotDone") : t("menu.markDone")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => update("rejected", !item.rejected)}
              >
                {item.rejected ? t("menu.unreject") : t("menu.reject")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMoveOpen(true)}>
                <ArrowRightLeft className="mr-2 h-3.5 w-3.5 text-primary" />
                {t("menu.move")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await duplicateItem.mutateAsync(item.id);
                    toast.success(t("toasts.duplicateSuccess"));
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : t("toasts.duplicateError"));
                  }
                }}
              >
                <Copy className="mr-2 h-3.5 w-3.5" /> {t("menu.duplicate")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> {tCommon("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("delete.title")}</DialogTitle>
              <DialogDescription>
                {t.rich("delete.body", {
                  name: item.subcategory || item.category,
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                {tCommon("cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={deleteItem.isPending}
                onClick={async () => {
                  try {
                    await deleteItem.mutateAsync(item.id);
                    toast.success(t("toasts.deleteSuccess"));
                    setConfirmDelete(false);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : t("toasts.deleteError"));
                  }
                }}
              >
                {deleteItem.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {tCommon("delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {allItems && (
          <MoveItemDialog
            open={moveOpen}
            onOpenChange={setMoveOpen}
            item={item}
            projectId={projectId}
            allItems={allItems}
            onMove={handleMove}
          />
        )}
      </TableCell>
    </TableRow>
  );
});
