"use client";

import { useTranslations, useLocale } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Receipt, RotateCw, Eye, Plus } from "lucide-react";
import { formatCzk, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import type { Payment } from "@/lib/api";

// ===== Invoices overview (compact cards above the table) =====
//
// Renders one Card per installment-parent invoice that still has a
// remaining balance (i.e. percent < 100). Cards show the invoice's
// totals (invoice / paid / remaining), a small progress bar, and
// quick actions: "Zobrazit" (scroll to the invoice's row in the
// table) and "Přidat splátku" (open the payment dialog pre-filled
// with the parent's data).
//
// Fully-paid invoices are hidden (cards list is filtered) — the section
// collapses to null when no invoices remain, so the table just renders
// without the overview above it.
export function InvoicesOverview({
  groups,
  onAddInstallment,
  onShow,
}: {
  groups: { parent: Payment; installments: Payment[] }[];
  onAddInstallment: (parent: Payment) => void;
  onShow: (parentId: string) => void;
}) {
  const t = useTranslations("tabs.payments");
  const locale = useLocale() as Locale;
  // Compute totals per group once — hide cards for invoices that are
  // already 100% paid (no remaining amount to track).
  const cards = groups
    .map((g) => {
      const invoiceTotal = g.parent.invoiceTotal ?? g.parent.amount;
      const paidTotal = g.parent.amount + g.installments.reduce((s, i) => s + i.amount, 0);
      const remaining = invoiceTotal - paidTotal;
      const percent = invoiceTotal > 0 ? (paidTotal / invoiceTotal) * 100 : 0;
      const installmentCount = 1 + g.installments.length;
      const title =
        g.parent.vendor ||
        g.parent.invoiceNumber ||
        g.parent.description ||
        g.parent.budgetItem?.subcategory ||
        g.parent.budgetItem?.category ||
        t("invoices.fallbackTitle");
      return {
        parent: g.parent,
        invoiceTotal,
        paidTotal,
        remaining,
        percent,
        installmentCount,
        title,
      };
    })
    .filter((c) => c.percent < 100);

  // If every invoice is fully paid, the overview section would just be noise — hide it entirely.
  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => {
        // MD3-style progress bar: green at 100%, amber when >50%, red when overpaid (>100%).
        const progressColor =
          c.percent >= 100
            ? "bg-success"
            : c.percent > 100
              ? "bg-danger"
              : c.percent > 50
                ? "bg-warning"
                : "bg-info";
        const remainingTone =
          c.remaining < 0
            ? "text-danger"
            : c.remaining === 0
              ? "text-success"
              : "text-on-surface-variant";
        return (
          <Card key={c.parent.id} className="gap-3 rounded-lg p-3 shadow-sm">
            <CardHeader className="gap-1 px-0 pb-0">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
                  <Receipt className="h-3.5 w-3.5 shrink-0 text-on-surface-variant" />
                  <span className="truncate">{c.title}</span>
                  {c.parent.recurringInterval && (
                    <span
                      className="inline-flex shrink-0 items-center text-info"
                      aria-label={t("dialog.recurring.badge")}
                      title={
                        c.parent.recurringNextDate
                          ? t("dialog.recurring.nextDate", {
                              date: formatDate(c.parent.recurringNextDate, undefined, locale),
                            })
                          : t("dialog.recurring.badge")
                      }
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </span>
                  )}
                </CardTitle>
                <Badge variant="outline" className="shrink-0 type-label-sm">
                  {t("invoices.badge.installmentCount", { count: c.installmentCount })}
                </Badge>
              </div>
              {c.parent.budgetItem && (
                <p className="type-label text-on-surface-variant">
                  {c.parent.budgetItem.category}
                  {c.parent.budgetItem.subcategory ? ` · ${c.parent.budgetItem.subcategory}` : ""}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-2 px-0 pb-0">
              {/* Amounts row */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="type-label text-on-surface-variant">{t("invoices.label.invoice")}</div>
                  <div className="type-body font-semibold tabular-nums">{formatCzk(c.invoiceTotal, locale)}</div>
                </div>
                <div>
                  <div className="type-label text-on-surface-variant">{t("invoices.label.paid")}</div>
                  <div className="type-body font-semibold tabular-nums text-success">{formatCzk(c.paidTotal, locale)}</div>
                </div>
                <div>
                  <div className="type-label text-on-surface-variant">{t("invoices.label.remaining")}</div>
                  <div className={cn("type-body font-semibold tabular-nums", remainingTone)}>
                    {formatCzk(c.remaining, locale)}
                  </div>
                </div>
              </div>
              {/* MD3 progress bar */}
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
                <div
                  className={cn("h-full transition-all", progressColor)}
                  style={{ width: `${Math.min(100, c.percent)}%` }}
                />
              </div>
              <div className="flex items-center justify-between type-label text-on-surface-variant">
                <span className="tabular-nums">{t("invoices.label.percent", { percent: c.percent.toFixed(0) })}</span>
                {c.parent.invoiceNumber && (
                  <span className="truncate">{t("invoices.label.invoiceNumber", { number: c.parent.invoiceNumber })}</span>
                )}
              </div>
              {/* Actions */}
              <div className="flex items-center gap-1.5 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 flex-1"
                  onClick={() => onShow(c.parent.id)}
                  title={t("invoices.button.showTitle")}
                >
                  <Eye className="mr-1 h-3.5 w-3.5" /> {t("invoices.button.show")}
                </Button>
                <Button
                  size="sm"
                  className="h-7 flex-1"
                  onClick={() => onAddInstallment(c.parent)}
                  title={t("invoices.button.addInstallmentTitle")}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> {t("invoices.button.addInstallment")}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
