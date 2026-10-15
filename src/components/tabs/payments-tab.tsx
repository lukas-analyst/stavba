"use client";

import { useState, useMemo, useEffect, type ReactNode } from "react";
import {
  usePayments,
  useBudgetItems,
  useContacts,
  useCreatePayment,
  useUpdatePayment,
  useDeletePayment,
  useUpdateBudgetItem,
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Plus,
  Trash2,
  Pencil,
  MoreHorizontal,
  Search,
  Receipt,
  Layers,
  CircleDollarSign,
  ArrowUpDown,
  Eye,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { formatCzk, formatDate, PAYMENT_TYPES, paymentTypeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EmptyStateBox } from "@/components/empty-state-box";
import { InlineDate, InlineNumber } from "@/components/ui/inline-editors";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useLastValue } from "@/hooks/use-last-value";
import { useAnalytics } from "@/hooks/use-analytics";

// ===== Sorting =====
type SortKey =
  | "date-desc"
  | "date-asc"
  | "amount-desc"
  | "amount-asc"
  | "type"
  | "contact"
  | "vendor";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "date-desc", label: "Datum (nejnovější)" },
  { value: "date-asc", label: "Datum (nejstarší)" },
  { value: "amount-desc", label: "Částka (sestupně)" },
  { value: "amount-asc", label: "Částka (vzestupně)" },
  { value: "type", label: "Typ" },
  { value: "contact", label: "Kontakt (A→Z)" },
  { value: "vendor", label: "Firma (A→Z)" },
];

function sortPayments(a: Payment, b: Payment, key: SortKey): number {
  const tieBreak = () => new Date(b.date).getTime() - new Date(a.date).getTime();
  switch (key) {
    case "date-asc":
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    case "amount-desc":
      return b.amount - a.amount;
    case "amount-asc":
      return a.amount - b.amount;
    case "type": {
      const cmp = a.type.localeCompare(b.type, "cs-CZ");
      return cmp !== 0 ? cmp : tieBreak();
    }
    case "contact": {
      const ac = a.contact?.name ?? "~~~"; // nulls last
      const bc = b.contact?.name ?? "~~~";
      const cmp = ac.localeCompare(bc, "cs-CZ");
      return cmp !== 0 ? cmp : tieBreak();
    }
    case "vendor": {
      const av = a.vendor ?? "~~~";
      const bv = b.vendor ?? "~~~";
      const cmp = av.localeCompare(bv, "cs-CZ");
      return cmp !== 0 ? cmp : tieBreak();
    }
    case "date-desc":
    default:
      return new Date(b.date).getTime() - new Date(a.date).getTime();
  }
}

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

