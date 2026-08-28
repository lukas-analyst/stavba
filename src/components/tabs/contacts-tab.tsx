"use client";

import { useState } from "react";
import {
  useContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  useContactStats,
  useExportCsv,
  type Contact,
  type ContactStat,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Pencil,
  Trash2,
  MoreHorizontal,
  Phone,
  Mail,
  Building2,
  Globe,
  Star,
  Users,
  Loader2,
  TrendingUp,
  Clock,
  Download,
  ExternalLink,
  Wallet,
  Clock3,
  PackageCheck,
  CalendarClock,
} from "lucide-react";
import {
  CONTACT_TYPES,
  contactTypeLabel,
  formatCzk,
  formatNumber,
  formatDate,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EmptyStateBox } from "@/components/empty-state-box";

export function ContactsTab({ projectId }: { projectId: string }) {
  const { data: contacts, isLoading } = useContacts(projectId);
  const { data: statsData } = useContactStats(projectId);
  const createContact = useCreateContact(projectId);
  const exportCsv = useExportCsv(projectId);
  const [addOpen, setAddOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [detailContact, setDetailContact] = useState<Contact | null>(null);

  // Build a lookup of contactId → stat for quick access in cards
  const statsByContactId = new Map<string, ContactStat>();
  if (statsData) {
    for (const s of statsData.contactStats) {
      statsByContactId.set(s.contactId, s);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {contacts?.length ?? 0} kontaktů v projektu
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={exportCsv.isPending || (contacts?.length ?? 0) === 0}
            onClick={async () => {
              try {
                await exportCsv.mutateAsync("contacts");
                toast.success("Kontakty exportovány do CSV");
              } catch {
                toast.error("Export selhal");
              }
            }}
            title="Exportovat do CSV (Excel/Google Sheets)"
          >
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Přidat kontakt
          </Button>
        </div>
      </div>

      {/* Leaderboard: top contributors */}
      {statsData && statsData.contactStats.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card className="border-amber-200/60 dark:border-amber-900/40">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-amber-600" />
                <CardTitle className="text-sm">Největší náklady (celkem zaplaceno)</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {statsData.contactStats
                .filter((s) => s.totalPaid > 0)
                .slice(0, 4)
                .map((s, i) => {
                  const t = contactTypeLabel(s.type);
                  return (
                    <div key={s.contactId} className="flex items-center gap-2 text-xs">
                      <span className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                        i === 0 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground",
                      )}>
                        {i + 1}
                      </span>
                      <span className="text-base">{t.emoji}</span>
                      <span className="flex-1 truncate font-medium">{s.name}</span>
                      <span className="font-bold text-amber-600 tabular-nums">
                        {formatCzk(s.totalPaid)}
                      </span>
                    </div>
                  );
                })}
              {statsData.contactStats.filter((s) => s.totalPaid > 0).length === 0 && (
                <p className="text-xs text-muted-foreground">Zatím žádné platby přiřazené kontaktům</p>
              )}
            </CardContent>
          </Card>
          <Card className="border-violet-200/60 dark:border-violet-900/40">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-violet-600" />
                <CardTitle className="text-sm">Nejvíce odpracováno (hodiny)</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {statsData.workerStats
                .filter((w) => w.hours > 0)
                .slice(0, 4)
                .map((w, i) => {
                  const t = contactTypeLabel(w.type);
                  return (
                    <div key={w.name} className="flex items-center gap-2 text-xs">
                      <span className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                        i === 0 ? "bg-violet-100 text-violet-700" : "bg-muted text-muted-foreground",
                      )}>
                        {i + 1}
                      </span>
                      <span className="text-base">{t.emoji}</span>
                      <span className="flex-1 truncate font-medium">{w.name}</span>
                      <span className="font-bold text-violet-600 tabular-nums">
                        {formatNumber(w.hours, " h")}
                      </span>
                    </div>
                  );
                })}
              {statsData.workerStats.filter((w) => w.hours > 0).length === 0 && (
                <p className="text-xs text-muted-foreground">Zatím žádné časové záznamy</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : contacts?.length === 0 ? (
        <EmptyStateBox
          icon={Users}
          title="Zatím žádné kontakty"
          description="Přidejte firmy, řemeslníky, dodavatele a architekty. Můžete jim přiřazovat platby a časové záznamy."
          action={
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Přidat první kontakt
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {contacts?.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              projectId={projectId}
              stat={statsByContactId.get(c.id)}
              onEdit={() => setEditContact(c)}
              onOpenDetail={() => setDetailContact(c)}
              onDelete={(deletedId) => {
                // Close any open dialogs that reference the deleted contact
                // before React Query refetches and removes the card from the
                // DOM. Otherwise the detail/edit dialog would render with a
                // stale `contact` reference and could crash.
                if (detailContact?.id === deletedId) {
                  setDetailContact(null);
                }
                if (editContact?.id === deletedId) {
                  setEditContact(null);
                }
              }}
            />
          ))}
        </div>
      )}

      <ContactDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
        createContact={createContact}
      />
      <ContactDialog
        open={!!editContact}
        onOpenChange={(o) => !o && setEditContact(null)}
        projectId={projectId}
        contact={editContact}
      />
      <ContactDetailDialog
        contact={detailContact}
        stat={detailContact ? statsByContactId.get(detailContact.id) ?? null : null}
        open={!!detailContact}
        onOpenChange={(o) => !o && setDetailContact(null)}
        onEdit={() => {
          if (detailContact) {
            setEditContact(detailContact);
            setDetailContact(null);
          }
        }}
      />
    </div>
  );
}

