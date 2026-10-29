"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddDialogShell } from "@/components/ui/add-dialog-shell";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Layers,
  CircleDollarSign,
  AlertTriangle,
  ChevronRight,
  RotateCw,
  Plus,
} from "lucide-react";
import { formatCzk, formatDate, PAYMENT_TYPES } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Locale } from "@/i18n/config";
import { CurrencySelect } from "@/components/ui/currency-select";
import { CurrencyConversionPreview } from "@/components/ui/currency-conversion-preview";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useLastValue } from "@/hooks/use-last-value";
import { useAnalytics } from "@/hooks/use-analytics";
import {
  RECURRING_INTERVALS,
  type RecurringInterval,
  computeNextRecurringDate,
} from "@/lib/recurring";
import {
  useCreatePayment,
  useUpdatePayment,
  useUpdateBudgetItem,
  type Payment,
} from "@/lib/api";
import {
  RECURRING_INTERVAL_LABEL_KEYS,
  type PaymentDialogProps,
} from "./types";

// Convert ISO date string to yyyy-mm-dd for <input type="date">
function toDateStr(d: string | null | undefined): string {
  if (!d) return "";
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "";
    return dt.toISOString().substring(0, 10);
  } catch {
    return "";
  }
}

// Wrapper component: handles Dialog open state and remounts inner form via `key`
// whenever payment changes — ensures fresh state via useState initializers.
//
// B20 fix: key includes `${open}` so transitioning edit→create (or any
// open→close→open cycle) forces a fresh mount — `useState(payment?.…)` then
// re-initializes from the new `payment` (or `undefined` for create flow).
// Previously, both Edit (with `payment=null` after Cancel) and Create had
// the same key "new", so React could in some reconciliations preserve
// stale state from the previous session.
export function PaymentDialog(props: PaymentDialogProps) {
  const { open, payment, prefillParent } = props;
  if (!open) return null;
  return (
    <PaymentDialogInner
      key={`${payment?.id ?? "new"}-${!!prefillParent}-${open}`}
      {...props}
    />
  );
}