export function PaymentsTab({ projectId }: { projectId: string }) {
  const { data: payments, isLoading } = usePayments(projectId);
  const { data: budgetItems } = useBudgetItems(projectId);
  const { data: contacts } = useContacts(projectId);
  const createPayment = useCreatePayment(projectId);
  const updatePayment = useUpdatePayment(projectId);
  const deletePayment = useDeletePayment(projectId);
  const updateBudgetItem = useUpdateBudgetItem(projectId);
  const { trackEvent } = useAnalytics(projectId);
  const [addOpen, setAddOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [search, setSearch] = useState("");
  // Debounce search so filter only re-runs 250ms after typing stops
  const debouncedSearch = useDebouncedValue(search, 250);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("date-desc");

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
    .sort((a, b) => sortPayments(a, b, sortBy));
  const filteredGroups = groups
    .filter((g) => filterFn(g.parent))
    .slice()
    .sort((a, b) => sortPayments(a.parent, b.parent, sortBy));

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

  return (
    <div id="payments-root" className="space-y-4">
      <div id="payments-toolbar" className="flex flex-wrap items-center gap-2">
        <div id="payments-search" className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hledat platbu…"
            className="h-9 w-56 pl-8"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny typy</SelectItem>
            {PAYMENT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.emoji} {t.label}
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
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">
              Součet ({filteredStandalone.length + filteredGroups.length})
            </div>
            <div className="text-lg font-bold text-warning tabular-nums">{formatCzk(totalAmount)}</div>
          </div>
          {/* VAT summary */}
          {(() => {
            const allPayments = [...filteredStandalone, ...filteredGroups.flatMap((g) => [g.parent, ...g.installments])];
            const totalVat = allPayments.reduce((s, p) => s + (p.vatAmount || 0), 0);
            const hasVat = allPayments.some((p) => p.vatAmount !== null && p.vatAmount !== undefined);
            return hasVat ? (
              <div className="text-right">
                <div className="text-xs text-muted-foreground">z toho DPH</div>
                <div className="text-sm font-semibold text-info tabular-nums">{formatCzk(totalVat)}</div>
              </div>
            ) : null;
          })()}
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Přidat platbu
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {/* Toolbar skeleton */}
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-24" />
            <div className="ml-auto flex items-center gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-32" />
            </div>
          </div>
          {/* Table skeleton */}
          <div className="overflow-hidden rounded-lg border border-outline-variant bg-card">
            <div className="border-b bg-muted/40 px-4 py-2.5">
              <Skeleton className="h-4 w-full" />
            </div>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="border-b px-4 py-3">
                <Skeleton className="h-5 w-full" />
              </div>
            ))}
          </div>
        </div>
      ) : filteredStandalone.length === 0 && filteredGroups.length === 0 ? (
        <EmptyStateBox
          icon={Receipt}
          title={payments?.length === 0 ? "Zatím žádné platby" : "Žádné platby neodpovídají filtru"}
          description={
            payments?.length === 0
              ? "Začněte evidovat platby - účtenky, faktury nebo výplaty za práci. Můžete je rozdělit i do splátek."
              : "Zkuste změnit filtr nebo vyhledávání."
          }
          action={
            payments?.length === 0 ? (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Přidat první platbu
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
          <div className="overflow-hidden rounded-lg border border-outline-variant bg-card">
            <Table>
              <TableHeader>
                <TableRow className="sticky top-0 z-30 bg-surface-container-high">
                  <TableHead className="w-16"></TableHead>
                  <TableHead className="w-28">Datum</TableHead>
                  <TableHead className="min-w-[220px]">Položka rozpočtu</TableHead>
                  <TableHead className="min-w-[160px]">Popis</TableHead>
                  <TableHead className="w-32">Typ</TableHead>
                  <TableHead>Kontakt</TableHead>
                  <TableHead className="text-right">Částka</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {renderBlocks.flatMap((block): ReactNode[] => {
                  if (block.kind === "standalone") {
                    const p = block.payment;
                    return [
                      <PaymentRow
                        key={p.id}
                        payment={p}
                        projectId={projectId}
                        onEdit={() => setEditPayment(p)}
                        updatePayment={updatePayment}
                        onDelete={async () => {
                          try {
                            await deletePayment.mutateAsync(p.id);
                            trackEvent("delete_payment", { amount: p.amount });
                            toast.success("Platba smazána");
                          } catch {
                            toast.error("Nepodařilo se smazat");
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
                      onEdit={() => setEditPayment(parent)}
                      updatePayment={updatePayment}
                      onDelete={async () => {
                        try {
                          await deletePayment.mutateAsync(parent.id);
                          trackEvent("delete_payment", { amount: parent.amount });
                          toast.success("Platba smazána");
                        } catch {
                          toast.error("Nepodařilo se smazat");
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
                        onEdit={() => setEditPayment(c)}
                        updatePayment={updatePayment}
                        onDelete={async () => {
                          try {
                            await deletePayment.mutateAsync(c.id);
                            trackEvent("delete_payment", { amount: c.amount });
                            toast.success("Platba smazána");
                          } catch {
                            toast.error("Nepodařilo se smazat");
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
        </div>
      )}

      <PaymentDialog
        open={addOpen && !installmentPrefillParent}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) setInstallmentPrefillParent(null);
        }}
        projectId={projectId}
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


// ===== Unified payment row (standalone + installment parent + installment child) =====
type RowMeta = {
  isInstallmentParent: boolean;
  isInstallmentChild: boolean;
  installmentNumber: number;
  totalInstallments: number;
  invoiceTotal: number | null;
  paidTotal: number;
  remaining: number;
  percent: number;
  parentId?: string;
};

function PaymentRow({
  payment,
  meta,
  highlighted,
  rowId,
  projectId,
  onEdit,
  onDelete,
  updatePayment,
}: {
  payment: Payment;
  meta?: RowMeta;
  highlighted?: boolean;
  rowId?: string;
  projectId: string;
  onEdit: () => void;
  onDelete: () => void;
  updatePayment?: ReturnType<typeof useUpdatePayment>;
}) {
  const [confirm, setConfirm] = useState(false);
  const { trackEvent } = useAnalytics(projectId);
  const t = paymentTypeLabel(payment.type);
  const isParent = meta?.isInstallmentParent ?? false;
  const isChild = meta?.isInstallmentChild ?? false;
  const installmentNumber = meta?.installmentNumber ?? 0;
  const totalInstallments = meta?.totalInstallments ?? 0;
  const hasInstallment = isParent || isChild;

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
      title="Klikněte pro úpravu platby"
    >
      <TableCell className={cn("w-16", childIndent, rowBg)}>
        {isParent ? (
          <Badge
            variant="outline"
            className="gap-0.5 type-label-sm text-warning-strong dark:text-warning/80"
            title={
              meta?.invoiceTotal != null
                ? `Faktura ve splátkách: ${formatCzk(meta.invoiceTotal)} — zaplaceno ${formatCzk(meta.paidTotal)} (${meta.percent.toFixed(0)} %), zbývá ${formatCzk(meta.remaining)}`
                : "Faktura ve splátkách"
            }
          >
            <span className="tabular-nums">1 / {totalInstallments}</span>
          </Badge>
        ) : isChild ? (
          <span
            className="inline-flex items-center gap-0.5 type-label-sm text-on-surface-variant tabular-nums"
            title={`${installmentNumber}. splátka z ${totalInstallments}`}
          >
            {installmentNumber}. splátka
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
          <span className="type-body">{payment.description || (isParent ? "1. splátka" : "—")}</span>
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
              {t.emoji} {t.label}
            </Badge>
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_TYPES.map((pt) => (
              <SelectItem key={pt.value} value={pt.value}>
                {pt.emoji} {pt.label}
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
          <InlineNumber
            value={payment.amount}
            onCommit={(v) => update("amount", v)}
            suffix=" Kč"
            className="font-semibold text-warning"
          />
          {isParent && meta?.invoiceTotal != null && (
            <span className="type-label text-on-surface-variant tabular-nums">
              z {formatCzk(meta.invoiceTotal)}
            </span>
          )}
          {payment.vatRate !== null && payment.vatRate !== undefined && (
            <span className="type-label text-on-surface-variant tabular-nums">
              vč. DPH {payment.vatRate}%
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
              <Pencil className="mr-2 h-3.5 w-3.5" /> Upravit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirm(true)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Smazat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={confirm} onOpenChange={setConfirm}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Smazat platbu?</DialogTitle>
              <DialogDescription>
                Opravdu chcete smazat platbu{" "}
                <strong>{formatCzk(payment.amount)}</strong>?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirm(false)}>
                Zrušit
              </Button>
              <Button variant="destructive" onClick={() => { setConfirm(false); onDelete(); }}>
                Smazat
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}

// ===== "Add installment" inline row (rendered at the end of an installment group) =====
function AddInstallmentRow({
  parent,
  onAdd,
}: {
  parent: Payment;
  onAdd: () => void;
}) {
  return (
    <TableRow className="group hover:bg-muted/20">
      <TableCell colSpan={8} className="py-0.5 pl-2">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 type-label-sm text-on-surface-variant/80 transition-colors hover:bg-surface-container-high hover:text-on-surface"
          title={`Přidat další splátku k faktuře ${parent.vendor ?? parent.invoiceNumber ?? parent.id.slice(0, 6)}`}
        >
          <Plus className="h-3 w-3" />
          Přidat splátku
        </button>
      </TableCell>
    </TableRow>
  );
}

// ===== Invoices overview (compact cards above the table) =====
function InvoicesOverview({
  groups,
  onAddInstallment,
  onShow,
}: {
  groups: { parent: Payment; installments: Payment[] }[];
  onAddInstallment: (parent: Payment) => void;
  onShow: (parentId: string) => void;
}) {
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
        "Faktura";
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
                </CardTitle>
                <Badge variant="outline" className="shrink-0 type-label-sm">
                  {c.installmentCount}× splátka
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
                  <div className="type-label text-on-surface-variant">Faktura</div>
                  <div className="type-body font-semibold tabular-nums">{formatCzk(c.invoiceTotal)}</div>
                </div>
                <div>
                  <div className="type-label text-on-surface-variant">Zaplaceno</div>
                  <div className="type-body font-semibold tabular-nums text-success">{formatCzk(c.paidTotal)}</div>
                </div>
                <div>
                  <div className="type-label text-on-surface-variant">Zbývá</div>
                  <div className={cn("type-body font-semibold tabular-nums", remainingTone)}>
                    {formatCzk(c.remaining)}
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
                <span className="tabular-nums">{c.percent.toFixed(0)} %</span>
                {c.parent.invoiceNumber && (
                  <span className="truncate">č. {c.parent.invoiceNumber}</span>
                )}
              </div>
              {/* Actions */}
              <div className="flex items-center gap-1.5 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 flex-1"
                  onClick={() => onShow(c.parent.id)}
                  title="Zobrazit splátky v tabulce"
                >
                  <Eye className="mr-1 h-3.5 w-3.5" /> Zobrazit
                </Button>
                <Button
                  size="sm"
                  className="h-7 flex-1"
                  onClick={() => onAddInstallment(c.parent)}
                  title="Přidat další splátku k této faktuře"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Přidat splátku
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ===== Payment dialog (create + edit) =====
interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  budgetItems: { id: string; category: string; subcategory: string | null; completed?: boolean }[];
  contacts: { id: string; name: string; type: string }[];
  /**
   * All payments in the project. Used to populate the "Připojit k faktuře"
   * Select in edit mode — lists installment-parent payments (invoiceTotal != null)
   * that the currently edited payment can be linked to as an installment.
   */
  payments?: Payment[];
  createPayment: ReturnType<typeof useCreatePayment>;
  updatePayment?: ReturnType<typeof useUpdatePayment>;
  updateBudgetItem: ReturnType<typeof useUpdateBudgetItem>;
  payment?: Payment | null;
  onClose?: () => void;
  /**
   * When set, dialog opens in "add installment" mode — a create flow that
   * pre-fills the parent's budgetItem/contact/vendor/invoiceNumber and forces
   * `installmentOf = prefillParent.id` on submit. The "isInvoice" toggle is
   * hidden and the user can't pick a different invoiceTotal.
   */
  prefillParent?: Payment | null;
  /**
   * Called when the user clicks "Přidat splátku k této faktuře" after picking
   * a budget item that already has an invoice. The parent component switches
   * to "add installment" mode using the discovered parent.
   */
  onAddInstallmentToExisting?: (parent: Payment) => void;
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
function PaymentDialog(props: PaymentDialogProps) {
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
    payment?.contactId ?? prefillParent?.contactId ?? lastContactId,
  );
  const [amount, setAmount] = useState(payment ? String(payment.amount ?? "") : "");
  const [date, setDate] = useState(toDateStr(payment?.date) || today);
  const [type, setType] = useState(payment?.type ?? prefillParent?.type ?? lastType);
  const [vendor, setVendor] = useState(
    payment?.vendor ?? prefillParent?.vendor ?? lastVendor,
  );
  const [invoiceNumber, setInvoiceNumber] = useState(
    payment?.invoiceNumber ?? prefillParent?.invoiceNumber ?? "",
  );
  const [description, setDescription] = useState(
    payment?.description ?? (isAddingInstallment ? "Další splátka" : ""),
  );
  const [vatRate, setVatRate] = useState(
    payment?.vatRate !== null && payment?.vatRate !== undefined ? String(payment.vatRate) : "",
  );
  // Installment mode (create-only)
  const [isInvoice, setIsInvoice] = useState(false);
  const [invoiceTotal, setInvoiceTotal] = useState("");
  const [markCompleted, setMarkCompleted] = useState(false);

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
    setVendor("");
    setInvoiceNumber("");
    setDescription("");
    setType("receipt");
    setIsInvoice(false);
    setInvoiceTotal("");
    setVatRate("");
    setMarkCompleted(false);
    setInstallmentParentId("");
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
          ? `Faktura převedena na běžnou platbu, ${childPayments.length} splátek odpojeno`
          : "Faktura převedena na běžnou platbu",
      );
      setShowConvertConfirm(false);
      onOpenChange(false);
      onClose?.();
    } catch {
      toast.error("Nepodařilo se převést fakturu na běžnou platbu");
    } finally {
      setIsConverting(false);
    }
  };

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    if (!budgetItemId) newErrors.budgetItemId = "Vyberte položku rozpočtu";
    if (isInvoice && (!invoiceTotal || isNaN(Number(invoiceTotal.replace(",", "."))))) {
      newErrors.invoiceTotal = "Zadejte platnou celkovou částku faktury";
    }
    if (!isInvoice && (!amount || isNaN(Number(amount.replace(",", "."))))) {
      newErrors.amount = "Zadejte platnou částku";
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
          date,
          type,
          vendor: vendor || null,
          invoiceNumber: invoiceNumber || null,
          description: description || null,
          vatRate: vatRate || null,
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
            toast.success("Platba upravena, položka označena jako hotová");
          } catch {
            toast.success("Platba upravena (nepodařilo se označit položku jako hotovou)");
          }
        } else {
          toast.success("Platba upravena");
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
          invoiceTotal: inv, // full invoice amount
          installmentOf: null, // this IS the parent
          vatRate: vatRate || null,
          date,
          type,
          vendor,
          invoiceNumber,
          description: description || "1. splátka",
        });
        trackEvent("add_payment", { amount: amt, type, invoice: true });
        if (markCompleted) {
          try {
            await updateBudgetItem.mutateAsync({ id: budgetItemId, data: { completed: true } });
            toast.success("Faktura vytvořena, položka označena jako hotová");
          } catch {
            toast.success("Faktura vytvořena (nepodařilo se označit položku jako hotovou)");
          }
        } else {
          toast.success("Faktura se splátkami vytvořena");
        }
      } else {
        await createPayment.mutateAsync({
          budgetItemId,
          contactId: contactId || null,
          amount: amt,
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
        });
        trackEvent("add_payment", {
          amount: amt,
          type,
          invoice: false,
          installment: isAddingInstallment,
        });
        if (isAddingInstallment) {
          toast.success("Splátka přidána k faktuře");
        } else if (markCompleted) {
          try {
            await updateBudgetItem.mutateAsync({ id: budgetItemId, data: { completed: true } });
            toast.success("Platba přidána, položka označena jako hotová");
          } catch {
            toast.success("Platba přidána (nepodařilo se označit položku jako hotovou)");
          }
        } else {
          toast.success("Platba přidána");
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
    } catch {
      toast.error(isEdit ? "Nepodařilo se upravit platbu" : "Nepodařilo se přidat platbu");
    }
  };

  // Selected budget item to show "already completed" hint next to checkbox
  const selectedBudgetItem = budgetItems.find((b) => b.id === budgetItemId);
  const alreadyCompleted = selectedBudgetItem?.completed === true;

  const submitLabel = isEdit
    ? isInstallment
      ? "Upravit splátku"
      : "Upravit platbu"
    : isAddingInstallment
      ? "Přidat splátku"
      : isInvoice
        ? "Vytvořit fakturu"
        : "Přidat platbu";

  return (
    <AddDialogShell
      open={open}
      onOpenChange={onOpenChange}
      titleValue={description}
      onTitleChange={setDescription}
      titlePlaceholder="Co bylo zakoupeno / zaplaceno…"
      submitLabel={submitLabel}
      onSubmit={handleSubmit}
      isSubmitting={isPending}
      maxWidth="max-w-3xl"
    >
      {/* ===== ZÁKLAD ===== */}
      <div className="space-y-2">
        <Label htmlFor="budgetItem">Položka rozpočtu *</Label>
        <SearchableSelect
          id="budgetItem"
          options={budgetItems.map((b) => ({
            value: b.id,
            label: `${b.category}${b.subcategory ? ` / ${b.subcategory}` : ""}${b.completed ? " ✓" : ""}`,
            hint: b.category,
          }))}
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
          placeholder="Vyberte položku…"
          searchPlaceholder="Hledat položku…"
          emptyText="Žádné položky nenalezeny"
          className={cn(errors.budgetItemId && "border-destructive")}
        />
        {errors.budgetItemId && (
          <p className="text-xs text-destructive mt-1">{errors.budgetItemId}</p>
        )}
      </div>

      {/* "Add installment" prefill banner — shown when the dialog was opened
          via "Přidat splátku" from an invoice card or the in-dialog action.
          Tells the user that this new payment will be added as a new
          installment of the parent invoice. */}
      {isAddingInstallment && prefillParent && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning-soft/40 p-2.5 dark:border-warning-strong/40 dark:bg-warning-soft/30">
          <Layers className="h-4 w-4 shrink-0 text-warning-strong dark:text-warning" />
          <div className="flex-1 text-xs leading-tight">
            <div className="font-semibold text-warning-strong dark:text-warning">
              Nová splátka k faktuře
            </div>
            <div className="text-on-surface-variant">
              {prefillParent.vendor || prefillParent.invoiceNumber || "Faktura"}
              {prefillParent.invoiceTotal != null
                ? ` · ${formatCzk(prefillParent.invoiceTotal)} celkem`
                : ""}
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
          <div className="flex-1 text-xs leading-tight">
            <div className="font-medium">
              Tato položka už má fakturu:{" "}
              <span className="text-foreground">
                {existingInvoiceForBudgetItem.vendor ||
                  existingInvoiceForBudgetItem.invoiceNumber ||
                  "Faktura"}
              </span>
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
                  {formatCzk(paid)} / {formatCzk(inv)} ({percent.toFixed(0)} %)
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
            <Plus className="mr-1 h-3.5 w-3.5" /> Přidat splátku k této faktuře
          </Button>
        </div>
      )}

      {/* "Convert parent → regular payment" action (edit mode only, when this
          payment is an installment-parent with invoiceTotal set). */}
      {isEdit && payment?.invoiceTotal != null && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-danger/40 bg-danger-soft/30 p-2.5 dark:border-danger-strong/40 dark:bg-danger-soft/20">
            <AlertTriangle className="h-4 w-4 shrink-0 text-danger-strong dark:text-danger" />
            <div className="flex-1 text-xs leading-tight">
              <div className="font-medium text-danger-strong dark:text-danger">
                Toto je faktura ve splátkách
              </div>
              <div className="text-on-surface-variant">
                Faktura celkem {formatCzk(payment.invoiceTotal)}. Můžete ji
                převést zpět na běžnou platbu — splátky zůstanou jako
                samostatné platby.
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
              <ChevronRight className="mr-1 h-3.5 w-3.5" /> Převést na běžnou platbu
            </Button>
          </div>
          <Dialog open={showConvertConfirm} onOpenChange={setShowConvertConfirm}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-danger" />
                  Převést fakturu na běžnou platbu?
                </DialogTitle>
                <DialogDescription>
                  Tímto se faktura převede na běžnou platbu. Všechny splátky
                  ({childPayments.length}) zůstanou jako samostatné platby.
                  Pokračovat?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowConvertConfirm(false)}
                  disabled={isConverting}
                >
                  Zrušit
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConvertToRegular}
                  disabled={isConverting}
                >
                  {isConverting ? "Převádím…" : "Převést na běžnou platbu"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Částka / Faktura celkem / 1. splátka + Datum */}
      {isInvoice && !isEdit ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="invoiceTotal">Faktura celkem (Kč) *</Label>
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
              placeholder="150000"
              inputMode="decimal"
              className={cn(errors.invoiceTotal && "border-destructive")}
            />
            {errors.invoiceTotal && (
              <p className="text-xs text-destructive mt-1">{errors.invoiceTotal}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">1. splátka (Kč) *</Label>
            <Input
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="50000"
              inputMode="decimal"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="amount">Částka (Kč) *</Label>
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
              placeholder="25000"
              inputMode="decimal"
              className={cn(errors.amount && "border-destructive")}
            />
            {errors.amount && (
              <p className="text-xs text-destructive mt-1">{errors.amount}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">Datum *</Label>
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
          <Label htmlFor="date">Datum faktury *</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      )}

      {/* Typ */}
      <div className="space-y-2">
        <Label htmlFor="type">Typ</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger id="type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.emoji} {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ===== DETAILY (volitelné) ===== */}
      <CollapsibleSection title="Detaily (volitelné)">
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
            <Label htmlFor="isInvoice" className="cursor-pointer text-xs">
              <CircleDollarSign className="mr-1 inline h-3.5 w-3.5" />
              Platba ve splátkách (faktura s více platbami)
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
              Připojit k faktuře (jako splátka)
            </Label>
            <Select
              value={installmentParentId || "none"}
              onValueChange={(v) => setInstallmentParentId(v === "none" ? "" : v)}
            >
              <SelectTrigger id="installmentOf">
                <SelectValue placeholder="Samostatná platba (bez faktury)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  Samostatná platba (bez faktury)
                </SelectItem>
                {parentCandidates.map((p) => {
                  const label = [
                    p.vendor,
                    p.invoiceNumber,
                    p.description,
                    formatCzk(p.invoiceTotal ?? p.amount),
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <SelectItem key={p.id} value={p.id}>
                      {label || `Faktura ${p.id.slice(0, 6)}`}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Tato platba se zobrazí jako další splátka vybrané faktury.
              Změnou se aktualizuje součet plátby faktury.
            </p>
          </div>
        )}

        {/* Kontakt (volitelné) */}
        <div className="space-y-2">
          <Label htmlFor="contact">Kontakt (volitelné)</Label>
          <SearchableSelect
            id="contact"
            options={contacts.map((c) => ({
              value: c.id,
              label: c.name,
              hint: `${c.type}${c.role ? ` · ${c.role}` : ""}${c.company ? ` · ${c.company}` : ""}`,
            }))}
            value={contactId}
            onChange={setContactId}
            placeholder="Bez kontaktu"
            searchPlaceholder="Hledat kontakt…"
            emptyText="Žádné kontakty nenalezeny"
          />
        </div>

        {/* Firma / Obchod + Číslo faktury/účtenky */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="vendor">Firma / Obchod</Label>
            <Input
              id="vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="např. Hornbach"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invoiceNumber">Číslo faktury/účtenky</Label>
            <Input
              id="invoiceNumber"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="2024-001"
            />
          </div>
        </div>

        {/* VAT field - shown for non-invoice (standalone or edit) payments */}
        {(!isInvoice || isEdit) && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="vatRate">DPH sazba (%)</Label>
              <Select value={vatRate || "none"} onValueChange={(v) => setVatRate(v === "none" ? "" : v)}>
                <SelectTrigger id="vatRate">
                  <SelectValue placeholder="Bez DPH" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Bez DPH</SelectItem>
                  <SelectItem value="21">21 % (standardní)</SelectItem>
                  <SelectItem value="12">12 % (snížená 1)</SelectItem>
                  <SelectItem value="10">10 % (snížená 2)</SelectItem>
                  <SelectItem value="0">0 %</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Výpočet DPH</Label>
              <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-xs text-muted-foreground">
                {vatRate && amount ? (
                  <>
                    DPH:{" "}
                    <strong className="ml-1 text-foreground tabular-nums">
                      {formatCzk(
                        (Number(amount.replace(",", ".")) * Number(vatRate)) /
                          (100 + Number(vatRate)),
                      )}
                    </strong>
                    <span className="ml-2">
                      (Základ:{" "}
                      {formatCzk(
                        (Number(amount.replace(",", ".")) * 100) /
                          (100 + Number(vatRate)),
                      )}
                      )
                    </span>
                  </>
                ) : (
                  <span>Zadejte částku a DPH sazbu</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Hotovo checkbox - propojí platbu s dokončením budget item */}
        <div className="flex flex-col gap-1 rounded-md border border-warning/30 bg-warning-soft/50 p-3 dark:border-warning-strong/60 dark:bg-warning-soft/40">
          <div className="flex items-start gap-2">
            <Checkbox
              id="markCompleted"
              checked={markCompleted}
              onCheckedChange={(v) => setMarkCompleted(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="markCompleted" className="cursor-pointer text-sm font-medium leading-tight">
              Označit položku jako hotovou
            </Label>
          </div>
          <p className="ml-6 text-[11px] text-muted-foreground">
            {alreadyCompleted
              ? "Položka je již označena jako hotová."
              : "Položka bude označena jako dokončená"}
          </p>
        </div>
      </CollapsibleSection>
    </AddDialogShell>
  );
}
