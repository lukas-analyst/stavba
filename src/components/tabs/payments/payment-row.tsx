"use client";

import { memo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
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
import { Pencil, MoreHorizontal, Trash2, RotateCw } from "lucide-react";
import { formatCurrency, formatCzk, formatDate, PAYMENT_TYPES } from "@/lib/format";
import { CURRENCY_MAP } from "@/lib/currency-config";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import { InlineDate, InlineNumber } from "@/components/ui/inline-editors";
import { useUpdatePayment, type Payment } from "@/lib/api";
import { useAnalytics } from "@/hooks/use-analytics";
import type { RecurringInterval } from "@/lib/recurring";
import { RECURRING_INTERVAL_LABEL_KEYS, type RowMeta } from "./types";

// ===== Unified payment row (standalone + installment parent + installment child) =====
export const PaymentRow = memo(function PaymentRow({
  payment,
  meta,
  highlighted,
  rowId,
  projectId,
  projectCurrency = "CZK",
  onEdit,
  onDelete,
  updatePayment,
}: {
  payment: Payment;
  meta?: RowMeta;
  highlighted?: boolean;
  rowId?: string;
  projectId: string;
  // Project's default currency — used to format the converted amount
  // shown in parentheses when `payment.currency` is set (foreign).
  projectCurrency?: string;
  onEdit: () => void;
  onDelete: () => void;
  updatePayment?: ReturnType<typeof useUpdatePayment>;
}) {
  const [confirm, setConfirm] = useState(false);
  const { trackEvent } = useAnalytics(projectId);
  const t = useTranslations("tabs.payments");
  const tPaymentTypes = useTranslations("paymentTypes");
  const locale = useLocale() as Locale;
  const paymentTypeInfo = PAYMENT_TYPES.find((pt) => pt.value === payment.type);
  const paymentTypeEmoji = paymentTypeInfo?.emoji ?? "•";
  const paymentTypeLabelStr = tPaymentTypes(payment.type);
  const isParent = meta?.isInstallmentParent ?? false;
  const isChild = meta?.isInstallmentChild ?? false;
  const installmentNumber = meta?.installmentNumber ?? 0;
  const totalInstallments = meta?.totalInstallments ?? 0;
  const hasInstallment = isParent || isChild;

  // Multi-currency: when `payment.currency` is set (foreign currency),
  // the row displays the original amount in that currency followed by
  // the converted amount in the project's default currency in parens.
  //   Example:  "200 €"
  //             "(5 041 Kč)"
  // When currency is null/undefined, the payment is in the project's
  // default currency — we just show the amount formatted with the
  // project's currency symbol.
  const paymentCurrency = payment.currency ?? projectCurrency;
  const isForeignCurrency = !!payment.currency && payment.currency !== projectCurrency;
  // amountConverted falls back to `amount` if the server didn't compute
  // a conversion yet (e.g. rate was unavailable at save time).
  const convertedAmount = payment.amountConverted ?? payment.amount;
  // Suffix for the InlineNumber in the default-currency branch — uses
  // the project's currency symbol (e.g. " Kč" for CZK, " €" for EUR).
  const projectSymbol = CURRENCY_MAP[projectCurrency]?.symbol ?? projectCurrency;

  // Inline update helper — patches a single field without opening the edit dialog.
  const update = (field: keyof Payment, value: unknown) => {
    updatePayment?.mutate({ id: payment.id, data: { [field]: value } });
    trackEvent("edit_payment", { field, amount: payment.amount });
  };

  // Child rows use a gentle green tint (`bg-success/5`) to visually group
  // installment children with their parent — no vertical connector border.
  const childIndent = "";
  const rowBg = cn(
    isChild && "bg-success/5",
    highlighted && "bg-warning-soft/60 ring-2 ring-inset ring-warning/50",
  );

  return (
    <TableRow
      id={rowId}
      className={cn(
        "group cursor-pointer hover:bg-muted/30 cv-row",
        isChild && "bg-success/5",
        highlighted && "bg-warning-soft/60 ring-2 ring-inset ring-warning/50",
      )}
      onClick={() => onEdit()}
      title={t("row.aria.clickToEdit")}
      // Accessibility (A3): keyboard users can focus the row and press
      // Enter to open the edit dialog (same as a click). The aria-label
      // includes the payment description so screen-reader users hear
      // which row they're on before activating it.
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEdit();
        }
      }}
      aria-label={t("row.aria.editRow", {
        description: payment.description || payment.vendor || "",
      })}
    >
      <TableCell className={cn("w-16", childIndent, rowBg)}>
        {isParent ? (
          <Badge
            variant="outline"
            className="gap-0.5 type-label-sm text-warning-strong dark:text-warning/80"
            title={
              meta?.invoiceTotal != null
                ? t("row.installment.title", {
                    invoiceTotal: formatCzk(meta.invoiceTotal, locale),
                    paidTotal: formatCzk(meta.paidTotal, locale),
                    percent: meta.percent.toFixed(0),
                    remaining: formatCzk(meta.remaining, locale),
                  })
                : t("row.installment.fallbackTitle")
            }
          >
            <span className="tabular-nums">1 / {totalInstallments}</span>
          </Badge>
        ) : isChild ? (
          <span
            className="inline-flex items-center gap-0.5 type-label-sm text-on-surface-variant tabular-nums"
            title={t("row.installment.titleShort", { n: installmentNumber, total: totalInstallments })}
          >
            {t("row.installment.label", { n: installmentNumber })}
            <span className="text-on-surface-variant/70">/ {totalInstallments}</span>
          </span>
        ) : null}
      </TableCell>
      <TableCell className={cn("whitespace-nowrap", childIndent, rowBg)} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5">
          {hasInstallment && (
            <span
              className={cn(
                "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full type-label-sm font-bold",
                isParent
                  ? "bg-success-soft text-success-strong dark:bg-success-soft/40 dark:text-success/70"
                  : "bg-warning-soft text-warning-strong dark:bg-warning-soft/40 dark:text-warning/70",
              )}
            >
              {installmentNumber}
            </span>
          )}
          <InlineDate
            value={payment.date}
            onCommit={(v) => update("date", v)}
            ariaLabel={t("column.date")}
          />
        </div>
      </TableCell>
      <TableCell className={cn(childIndent, rowBg)}>
        <div className="flex flex-col">
          <span className="type-body font-medium">
            {payment.budgetItem?.subcategory || payment.budgetItem?.category}
          </span>
          <span className="type-label text-on-surface-variant">
            {payment.budgetItem?.category}
          </span>
        </div>
      </TableCell>
      <TableCell className={cn(childIndent, rowBg)}>
        <div className="flex flex-col">
          <span className="flex items-center gap-1.5 type-body">
            <span className="flex-1 truncate">
              {payment.description || (isParent ? t("row.firstInstallment") : "—")}
            </span>
            {payment.recurringInterval && (
              <Badge
                variant="outline"
                className="shrink-0 gap-0.5 type-label-sm text-info border-info/40 dark:border-info/40"
                title={
                  payment.recurringNextDate
                    ? t("dialog.recurring.nextDate", {
                        date: formatDate(payment.recurringNextDate, undefined, locale),
                      })
                    : t("dialog.recurring.badge")
                }
              >
                <RotateCw className="h-3 w-3" />
                <span className="hidden sm:inline">
                  {t(
                    RECURRING_INTERVAL_LABEL_KEYS[
                      payment.recurringInterval as RecurringInterval
                    ] as Parameters<typeof t>[0],
                  )}
                </span>
              </Badge>
            )}
          </span>
          {payment.vendor && (
            <span className="type-label text-on-surface-variant">
              {payment.vendor}
              {payment.invoiceNumber ? ` · ${payment.invoiceNumber}` : ""}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className={cn(childIndent, rowBg)} onClick={(e) => e.stopPropagation()}>
        <Select value={payment.type} onValueChange={(v) => update("type", v)}>
          <SelectTrigger className="h-7 w-auto border-0 px-1 type-label-sm shadow-none hover:bg-surface-container-high gap-1">
            <Badge variant="outline" className="type-label-sm">
              {paymentTypeEmoji} {paymentTypeLabelStr}
            </Badge>
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_TYPES.map((pt) => (
              <SelectItem key={pt.value} value={pt.value}>
                {pt.emoji} {tPaymentTypes(pt.value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className={cn("type-label text-on-surface-variant", childIndent, rowBg)}>
        {payment.contact?.name || "—"}
      </TableCell>
      <TableCell className={cn("text-right", childIndent, rowBg)} onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-end">
          {isForeignCurrency ? (
            // Foreign currency: original amount + converted amount in parens.
            //   "200 €"
            //   "(5 041 Kč)"
            // Inline editing is disabled for foreign-currency rows — the
            // amount + currency + date together determine the converted
            // value, so the user must open the edit dialog to change any
            // of these (the dialog recomputes the conversion on save).
            <>
              <span className="font-semibold text-warning tabular-nums">
                {formatCurrency(payment.amount, paymentCurrency, locale)}
              </span>
              <span className="type-label text-on-surface-variant tabular-nums">
                ({formatCurrency(convertedAmount, projectCurrency, locale)})
              </span>
            </>
          ) : (
            // Default currency: editable inline (same UX as before).
            <InlineNumber
              value={payment.amount}
              onCommit={(v) => update("amount", v)}
              suffix={` ${projectSymbol}`}
              className="font-semibold text-warning"
              ariaLabel={t("column.amount")}
            />
          )}
          {isParent && meta?.invoiceTotal != null && (
            <span className="type-label text-on-surface-variant tabular-nums">
              {t("row.ofInvoiceTotal", { invoiceTotal: formatCzk(meta.invoiceTotal, locale) })}
            </span>
          )}
          {payment.vatRate !== null && payment.vatRate !== undefined && (
            <span className="type-label text-on-surface-variant tabular-nums">
              {t("row.vatRateSuffix", { rate: payment.vatRate })}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className={cn(childIndent, rowBg)} onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> {t("row.menu.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirm(true)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> {t("row.menu.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={confirm} onOpenChange={setConfirm}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("row.delete.title")}</DialogTitle>
              <DialogDescription>
                {t.rich("row.delete.body", {
                  amount: formatCurrency(payment.amount, paymentCurrency, locale),
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirm(false)}>
                {t("row.delete.cancel")}
              </Button>
              <Button variant="destructive" onClick={() => { setConfirm(false); onDelete(); }}>
                {t("row.delete.confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
});