function PaymentDialogInner({
  open,
  onOpenChange,
  projectId,
  projectCurrency = "CZK",
  budgetItems,
  contacts,
  payments,
  createPayment,
  updatePayment,
  updateBudgetItem,
  payment,
  onClose,
  prefillParent,
  onAddInstallmentToExisting,
}: PaymentDialogProps) {
  const isEdit = !!payment;
  const isAddingInstallment = !!prefillParent && !isEdit;
  const { trackEvent } = useAnalytics(projectId);
  const t = useTranslations("tabs.payments");
  const tPaymentTypes = useTranslations("paymentTypes");
  const locale = useLocale() as Locale;
  const isInstallment = !!payment?.installmentOf;
  const today = new Date().toISOString().substring(0, 10);

  // Smart defaults: remember last used values per project (only for create flow)
  const [lastType, setLastType] = useLastValue("paymentType", "receipt", projectId);
  const [lastContactId, setLastContactId] = useLastValue("contactId", "", projectId);
  const [lastVendor, setLastVendor] = useLastValue("vendor", "", projectId);

  const [budgetItemId, setBudgetItemId] = useState(
    payment?.budgetItemId ?? prefillParent?.budgetItemId ?? "",
  );
  const [contactId, setContactId] = useState(
    // Default: NO contact for new payments (user explicitly asked for this).
    // When editing existing payment, keep its contactId. When prefilling
    // from a parent invoice, use the parent's contactId. Otherwise empty.
    payment?.contactId ?? prefillParent?.contactId ?? "",
  );
  const [amount, setAmount] = useState(payment ? String(payment.amount ?? "") : "");
  // Multi-currency: when editing a payment that has `currency` set (foreign
  // currency), pre-fill the selector with that currency. For new payments
  // (or payments without `currency`), default to the project's currency.
  const [currency, setCurrency] = useState<string>(
    payment?.currency ?? projectCurrency,
  );
  const [date, setDate] = useState(toDateStr(payment?.date) || today);
  const [type, setType] = useState(payment?.type ?? prefillParent?.type ?? lastType);
  const [vendor, setVendor] = useState(
    // Default: empty for new payments (no pre-filled vendor).
    payment?.vendor ?? prefillParent?.vendor ?? "",
  );
  const [invoiceNumber, setInvoiceNumber] = useState(
    payment?.invoiceNumber ?? prefillParent?.invoiceNumber ?? "",
  );
  const [description, setDescription] = useState(
    payment?.description ?? "",
  );
  const [vatRate, setVatRate] = useState(
    payment?.vatRate !== null && payment?.vatRate !== undefined ? String(payment.vatRate) : "",
  );
  // Installment mode (create-only)
  const [isInvoice, setIsInvoice] = useState(false);
  const [invoiceTotal, setInvoiceTotal] = useState("");
  const [markCompleted, setMarkCompleted] = useState(false);

  // Recurring interval ("none" | "weekly" | "monthly" | "quarterly" | "yearly").
  // When set (not "none"), the payment becomes a recurring template — the
  // cron job will auto-clone it on each `recurringNextDate`.
  // Edit-mode payments that already have a recurringInterval keep their value.
  const [recurringInterval, setRecurringInterval] = useState<string>(
    payment?.recurringInterval ?? "none",
  );

  // Fetch exchange rates for the payment date — used to compute the live
  // conversion preview ("200 € → 5 041 Kč (kurz 25.21)") shown below the
  // amount field when a foreign currency is selected.
  const { data: exchangeRates, isLoading: ratesLoading } = useExchangeRates(date);

  // U22: In edit mode, allow linking this payment to an existing
  // invoice-parent as an installment. `installmentParentId` is "" when
  // the payment is standalone, otherwise it's the parent payment's id.
  const [installmentParentId, setInstallmentParentId] = useState<string>(
    payment?.installmentOf ?? "",
  );

  // "Convert parent → regular payment" confirmation dialog (edit-mode only).
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [isConverting, setIsConverting] = useState(false);

  // Inline validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isPending = isEdit
    ? (updatePayment?.isPending ?? false) || isConverting
    : createPayment.isPending;

  function resetForm() {
    setBudgetItemId("");
    setContactId("");
    setAmount("");
    setCurrency(projectCurrency);
    setVendor("");
    setInvoiceNumber("");
    setDescription("");
    setType("receipt");
    setIsInvoice(false);
    setInvoiceTotal("");
    setVatRate("");
    setMarkCompleted(false);
    setInstallmentParentId("");
    setRecurringInterval("none");
  }

  // U22: Parent candidates = installment-parent payments (invoiceTotal != null)
  // in the project, excluding the currently edited payment (cannot be its
  // own parent) and excluding payments that already have children pointing
  // to them (those are themselves parents and shouldn't be re-linked).
  // Also excludes payments that are themselves children (installmentOf set).
  const parentCandidates = useMemo(() => {
    if (!isEdit || !payment) return [];
    const hasChildren = (payments ?? []).some(
      (p) => p.installmentOf === payment.id,
    );
    // Don't show the Select if this payment is itself a parent (has
    // invoiceTotal OR has children) — turning a parent into a child would
    // orphan its existing children.
    if (payment.invoiceTotal != null || hasChildren) return [];
    return (payments ?? []).filter(
      (p) =>
        p.id !== payment.id &&
        p.installmentOf == null &&
        p.invoiceTotal != null,
    );
  }, [payments, payment, isEdit]);

  // Existing invoice for the selected budget item (create-mode only).
  // Used to show the info badge "Tato položka už má fakturu: …" + the
  // "Přidat splátku k této faktuře" action.
  const existingInvoiceForBudgetItem = useMemo(() => {
    if (isEdit || isAddingInstallment || !budgetItemId) return null;
    return (payments ?? []).find(
      (p) =>
        p.budgetItemId === budgetItemId &&
        p.invoiceTotal != null &&
        p.installmentOf == null,
    ) ?? null;
  }, [payments, budgetItemId, isEdit, isAddingInstallment]);

  // Children of the edited payment (for the "convert to regular payment" flow).
  const childPayments = useMemo(() => {
    if (!isEdit || !payment) return [];
    return (payments ?? []).filter((p) => p.installmentOf === payment.id);
  }, [payments, payment, isEdit]);

  // Handle "Convert parent → regular payment" — PATCH parent with
  // invoiceTotal: null and PATCH each child with installmentOf: null.
  const handleConvertToRegular = async () => {
    if (!payment || !updatePayment) return;
    setIsConverting(true);
    try {
      // 1. Convert parent: clear invoiceTotal.
      await updatePayment.mutateAsync({
        id: payment.id,
        data: { invoiceTotal: null },
      });
      // 2. Detach all children.
      for (const c of childPayments) {
        await updatePayment.mutateAsync({
          id: c.id,
          data: { installmentOf: null },
        });
      }
      toast.success(
        childPayments.length > 0
          ? t("toasts.convertSuccessWithChildren", { count: childPayments.length })
          : t("toasts.convertSuccess"),
      );
      setShowConvertConfirm(false);
      onOpenChange(false);
      onClose?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.convertError"));
    } finally {
      setIsConverting(false);
    }
  };

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    if (!budgetItemId) newErrors.budgetItemId = t("dialog.error.budgetItem");
    if (isInvoice && (!invoiceTotal || isNaN(Number(invoiceTotal.replace(",", "."))))) {
      newErrors.invoiceTotal = t("dialog.error.invoiceTotal");
    }
    if (!isInvoice && (!amount || isNaN(Number(amount.replace(",", "."))))) {
      newErrors.amount = t("dialog.error.amount");
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const amt = Number(amount.replace(",", "."));

    try {
      if (isEdit && payment && updatePayment) {
        const payload: Partial<Payment> = {
          budgetItemId,
          contactId: contactId || null,
          amount: amt,
          // Multi-currency: send `currency` so the server can recompute the
          // converted amount. The server treats `currency === projectCurrency`
          // as "no foreign currency" (stores NULL in the DB column).
          currency: currency || null,
          date,
          type,
          vendor: vendor || null,
          invoiceNumber: invoiceNumber || null,
          description: description || null,
          vatRate: vatRate || null,
          // Recurring: always send `recurringInterval` on submit — the
          // server normalizes "none" / null to NULL (disable recurrence).
          // When the user picks a non-"none" interval, the server
          // recomputes `recurringNextDate` from `date + interval`.
          recurringInterval: recurringInterval === "none" ? null : recurringInterval,
          // Preserve invoiceTotal if this is an installment parent
          ...(payment.invoiceTotal != null ? { invoiceTotal: payment.invoiceTotal } : {}),
        };
        // U22: Only include `installmentOf` when the parent-candidate Select
        // is shown (i.e., this payment is a "leaf" that can be linked to a
        // parent). Send null to detach from current parent, or the parent id
        // to (re-)link. When the Select isn't shown, leave the field
        // untouched by simply not including it in the payload.
        if (parentCandidates.length > 0 || isInstallment) {
          payload.installmentOf = installmentParentId || null;
        }
        await updatePayment.mutateAsync({ id: payment.id, data: payload });
        if (markCompleted) {
          try {
            await updateBudgetItem.mutateAsync({ id: budgetItemId, data: { completed: true } });
            toast.success(t("toasts.updateSuccessWithItem"));
          } catch {
            toast.success(t("toasts.updateSuccessItemFail"));
          }
        } else {
          toast.success(t("toasts.updateSuccess"));
        }
        onOpenChange(false);
        onClose?.();
        return;
      }

      // Create flow
      if (isInvoice) {
        const inv = Number(invoiceTotal.replace(",", "."));
        // Create ONE payment that IS the first installment + has invoiceTotal
        // Additional installments can be added later with installmentOf = this payment
        await createPayment.mutateAsync({
          budgetItemId,
          contactId: contactId || null,
          amount: amt, // first installment amount (not 0!)
          currency: currency || null,
          invoiceTotal: inv, // full invoice amount
          installmentOf: null, // this IS the parent
          vatRate: vatRate || null,
          date,
          type,
          vendor,
          invoiceNumber,
          description: description || t("row.firstInstallment"),
          recurringInterval: recurringInterval === "none" ? null : recurringInterval,
        });
        trackEvent("add_payment", { amount: amt, type, invoice: true });
        if (markCompleted) {
          try {
            await updateBudgetItem.mutateAsync({ id: budgetItemId, data: { completed: true } });
            toast.success(t("toasts.invoiceCreateSuccessWithItem"));
          } catch {
            toast.success(t("toasts.invoiceCreateSuccessItemFail"));
          }
        } else {
          toast.success(t("toasts.invoiceCreateSuccess"));
        }
      } else {
        await createPayment.mutateAsync({
          budgetItemId,
          contactId: contactId || null,
          amount: amt,
          currency: currency || null,
          vatRate: vatRate || null,
          date,
          type,
          vendor,
          invoiceNumber,
          description,
          // Add-installment flow: link to parent.
          ...(isAddingInstallment && prefillParent
            ? { installmentOf: prefillParent.id }
            : {}),
          recurringInterval: recurringInterval === "none" ? null : recurringInterval,
        });
        trackEvent("add_payment", {
          amount: amt,
          type,
          invoice: false,
          installment: isAddingInstallment,
        });
        if (isAddingInstallment) {
          toast.success(t("toasts.installmentAdded"));
        } else if (markCompleted) {
          try {
            await updateBudgetItem.mutateAsync({ id: budgetItemId, data: { completed: true } });
            toast.success(t("toasts.paymentCreateSuccessWithItem"));
          } catch {
            toast.success(t("toasts.paymentCreateSuccessItemFail"));
          }
        } else {
          toast.success(t("toasts.paymentCreateSuccess"));
        }
      }
      // Save smart defaults (only on create — edit flow returns earlier above)
      setLastType(type);
      setLastContactId(contactId);
      setLastVendor(vendor);
      setErrors({});
      resetForm();
      onOpenChange(false);
      onClose?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (isEdit ? t("toasts.updateError") : t("toasts.createError")));
    }
  };

  // Selected budget item to show "already completed" hint next to checkbox
  const selectedBudgetItem = budgetItems.find((b) => b.id === budgetItemId);
  const alreadyCompleted = selectedBudgetItem?.completed === true;

  const submitLabel = isEdit
    ? isInstallment
      ? t("dialog.submitLabel.edit.installment")
      : t("dialog.submitLabel.edit.payment")
    : isAddingInstallment
      ? t("dialog.submitLabel.create.installment")
      : isInvoice
        ? t("dialog.submitLabel.create.invoice")
        : t("dialog.submitLabel.create.payment");

  return (
    <AddDialogShell
      open={open}
      onOpenChange={onOpenChange}
      titleValue={description}
      onTitleChange={setDescription}
      titlePlaceholder={t("dialog.titlePlaceholder")}
      submitLabel={submitLabel}
      onSubmit={handleSubmit}
      isSubmitting={isPending}
      maxWidth="max-w-3xl"
    >
      {/* ===== ZÁKLAD ===== */}
      <div className="space-y-2">
        <Label htmlFor="budgetItem">{t("dialog.label.budgetItem")}</Label>
        <SearchableSelect
          id="budgetItem"
          options={budgetItems.map((b) => {
            // For child items (tasks), show the parent item's name as hint
            // so the user can distinguish which parent a task belongs to.
            const parent = b.parentId
              ? budgetItems.find((p) => p.id === b.parentId)
              : null;
            const label = `${b.category}${b.subcategory ? ` / ${b.subcategory}` : ""}${b.completed ? " ✓" : ""}`;
            return {
              value: b.id,
              label,
              hint: parent
                ? `${parent.subcategory || parent.category} › ${b.subcategory || b.category}`
                : b.category,
            };
          })}
          value={budgetItemId}
          onChange={(v) => {
            setBudgetItemId(v);
            if (errors.budgetItemId)
              setErrors((prev) => {
                const n = { ...prev };
                delete n.budgetItemId;
                return n;
              });
          }}
          placeholder={t("dialog.placeholder.budgetItem")}
          searchPlaceholder={t("dialog.search.budgetItem")}
          emptyText={t("dialog.empty.budgetItem")}
          className={cn(errors.budgetItemId && "border-destructive")}
        />
        {errors.budgetItemId && (
          <p className="type-label text-destructive mt-1">{errors.budgetItemId}</p>
        )}
      </div>

      {/* "Add installment" prefill banner — shown when the dialog was opened
          via "Přidat splátku" from an invoice card or the in-dialog action.
          Tells the user that this new payment will be added as a new
          installment of the parent invoice. */}
      {isAddingInstallment && prefillParent && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning-soft/40 p-2.5 dark:border-warning-strong/40 dark:bg-warning-soft/30">
          <Layers className="h-4 w-4 shrink-0 text-warning-strong dark:text-warning" />
          <div className="flex-1 type-label leading-tight">
            <div className="font-semibold text-warning-strong dark:text-warning">
              {t("dialog.prefill.title")}
            </div>
            <div className="text-on-surface-variant">
              {t("dialog.prefill.subtitle", {
                vendor: prefillParent.vendor || prefillParent.invoiceNumber || t("dialog.prefill.fallback"),
                amount: prefillParent.invoiceTotal != null ? formatCzk(prefillParent.invoiceTotal, locale) : "",
              })}
            </div>
          </div>
        </div>
      )}

      {/* Existing-invoice info badge — when user picks a budget item that
          already has an installment-parent invoice, offer to add a new
          installment to that invoice instead of creating a new payment. */}
      {existingInvoiceForBudgetItem && !isAddingInstallment && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-info/30 bg-info-soft/40 p-2.5 dark:border-info/40 dark:bg-info-soft/20">
          <CircleDollarSign className="h-4 w-4 shrink-0 text-info" />
          <div className="flex-1 type-label leading-tight">
            <div className="font-medium">
              {t("dialog.existingInvoice.title", {
                vendor:
                  existingInvoiceForBudgetItem.vendor ||
                  existingInvoiceForBudgetItem.invoiceNumber ||
                  t("dialog.existingInvoice.fallback"),
              })}
            </div>
            {(() => {
              const inv = existingInvoiceForBudgetItem.invoiceTotal ?? existingInvoiceForBudgetItem.amount;
              const children = (payments ?? []).filter(
                (p) => p.installmentOf === existingInvoiceForBudgetItem.id,
              );
              const paid =
                existingInvoiceForBudgetItem.amount +
                children.reduce((s, c) => s + c.amount, 0);
              const percent = inv > 0 ? (paid / inv) * 100 : 0;
              return (
                <div className="text-on-surface-variant tabular-nums">
                  {t("dialog.existingInvoice.subtitle", {
                    paid: formatCzk(paid, locale),
                    invoiceTotal: formatCzk(inv, locale),
                    percent: percent.toFixed(0),
                  })}
                </div>
              );
            })()}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => {
              if (onAddInstallmentToExisting) {
                onAddInstallmentToExisting(existingInvoiceForBudgetItem);
              }
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> {t("dialog.existingInvoice.button")}
          </Button>
        </div>
      )}

      {/* "Convert parent → regular payment" action (edit mode only, when this
          payment is an installment-parent with invoiceTotal set). */}
      {isEdit && payment?.invoiceTotal != null && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/30 bg-warning-soft/50 p-2.5 dark:border-warning-strong/60 dark:bg-warning-soft/40">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning-strong dark:text-warning" />
            <div className="flex-1 type-label leading-tight">
              <div className="font-medium text-warning-strong dark:text-warning">
                {t("dialog.parentWarning.title")}
              </div>
              <div className="text-on-surface-variant">
                {t("dialog.parentWarning.body", {
                  invoiceTotal: formatCzk(payment.invoiceTotal, locale),
                })}
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 border-danger/40 text-danger hover:bg-danger-soft/60 dark:border-danger/40 dark:text-danger"
              onClick={() => setShowConvertConfirm(true)}
              disabled={isConverting}
            >
              <ChevronRight className="mr-1 h-3.5 w-3.5" /> {t("dialog.parentWarning.button")}
            </Button>
          </div>
          <Dialog open={showConvertConfirm} onOpenChange={setShowConvertConfirm}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-danger" />
                  {t("dialog.convertDialog.title")}
                </DialogTitle>
                <DialogDescription>
                  {t("dialog.convertDialog.body", { count: childPayments.length })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowConvertConfirm(false)}
                  disabled={isConverting}
                >
                  {t("dialog.convertDialog.cancel")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConvertToRegular}
                  disabled={isConverting}
                >
                  {isConverting ? t("dialog.convertDialog.confirming") : t("dialog.convertDialog.confirm")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Amount / Invoice total / 1st installment + Date */}
      {isInvoice && !isEdit ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="invoiceTotal">{t("dialog.label.invoiceTotal")}</Label>
            <Input
              id="invoiceTotal"
              value={invoiceTotal}
              onChange={(e) => {
                setInvoiceTotal(e.target.value);
                if (errors.invoiceTotal)
                  setErrors((prev) => {
                    const n = { ...prev };
                    delete n.invoiceTotal;
                    return n;
                  });
              }}
              placeholder={t("dialog.placeholder.invoiceTotal")}
              inputMode="decimal"
              className={cn(errors.invoiceTotal && "border-destructive")}
            />
            {errors.invoiceTotal && (
              <p className="type-label text-destructive mt-1">{errors.invoiceTotal}</p>
            )}
            <CurrencyConversionPreview
              amountStr={invoiceTotal}
              fromCurrency={currency}
              toCurrency={projectCurrency}
              rates={exchangeRates}
              isLoading={ratesLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">{t("dialog.label.firstInstallment")}</Label>
            <div className="flex gap-2">
              <Input
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t("dialog.placeholder.firstInstallment")}
                inputMode="decimal"
                className="flex-1"
              />
              <CurrencySelect
                id="amount-currency"
                value={currency}
                onChange={setCurrency}
                defaultCurrency={projectCurrency}
                className="w-32 shrink-0"
              />
            </div>
            <CurrencyConversionPreview
              amountStr={amount}
              fromCurrency={currency}
              toCurrency={projectCurrency}
              rates={exchangeRates}
              isLoading={ratesLoading}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="amount">{t("dialog.label.amount")}</Label>
            <div className="flex gap-2">
              <Input
                id="amount"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (errors.amount)
                    setErrors((prev) => {
                      const n = { ...prev };
                      delete n.amount;
                      return n;
                    });
                }}
                placeholder={t("dialog.placeholder.amount")}
                inputMode="decimal"
                className={cn("flex-1", errors.amount && "border-destructive")}
              />
              <CurrencySelect
                id="amount-currency"
                value={currency}
                onChange={setCurrency}
                defaultCurrency={projectCurrency}
                className="w-32 shrink-0"
              />
            </div>
            {errors.amount && (
              <p className="type-label text-destructive mt-1">{errors.amount}</p>
            )}
            <CurrencyConversionPreview
              amountStr={amount}
              fromCurrency={currency}
              toCurrency={projectCurrency}
              rates={exchangeRates}
              isLoading={ratesLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">{t("dialog.label.date")}</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
      )}

      {isInvoice && !isEdit && (
        <div className="space-y-2">
          <Label htmlFor="date">{t("dialog.label.invoiceDate")}</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      )}

      {/* Type */}
      <div className="space-y-2">
        <Label htmlFor="type">{t("dialog.label.type")}</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger id="type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_TYPES.map((pt) => (
              <SelectItem key={pt.value} value={pt.value}>
                {pt.emoji} {tPaymentTypes(pt.value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ===== DETAILS (optional) ===== */}
      <CollapsibleSection title={t("dialog.section.details")}>
        {/* Installment toggle - only in create mode (not editing existing
            payments) and not when prefilling an installment (that flow
            doesn't allow creating a NEW invoice — it links to an existing one). */}
        {!isEdit && !isAddingInstallment && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
            <Checkbox
              id="isInvoice"
              checked={isInvoice}
              onCheckedChange={(v) => setIsInvoice(v === true)}
            />
            <Label htmlFor="isInvoice" className="cursor-pointer type-label">
              <CircleDollarSign className="mr-1 inline h-3.5 w-3.5" />
              {t("dialog.isInvoice.label")}
            </Label>
          </div>
        )}

        {/* U22: Připojit k faktuře — Select shown only in edit mode when
            this payment is a "leaf" (no invoiceTotal, no children).
            Lets the user link this payment to an existing installment-parent
            invoice as an additional installment (or detach it). */}
        {isEdit && (parentCandidates.length > 0 || isInstallment) && (
          <div className="space-y-2">
            <Label htmlFor="installmentOf">
              <CircleDollarSign className="mr-1 inline h-3.5 w-3.5" />
              {t("dialog.installmentOf.label")}
            </Label>
            <Select
              value={installmentParentId || "none"}
              onValueChange={(v) => setInstallmentParentId(v === "none" ? "" : v)}
            >
              <SelectTrigger id="installmentOf">
                <SelectValue placeholder={t("dialog.installmentOf.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {t("dialog.installmentOf.noneLabel")}
                </SelectItem>
                {parentCandidates.map((p) => {
                  const label = [
                    p.vendor,
                    p.invoiceNumber,
                    p.description,
                    formatCzk(p.invoiceTotal ?? p.amount, locale),
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <SelectItem key={p.id} value={p.id}>
                      {label || t("invoices.fallbackTitle")}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="type-label text-muted-foreground">
              {t("dialog.installmentOf.hint")}
            </p>
          </div>
        )}

        {/* Contact (optional) */}
        <div className="space-y-2">
          <Label htmlFor="contact">{t("dialog.label.contact")}</Label>
          <SearchableSelect
            id="contact"
            options={contacts.map((c) => ({
              value: c.id,
              label: c.name,
              hint: `${c.type}${c.role ? ` · ${c.role}` : ""}${c.company ? ` · ${c.company}` : ""}`,
            }))}
            value={contactId}
            onChange={setContactId}
            placeholder={t("dialog.placeholder.contact")}
            searchPlaceholder={t("dialog.search.contact")}
            emptyText={t("dialog.empty.contact")}
          />
        </div>

        {/* Vendor / Store + Invoice/Receipt no. */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="vendor">{t("dialog.label.vendor")}</Label>
            <Input
              id="vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder={t("dialog.placeholder.vendor")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invoiceNumber">{t("dialog.label.invoiceNumber")}</Label>
            <Input
              id="invoiceNumber"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder={t("dialog.placeholder.invoiceNumber")}
            />
          </div>
        </div>

        {/* VAT field - shown for non-invoice (standalone or edit) payments */}
        {(!isInvoice || isEdit) && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="vatRate">{t("dialog.label.vatRate")}</Label>
              <Select value={vatRate || "none"} onValueChange={(v) => setVatRate(v === "none" ? "" : v)}>
                <SelectTrigger id="vatRate">
                  <SelectValue placeholder={t("dialog.vatRate.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("dialog.vatRate.none")}</SelectItem>
                  <SelectItem value="21">{t("dialog.vatRate.21")}</SelectItem>
                  <SelectItem value="12">{t("dialog.vatRate.12")}</SelectItem>
                  <SelectItem value="10">{t("dialog.vatRate.10")}</SelectItem>
                  <SelectItem value="0">{t("dialog.vatRate.0")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("dialog.label.vatCalculation")}</Label>
              <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 type-label text-muted-foreground">
                {vatRate && amount ? (
                  <>
                    {t("dialog.vatCalc.label.vat")}{" "}
                    <strong className="ml-1 text-foreground tabular-nums">
                      {formatCzk(
                        (Number(amount.replace(",", ".")) * Number(vatRate)) /
                          (100 + Number(vatRate)),
                        locale,
                      )}
                    </strong>
                    <span className="ml-2">
                      ({t("dialog.vatCalc.label.base")}{" "}
                      {formatCzk(
                        (Number(amount.replace(",", ".")) * 100) /
                          (100 + Number(vatRate)),
                        locale,
                      )}
                      )
                    </span>
                  </>
                ) : (
                  <span>{t("dialog.vatCalc.empty")}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== Recurring section =====
            Lets the user mark this payment as a "recurring template".
            The cron job (process-recurring-payments) will auto-clone this
            template on each `recurringNextDate`. The "nextDate" hint shows
            when the next auto-clone will fire (computed locally from
            `date + interval` — matches the server-side computation in
            src/lib/recurring.ts). */}
        <div className="space-y-2">
          <Label htmlFor="recurringInterval" className="flex items-center gap-1.5">
            <RotateCw className="h-3.5 w-3.5 text-info" />
            {t("dialog.label.recurring")}
          </Label>
          <Select
            value={recurringInterval}
            onValueChange={(v) => setRecurringInterval(v)}
          >
            <SelectTrigger id="recurringInterval">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                {t("dialog.recurring.none")}
              </SelectItem>
              {RECURRING_INTERVALS.map((interval) => (
                <SelectItem key={interval} value={interval}>
                  {t(
                    RECURRING_INTERVAL_LABEL_KEYS[interval] as Parameters<typeof t>[0],
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {recurringInterval !== "none" && (
            <p className="type-label text-muted-foreground tabular-nums">
              {(() => {
                // Compute the next recurring date locally for the live
                // preview. The server re-computes on save using the same
                // helper (`computeNextRecurringDate`), so the displayed
                // date matches what's stored.
                const anchor = date ? new Date(date) : new Date();
                if (isNaN(anchor.getTime())) return null;
                const next = computeNextRecurringDate(
                  anchor,
                  recurringInterval as RecurringInterval,
                );
                return t("dialog.recurring.nextDate", {
                  date: formatDate(next, undefined, locale),
                });
              })()}
            </p>
          )}
        </div>

        {/* Mark-completed checkbox - links payment to budget item completion */}
        <div className="flex flex-col gap-1 rounded-md border border-success/30 bg-success-soft/50 p-3 dark:border-success-strong/60 dark:bg-success-soft/40">
          <div className="flex items-start gap-2">
            <Checkbox
              id="markCompleted"
              checked={markCompleted}
              onCheckedChange={(v) => setMarkCompleted(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="markCompleted" className="cursor-pointer type-body font-medium leading-tight">
              {t("dialog.markCompleted.label")}
            </Label>
          </div>
          {alreadyCompleted && (
            <p className="ml-6 type-label text-muted-foreground">
              {t("dialog.markCompleted.alreadyCompleted")}
            </p>
          )}
        </div>
      </CollapsibleSection>
    </AddDialogShell>
  );
}
