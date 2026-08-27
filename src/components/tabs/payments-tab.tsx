"use client";

import { useState, useMemo } from "react";
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
import { Textarea } from "@/components/ui/textarea";
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
import {
  Plus,
  Trash2,
  Pencil,
  MoreHorizontal,
  Search,
  Receipt,
  Loader2,
  FileText,
  Layers,
  CircleDollarSign,
  ArrowUpDown,
  CheckCircle2,
  Download,
} from "lucide-react";
import { formatCzk, formatDate, PAYMENT_TYPES, paymentTypeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EmptyStateBox } from "@/components/empty-state-box";

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
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("date-desc");

  // Group payments: standalone payments + installment groups
  // A "parent" payment is one that has installments (other payments point to it via installmentOf).
  // A standalone payment has installmentOf === null and no children.
  const { standalone, groups } = useMemo(() => {
    const childrenByParent = new Map<string, Payment[]>();
    const parentIds = new Set<string>();
    for (const p of payments ?? []) {
      if (p.installmentOf) {
        parentIds.add(p.installmentOf);
        const arr = childrenByParent.get(p.installmentOf) ?? [];
        arr.push(p);
        childrenByParent.set(p.installmentOf, arr);
      }
    }
    const standalone: Payment[] = [];
    const groups: { parent: Payment; installments: Payment[] }[] = [];
    for (const p of payments ?? []) {
      if (parentIds.has(p.id)) {
        const children = (childrenByParent.get(p.id) ?? []).slice().sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
        groups.push({ parent: p, installments: children });
      } else if (!p.installmentOf) {
        standalone.push(p);
      }
    }
    return { standalone, groups };
  }, [payments]);

  // Apply filters to both lists
  const filterFn = (p: Payment) => {
    if (typeFilter !== "all" && p.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
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

  const totalAmount = [
    ...filteredStandalone,
    ...filteredGroups.flatMap((g) => g.installments),
  ].reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
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
            const allPayments = [...filteredStandalone, ...filteredGroups.flatMap((g) => g.installments)];
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
        <Skeleton className="h-96" />
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
          {/* Installment groups (invoices with partial payments) */}
          {filteredGroups.map(({ parent, installments }) => (
            <InstallmentGroupCard
              key={parent.id}
              parent={parent}
              installments={installments}
              onDeletePayment={async (id) => {
                try {
                  await deletePayment.mutateAsync(id);
                  toast.success("Platba smazána");
                } catch {
                  toast.error("Nepodařilo se smazat");
                }
              }}
              onAddInstallment={async (data) => {
                try {
                  await createPayment.mutateAsync(data);
                  toast.success("Splátka přidána");
                } catch {
                  toast.error("Nepodařilo se přidat splátku");
                }
              }}
              onEditPayment={(p) => setEditPayment(p)}
            />
          ))}

          {/* Standalone payments */}
          {filteredStandalone.length > 0 && (
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
                  {filteredStandalone.map((p) => (
                    <PaymentRow
                      key={p.id}
                      payment={p}
                      onEdit={() => setEditPayment(p)}
                      onDelete={async () => {
                        try {
                          await deletePayment.mutateAsync(p.id);
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
          )}
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

// ===== Installment group card =====
function InstallmentGroupCard({
  parent,
  installments,
  onDeletePayment,
  onAddInstallment,
  onEditPayment,
}: {
  parent: Payment;
  installments: Payment[];
  onDeletePayment: (id: string) => void;
  onAddInstallment: (data: {
    budgetItemId: string;
    amount: number;
    installmentOf: string;
    date: string;
    type: string;
    description?: string;
  }) => Promise<void>;
  onEditPayment: (payment: Payment) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [description, setDescription] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const invoiceTotal = parent.invoiceTotal ?? parent.amount;
  const paidTotal = installments.reduce((s, i) => s + i.amount, 0);
  const remaining = invoiceTotal - paidTotal;
  const percent = invoiceTotal > 0 ? (paidTotal / invoiceTotal) * 100 : 0;
  const t = paymentTypeLabel(parent.type);

  return (
    <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/10">
      {/* Header row: invoice summary */}
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-amber-50/60 dark:hover:bg-amber-950/20"
        onClick={() => setExpanded(!expanded)}
      >
        <FileText className="h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">
              {parent.budgetItem?.subcategory || parent.budgetItem?.category}
            </span>
            <Badge variant="outline" className="text-[10px]">
              <Layers className="mr-1 h-2.5 w-2.5" /> Faktura ve splátkách
            </Badge>
            {parent.invoiceNumber && (
              <Badge variant="secondary" className="text-[10px]">
                {parent.invoiceNumber}
              </Badge>
            )}
            {parent.vendor && (
              <span className="text-[11px] text-muted-foreground">{parent.vendor}</span>
            )}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {parent.budgetItem?.category} · {t.emoji} {t.label} · vystavena {formatDate(parent.date)}
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground">Zaplaceno</div>
            <div className="font-bold text-emerald-600">{formatCzk(paidTotal)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground">Faktura</div>
            <div className="font-bold">{formatCzk(invoiceTotal)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground">Zbývá</div>
            <div className={cn("font-bold", remaining > 0 ? "text-amber-600" : "text-emerald-600")}>
              {formatCzk(remaining)}
            </div>
          </div>
          <div className="w-24">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  percent >= 100 ? "bg-emerald-500" : percent >= 50 ? "bg-amber-500" : "bg-sky-500",
                )}
                style={{ width: `${Math.min(percent, 100)}%` }}
              />
            </div>
            <div className="mt-0.5 text-center text-[10px] text-muted-foreground">
              {percent.toFixed(0)} %
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t bg-card">
          {/* Installments list */}
          <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-32">Datum splátky</TableHead>
                  <TableHead className="min-w-[160px]">Popis</TableHead>
                  <TableHead>Kontakt</TableHead>
                  <TableHead className="text-right">Částka</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {installments.map((inst, i) => (
                  <TableRow
                    key={inst.id}
                    className="group cursor-pointer hover:bg-muted/30"
                    onClick={() => onEditPayment(inst)}
                  >
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-[9px] font-bold text-amber-700">
                        {i + 1}
                      </span>
                      {formatDate(inst.date)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {inst.description || "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {inst.contact?.name || "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold text-amber-600">
                      {formatCzk(inst.amount)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEditPayment(inst)}>
                            <Pencil className="mr-2 h-3.5 w-3.5" /> Upravit splátku
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setConfirmDelete(inst.id)}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Smazat splátku
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {installments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-4 text-center text-xs text-muted-foreground">
                      Zatím žádné splátky. Přidejte první splátku níže.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

          {/* Add installment form */}
          <div className="border-t bg-muted/20 px-4 py-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor={`amt-${parent.id}`} className="text-[11px]">Částka (Kč) *</Label>
                <Input
                  id={`amt-${parent.id}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={remaining > 0 ? String(remaining) : "0"}
                  className="h-8 w-32 text-sm"
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`dt-${parent.id}`} className="text-[11px]">Datum *</Label>
                <Input
                  id={`dt-${parent.id}`}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-8 w-36 text-sm"
                />
              </div>
              <div className="space-y-1 flex-1 min-w-[160px]">
                <Label htmlFor={`ds-${parent.id}`} className="text-[11px]">Popis</Label>
                <Input
                  id={`ds-${parent.id}`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="např. 1. záloha"
                  className="h-8 text-sm"
                />
              </div>
              <Button
                size="sm"
                className="h-8"
                disabled={!amount || Number(amount.replace(",", ".")) <= 0 || submitting}
                onClick={async () => {
                  const amt = Number(amount.replace(",", "."));
                  if (!amt || amt <= 0) {
                    toast.error("Zadejte platnou částku");
                    return;
                  }
                  setSubmitting(true);
                  try {
                    await onAddInstallment({
                      budgetItemId: parent.budgetItemId,
                      amount: amt,
                      installmentOf: parent.id,
                      date,
                      type: parent.type,
                      description: description || undefined,
                    });
                    setAmount("");
                    setDescription("");
                    setDate(new Date().toISOString().substring(0, 10));
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                {submitting && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                <Plus className="mr-1 h-3.5 w-3.5" /> Přidat splátku
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Smazat splátku?</DialogTitle>
            <DialogDescription>
              Opravdu chcete smazat tuto splátku?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Zrušit</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmDelete) onDeletePayment(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              Smazat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== Standalone payment row =====
function PaymentRow({
  payment,
  onEdit,
  onDelete,
}: {
  payment: Payment;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const t = paymentTypeLabel(payment.type);

  return (
    <TableRow
      className="group cursor-pointer hover:bg-muted/30"
      onClick={() => onEdit()}
    >
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {formatDate(payment.date)}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[10px]">
          {t.emoji} {t.label}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
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
          <span className="text-xs">{payment.description || "—"}</span>
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
  const { open, onOpenChange, payment } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {open && (
          <PaymentDialogInner
            key={payment?.id ?? "new"}
            {...props}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialogInner({
  projectId,
  budgetItems,
  contacts,
  createPayment,
  updatePayment,
  updateBudgetItem,
  payment,
  onClose,
  onOpenChange,
}: Omit<PaymentDialogProps, "open">) {
  const isEdit = !!payment;
  const isInstallment = !!payment?.installmentOf;
  const today = new Date().toISOString().substring(0, 10);

  const [budgetItemId, setBudgetItemId] = useState(payment?.budgetItemId ?? "");
  const [contactId, setContactId] = useState(payment?.contactId ?? "");
  const [amount, setAmount] = useState(payment ? String(payment.amount ?? "") : "");
  const [date, setDate] = useState(toDateStr(payment?.date) || today);
  const [type, setType] = useState(payment?.type ?? "receipt");
  const [vendor, setVendor] = useState(payment?.vendor ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(payment?.invoiceNumber ?? "");
  const [description, setDescription] = useState(payment?.description ?? "");
  const [vatRate, setVatRate] = useState(
    payment?.vatRate !== null && payment?.vatRate !== undefined ? String(payment.vatRate) : "",
  );
  // Installment mode (create-only)
  const [isInvoice, setIsInvoice] = useState(false);
  const [invoiceTotal, setInvoiceTotal] = useState("");
  const [markCompleted, setMarkCompleted] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!budgetItemId) {
      toast.error("Vyberte položku rozpočtu");
      return;
    }
    const amt = Number(amount.replace(",", "."));
    if (!amt || amt <= 0) {
      toast.error("Zadejte platnou částku");
      return;
    }

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
        if (!inv || inv <= 0) {
          toast.error("Zadejte platnou celkovou částku faktury");
          return;
        }
        // 1. Create parent invoice with amount=0 (just the expected total)
        const parentRes = await fetch(`/api/projects/${projectId}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            budgetItemId,
            contactId: contactId || null,
            amount: 0,
            invoiceTotal: inv,
            installmentOf: null,
            date,
            type,
            vendor,
            invoiceNumber,
            description,
          }),
        });
        if (!parentRes.ok) throw new Error("Failed to create invoice");
        const parent = await parentRes.json();
        // 2. Create the first installment as a child
        if (amt > 0) {
          await createPayment.mutateAsync({
            budgetItemId,
            contactId: contactId || null,
            amount: amt,
            installmentOf: parent.id,
            date,
            type,
            description: "1. splátka",
          });
        }
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

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEdit
            ? isInstallment
              ? "Upravit splátku"
              : "Upravit platbu"
            : "Nová platba"}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Upravte údaje o platbě. Změny se propíší do statistik položky rozpočtu."
            : "Zaznamenejte platbu - účtenku, fakturu nebo výplatu za práci."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="budgetItem">Položka rozpočtu *</Label>
          <Select value={budgetItemId} onValueChange={setBudgetItemId}>
            <SelectTrigger id="budgetItem">
              <SelectValue placeholder="Vyberte položku…" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {budgetItems.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.category}
                  {b.subcategory ? ` / ${b.subcategory}` : ""}
                  {b.completed ? " ✓" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                onChange={(e) => setInvoiceTotal(e.target.value)}
                placeholder="150000"
                inputMode="decimal"
              />
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
                onChange={(e) => setAmount(e.target.value)}
                placeholder="25000"
                inputMode="decimal"
              />
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
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger id="contact">
                <SelectValue placeholder="Bez kontaktu" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        <div className="space-y-2">
          <Label htmlFor="description">Popis</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Co bylo koupeno / zaplaceno…"
            rows={2}
          />
        </div>

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

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit
              ? "Uložit změny"
              : isInvoice
                ? "Vytvořit fakturu"
                : "Přidat platbu"}
            {markCompleted && !isPending && (
              <CheckCircle2 className="ml-1.5 h-4 w-4 text-amber-500" />
            )}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
