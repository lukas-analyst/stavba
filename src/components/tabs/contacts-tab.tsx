"use client";

import { useState } from "react";
import {
  useContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  type Contact,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
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
  Star,
  Users,
  Loader2,
} from "lucide-react";
import { CONTACT_TYPES, contactTypeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ContactsTab({ projectId }: { projectId: string }) {
  const { data: contacts, isLoading } = useContacts(projectId);
  const createContact = useCreateContact(projectId);
  const [addOpen, setAddOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {contacts?.length ?? 0} kontaktů v projektu
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Přidat kontakt
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : contacts?.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-2 h-8 w-8 opacity-40" />
          Zatím žádné kontakty. Přidejte firmy, řemeslníky a dodavatele.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {contacts?.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              projectId={projectId}
              onEdit={() => setEditContact(c)}
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
    </div>
  );
}

function ContactCard({
  contact,
  projectId,
  onEdit,
}: {
  contact: Contact;
  projectId: string;
  onEdit: () => void;
}) {
  const deleteContact = useDeleteContact(projectId);
  const [confirm, setConfirm] = useState(false);
  const t = contactTypeLabel(contact.type);

  return (
    <Card className="group relative overflow-hidden">
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
              >
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
            className="flex items-center gap-1.5 text-xs hover:text-primary"
          >
            <Phone className="h-3 w-3 text-muted-foreground" />
            <span>{contact.phone}</span>
          </a>
        )}
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="flex items-center gap-1.5 text-xs hover:text-primary"
          >
            <Mail className="h-3 w-3 text-muted-foreground" />
            <span className="truncate">{contact.email}</span>
          </a>
        )}
        {contact.notes && (
          <p className="border-t pt-2 text-[11px] text-muted-foreground">{contact.notes}</p>
        )}
        <div className="flex items-center justify-between border-t pt-2">
          <div className="flex gap-1">
            {contact._count && contact._count.payments > 0 && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                {contact._count.payments} plateb
              </Badge>
            )}
            {contact._count && contact._count.timeEntries > 0 && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                {contact._count.timeEntries} časů
              </Badge>
            )}
          </div>
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
      </CardContent>

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
