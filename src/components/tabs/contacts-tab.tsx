"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  useContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  useContactStats,
  useCreateContactPerson,
  useDeleteContactPerson,
  type Contact,
  type ContactPerson,
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  ExternalLink,
  Wallet,
  Clock3,
  PackageCheck,
  CalendarClock,
  Search,
  Hash,
  ChevronDown,
} from "lucide-react";
import { AresSearch, type AresCompany } from "@/components/ares-search";
import {
  CONTACT_TYPES,
  formatCzk,
  formatNumber,
  formatDate,
} from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { getPhoneInfo } from "@/lib/phone";
import { toast } from "sonner";
import { EmptyStateBox } from "@/components/empty-state-box";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAnalytics } from "@/hooks/use-analytics";

export function ContactsTab({ projectId }: { projectId: string }) {
  const { data: contacts, isLoading } = useContacts(projectId);
  const { data: statsData } = useContactStats(projectId);
  const createContact = useCreateContact(projectId);
  const [addOpen, setAddOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [detailContact, setDetailContact] = useState<Contact | null>(null);
  const t = useTranslations("tabs.contacts");

  // Listen for FAB "add contact" trigger (mobile contextual FAB)
  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent<string>).detail;
      if (action === "add-contact") {
        setAddOpen(true);
      }
    };
    window.addEventListener("stavba:fab-add", handler);
    return () => window.removeEventListener("stavba:fab-add", handler);
  }, []);

  // Build a lookup of contactId → stat for quick access in cards
  const statsByContactId = new Map<string, ContactStat>();
  if (statsData) {
    for (const s of statsData.contactStats) {
      statsByContactId.set(s.contactId, s);
    }
  }

  return (
    <div id="contacts-root" className="space-y-4">
      <div id="contacts-header" className="flex items-center justify-between">
        <div className="flex items-center gap-2 type-body text-on-surface-variant">
          <Users className="h-4 w-4" />
          {t("header.count", { count: contacts?.length ?? 0 })}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : contacts?.length === 0 ? (
        <EmptyStateBox
          icon={Users}
          title={t("empty.title")}
          description={t("empty.description")}
          action={
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> {t("empty.button.first")}
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
        projectId={projectId}
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
  const t = useTranslations("tabs.contacts");
  const tContactTypes = useTranslations("contactTypes");
  const locale = useLocale() as Locale;
  const contactTypeInfo = CONTACT_TYPES.find((c) => c.value === contact.type);
  const contactTypeEmoji = contactTypeInfo?.emoji ?? "•";
  const contactTypeLabelStr = tContactTypes(contact.type);

  const hasStats =
    stat && (stat.totalPaid > 0 || stat.totalHours > 0 || stat.paymentCount > 0 || stat.timeEntryCount > 0);

  return (
    <Card
      // MD3 Card: tonal surface-container-low + outline-variant border + subtle shadow
      className="group relative cursor-pointer overflow-hidden border-outline-variant bg-card shadow-sm transition-shadow hover:shadow-md hover-lift"
      onClick={onOpenDetail}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2">
            {/* MD3 avatar: secondary-container tonal fill */}
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl text-lg",
                "bg-secondary-container text-secondary-container-foreground",
              )}
            >
              {contactTypeEmoji}
            </div>
            <div className="min-w-0">
              <h3 className="type-title truncate">{contact.name}</h3>
              <Badge variant="outline" className="mt-0.5 text-[10px]">
                {contactTypeLabelStr}
              </Badge>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full state-layer-on-surface opacity-0 group-hover:opacity-100"
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
                <Pencil className="mr-2 h-3.5 w-3.5" /> {t("menu.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirm(true);
                }}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> {t("menu.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {contact.role && (
          <p className="type-label text-on-surface-variant">{contact.role}</p>
        )}
        {contact.company && (
          <div className="flex items-center gap-1.5 type-body">
            <Building2 className="h-3 w-3 text-muted-foreground" />
            <span className="truncate">{contact.company}</span>
          </div>
        )}
        {(contact.ico || contact.dic) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-on-surface-variant">
            {contact.ico && (
              <span className="tabular-nums">
                {t("detail.field.ico")}: <span className="font-medium text-foreground/80">{contact.ico}</span>
              </span>
            )}
            {contact.dic && (
              <span className="tabular-nums">
                {t("detail.field.dic")}: <span className="font-medium text-foreground/80">{contact.dic}</span>
              </span>
            )}
          </div>
        )}
        {contact.phone && (
          <a
            href={`tel:${contact.phone}`}
            onClick={(e) => e.stopPropagation()}
            // MD3 state layer on interactive communication rows
            className="flex items-center gap-1.5 rounded-lg px-1 py-0.5 type-body hover:bg-surface-container-high state-layer-on-surface"
            title={getPhoneInfo(contact.phone).countryName || undefined}
          >
            <Phone className="h-3 w-3 text-muted-foreground" />
            {getPhoneInfo(contact.phone).flag && (
              <span className="text-sm leading-none" aria-hidden>
                {getPhoneInfo(contact.phone).flag}
              </span>
            )}
            <span className="tabular-nums">{getPhoneInfo(contact.phone).formatted}</span>
          </a>
        )}
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 rounded-lg px-1 py-0.5 type-body hover:bg-surface-container-high state-layer-on-surface"
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
            className="flex items-center gap-1.5 rounded-lg px-1 py-0.5 type-body hover:bg-surface-container-high state-layer-on-surface"
          >
            <Globe className="h-3 w-3 text-muted-foreground" />
            <span className="truncate">{contact.website}</span>
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/60" />
          </a>
        )}
        {contact.notes && (
          // MD3 divider: outline-variant
          <p className="type-label border-t border-outline-variant pt-2 text-on-surface-variant">{contact.notes}</p>
        )}
      </CardContent>
      {(hasStats || contact.rating) && (
        <CardFooter className="flex flex-col items-stretch gap-2 pt-0">
          {hasStats && (
            // MD3 divider: outline-variant, neutral surface-container-high
            <div className="grid grid-cols-2 gap-2 border-t border-outline-variant pt-2">
              <StatPill
                icon={<Wallet className="h-3 w-3" />}
                label={t("stat.paid")}
                value={stat!.totalPaid > 0 ? formatCzk(stat!.totalPaid, locale) : "—"}
                tone="amber"
              />
              <StatPill
                icon={<Clock3 className="h-3 w-3" />}
                label={t("stat.hours")}
                value={stat!.totalHours > 0 ? formatNumber(stat!.totalHours, " h", locale) : "—"}
                tone="violet"
              />
              <StatPill
                icon={<PackageCheck className="h-3 w-3" />}
                label={t("stat.payments")}
                value={stat!.paymentCount > 0 ? String(stat!.paymentCount) : "—"}
                tone="amber"
              />
              <StatPill
                icon={<Clock3 className="h-3 w-3" />}
                label={t("stat.times")}
                value={stat!.timeEntryCount > 0 ? String(stat!.timeEntryCount) : "—"}
                tone="violet"
              />
            </div>
          )}
          {!hasStats && contact.rating && <div className="border-t border-outline-variant" />}
          {contact.rating && (
            // MD3 rating: primary selected, on-surface-variant unselected
            <div className="flex items-center justify-end gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={cn(
                    "h-3 w-3",
                    s <= contact.rating!
                      ? "fill-primary text-primary"
                      : "text-on-surface-variant/30",
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
            <DialogTitle>{t("delete.title")}</DialogTitle>
            <DialogDescription>
              {t.rich("delete.body", {
                name: contact.name,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              {t("delete.cancel")}
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
                  toast.success(t("toasts.deleteSuccess"));
                  setConfirm(false);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : t("toasts.deleteError"));
                }
              }}
            >
              {deleteContact.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("delete.confirm")}
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
  // MD3: neutral surface-container-high background, tone only in icon/text color
  const iconColor = tone === "amber" ? "text-warning" : "text-time";
  const valueColor = tone === "amber" ? "text-warning-strong dark:text-warning/80" : "text-time-strong dark:text-time/80";
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-surface-container-high px-2 py-1 type-label-sm">
      <span className={iconColor}>{icon}</span>
      <span className="text-on-surface-variant/80">{label}:</span>
      <span className={cn("ml-auto font-bold tabular-nums", valueColor)}>{value}</span>
    </div>
  );
}

// ============================================================
// ContactPersonsSection — manage 1:N persons for a contact
// ------------------------------------------------------------
// Displays a list of persons (firstName, lastName, phone, email, role)
// with inline add/edit/remove. Each person row has clickable
// phone/email links. Add form is a simple inline expandable.
// ============================================================
function ContactPersonsSection({
  projectId,
  contactId,
  persons,
}: {
  projectId: string;
  contactId: string;
  persons: ContactPerson[];
}) {
  const createPerson = useCreateContactPerson(projectId, contactId);
  const deletePerson = useDeleteContactPerson(projectId, contactId);
  const t = useTranslations("tabs.contacts");
  const tCommon = useTranslations("common");

  const [showAddForm, setShowAddForm] = useState(false);
  const [newPerson, setNewPerson] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    role: "",
  });

  const handleAdd = async () => {
    if (!newPerson.firstName.trim() || !newPerson.lastName.trim()) {
      toast.error(t("toasts.personAddError"));
      return;
    }
    try {
      await createPerson.mutateAsync({
        firstName: newPerson.firstName.trim(),
        lastName: newPerson.lastName.trim(),
        phone: newPerson.phone.trim() || undefined,
        email: newPerson.email.trim() || undefined,
        role: newPerson.role.trim() || undefined,
      });
      toast.success(t("toasts.personAddSuccess"));
      setNewPerson({ firstName: "", lastName: "", phone: "", email: "", role: "" });
      setShowAddForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.personAddErrorFallback"));
    }
  };

  const handleDelete = async (personId: string, name: string) => {
    try {
      await deletePerson.mutateAsync(personId);
      toast.success(t("toasts.personDeleteSuccess", { name }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.personDeleteError"));
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="type-overline text-on-surface-variant">
          {t("persons.title")}
          {persons.length > 0 && (
            <span className="ml-1.5 rounded bg-surface-container-high px-1.5 py-0.5 text-[9px] tabular-nums text-on-surface">
              {persons.length}
            </span>
          )}
        </h4>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 rounded-full px-2 text-xs"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus className="h-3 w-3" /> {showAddForm ? tCommon("cancel") : t("persons.button.add")}
        </Button>
      </div>

      {/* Add form (expandable) */}
      {showAddForm && (
        <div className="space-y-2 rounded-lg border border-outline-variant bg-surface-container-low p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="person-firstName" className="type-label-sm">{t("persons.field.firstName")}</Label>
              <Input
                id="person-firstName"
                value={newPerson.firstName}
                onChange={(e) => setNewPerson({ ...newPerson, firstName: e.target.value })}
                placeholder={t("persons.placeholder.firstName")}
                className="h-8"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="person-lastName" className="type-label-sm">{t("persons.field.lastName")}</Label>
              <Input
                id="person-lastName"
                value={newPerson.lastName}
                onChange={(e) => setNewPerson({ ...newPerson, lastName: e.target.value })}
                placeholder={t("persons.placeholder.lastName")}
                className="h-8"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="person-phone" className="type-label-sm">{t("persons.field.phone")}</Label>
              <Input
                id="person-phone"
                value={newPerson.phone}
                onChange={(e) => setNewPerson({ ...newPerson, phone: e.target.value })}
                placeholder={t("persons.placeholder.phone")}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="person-email" className="type-label-sm">{t("persons.field.email")}</Label>
              <Input
                id="person-email"
                value={newPerson.email}
                onChange={(e) => setNewPerson({ ...newPerson, email: e.target.value })}
                placeholder={t("persons.placeholder.email")}
                className="h-8"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="person-role" className="type-label-sm">{t("persons.field.role")}</Label>
            <Input
              id="person-role"
              value={newPerson.role}
              onChange={(e) => setNewPerson({ ...newPerson, role: e.target.value })}
              placeholder={t("persons.placeholder.role")}
              className="h-8"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setShowAddForm(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              size="sm"
              className="rounded-full"
              onClick={handleAdd}
              disabled={createPerson.isPending || !newPerson.firstName.trim() || !newPerson.lastName.trim()}
            >
              {createPerson.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {t("persons.button.addPerson")}
            </Button>
          </div>
        </div>
      )}

      {/* Persons list */}
      {persons.length > 0 ? (
        <div className="space-y-1.5">
          {persons.map((p) => {
            const phoneInfo = p.phone ? getPhoneInfo(p.phone) : null;
            return (
              <div
                key={p.id}
                className="group flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-2.5 py-2"
              >
                {/* Avatar initials */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary-container text-xs font-bold text-secondary-container-foreground">
                  {(p.firstName[0] ?? "") + (p.lastName[0] ?? "")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="type-body font-medium truncate">
                      {p.firstName} {p.lastName}
                    </span>
                    {p.role && (
                      <span className="type-label text-on-surface-variant truncate">· {p.role}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 type-label text-on-surface-variant">
                    {phoneInfo && (
                      <a
                        href={`tel:${p.phone}`}
                        className="flex items-center gap-1 hover:text-primary"
                        title={phoneInfo.countryName || undefined}
                      >
                        {phoneInfo.flag && <span aria-hidden>{phoneInfo.flag}</span>}
                        <span className="tabular-nums">{phoneInfo.formatted}</span>
                      </a>
                    )}
                    {p.email && (
                      <a
                        href={`mailto:${p.email}`}
                        className="flex items-center gap-1 truncate hover:text-primary"
                      >
                        <Mail className="h-2.5 w-2.5" />
                        <span className="truncate">{p.email}</span>
                      </a>
                    )}
                  </div>
                </div>
                {/* Delete button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 rounded-full state-layer-on-surface opacity-0 group-hover:opacity-100"
                  onClick={() => handleDelete(p.id, `${p.firstName} ${p.lastName}`)}
                  disabled={deletePerson.isPending}
                  aria-label={t("persons.aria.delete", { firstName: p.firstName, lastName: p.lastName })}
                  title={t("persons.title.delete")}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-danger" />
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        !showAddForm && (
          <div className="rounded-lg border border-dashed border-outline-variant px-3 py-4 text-center type-label text-on-surface-variant">
            {t("persons.empty")}
          </div>
        )
      )}
    </section>
  );
}

function ContactDetailDialog({
  projectId,
  contact,
  stat,
  open,
  onOpenChange,
  onEdit,
}: {
  projectId: string;
  contact: Contact | null;
  stat: ContactStat | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}) {
  const t = useTranslations("tabs.contacts");
  const tContactTypes = useTranslations("contactTypes");
  const locale = useLocale() as Locale;
  if (!contact) return null;
  const contactTypeInfo = CONTACT_TYPES.find((c) => c.value === contact.type);
  const contactTypeEmoji = contactTypeInfo?.emoji ?? "•";
  const contactTypeLabelStr = tContactTypes(contact.type);
  const lastActivity = stat?.lastActivity;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden p-0">
        <div className="flex max-h-[90vh] flex-col">
          {/* Header */}
          {/* pr-10 reserves space for the absolute-positioned close (X) button
              in the top-right corner so it never overlaps the "Upravit" button. */}
          <DialogHeader className="border-b px-6 py-4 pr-10">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-xl">
                {contactTypeEmoji}
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-lg">{contact.name}</DialogTitle>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{contactTypeLabelStr}</Badge>
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
                              ? "fill-warning text-warning"
                              : "text-muted-foreground/30",
                          )}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={onEdit} className="shrink-0">
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> {t("detail.button.edit")}
              </Button>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1">
            <div className="space-y-5 px-6 py-5">
              {/* Kontakt info */}
              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("detail.section.contact")}
                </h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {contact.company && (
                    <DetailRow icon={<Building2 className="h-3.5 w-3.5" />} label={t("detail.field.company")} value={contact.company} />
                  )}
                  {contact.ico && (
                    <DetailRow
                      icon={<Hash className="h-3.5 w-3.5" />}
                      label={t("detail.field.ico")}
                      value={contact.ico}
                    />
                  )}
                  {contact.dic && (
                    <DetailRow
                      icon={<Hash className="h-3.5 w-3.5" />}
                      label={t("detail.field.dic")}
                      value={contact.dic}
                    />
                  )}
                  {contact.phone && (
                    <DetailRow
                      icon={<Phone className="h-3.5 w-3.5" />}
                      label={t("detail.field.phone")}
                      value={
                        <span className="tabular-nums">
                          {getPhoneInfo(contact.phone).formatted}
                        </span>
                      }
                      prefix={getPhoneInfo(contact.phone).flag || undefined}
                      href={`tel:${contact.phone}`}
                    />
                  )}
                  {contact.email && (
                    <DetailRow
                      icon={<Mail className="h-3.5 w-3.5" />}
                      label={t("detail.field.email")}
                      value={contact.email}
                      href={`mailto:${contact.email}`}
                    />
                  )}
                  {contact.website && (
                    <DetailRow
                      icon={<Globe className="h-3.5 w-3.5" />}
                      label={t("detail.field.web")}
                      value={contact.website}
                      href={normalizeWebsite(contact.website) ?? "#"}
                      external
                    />
                  )}
                  {lastActivity && (
                    <DetailRow
                      icon={<CalendarClock className="h-3.5 w-3.5" />}
                      label={t("detail.field.lastActivity")}
                      value={formatDate(lastActivity, undefined, locale)}
                    />
                  )}
                </div>
                {contact.notes && (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    {contact.notes}
                  </div>
                )}
              </section>

              {/* Kontaktní osoby (1:N) */}
              <ContactPersonsSection projectId={projectId} contactId={contact.id} persons={contact.persons ?? []} />

              <Separator />

              {/* Souhrn času a financí */}
              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("detail.section.summary")}
                </h4>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <DetailStat
                    icon={<Wallet className="h-4 w-4" />}
                    label={t("detail.stat.totalPaid")}
                    value={stat ? formatCzk(stat.totalPaid, locale) : "—"}
                    tone="amber"
                  />
                  <DetailStat
                    icon={<Clock3 className="h-4 w-4" />}
                    label={t("detail.stat.totalHours")}
                    value={stat ? formatNumber(stat.totalHours, " h", locale) : "—"}
                    tone="violet"
                  />
                  <DetailStat
                    icon={<PackageCheck className="h-4 w-4" />}
                    label={t("detail.stat.paymentCount")}
                    value={stat ? String(stat.paymentCount) : "—"}
                    tone="amber"
                  />
                  <DetailStat
                    icon={<Clock3 className="h-4 w-4" />}
                    label={t("detail.stat.timeEntryCount")}
                    value={stat ? String(stat.timeEntryCount) : "—"}
                    tone="violet"
                  />
                </div>
              </section>
            </div>
          </ScrollArea>

          <DialogFooter className="border-t px-6 py-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("detail.button.close")}
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
  prefix,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  href?: string;
  external?: boolean;
  prefix?: React.ReactNode;
}) {
  const content = (
    <div className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate text-xs font-medium">
          {prefix && <span className="mr-1" aria-hidden>{prefix}</span>}
          {value}
        </div>
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
      ? "border-warning/30 bg-warning-soft/50 text-warning-strong dark:border-warning-strong/50 dark:bg-warning-soft/70 dark:text-warning-strong"
      : "border-time/30 bg-time-soft/50 text-time-strong dark:border-time-strong/50 dark:bg-time-soft/70 dark:text-time-strong";
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
  if (!open) return null;
  return (
    <ContactForm
      key={contact?.id ?? "new"}
      open={open}
      onOpenChange={onOpenChange}
      projectId={projectId}
      contact={contact}
      createContact={createContact}
    />
  );
}

function ContactForm({
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
  const updateContact = useUpdateContact(projectId);
  const { trackEvent } = useAnalytics(projectId);
  const t = useTranslations("tabs.contacts");
  const tContactTypes = useTranslations("contactTypes");
  const tCommon = useTranslations("common");
  const [name, setName] = useState(contact?.name ?? "");
  const [type, setType] = useState(contact?.type ?? "company");
  const [role, setRole] = useState(contact?.role ?? "");
  const [company, setCompany] = useState(contact?.company ?? "");
  const [ico, setIco] = useState(contact?.ico ?? "");
  const [dic, setDic] = useState(contact?.dic ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [website, setWebsite] = useState(contact?.website ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [rating, setRating] = useState<number | null>(contact?.rating ?? null);

  const isMobile = useIsMobile();

  // Handle ARES company selection — prefill name, company, IČO, DIČ and type.
  // ARES returns only companies, so type defaults to "company".
  const handleAresSelect = (c: AresCompany) => {
    setName(c.name);
    setCompany(c.name);
    setIco(c.ico);
    setDic(c.dic ?? "");
    setType("company");
    // If the contact form has notes and ARES returned an address, append it
    // so the user keeps the info without overwriting existing notes.
    if (c.address) {
      setNotes((prev) => {
        const trimmedPrev = prev.trim();
        const addrLine = t("form.ares.addressPrefix", { address: c.address });
        return trimmedPrev ? `${trimmedPrev}\n${addrLine}` : addrLine;
      });
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t("toasts.updateError"));
      return;
    }
    try {
      const data = {
        name,
        type,
        role,
        company,
        ico,
        dic,
        phone,
        email,
        website,
        notes,
        rating,
      };
      if (contact) {
        await updateContact.mutateAsync({ id: contact.id, data });
        toast.success(t("toasts.updateSuccess"));
      } else if (createContact) {
        await createContact.mutateAsync(data);
        trackEvent("add_contact", { name, type });
        toast.success(t("toasts.createSuccess"));
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.saveErrorFallback"));
    }
  };

  const submitLabel = contact ? t("form.submitLabel.edit") : t("form.submitLabel.create");

  return (
    <AddDialogShell
      open={open}
      onOpenChange={onOpenChange}
      titleValue={name}
      onTitleChange={setName}
      titlePlaceholder={t("form.placeholder.title")}
      submitLabel={submitLabel}
      onSubmit={handleSubmit}
      isSubmitting={createContact?.isPending || updateContact.isPending}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4">
        {/* ARES search — načte data firmy z registru */}
        {!contact && (
          <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
            <Label className="flex items-center gap-1.5 text-xs">
              <Search className="h-3 w-3" />
              {t("form.ares.label")}
            </Label>
            <p className="text-[11px] text-muted-foreground">
              {t("form.ares.hint")}
            </p>
            <AresSearch onSelect={handleAresSelect} />
          </div>
        )}
        {/* Typ + Role */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="type">{t("form.field.type")}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_TYPES.map((ct) => (
                  <SelectItem key={ct.value} value={ct.value}>
                    {ct.emoji} {tContactTypes(ct.value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">{t("form.field.role")}</Label>
            <Input
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder={t("form.placeholder.role")}
            />
          </div>
        </div>

        {/* Detaily (volitelné) */}
        <CollapsibleSection title={t("form.section.details")}>
          {/* Firma */}
          <div className="space-y-2">
            <Label htmlFor="company">{t("form.field.company")}</Label>
            <Input
              id="company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder={t("form.placeholder.company")}
            />
          </div>
          {/* IČO + DIČ */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ico">{t("form.field.ico")}</Label>
              <Input
                id="ico"
                value={ico}
                onChange={(e) => setIco(e.target.value)}
                placeholder={t("form.placeholder.ico")}
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dic">{t("form.field.dic")}</Label>
              <Input
                id="dic"
                value={dic}
                onChange={(e) => setDic(e.target.value)}
                placeholder={t("form.placeholder.dic")}
                autoComplete="off"
              />
            </div>
          </div>
          {/* Telefon + E-mail */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">{t("form.field.phone")}</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("form.placeholder.phone")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("form.field.email")}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("form.placeholder.email")}
              />
            </div>
          </div>
          {/* Web */}
          <div className="space-y-2">
            <Label htmlFor="website">{t("form.field.web")}</Label>
            <div className="relative">
              <Globe className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder={t("form.placeholder.web")}
                className="pl-9"
              />
            </div>
          </div>
          {/* Hodnocení */}
          <div className="space-y-2">
            <Label>{t("form.field.rating")}</Label>
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
                        ? "fill-warning text-warning"
                        : "text-muted-foreground/40 hover:text-warning-strong",
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
                  {tCommon("cancel")}
                </Button>
              )}
            </div>
          </div>
          {/* Poznámky */}
          <div className="space-y-2">
            <Label htmlFor="notes">{t("form.field.notes")}</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("form.placeholder.notes")}
              rows={2}
            />
          </div>
        </CollapsibleSection>
      </div>
    </AddDialogShell>
  );
}
