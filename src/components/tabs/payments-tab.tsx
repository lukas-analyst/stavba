"use client";

import { useState, useMemo } from "react";
import {
  usePayments,
  useBudgetItems,
  useContacts,
  useCreatePayment,
  useDeletePayment,
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
  MoreHorizontal,
  Search,
  Receipt,
  Loader2,
  FileText,
  Layers,
  CircleDollarSign,
} from "lucide-react";
import { formatCzk, formatDate, PAYMENT_TYPES, paymentTypeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function PaymentsTab({ projectId }: { projectId: string }) {
  const { data: payments, isLoading } = usePayments(projectId);
  const { data: budgetItems } = useBudgetItems(projectId);
  const { data: contacts } = useContacts(projectId);
  const createPayment = useCreatePayment(projectId);
  const deletePayment = useDeletePayment(projectId);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

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
        const children = (childrenByParent.get(p.id) ?? []).sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
        groups.push({ parent: p, installments: children });
      } else if (!p.installmentOf) {
        standalone.push(p);
      }
    }
    // sort
    standalone.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    groups.sort(
      (a, b) => new Date(b.parent.date).getTime() - new Date(a.parent.date).getTime(),
    );
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
  const filteredStandalone = standalone.filter(filterFn);
  const filteredGroups = groups.filter((g) => filterFn(g.parent));

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
        <div className="ml-auto flex items-center gap-3 text-sm">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">
              Součet ({filteredStandalone.length + filteredGroups.length})
            </div>
            <div className="text-lg font-bold text-amber-600">{formatCzk(totalAmount)}</div>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Přidat platbu
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-96" />
      ) : filteredStandalone.length === 0 && filteredGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          <Receipt className="mx-auto mb-2 h-8 w-8 opacity-40" />
          {payments?.length === 0
            ? 'Zatím nebyly zaznamenány žádné platby. Klikněte na „Přidat platbu".'
            : "Žádné platby neodpovídají filtru."}
        </div>
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
          <div className="overflow-x-auto">
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
                  <TableRow key={inst.id} className="group">
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
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
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
          </div>

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
  onDelete,
}: {
  payment: Payment;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const t = paymentTypeLabel(payment.type);

  return (
    <TableRow className="group">
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
      <TableCell className="text-right text-sm font-semibold text-amber-600">
        {formatCzk(payment.amount)}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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

// ===== Payment creation dialog =====
function PaymentDialog({
  open,
  onOpenChange,
  projectId,
  budgetItems,
  contacts,
  createPayment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  budgetItems: { id: string; category: string; subcategory: string | null }[];
  contacts: { id: string; name: string; type: string }[];
  createPayment: ReturnType<typeof useCreatePayment>;
}) {
  const [budgetItemId, setBudgetItemId] = useState("");
  const [contactId, setContactId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [type, setType] = useState("receipt");
  const [vendor, setVendor] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [description, setDescription] = useState("");
  // Installment mode
  const [isInvoice, setIsInvoice] = useState(false);
  const [invoiceTotal, setInvoiceTotal] = useState("");

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
    if (isInvoice) {
      const inv = Number(invoiceTotal.replace(",", "."));
      if (!inv || inv <= 0) {
        toast.error("Zadejte platnou celkovou částku faktury");
        return;
      }
    }
    try {
      if (isInvoice) {
        // Create the parent invoice record (amount = first installment,
        // invoiceTotal = the full expected). If first installment < invoiceTotal,
        // the parent represents the invoice and this first payment is recorded
        // as the first installment (child).
        const inv = Number(invoiceTotal.replace(",", "."));
        // 1. Create parent invoice with amount=0 (just the expected total)
        const parentRes = await fetch(`/api/projects/${projectId}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            budgetItemId,
            contactId: contactId || null,
            amount: 0, // parent holds invoiceTotal, not a paid amount
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
      } else {
        await createPayment.mutateAsync({
          budgetItemId,
          contactId: contactId || null,
          amount: amt,
          date,
          type,
          vendor,
          invoiceNumber,
          description,
        });
      }
      toast.success(isInvoice ? "Faktura se splátkami vytvořena" : "Platba přidána");
      setBudgetItemId("");
      setContactId("");
      setAmount("");
      setVendor("");
      setInvoiceNumber("");
      setDescription("");
      setType("receipt");
      setIsInvoice(false);
      setInvoiceTotal("");
      onOpenChange(false);
    } catch {
      toast.error("Nepodařilo se přidat platbu");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setBudgetItemId("");
          setContactId("");
          setAmount("");
          setVendor("");
          setInvoiceNumber("");
          setDescription("");
          setType("receipt");
          setIsInvoice(false);
          setInvoiceTotal("");
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nová platba</DialogTitle>
          <DialogDescription>
            Zaznamenejte platbu - účtenku, fakturu nebo výplatu za práci.
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
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Installment toggle */}
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

          {isInvoice ? (
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

          {isInvoice && (
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Zrušit
            </Button>
            <Button type="submit" disabled={createPayment.isPending}>
              {createPayment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isInvoice ? "Vytvořit fakturu" : "Přidat platbu"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