/**
 * Normalize a website input into a full URL.
 * Accepts "www.firma.cz", "firma.cz", or "https://firma.cz".
 */
function normalizeWebsite(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function ContactCard({
  contact,
  projectId,
  stat,
  onEdit,
  onOpenDetail,
  onDelete,
}: {
  contact: Contact;
  projectId: string;
  stat?: ContactStat;
  onEdit: () => void;
  onOpenDetail: () => void;
  onDelete?: (deletedId: string) => void;
}) {
  const deleteContact = useDeleteContact(projectId);
  const [confirm, setConfirm] = useState(false);
  const t = contactTypeLabel(contact.type);

  const hasStats =
    stat && (stat.totalPaid > 0 || stat.totalHours > 0 || stat.paymentCount > 0 || stat.timeEntryCount > 0);

  return (
    <Card
      className="group relative cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
      onClick={onOpenDetail}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg text-lg",
                "bg-muted",
              )}
            >
              {t.emoji}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold">{contact.name}</h3>
              <Badge variant="outline" className="mt-0.5 text-[10px]">
                {t.label}
              </Badge>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" /> Upravit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirm(true);
                }}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Smazat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {contact.role && (
          <p className="text-xs font-medium text-muted-foreground">{contact.role}</p>
        )}
        {contact.company && (
          <div className="flex items-center gap-1.5 text-xs">
            <Building2 className="h-3 w-3 text-muted-foreground" />
            <span className="truncate">{contact.company}</span>
          </div>
        )}
        {contact.phone && (
          <a
            href={`tel:${contact.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs hover:text-primary"
          >
            <Phone className="h-3 w-3 text-muted-foreground" />
            <span>{contact.phone}</span>
          </a>
        )}
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs hover:text-primary"
          >
            <Mail className="h-3 w-3 text-muted-foreground" />
            <span className="truncate">{contact.email}</span>
          </a>
        )}
        {contact.website && (
          <a
            href={normalizeWebsite(contact.website) ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs hover:text-primary"
          >
            <Globe className="h-3 w-3 text-muted-foreground" />
            <span className="truncate">{contact.website}</span>
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/60" />
          </a>
        )}
        {contact.notes && (
          <p className="border-t pt-2 text-[11px] text-muted-foreground">{contact.notes}</p>
        )}
      </CardContent>
      {(hasStats || contact.rating) && (
        <CardFooter className="flex flex-col items-stretch gap-2 pt-0">
          {hasStats && (
            <div className="grid grid-cols-2 gap-2 border-t pt-2">
              <StatPill
                icon={<Wallet className="h-3 w-3" />}
                label="Zaplaceno"
                value={stat!.totalPaid > 0 ? formatCzk(stat!.totalPaid) : "—"}
                tone="amber"
              />
              <StatPill
                icon={<Clock3 className="h-3 w-3" />}
                label="Hodiny"
                value={stat!.totalHours > 0 ? formatNumber(stat!.totalHours, " h") : "—"}
                tone="violet"
              />
              <StatPill
                icon={<PackageCheck className="h-3 w-3" />}
                label="Plateb"
                value={stat!.paymentCount > 0 ? String(stat!.paymentCount) : "—"}
                tone="amber"
              />
              <StatPill
                icon={<Clock3 className="h-3 w-3" />}
                label="Časů"
                value={stat!.timeEntryCount > 0 ? String(stat!.timeEntryCount) : "—"}
                tone="violet"
              />
            </div>
          )}
          {!hasStats && contact.rating && <div className="border-t" />}
          {contact.rating && (
            <div className="flex items-center justify-end gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={cn(
                    "h-3 w-3",
                    s <= contact.rating!
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/30",
                  )}
                />
              ))}
            </div>
          )}
        </CardFooter>
      )}

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Smazat kontakt?</DialogTitle>
            <DialogDescription>
              Opravdu chcete smazat kontakt <strong>{contact.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Zrušit
            </Button>
            <Button
              variant="destructive"
              disabled={deleteContact.isPending}
              onClick={async () => {
                try {
                  // Close any open dialogs that reference this contact
                  // BEFORE the mutation fires, so the React Query
                  // invalidation (which removes the card from the DOM)
                  // does not race with the dialog rendering a stale
                  // contact reference.
                  onDelete?.(contact.id);
                  await deleteContact.mutateAsync(contact.id);
                  toast.success("Kontakt smazán");
                  setConfirm(false);
                } catch {
                  toast.error("Nepodařilo se smazat");
                }
              }}
            >
              {deleteContact.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Smazat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function StatPill({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "amber" | "violet";
}) {
  const toneClasses =
    tone === "amber"
      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
      : "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300";
  return (
    <div className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px]", toneClasses)}>
      {icon}
      <span className="text-muted-foreground/80">{label}:</span>
      <span className="ml-auto font-bold tabular-nums">{value}</span>
    </div>
  );
}

function ContactDetailDialog({
  contact,
  stat,
  open,
  onOpenChange,
  onEdit,
}: {
  contact: Contact | null;
  stat: ContactStat | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}) {
  if (!contact) return null;
  const t = contactTypeLabel(contact.type);
  const totalItems = stat?.budgetItems?.length ?? 0;
  const lastActivity = stat?.lastActivity;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden p-0">
        <div className="flex max-h-[90vh] flex-col">
          {/* Header */}
          <DialogHeader className="border-b px-6 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-xl">
                {t.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-lg">{contact.name}</DialogTitle>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{t.label}</Badge>
                  {contact.role && (
                    <span className="text-xs text-muted-foreground">{contact.role}</span>
                  )}
                  {contact.rating && (
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={cn(
                            "h-3 w-3",
                            s <= contact.rating!
                              ? "fill-amber-400 text-amber-400"
                              : "text-muted-foreground/30",
                          )}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Upravit
              </Button>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1">
            <div className="space-y-5 px-6 py-5">
              {/* Kontakt info */}
              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Kontakt
                </h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {contact.company && (
                    <DetailRow icon={<Building2 className="h-3.5 w-3.5" />} label="Firma" value={contact.company} />
                  )}
                  {contact.phone && (
                    <DetailRow
                      icon={<Phone className="h-3.5 w-3.5" />}
                      label="Telefon"
                      value={contact.phone}
                      href={`tel:${contact.phone}`}
                    />
                  )}
                  {contact.email && (
                    <DetailRow
                      icon={<Mail className="h-3.5 w-3.5" />}
                      label="E-mail"
                      value={contact.email}
                      href={`mailto:${contact.email}`}
                    />
                  )}
                  {contact.website && (
                    <DetailRow
                      icon={<Globe className="h-3.5 w-3.5" />}
                      label="Web"
                      value={contact.website}
                      href={normalizeWebsite(contact.website) ?? "#"}
                      external
                    />
                  )}
                  {lastActivity && (
                    <DetailRow
                      icon={<CalendarClock className="h-3.5 w-3.5" />}
                      label="Poslední aktivita"
                      value={formatDate(lastActivity)}
                    />
                  )}
                </div>
                {contact.notes && (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    {contact.notes}
                  </div>
                )}
              </section>

              <Separator />

              {/* Souhrn času a financí */}
              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Souhrn času a financí
                </h4>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <DetailStat
                    icon={<Wallet className="h-4 w-4" />}
                    label="Celkem zaplaceno"
                    value={stat ? formatCzk(stat.totalPaid) : "—"}
                    tone="amber"
                  />
                  <DetailStat
                    icon={<Clock3 className="h-4 w-4" />}
                    label="Celkem hodin"
                    value={stat ? formatNumber(stat.totalHours, " h") : "—"}
                    tone="violet"
                  />
                  <DetailStat
                    icon={<PackageCheck className="h-4 w-4" />}
                    label="Počet plateb"
                    value={stat ? String(stat.paymentCount) : "—"}
                    tone="amber"
                  />
                  <DetailStat
                    icon={<Clock3 className="h-4 w-4" />}
                    label="Časových záznamů"
                    value={stat ? String(stat.timeEntryCount) : "—"}
                    tone="violet"
                  />
                </div>
              </section>

              <Separator />

              {/* Položky rozpočtu na kterých kontakt pracoval */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Položky rozpočtu
                  </h4>
                  <Badge variant="secondary" className="text-[10px]">
                    {totalItems} {totalItems === 1 ? "položka" : totalItems >= 2 && totalItems <= 4 ? "položky" : "položek"}
                  </Badge>
                </div>
                {stat && stat.budgetItems.length > 0 ? (
                  <div className="overflow-hidden rounded-md border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Kategorie / Prvek</th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Fáze</th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Kč</th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Hodiny</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stat.budgetItems.map((bi) => (
                          <tr key={bi.budgetItemId} className="border-t">
                            <td className="px-2 py-1.5">
                              <div className="font-medium">{bi.category}</div>
                              {bi.subcategory && (
                                <div className="text-[10px] text-muted-foreground">{bi.subcategory}</div>
                              )}
                              {bi.element && (
                                <div className="text-[10px] text-muted-foreground">{bi.element}</div>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <Badge variant="outline" className="text-[10px]">{bi.phase}</Badge>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                              {bi.amount > 0 ? formatCzk(bi.amount) : "—"}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-violet-700 dark:text-violet-400">
                              {bi.hours > 0 ? formatNumber(bi.hours, " h") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
                    Kontakt zatím nepracoval na žádné položce rozpočtu.
                  </div>
                )}
              </section>
            </div>
          </ScrollArea>

          <DialogFooter className="border-t px-6 py-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Zavřít
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  icon,
  label,
  value,
  href,
  external,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
  external?: boolean;
}) {
  const content = (
    <div className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate text-xs font-medium">{value}</div>
      </div>
      {external && <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/60" />}
    </div>
  );
  if (!href) return content;
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="block hover:opacity-80"
    >
      {content}
    </a>
  );
}

function DetailStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "amber" | "violet";
}) {
  const toneClasses =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
      : "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300";
  return (
    <div className={cn("rounded-md border px-3 py-2", toneClasses)}>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wide opacity-80">{label}</span>
      </div>
      <div className="mt-1 text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}

function ContactDialog({
  open,
  onOpenChange,
  projectId,
  contact,
  createContact,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  contact?: Contact | null;
  createContact?: ReturnType<typeof useCreateContact>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {open && (
          <ContactForm
            key={contact?.id ?? "new"}
            projectId={projectId}
            contact={contact}
            createContact={createContact}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ContactForm({
  projectId,
  contact,
  createContact,
  onDone,
}: {
  projectId: string;
  contact?: Contact | null;
  createContact?: ReturnType<typeof useCreateContact>;
  onDone: () => void;
}) {
  const updateContact = useUpdateContact(projectId);
  const [name, setName] = useState(contact?.name ?? "");
  const [type, setType] = useState(contact?.type ?? "company");
  const [role, setRole] = useState(contact?.role ?? "");
  const [company, setCompany] = useState(contact?.company ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [website, setWebsite] = useState(contact?.website ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [rating, setRating] = useState<number | null>(contact?.rating ?? null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Jméno je povinné");
      return;
    }
    try {
      const data = {
        name,
        type,
        role,
        company,
        phone,
        email,
        website,
        notes,
        rating,
      };
      if (contact) {
        await updateContact.mutateAsync({ id: contact.id, data });
        toast.success("Kontakt upraven");
      } else if (createContact) {
        await createContact.mutateAsync(data);
        toast.success("Kontakt přidán");
      }
      onDone();
    } catch {
      toast.error("Nepodařilo se uložit kontakt");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{contact ? "Upravit kontakt" : "Nový kontakt"}</DialogTitle>
        <DialogDescription>
          Firma, řemeslník, dodavatel, architekt nebo svépomoc.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="name">Jméno / Název *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="např. Pavel Novák"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Typ</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.emoji} {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="role">Role / Obor</Label>
              <Input
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="např. Zedník, Elektrikář"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Firma (volitelné)</Label>
              <Input
                id="company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="např. Stavby s.r.o."
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefon</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+420 …"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@domena.cz"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Web</Label>
            <div className="relative">
              <Globe className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="např. www.firma.cz"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Hodnocení</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRating(rating === s ? null : s)}
                  className="p-1"
                >
                  <Star
                    className={cn(
                      "h-5 w-5 transition-colors",
                      rating && s <= rating
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/40 hover:text-amber-300",
                    )}
                  />
                </button>
              ))}
              {rating && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-2 h-6 text-xs"
                  onClick={() => setRating(null)}
                >
                  Zrušit
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Poznámky</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Zkušenosti, reference, postup práce…"
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDone}>
              Zrušit
            </Button>
            <Button
              type="submit"
              disabled={createContact?.isPending || updateContact.isPending}
            >
              {(createContact?.isPending || updateContact.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {contact ? "Uložit" : "Přidat kontakt"}
            </Button>
          </DialogFooter>
        </form>
      </>
  );
}
