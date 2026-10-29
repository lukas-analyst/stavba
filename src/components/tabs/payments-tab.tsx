"use client";

import { useState, useMemo, useEffect, type ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  usePayments,
  useBudgetItems,
  useContacts,
  useCreatePayment,
  useUpdatePayment,
  useDeletePayment,
  useUpdateBudgetItem,
  useProjects,
  type Payment,
} from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabSkeleton } from "@/components/ui/tab-skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  Receipt,
  ArrowUpDown,
} from "lucide-react";
import { formatCzk, PAYMENT_TYPES, toBcp47 } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { toast } from "sonner";
import { EmptyStateBox } from "@/components/empty-state-box";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAnalytics } from "@/hooks/use-analytics";
// Extracted sub-components — see ./payments/ folder.
import { PaymentRow } from "./payments/payment-row";
import { AddInstallmentRow } from "./payments/add-installment-row";
import { InvoicesOverview } from "./payments/invoices-overview";
import { PaymentDialog } from "./payments/payment-dialog";
import {
  SORT_KEYS,
  SORT_LABEL_KEYS,
  type SortKey,
} from "./payments/types";

// ===== Sorting =====
// `sortPayments` is kept here in the main tab file (per task spec:
// "Keep in payments-tab.tsx: PaymentsTab, imports, state, sort functions,
// main render.") and consumed both by PaymentsTab's table-windowing
// pass and the renderBlocks sort.

function sortPayments(a: Payment, b: Payment, key: SortKey, locale: Locale): number {
  const tieBreak = () => new Date(b.date).getTime() - new Date(a.date).getTime();
  const loc = toBcp47(locale);
  switch (key) {
    case "date-asc":
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    case "amount-desc":
      return b.amount - a.amount;
    case "amount-asc":
      return a.amount - b.amount;
    case "type": {
      const cmp = a.type.localeCompare(b.type, loc);
      return cmp !== 0 ? cmp : tieBreak();
    }
    case "contact": {
      const ac = a.contact?.name ?? "~~~"; // nulls last
      const bc = b.contact?.name ?? "~~~";
      const cmp = ac.localeCompare(bc, loc);
      return cmp !== 0 ? cmp : tieBreak();
    }
    case "vendor": {
      const av = a.vendor ?? "~~~";
      const bv = b.vendor ?? "~~~";
      const cmp = av.localeCompare(bv, loc);
      return cmp !== 0 ? cmp : tieBreak();
    }
    case "date-desc":
    default:
      return new Date(b.date).getTime() - new Date(a.date).getTime();
  }
}

