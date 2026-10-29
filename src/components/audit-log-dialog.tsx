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
import { getFieldValue } from "@/lib/audit-fields";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  History,
  Plus,
  Pencil,
  Trash2,
  CircleDot,
} from "lucide-react";
import { useTranslations } from "next-intl";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
};

export function AuditLogDialog({ open, onOpenChange, projectId }: Props) {
  const { data: auditData, isLoading } = useAuditLog(open ? projectId : null);
  const logs = auditData?.entries ?? [];
  const t = useTranslations("dialogs.auditLog");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-50 flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogHeader className="shrink-0 space-y-2 px-4 pt-4 pb-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <DialogTitle>{t("title")}</DialogTitle>
          </div>
          <DialogDescription>
            {t("description", { count: logs.length || 100 })}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="shrink-0 space-y-2 px-4 pb-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !logs || logs.length === 0 ? (
          <div className="py-12 text-center type-body text-muted-foreground">
            <History className="mx-auto mb-2 h-8 w-8 opacity-40" />
            {t("empty")}
          </div>
        ) : (
          // Plain scrollable container — using a div instead of ScrollArea
          // avoids layout glitches inside the Radix Dialog where the
          // ScrollArea viewport sometimes doesn't get a proper height and
          // ends up rendering outside the dialog bounds.
          <div
            className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 pb-4"
            style={{ scrollbarGutter: "stable" }}
          >
            <div className="space-y-1.5">
              {logs.map((log) => (
                <AuditLogEntry key={log.id} log={log} />
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AuditLogEntry({ log }: { log: AuditLog }) {
  // C3a: REUSE `tabs.management.auditLog.*` for action/entity/field labels
  // (the management tab already has the full superset of these keys).
  // Keep `dialogs.auditLog` for dialog-specific keys (emptyValue, action.fallback).
  const t = useTranslations("dialogs.auditLog");
  const tMgmt = useTranslations("tabs.management.auditLog");
  const actionConfig = {
    create: { icon: Plus, color: "text-success", bg: "bg-success-soft/50 dark:bg-success-soft/60", label: tMgmt("actions.create") },
    update: { icon: Pencil, color: "text-info", bg: "bg-info-soft/50 dark:bg-info-soft/60", label: tMgmt("actions.update") },
    delete: { icon: Trash2, color: "text-danger", bg: "bg-danger-soft/50 dark:bg-danger-soft/60", label: tMgmt("actions.delete") },
  }[log.action] ?? { icon: CircleDot, color: "text-muted-foreground", bg: "bg-muted/30", label: t("action.fallback", { action: log.action }) };

  const Icon = actionConfig.icon;
  // Entity and field labels: look up via the management-tab namespace
  // (superset of entities/fields), with raw fallback.
  // next-intl returns the key path when missing — for fields not in the
  // management namespace (e.g. `element`, `actualHours`, `date`), fall back
  // to the dialog-local `dialogs.auditLog.field.*` sub-namespace, then to
  // the raw value as a last resort.
  const entityKey = `entities.${log.entityType}` as const;
  const fieldKey = log.field ? (`fields.${log.field}` as const) : null;
  const entityRaw = tMgmt(entityKey);
  const entityLabel = entityRaw === entityKey ? log.entityType : entityRaw;
  const fieldLabel = fieldKey
    ? (() => {
        const f = tMgmt(fieldKey);
        if (f !== fieldKey) return f;
        // Field not in management namespace — try dialog-local field.* (e.g. element/actualHours/date).
        const f2 = t(`field.${log.field}` as const);
        return f2 === `field.${log.field}` ? log.field : f2;
      })()
    : null;

  return (
    <div className={cn("flex items-start gap-3 rounded-lg border p-2.5 type-label", actionConfig.bg)}>
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", actionConfig.color)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="h-4 px-1.5 type-label-sm">
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
            {formatDate(log.createdAt, {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        {log.action === "update" && log.oldValue !== null && log.newValue !== null && (
          <div className="mt-1 flex items-center gap-2 font-mono type-label">
            <span className="rounded bg-danger-soft/50 px-1.5 py-0.5 text-danger-strong line-through dark:bg-danger-soft/70 dark:text-danger-strong">
              {/* B28: Translation happens here in the UI — DB stores raw values. */}
              {getFieldValue(log.field ?? "", log.oldValue) || t("emptyValue")}
            </span>
            <span className="text-muted-foreground">→</span>
            <span className="rounded bg-success-soft/50 px-1.5 py-0.5 text-success-strong dark:bg-success-soft/70 dark:text-success-strong">
              {getFieldValue(log.field ?? "", log.newValue) || t("emptyValue")}
            </span>
          </div>
        )}
        {log.action === "delete" && log.oldValue && (
          <div className="mt-1 truncate font-mono type-label text-muted-foreground">
            {log.oldValue.substring(0, 100)}
            {log.oldValue.length > 100 ? "…" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
