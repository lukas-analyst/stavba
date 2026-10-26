"use client";

import { useTranslations } from "next-intl";
import { TableRow, TableCell } from "@/components/ui/table";
import { useUpdateBudgetItem, type BudgetItem } from "@/lib/api";
import { useAnalytics } from "@/hooks/use-analytics";
import {
  ChevronRight,
  ExternalLink,
  Link as LinkIcon,
  User,
} from "lucide-react";
import { InlineTextarea } from "./inline-textarea";

// DetailPanelRow — expandable panel rendered below a parent budget item row
// when the user expands it. Shows the "hidden" fields that don't fit in the
// narrow table columns: free-text note, assigned contact, and a list of
// related web links (own + inherited from child tasks).
//
// The panel spans all table columns (`colSpan = selectionMode ? 13 : 12`)
// and uses a CSS-grid layout that collapses from 2 columns on desktop to a
// single column on mobile.
//
// A subtle phase-colored gradient is painted on the left edge to visually
// tie the panel back to the phase of the parent item (same treatment as
// child task rows). The gradient is set via a CSS variable from a hardcoded
// color map keyed by phase id — see `colorMap` below.
export function DetailPanelRow({
  item,
  projectId,
  childItems = [],
  selectionMode = false,
}: {
  item: BudgetItem;
  projectId: string;
  childItems?: BudgetItem[];
  selectionMode?: boolean;
}) {
  const updateItem = useUpdateBudgetItem(projectId);
  const { trackEvent } = useAnalytics(projectId);
  const t = useTranslations("tabs.budget.detail");

  const update = (field: keyof BudgetItem, value: unknown) => {
    updateItem.mutate({ id: item.id, data: { [field]: value } });
    trackEvent("edit_budget_item", { field });
  };

  return (
    <TableRow className="detail-panel bg-muted/20 hover:bg-muted/20">
      <TableCell colSpan={selectionMode ? 13 : 12} className="relative py-3">
        {/* Gradient fade from phase color (left edge) to transparent */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-24 pointer-events-none"
          style={{
            background: `linear-gradient(to right, var(--phase-color, transparent) 0%, transparent 100%)`,
            opacity: 0.12,
          }}
          data-phase-color={item.rejected ? "rose" : item.phase}
          ref={(el) => {
            if (!el) return;
            const colorMap: Record<string, string> = {
              "preparation": "#a78bfa",
              "demolition": "#f87171",
              "earthworks": "#8b6f47",
              "foundation": "#6b7280",
              "shell": "#fbbf24",
              "installations": "#3b82f6",
              "finishing": "#34d399",
              "facade": "#f59e0b",
              "roof": "#ef4444",
              "interior": "#10b981",
              "exterior": "#84cc16",
              "final_inspection": "#a855f7",
              "future": "#60a5fa",
              "unspecified": "#a1a1aa",
              "rose": "#f43f5e",
            };
            const key = el.getAttribute("data-phase-color") ?? "";
            el.style.setProperty("--phase-color", colorMap[key] ?? "#a1a1aa");
          }}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Poznámka */}
          <div className="space-y-2">
            <div className="type-label-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("label.note")}
            </div>
            <InlineTextarea
              value={item.note}
              onCommit={(v) => update("note", v)}
              placeholder={t("placeholder.note")}
            />
          </div>

          {/* Kontakt — přiřazená osoba/firma */}
          <div className="space-y-2">
            <div className="flex items-center gap-1 type-label-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <User className="h-3 w-3" />
              {t("label.contact")}
            </div>
            {item.contact ? (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-medium text-foreground">{item.contact.name}</span>
                {item.contact.role && (
                  <span className="text-muted-foreground">· {item.contact.role}</span>
                )}
              </div>
            ) : (
              <span className="type-label text-muted-foreground/60">
                {t("contact.unassigned")}
              </span>
            )}
          </div>

          {/* Odkazy */}
          <div className="space-y-2">
            <div className="flex items-center gap-1 type-label-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <LinkIcon className="h-3 w-3" />
              {t("label.links")}
              {item.links && item.links.length > 0 && (
                <span className="rounded bg-muted px-1.5 py-0.5 type-label-sm tabular-nums">
                  {item.links.length}
                </span>
              )}
            </div>
            {item.links && item.links.length > 0 && (
              <ul className="space-y-0.5">
                {item.links.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={link.url}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {/* Odkazy z úkolů — zobrazeny pod odkazy položky */}
            {childItems.filter((c) => c.links && c.links.length > 0).length > 0 && (
              <div className="mt-2 space-y-1 border-t pt-2">
                <div className="flex items-center gap-1 type-label-sm font-medium text-muted-foreground">
                  <ChevronRight className="h-3 w-3" />
                  {t("label.linksFromTasks")}
                </div>
                {childItems
                  .filter((c) => c.links && c.links.length > 0)
                  .map((child) => (
                    <div key={child.id} className="space-y-0.5">
                      <div className="type-label-sm text-muted-foreground/70">
                        └ {child.subcategory || t("placeholder.noName")}
                      </div>
                      <ul className="space-y-0.5 pl-3">
                        {child.links!.map((link) => (
                          <li key={link.id}>
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={link.url}
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0 opacity-40" />
                              {link.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}