export function PaymentsTab({ projectId }: { projectId: string }) {
  const { data: payments, isLoading } = usePayments(projectId);
  const { data: budgetItems } = useBudgetItems(projectId);
  const { data: contacts } = useContacts(projectId);
  const { data: projects } = useProjects();
  const project = projects?.find((p) => p.id === projectId);
  // Resolve the project's default currency — used to label the CurrencySelect
  // ("(default)" badge) and to compute the live conversion preview in the
  // payment dialog. Falls back to CZK when the project isn't loaded yet
  // (the dialog won't be openable during that brief loading window anyway).
  const projectCurrency = project?.currency ?? "CZK";
  const createPayment = useCreatePayment(projectId);
  const updatePayment = useUpdatePayment(projectId);
  const deletePayment = useDeletePayment(projectId);
  const updateBudgetItem = useUpdateBudgetItem(projectId);
  const { trackEvent } = useAnalytics(projectId);
  const t = useTranslations("tabs.payments");
  const tPaymentTypes = useTranslations("paymentTypes");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const [addOpen, setAddOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [search, setSearch] = useState("");
  // Debounce search so filter only re-runs 250ms after typing stops
  const debouncedSearch = useDebouncedValue(search, 250);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("date-desc");

  // Windowing: only render the first `renderLimit` "render blocks" (standalone
  // payments + installment groups) in the table DOM. For large projects this
  // avoids rendering 100+ rows up-front; the user clicks "Show N more" to
  // progressively expand the visible window. Reset whenever filters / sort /
  // search change so the user always sees the top of the freshly-filtered set.
  //
  // The "adjust state during render" pattern (per React docs:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // is used instead of `useEffect` to avoid the cascading-render smell that
  // trips the `react-hooks/set-state-in-effect` lint rule.
  const filterKey = `${debouncedSearch}__${typeFilter}__${sortBy}`;
  const [renderLimit, setRenderLimit] = useState(50);
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setRenderLimit(50);
  }

  // "Přidat splátku" flow: when user clicks the button on an invoice card or
  // the in-dialog "Přidat splátku k této faktuře" action, we open PaymentDialog
  // in create mode with this parent's fields pre-filled and `installmentOf`
  // forced to the parent's id.
  const [installmentPrefillParent, setInstallmentPrefillParent] = useState<Payment | null>(null);

  // "Zobrazit" highlight: when user clicks "Zobrazit" on an invoice card, we
  // highlight all rows belonging to that invoice in the table and scroll to
  // the parent row.
  const [highlightInvoiceId, setHighlightInvoiceId] = useState<string | null>(null);

  // Listen for FAB "add payment" trigger (mobile contextual FAB)
  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent<string>).detail;
      if (action === "add-payment") {
        setAddOpen(true);
      }
    };
    window.addEventListener("stavba:fab-add", handler);
    return () => window.removeEventListener("stavba:fab-add", handler);
  }, []);

  // Group payments: standalone payments + installment groups
  // A payment is an "installment parent" if it has invoiceTotal != null (regardless of children).
  // A "standalone" payment has installmentOf === null and invoiceTotal === null.
  // Children (additional installments) have installmentOf = parent.id.
  const { standalone, groups } = useMemo(() => {
    const childrenByParent = new Map<string, Payment[]>();
    for (const p of payments ?? []) {
      if (p.installmentOf) {
        const arr = childrenByParent.get(p.installmentOf) ?? [];
        arr.push(p);
        childrenByParent.set(p.installmentOf, arr);
      }
    }
    const standalone: Payment[] = [];
    const groups: { parent: Payment; installments: Payment[] }[] = [];
    for (const p of payments ?? []) {
      // A payment is an installment parent if:
      // - it has invoiceTotal != null, OR
      // - other payments point to it via installmentOf
      const hasChildren = childrenByParent.has(p.id);
      const isInstallmentParent = (p.invoiceTotal != null) || hasChildren;

      if (isInstallmentParent && !p.installmentOf) {
        // This is a parent (installment group)
        const children = (childrenByParent.get(p.id) ?? []).slice().sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
        groups.push({ parent: p, installments: children });
      } else if (!p.installmentOf) {
        // Standalone payment (no invoiceTotal, no children)
        standalone.push(p);
      }
      // If p.installmentOf is set, it's a child — already in childrenByParent, skip
    }
    return { standalone, groups };
  }, [payments]);

  // Apply filters to both lists
  const filterFn = (p: Payment) => {
    if (typeFilter !== "all" && p.type !== typeFilter) return false;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      const text = `${p.description ?? ""} ${p.vendor ?? ""} ${p.budgetItem?.category ?? ""} ${p.budgetItem?.subcategory ?? ""} ${p.contact?.name ?? ""}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  };
  const filteredStandalone = standalone
    .filter(filterFn)
    .slice()
    .sort((a, b) => sortPayments(a, b, sortBy, locale));
  const filteredGroups = groups
    .filter((g) => filterFn(g.parent))
    .slice()
    .sort((a, b) => sortPayments(a.parent, b.parent, sortBy, locale));

  // Build a list of "render blocks" so parent+children stay grouped together
  // (children must visually follow their parent with a vertical connector).
  // Standalone payments are single-row blocks. Sorting applies to the block's
  // "anchor" payment (the standalone payment itself, or the group parent).
  type RenderBlock =
    | { kind: "standalone"; payment: Payment }
    | {
        kind: "group";
        parent: Payment;
        children: Payment[];
        invoiceTotal: number;
        paidTotal: number;
        remaining: number;
        percent: number;
      };

  const renderBlocks: RenderBlock[] = [];
  for (const p of filteredStandalone) {
    renderBlocks.push({ kind: "standalone", payment: p });
  }
  for (const g of filteredGroups) {
    const invoiceTotal = g.parent.invoiceTotal ?? g.parent.amount;
    const paidTotal = g.parent.amount + g.installments.reduce((s, i) => s + i.amount, 0);
    const remaining = invoiceTotal - paidTotal;
    const percent = invoiceTotal > 0 ? (paidTotal / invoiceTotal) * 100 : 0;
    renderBlocks.push({
      kind: "group",
      parent: g.parent,
      children: g.installments,
      invoiceTotal,
      paidTotal,
      remaining,
      percent,
    });
  }

  // Sort blocks by the user's chosen sort key (anchored on standalone payment
  // or group parent — children stay attached to their parent).
  renderBlocks.sort((a, b) =>
    sortPayments(
      a.kind === "standalone" ? a.payment : a.parent,
      b.kind === "standalone" ? b.payment : b.parent,
      sortBy,
      locale,
    ),
  );

  const totalAmount = renderBlocks.reduce(
    (s, b) =>
      s +
      (b.kind === "standalone"
        ? b.payment.amount
        : b.parent.amount + b.children.reduce((s2, c) => s2 + c.amount, 0)),
    0,
  );

  // Windowed slice for the table render — keeps DOM nodes bounded for big
  // projects. `renderLimit` is bumped by the "Show N more" button below the
  // table and reset to 50 when filters / sort / search change (see effect).
  const visibleBlocks = renderBlocks.slice(0, renderLimit);
  const remainingCount = Math.max(0, renderBlocks.length - renderLimit);
  const nextBatchCount = Math.min(50, remainingCount);

  return (
    <div id="payments-root" className="space-y-4">
      <div id="payments-toolbar" className="flex flex-wrap items-center gap-2">
        {/* Search input — filters payments by description/vendor/invoice #
            (debounced 250ms). Mirrors the existing `search`/`debouncedSearch`
            pipeline that was already wired up but had no UI surface. */}
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("toolbar.search")}
            aria-label={t("toolbar.search")}
            className="h-9 rounded-full pl-8"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allTypes")}</SelectItem>
            {PAYMENT_TYPES.map((pt) => (
              <SelectItem key={pt.value} value={pt.value}>
                {pt.emoji} {tPaymentTypes(pt.value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
          <SelectTrigger className="h-9 w-52">
            <ArrowUpDown className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_KEYS.map((k) => (
              <SelectItem key={k} value={k}>
                {t(`sort.${SORT_LABEL_KEYS[k]}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-3 type-body">
          <div className="text-right">
            <div className="type-label text-muted-foreground">
              {t("toolbar.sum", { count: filteredStandalone.length + filteredGroups.length })}
            </div>
            <div className="type-title-lg font-bold text-warning tabular-nums">{formatCzk(totalAmount, locale)}</div>
          </div>
          {/* VAT summary */}
          {(() => {
            const allPayments = [...filteredStandalone, ...filteredGroups.flatMap((g) => [g.parent, ...g.installments])];
            const totalVat = allPayments.reduce((s, p) => s + (p.vatAmount || 0), 0);
            const hasVat = allPayments.some((p) => p.vatAmount !== null && p.vatAmount !== undefined);
            return hasVat ? (
              <div className="text-right">
                <div className="type-label text-muted-foreground">{t("toolbar.vatIncluded")}</div>
                <div className="type-body font-semibold text-info tabular-nums">{formatCzk(totalVat, locale)}</div>
              </div>
            ) : null;
          })()}
        </div>
        {/* Desktop "Add payment" button — hidden on mobile (mobile uses the FAB).
            Pushed to the end of the toolbar with ml-auto so it sits at the
            right edge of the row it lands on. */}
        <Button
          onClick={() => setAddOpen(true)}
          className="hidden sm:flex ml-auto gap-1.5 rounded-full"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          {t("toolbar.add")}
        </Button>
      </div>

      {isLoading ? (
        <TabSkeleton />
      ) : filteredStandalone.length === 0 && filteredGroups.length === 0 ? (
        <EmptyStateBox
          icon={Receipt}
          title={payments?.length === 0 ? t("empty.title.noRecords") : t("empty.title.noMatch")}
          description={
            payments?.length === 0
              ? t("empty.description.noRecords")
              : t("empty.description.noMatch")
          }
          action={
            payments?.length === 0 ? (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> {t("empty.button.first")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {/* ===== Invoices overview (installment groups) ===== */}
          {/* Compact cards above the table — one per installment-parent invoice */}
          {filteredGroups.length > 0 && (
            <InvoicesOverview
              groups={filteredGroups}
              onAddInstallment={(parent) => setInstallmentPrefillParent(parent)}
              onShow={(parentId) => {
                setHighlightInvoiceId(parentId);
                // Defer scroll until after React commits the (possible) state-driven className change.
                requestAnimationFrame(() => {
                  const el = document.getElementById(`invoice-row-${parentId}`);
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                  }
                });
                // Auto-clear the highlight after a few seconds so it doesn't linger.
                window.setTimeout(() => setHighlightInvoiceId(null), 4000);
              }}
            />
          )}

          {/* Unified payments table — standalone + installment invoices merged */}
          <div className="overflow-x-auto scrollbar-thin rounded-lg border border-outline-variant bg-card">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow className="sticky top-0 z-30 bg-surface-container-high">
                  <TableHead className="w-16"></TableHead>
                  <TableHead className="w-28">{t("column.date")}</TableHead>
                  <TableHead className="min-w-[220px]">{t("column.budgetItem")}</TableHead>
                  <TableHead className="min-w-[160px]">{t("column.description")}</TableHead>
                  <TableHead className="w-32">{t("column.type")}</TableHead>
                  <TableHead>{t("column.contact")}</TableHead>
                  <TableHead className="text-right">{t("column.amount")}</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleBlocks.flatMap((block): ReactNode[] => {
                  if (block.kind === "standalone") {
                    const p = block.payment;
                    return [
                      <PaymentRow
                        key={p.id}
                        payment={p}
                        projectId={projectId}
                        projectCurrency={projectCurrency}
                        onEdit={() => setEditPayment(p)}
                        updatePayment={updatePayment}
                        onDelete={async () => {
                          try {
                            await deletePayment.mutateAsync(p.id);
                            trackEvent("delete_payment", { amount: p.amount });
                            toast.success(t("toasts.deleteSuccess"));
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : t("toasts.deleteError"));
                          }
                        }}
                      />,
                    ];
                  }
                  const { parent, children, invoiceTotal, paidTotal, remaining, percent } = block;
                  const rows: ReactNode[] = [];
                  rows.push(
                    <PaymentRow
                      key={parent.id}
                      payment={parent}
                      meta={{
                        isInstallmentParent: true,
                        isInstallmentChild: false,
                        installmentNumber: 1,
                        totalInstallments: 1 + children.length,
                        invoiceTotal,
                        paidTotal,
                        remaining,
                        percent,
                      }}
                      highlighted={highlightInvoiceId === parent.id}
                      rowId={`invoice-row-${parent.id}`}
                      projectId={projectId}
                      projectCurrency={projectCurrency}
                      onEdit={() => setEditPayment(parent)}
                      updatePayment={updatePayment}
                      onDelete={async () => {
                        try {
                          await deletePayment.mutateAsync(parent.id);
                          trackEvent("delete_payment", { amount: parent.amount });
                          toast.success(t("toasts.deleteSuccess"));
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : t("toasts.deleteError"));
                        }
                      }}
                    />,
                  );
                  children.forEach((c, i) => {
                    rows.push(
                      <PaymentRow
                        key={c.id}
                        payment={c}
                        meta={{
                          isInstallmentParent: false,
                          isInstallmentChild: true,
                          installmentNumber: i + 2,
                          totalInstallments: 1 + children.length,
                          invoiceTotal,
                          paidTotal,
                          remaining,
                          percent,
                          parentId: parent.id,
                        }}
                        highlighted={highlightInvoiceId === parent.id}
                        projectId={projectId}
                        projectCurrency={projectCurrency}
                        onEdit={() => setEditPayment(c)}
                        updatePayment={updatePayment}
                        onDelete={async () => {
                          try {
                            await deletePayment.mutateAsync(c.id);
                            trackEvent("delete_payment", { amount: c.amount });
                            toast.success(t("toasts.deleteSuccess"));
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : t("toasts.deleteError"));
                          }
                        }}
                      />,
                    );
                  });
                  // "Add installment" row — small inline button at the end of the group.
                  rows.push(
                    <AddInstallmentRow
                      key={`add-${parent.id}`}
                      parent={parent}
                      onAdd={() => setInstallmentPrefillParent(parent)}
                    />,
                  );
                  return rows;
                })}
              </TableBody>
            </Table>
          </div>
          {/* "Show N more" — progressive windowing. Hidden when all blocks
              already fit within `renderLimit`. Button is full-width on mobile
              and auto-width on desktop. */}
          {remainingCount > 0 && (
            <div className="py-3 text-center">
              <Button
                variant="outline"
                onClick={() => setRenderLimit((r) => r + 50)}
                className="gap-1.5 rounded-full"
                size="sm"
              >
                {t("loadMore", { count: nextBatchCount })}
              </Button>
            </div>
          )}
        </div>
      )}

      <PaymentDialog
        open={addOpen && !installmentPrefillParent}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) setInstallmentPrefillParent(null);
        }}
        projectId={projectId}
        projectCurrency={projectCurrency}
        budgetItems={budgetItems ?? []}
        contacts={contacts ?? []}
        payments={payments ?? []}
        createPayment={createPayment}
        updateBudgetItem={updateBudgetItem}
        onAddInstallmentToExisting={(parent) => {
          // Switch from create-flow to "add installment to existing invoice"
          // flow. Make sure to clear `addOpen` so the create dialog stays
          // closed after the prefill dialog is dismissed.
          setAddOpen(false);
          setInstallmentPrefillParent(parent);
        }}
      />

      {/* "Add installment" prefill flow — opens PaymentDialog in create mode
          with parent's fields pre-filled and `installmentOf` forced. */}
      <PaymentDialog
        open={!!installmentPrefillParent}
        onOpenChange={(o) => {
          if (!o) setInstallmentPrefillParent(null);
        }}
        projectId={projectId}
        projectCurrency={projectCurrency}
        budgetItems={budgetItems ?? []}
        contacts={contacts ?? []}
        payments={payments ?? []}
        createPayment={createPayment}
        updateBudgetItem={updateBudgetItem}
        prefillParent={installmentPrefillParent}
      />

      <PaymentDialog
        open={editPayment !== null}
        onOpenChange={(open) => {
          if (!open) setEditPayment(null);
        }}
        projectId={projectId}
        projectCurrency={projectCurrency}
        budgetItems={budgetItems ?? []}
        contacts={contacts ?? []}
        payments={payments ?? []}
        createPayment={createPayment}
        updatePayment={updatePayment}
        updateBudgetItem={updateBudgetItem}
        payment={editPayment}
        onClose={() => setEditPayment(null)}
      />
    </div>
  );
}
