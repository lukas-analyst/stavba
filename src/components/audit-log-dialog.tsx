"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuditLog, type AuditLog } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ScrollArea,
} from "@/components/ui/scroll-area";
import {
  History,
  Plus,
  Pencil,
  Trash2,
  CircleDot,
} from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
};

const ENTITY_LABELS: Record<string, string> = {
  BudgetItem: "Položka rozpočtu",
  Payment: "Platba",
  TimeEntry: "Časový záznam",
  Contact: "Kontakt",
  Project: "Projekt",
};

const FIELD_LABELS: Record<string, string> = {
  category: "Kategorie",
  subcategory: "Podkategorie",
  element: "Prvek",
  phase: "Fáze",
  required: "Nutné",
  completed: "Hotovo",
  note: "Poznámka",
  planCost: "Plán (Kč)",
  actualCost: "Skutečnost (Kč)",
  flexibilityPercent: "Vůle (%)",
  planDays: "Plán (dní)",
  dateFrom: "Datum od",
  dateTo: "Datum do",
  actualHours: "Hodiny",
  amount: "Částka",
  date: "Datum",
  type: "Typ",
  vendor: "Firma",
  description: "Popis",
  name: "Jméno",
  workerName: "Pracovník",
  hours: "Hodiny",
  starred: "Hvězdička",
  status: "Stav",
};

export function AuditLogDialog({ open, onOpenChange, projectId }: Props) {
  const { data: logs, isLoading } = useAuditLog(open ? projectId : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <DialogTitle>Historie změn</DialogTitle>
          </div>
          <DialogDescription>
            Posledních 100 změn v projektu (úpravy, vytvoření, mazání).
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !logs || logs.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <History className="mx-auto mb-2 h-8 w-8 opacity-40" />
            Zatím žádné zaznamenané změny.
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-1.5">
              {logs.map((log) => (
                <AuditLogEntry key={log.id} log={log} />
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AuditLogEntry({ log }: { log: AuditLog }) {
  const actionConfig = {
    create: { icon: Plus, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/20", label: "Vytvořeno" },
    update: { icon: Pencil, color: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-950/20", label: "Upraveno" },
    delete: { icon: Trash2, color: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-950/20", label: "Smazáno" },
  }[log.action] ?? { icon: CircleDot, color: "text-muted-foreground", bg: "bg-muted/30", label: log.action };

  const Icon = actionConfig.icon;
  const entityLabel = ENTITY_LABELS[log.entityType] ?? log.entityType;
  const fieldLabel = log.field ? (FIELD_LABELS[log.field] ?? log.field) : null;

  return (
    <div className={cn("flex items-start gap-3 rounded-lg border p-2.5 text-xs", actionConfig.bg)}>
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", actionConfig.color)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
            {entityLabel}
          </Badge>
          <span className="font-medium">{actionConfig.label}</span>
          {fieldLabel && (
            <>
              <span className="text-muted-foreground">→</span>
              <span className="font-medium">{fieldLabel}</span>
            </>
          )}
          <span className="ml-auto text-muted-foreground">
            {formatDate(log.createdAt)}
          </span>
        </div>
        {log.action === "update" && log.oldValue !== null && log.newValue !== null && (
          <div className="mt-1 flex items-center gap-2 font-mono text-[11px]">
            <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700 line-through dark:bg-rose-950/30 dark:text-rose-300">
              {log.oldValue || "(prázdné)"}
            </span>
            <span className="text-muted-foreground">→</span>
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              {log.newValue || "(prázdné)"}
            </span>
          </div>
        )}
        {log.action === "delete" && log.oldValue && (
          <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
            {log.oldValue.substring(0, 100)}
            {log.oldValue.length > 100 ? "…" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
