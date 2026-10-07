"use client";

import { useState, useMemo, useEffect } from "react";
import {
  usePayments,
  useBudgetItems,
  useContacts,
  useCreatePayment,
  useUpdatePayment,
  useDeletePayment,
  useUpdateBudgetItem,
  useExportCsv,
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
  Plus,
  Trash2,
  Pencil,
  MoreHorizontal,
  Search,
  Receipt,
  Layers,
  CircleDollarSign,
  ArrowUpDown,
  Download,
} from "lucide-react";
import { formatCzk, formatDate, PAYMENT_TYPES, paymentTypeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EmptyStateBox } from "@/components/empty-state-box";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useLastValue } from "@/hooks/use-last-value";

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
  const exportCsv = useExportCsv(projectId);
  const [addOpen, setAddOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [search, setSearch] = useState("");
  // Debounce search so filter only re-runs 250ms after typing stops
  const debouncedSearch = useDebouncedValue(search, 250);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("date-desc");

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

  // Build a single flat list of all payment rows (standalone + installment
  // parents + installment children) so they can be rendered in ONE unified
  // table. Each row carries optional installment metadata for display.
  type RowMeta = {
    isInstallmentParent: boolean;
    isInstallmentChild: boolean;
    installmentNumber: number; // 1 for parent, 2+ for children
    totalInstallments: number; // 1 + children count
    invoiceTotal: number | null;
    paidTotal: number; // sum of parent + all children
    remaining: number;
    percent: number;
    parentId?: string; // for children — to keep parent reference
  };
  const allRows: { payment: Payment; meta: RowMeta }[] = [];

  // Standalone payments (no installment metadata)
  for (const p of filteredStandalone) {
    allRows.push({
      payment: p,
      meta: {
        isInstallmentParent: false,
        isInstallmentChild: false,
        installmentNumber: 0,
        totalInstallments: 0,
        invoiceTotal: null,
        paidTotal: p.amount,
        remaining: 0,
        percent: 100,
      },
    });
  }

  // Installment groups: parent (as row 1) + each child (row 2, 3, ...)
  for (const g of filteredGroups) {
    const children = g.installments;
    const invoiceTotal = g.parent.invoiceTotal ?? g.parent.amount;
    const paidTotal = g.parent.amount + children.reduce((s, i) => s + i.amount, 0);
    const remaining = invoiceTotal - paidTotal;
    const percent = invoiceTotal > 0 ? (paidTotal / invoiceTotal) * 100 : 0;
    allRows.push({
      payment: g.parent,
      meta: {
        isInstallmentParent: true,
        isInstallmentChild: false,
        installmentNumber: 1,
        totalInstallments: 1 + children.length,
        invoiceTotal,
        paidTotal,
        remaining,
        percent,
      },
    });
    children.forEach((c, i) => {
      allRows.push({
        payment: c,
        meta: {
          isInstallmentParent: false,
          isInstallmentChild: true,
          installmentNumber: i + 2,
          totalInstallments: 1 + children.length,
          invoiceTotal,
          paidTotal,
          remaining,
          percent,
          parentId: g.parent.id,
        },
      });
    });
  }

  // Sort the flat list by the user's chosen sort key (parent/child ordering
  // is preserved by stable sort within same date).
  allRows.sort((a, b) => sortPayments(a.payment, b.payment, sortBy));

  const totalAmount = allRows.reduce((s, r) => s + r.payment.amount, 0);

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
            <div className="text-lg font-bold text-amber-600 tabular-nums">{formatCzk(totalAmount)}</div>
          </div>
          {/* VAT summary */}
          {(() => {
            const allPayments = [...filteredStandalone, ...filteredGroups.flatMap((g) => [g.parent, ...g.installments])];
            const totalVat = allPayments.reduce((s, p) => s + (p.vatAmount || 0), 0);
            const hasVat = allPayments.some((p) => p.vatAmount !== null && p.vatAmount !== undefined);
            return hasVat ? (
              <div className="text-right">
                <div className="text-xs text-muted-foreground">z toho DPH</div>
                <div className="text-sm font-semibold text-sky-600 tabular-nums">{formatCzk(totalVat)}</div>
              </div>
            ) : null;
          })()}
          <Button
            variant="outline"
            size="sm"
            disabled={exportCsv.isPending || (payments?.length ?? 0) === 0}
            onClick={async () => {
              try {
                await exportCsv.mutateAsync("payments");
                toast.success("Platby exportovány do CSV");
              } catch {
                toast.error("Export selhal");
              }
            }}
            title="Exportovat do CSV (Excel/Google Sheets)"
          >
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
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
          <div className="overflow-hidden rounded-lg border">
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
          {/* Unified payments table — standalone + installment invoices merged */}
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-28">Datum</TableHead>
                  <TableHead className="w-32">Typ</TableHead>
                  <TableHead className="min-w-[220px]">Položka rozpočtu</TableHead>
                  <TableHead className="min-w-[160px]">Popis / Firma</TableHead>
                  <TableHead>Osoba / Kontakt</TableHead>
                  <TableHead className="text-right">Částka</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allRows.map(({ payment, meta }) => (
                  <PaymentRow
                    key={payment.id}
                    payment={payment}
                    meta={meta}
                    onEdit={() => setEditPayment(payment)}
                    onDelete={async () => {
                      try {
                        await deletePayment.mutateAsync(payment.id);
                        toast.success("Platba smazána");
                      } catch {
                        toast.error("Nepodařilo se smazat");
                      }
                    }}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <PaymentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
        budgetItems={budgetItems ?? []}
        contacts={contacts ?? []}
        createPayment={createPayment}
        updateBudgetItem={updateBudgetItem}
      />

      <PaymentDialog
        open={editPayment !== null}
        onOpenChange={(open) => {
          if (!open) setEditPayment(null);
        }}
        projectId={projectId}
        budgetItems={budgetItems ?? []}
        contacts={contacts ?? []}
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
  onEdit,
  onDelete,
}: {
  payment: Payment;
  meta?: RowMeta;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const t = paymentTypeLabel(payment.type);
  const isParent = meta?.isInstallmentParent ?? false;
  const isChild = meta?.isInstallmentChild ?? false;
  const installmentNumber = meta?.installmentNumber ?? 0;
  const totalInstallments = meta?.totalInstallments ?? 0;
  const hasInstallment = isParent || isChild;

  return (
    <TableRow
      className={cn(
        "group cursor-pointer hover:bg-muted/30",
        isParent && "bg-amber-50/30 dark:bg-amber-950/10",
      )}
      onClick={() => onEdit()}
      title="Klikněte pro úpravu platby"
    >
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {hasInstallment && (
          <span
            className={cn(
              "mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold",
              isParent
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
            )}
          >
            {installmentNumber}
          </span>
        )}
        {formatDate(payment.date)}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant="outline" className="text-[10px]">
            {t.emoji} {t.label}
          </Badge>
          {hasInstallment && (
            <Badge
              variant="outline"
              className="gap-0.5 text-[9px] text-amber-700 dark:text-amber-300"
              title={
                meta?.invoiceTotal != null
                  ? `Faktura ve splátkách: ${formatCzk(meta.invoiceTotal)} — zaplaceno ${formatCzk(meta.paidTotal)} (${meta.percent.toFixed(0)} %), zbývá ${formatCzk(meta.remaining)}`
                  : "Faktura ve splátkách"
              }
            >
              <Layers className="h-2.5 w-2.5" />
              {isParent ? "1. splátka" : `${installmentNumber}. splátka`}
              <span className="ml-0.5 tabular-nums">/ {totalInstallments}</span>
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className={cn("flex flex-col", isChild && "pl-4")}>
          <span className="text-xs font-medium">
            {payment.budgetItem?.subcategory || payment.budgetItem?.category}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {payment.budgetItem?.category}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-xs">{payment.description || (isParent ? "1. splátka" : "—")}</span>
          {payment.vendor && (
            <span className="text-[10px] text-muted-foreground">
              {payment.vendor}
              {payment.invoiceNumber ? ` · ${payment.invoiceNumber}` : ""}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-xs">
        {payment.contact?.name || "—"}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end">
          <span className="text-sm font-semibold text-amber-600 tabular-nums">
            {formatCzk(payment.amount)}
          </span>
          {isParent && meta?.invoiceTotal != null && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              z {formatCzk(meta.invoiceTotal)}
            </span>
          )}
          {payment.vatRate !== null && payment.vatRate !== undefined && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              vč. DPH {payment.vatRate}%
            </span>
          )}
        </div>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
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

// ===== Payment dialog (create + edit) =====
interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  budgetItems: { id: string; category: string; subcategory: string | null; completed?: boolean }[];
  contacts: { id: string; name: string; type: string }[];
  createPayment: ReturnType<typeof useCreatePayment>;
  updatePayment?: ReturnType<typeof useUpdatePayment>;
  updateBudgetItem: ReturnType<typeof useUpdateBudgetItem>;
  payment?: Payment | null;
  onClose?: () => void;
}

// Wrapper component: handles Dialog open state and remounts inner form via `key`
// whenever payment changes — ensures fresh state via useState initializers.
function PaymentDialog(props: PaymentDialogProps) {
  const { open } = props;
  if (!open) return null;
  return (
    <PaymentDialogInner
      key={props.payment?.id ?? "new"}
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
  createPayment,
  updatePayment,
  updateBudgetItem,
  payment,
  onClose,
}: PaymentDialogProps) {
  const isEdit = !!payment;
  const isInstallment = !!payment?.installmentOf;
  const today = new Date().toISOString().substring(0, 10);

  // Smart defaults: remember last used values per project (only for create flow)
  const [lastType, setLastType] = useLastValue("paymentType", "receipt", projectId);
  const [lastContactId, setLastContactId] = useLastValue("contactId", "", projectId);
  const [lastVendor, setLastVendor] = useLastValue("vendor", "", projectId);

  const [budgetItemId, setBudgetItemId] = useState(payment?.budgetItemId ?? "");
  const [contactId, setContactId] = useState(payment?.contactId ?? lastContactId);
  const [amount, setAmount] = useState(payment ? String(payment.amount ?? "") : "");
  const [date, setDate] = useState(toDateStr(payment?.date) || today);
  const [type, setType] = useState(payment?.type ?? lastType);
  const [vendor, setVendor] = useState(payment?.vendor ?? lastVendor);
  const [invoiceNumber, setInvoiceNumber] = useState(payment?.invoiceNumber ?? "");
  const [description, setDescription] = useState(payment?.description ?? "");
  const [vatRate, setVatRate] = useState(
    payment?.vatRate !== null && payment?.vatRate !== undefined ? String(payment.vatRate) : "",
  );
  // Installment mode (create-only)
  const [isInvoice, setIsInvoice] = useState(false);
  const [invoiceTotal, setInvoiceTotal] = useState("");
  const [markCompleted, setMarkCompleted] = useState(false);

  // Inline validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isPending = isEdit ? (updatePayment?.isPending ?? false) : createPayment.isPending;

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
  }

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
        });
        if (markCompleted) {
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
      <div className="space-y-4">
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

        {/* Installment toggle - only in create mode (not editing existing payments) */}
        {!isEdit && (
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

        <div className="grid grid-cols-2 gap-3">
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
        </div>
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
        <div className="flex flex-col gap-1 rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
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
      </div>
    </AddDialogShell>
  );
}
