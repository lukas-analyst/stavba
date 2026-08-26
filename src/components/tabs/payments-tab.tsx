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
import {
  Plus,
  Trash2,
  MoreHorizontal,
  Search,
  Receipt,
  Loader2,
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

  const filtered = useMemo(() => {
    return (payments ?? []).filter((p) => {
      if (typeFilter !== "all" && p.type !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const text = `${p.description ?? ""} ${p.vendor ?? ""} ${p.budgetItem?.category ?? ""} ${p.budgetItem?.subcategory ?? ""} ${p.contact?.name ?? ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [payments, search, typeFilter]);

  const totalAmount = filtered.reduce((s, p) => s + p.amount, 0);

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
            <div className="text-xs text-muted-foreground">Součet ({filtered.length})</div>
            <div className="text-lg font-bold text-amber-600">{formatCzk(totalAmount)}</div>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Přidat platbu
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-96" />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          <Receipt className="mx-auto mb-2 h-8 w-8 opacity-40" />
          {payments?.length === 0
            ? 'Zatím nebyly zaznamenány žádné platby. Klikněte na „Přidat platbu".'
            : "Žádné platby neodpovídají filtru."}
        </div>
      ) : (
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
              {filtered.map((p) => (
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
      toast.success("Platba přidána");
      // reset
      setBudgetItemId("");
      setContactId("");
      setAmount("");
      setVendor("");
      setInvoiceNumber("");
      setDescription("");
      setType("receipt");
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="amount">Částka (Kč) *</Label>
              <Input
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="25000"
                inputMode="decimal"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Datum *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>
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
              Přidat platbu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
