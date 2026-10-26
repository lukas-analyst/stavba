"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDashboard, useBudgetItems, usePayments, type BudgetItem, type AlertItem, type Payment } from "@/lib/api";
import { formatCzk, formatNumber, formatDate, PHASE_COLORS, normalizePhase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTranslations, useLocale } from "next-intl";
import type { Locale } from "@/i18n/config";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
};

/**
 * PrintReportDialog
 *
 * Náhled reportu projektu + stažitelné PDF (přes window.print() → „Uložit jako PDF").
 *
 * Print CSS je scopováno na `body.printing` (třída se přidá před window.print()
 * a odebere se v `afterprint` listeneru). Report container má třídu `.print-report`,
 * která je jediný viditelný element při tisku.
 */
export function PrintReportDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
}: Props) {
  const { data, isLoading } = useDashboard(projectId);
  const { data: budgetItems } = useBudgetItems(projectId);
  const { data: payments } = usePayments(projectId);
  const isMobile = useIsMobile();
  const t = useTranslations("dialogs.printReport");
  const locale = useLocale() as Locale;

  const handleDownloadPdf = () => {
    if (!data) {
      toast.error(t("toasts.dataNotLoaded"));
      return;
    }
    // U18: window.print() does not work reliably on mobile browsers
    // (most mobile browsers either block it or produce a poor-quality PDF
    // without the "Save as PDF" option). Redirect mobile users to the
    // desktop version of the app instead of attempting the print flow.
    if (isMobile) {
      toast.info(t("toasts.mobileExportHint"), { duration: 6000 });
      return;
    }
    document.body.classList.add("printing");
    const cleanup = () => {
      document.body.classList.remove("printing");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    // Defer print to next tick so the `printing` class is applied to the body
    // and any pending style recalculation finishes before the print dialog opens.
    setTimeout(() => {
      try {
        window.print();
      } catch {
        // Some browsers may throw if print is blocked — cleanup anyway.
        cleanup();
        toast.error(t("toasts.printFailed"));
      }
    }, 60);
  };

  const isDataReady = !isLoading && data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-3xl">
        {/* Header — sticky at top with own padding (matches AddDialogShell pattern) */}
        <DialogHeader className="shrink-0 space-y-2 px-4 pt-4 pb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <DialogTitle>{t("title")}</DialogTitle>
          </div>
          <DialogDescription>
            {t("description")}
            {isMobile && (
              <>
                {" "}
                <span className="text-warning">
                  {t("mobileWarning")}
                </span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Body — scrollable report preview */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 pb-4">
          {!isDataReady ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ReportBody
              projectName={projectName}
              data={data}
              budgetItems={budgetItems ?? []}
              payments={(payments ?? []).slice(0, 10)}
              locale={locale}
            />
          )}
        </div>

        {/* Footer — sticky at bottom with border-top (matches AddDialogShell pattern) */}
        <DialogFooter className="no-print shrink-0 gap-2 border-t bg-background p-3 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
            {t("button.close")}
          </Button>
          <Button
            onClick={handleDownloadPdf}
            disabled={!isDataReady}
            aria-busy={isLoading}
            className="flex-1 sm:flex-none"
          >
            <Download className="mr-2 h-4 w-4" />
            {isMobile ? t("button.exportDesktop") : t("button.downloadPdf")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Report body — vše uvnitř `.print-report` kontejneru.
// Tento obsah se zobrazí v náhledu dialogu i ve výsledném PDF.
// ============================================================

function ReportBody({
  projectName,
  data,
  budgetItems,
  payments,
  locale,
}: {
  projectName: string;
  data: NonNullable<ReturnType<typeof useDashboard>["data"]>;
  budgetItems: BudgetItem[];
  payments: Payment[];
  locale: Locale;
}) {
  const t = useTranslations("dialogs.printReport");
  const tPhases = useTranslations("phases");
  const { project, totals, byPhase, byCategory, alerts } = data;
  const hasCompleted = totals.completedCount > 0;
  const overPct = totals.planTotal > 0
    ? (totals.projectedFinal / totals.planTotal) * 100
    : 0;

  return (
    <div className="print-report space-y-6 rounded-lg border border-border bg-white p-6 text-foreground">
      {/* ===== Hlavička ===== */}
      <header className="border-b border-border pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight">{projectName}</h1>
            {project.address && (
              <p className="mt-1 text-sm text-muted-foreground">{project.address}</p>
            )}
            {project.description && (
              <p className="mt-2 max-w-prose text-xs text-muted-foreground">
                {project.description}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">{t("header.generated")}</span>{" "}
              {formatDate(new Date(), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }, locale)}
            </div>
            {project.startDate && (
              <div>{t("header.start")} {formatDate(project.startDate, undefined, locale)}</div>
            )}
            {project.endDate && (
              <div>{t("header.end")} {formatDate(project.endDate, undefined, locale)}</div>
            )}
          </div>
        </div>
      </header>

      {/* ===== KPI souhrn ===== */}
      <section className="print-section">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("section.summary")}
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <KpiCard label={t("kpi.plan")} value={formatCzk(totals.planTotal, locale)} />
          <KpiCard label={t("kpi.actual")} value={formatCzk(totals.actualTotal, locale)} />
          <KpiCard
            label={t("kpi.remaining")}
            value={formatCzk(totals.remaining, locale)}
            tone={totals.remaining < 0 ? "danger" : "ok"}
          />
          <KpiCard
            label={t("kpi.saved")}
            value={formatCzk(totals.savedTotal, locale)}
            tone="ok"
          />
          <KpiCard
            label={t("kpi.completed")}
            value={`${totals.completedCount} / ${totals.itemCount}`}
          />
          <KpiCard
            label={t("kpi.hours")}
            value={formatNumber(totals.hoursTotal, " h", locale)}
          />
        </div>
      </section>

      {/* ===== Upozornění ===== */}
      {(alerts.overdue.length > 0 ||
        alerts.upcoming.length > 0 ||
        alerts.overBudget.length > 0) && (
        <section className="print-section">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("section.alerts")}
          </h2>
          <div className="space-y-1.5 text-xs">
            {alerts.overdue.length > 0 && (
              <AlertLine
                tone="danger"
                label={t("alert.overdue", { count: alerts.overdue.length })}
                items={alerts.overdue}
              />
            )}
            {alerts.upcoming.length > 0 && (
              <AlertLine
                tone="info"
                label={t("alert.upcoming", { count: alerts.upcoming.length })}
                items={alerts.upcoming}
              />
            )}
            {alerts.overBudget.length > 0 && (
              <AlertLine
                tone="danger"
                label={t("alert.overBudget", { count: alerts.overBudget.length })}
                items={alerts.overBudget}
              />
            )}
          </div>
        </section>
      )}

      {/* ===== Projekční odhad ===== */}
      <section className="print-section">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("section.projection")}
        </h2>
        {hasCompleted ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <KpiCard
              label={t("kpi.avgOverrun")}
              value={`${(totals.avgOverrunRatio * 100).toFixed(0)} %`}
              tone={totals.avgOverrunRatio > 1 ? "danger" : "ok"}
            />
            <KpiCard
              label={t("kpi.predictedFinal")}
              value={formatCzk(totals.projectedFinal, locale)}
              tone={totals.projectedOverrun > 0 ? "danger" : "ok"}
            />
            <KpiCard
              label={t("kpi.estimatedOverrun")}
              value={formatCzk(totals.projectedOverrun, locale)}
              tone={totals.projectedOverrun > 0 ? "danger" : "ok"}
            />
            <KpiCard
              label={t("kpi.planRatio")}
              value={`${overPct.toFixed(0)} %`}
              tone={overPct > 100 ? "danger" : "ok"}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("projection.empty")}
          </p>
        )}
      </section>

      {/* ===== Fáze ===== */}
      <section className="print-section print-break-before">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("section.phases")}
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-1.5 pr-2 font-medium">{t("column.phase")}</th>
              <th className="py-1.5 px-2 text-right font-medium">{t("column.plan")}</th>
              <th className="py-1.5 px-2 text-right font-medium">{t("column.actual")}</th>
              <th className="py-1.5 px-2 text-right font-medium">{t("column.percent")}</th>
              <th className="py-1.5 pl-2 text-right font-medium">{t("column.hours")}</th>
            </tr>
          </thead>
          <tbody>
            {byPhase.map((p) => {
              const burn = p.plan > 0 ? (p.actual / p.plan) * 100 : 0;
              const phaseId = normalizePhase(p.phase);
              return (
                <tr key={p.phase} className="border-b border-border">
                  <td className="py-1.5 pr-2">
                    <Badge
                      variant="outline"
                      className={cn("text-[10px]", PHASE_COLORS[phaseId] ?? "")}
                    >
                      {tPhases(phaseId)}
                    </Badge>
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {formatCzk(p.plan, locale)}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {formatCzk(p.actual, locale)}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 px-2 text-right tabular-nums font-medium",
                      burn > 100 ? "text-danger" : burn > 80 ? "text-warning" : "text-success",
                    )}
                  >
                    {burn.toFixed(0)} %
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums">
                    {formatNumber(p.hours, " h", locale)}
                  </td>
                </tr>
              );
            })}
            {byPhase.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-center text-xs text-muted-foreground">
                  {t("empty.phases")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ===== Kategorie (top 15) ===== */}
      <section className="print-section">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("section.categories", { top: byCategory.length > 15 ? t("section.categoriesTop") : "" })}
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-1.5 pr-2 font-medium">{t("column.category")}</th>
              <th className="py-1.5 px-2 text-right font-medium">{t("column.plan")}</th>
              <th className="py-1.5 px-2 text-right font-medium">{t("column.actual")}</th>
              <th className="py-1.5 pl-2 text-right font-medium">{t("column.percent")}</th>
            </tr>
          </thead>
          <tbody>
            {byCategory.slice(0, 15).map((c) => {
              const burn = c.plan > 0 ? (c.actual / c.plan) * 100 : 0;
              return (
                <tr key={c.category} className="border-b border-border">
                  <td className="py-1.5 pr-2">{c.category}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{formatCzk(c.plan, locale)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{formatCzk(c.actual, locale)}</td>
                  <td
                    className={cn(
                      "py-1.5 pl-2 text-right tabular-nums",
                      burn > 100 ? "text-danger" : "text-success",
                    )}
                  >
                    {burn.toFixed(0)} %
                  </td>
                </tr>
              );
            })}
            {byCategory.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-center text-xs text-muted-foreground">
                  {t("empty.categories")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ===== Položky rozpočtu ===== */}
      <section className="print-section print-break-before">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("section.budgetItems", { count: budgetItems.length })}
        </h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-1.5 pr-2 font-medium">{t("column.category")}</th>
              <th className="py-1.5 px-2 font-medium">{t("column.name")}</th>
              <th className="py-1.5 px-2 text-right font-medium">{t("column.plan")}</th>
              <th className="py-1.5 px-2 text-right font-medium">{t("column.actualShort")}</th>
              <th className="py-1.5 px-2 font-medium">{t("column.from")}</th>
              <th className="py-1.5 px-2 font-medium">{t("column.to")}</th>
              <th className="py-1.5 pl-2 font-medium">{t("column.status")}</th>
            </tr>
          </thead>
          <tbody>
            {budgetItems.map((it) => {
              const name = it.subcategory || t("fallback.noName");
              const status = it.rejected
                ? t("status.rejected")
                : it.completed
                  ? t("status.completed")
                  : it.actualCost > 0 || it.actualHours > 0
                    ? t("status.active")
                    : t("status.plan");
              const statusTone = it.rejected
                ? "bg-zinc-100 text-zinc-700 border-zinc-200"
                : it.completed
                  ? "bg-success-soft text-success-strong border-success/30"
                  : it.actualCost > 0 || it.actualHours > 0
                    ? "bg-warning-soft text-warning-strong border-warning/30"
                    : "bg-info-soft text-info-strong border-info/30";
              return (
                <tr key={it.id} className="border-b border-border">
                  <td className="py-1 pr-2 align-top text-muted-foreground">{it.category}</td>
                  <td className="py-1 px-2 align-top">{name}</td>
                  <td className="py-1 px-2 text-right align-top tabular-nums">
                    {formatCzk(it.planCost, locale)}
                  </td>
                  <td className="py-1 px-2 text-right align-top tabular-nums">
                    {formatCzk(it.actualCost, locale)}
                  </td>
                  <td className="py-1 px-2 align-top text-muted-foreground">
                    {formatDate(it.dateFrom, undefined, locale)}
                  </td>
                  <td className="py-1 px-2 align-top text-muted-foreground">
                    {formatDate(it.dateTo, undefined, locale)}
                  </td>
                  <td className="py-1 pl-2 align-top">
                    <Badge variant="outline" className={cn("text-[10px]", statusTone)}>
                      {status}
                    </Badge>
                  </td>
                </tr>
              );
            })}
            {budgetItems.length === 0 && (
              <tr>
                <td colSpan={7} className="py-3 text-center text-xs text-muted-foreground">
                  {t("empty.budgetItems")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ===== Platby (posledních 10) ===== */}
      <section className="print-section print-break-before">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("section.payments", { count: payments.length })}
        </h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-1.5 pr-2 font-medium">{t("column.date")}</th>
              <th className="py-1.5 px-2 font-medium">{t("column.item")}</th>
              <th className="py-1.5 px-2 font-medium">{t("column.vendor")}</th>
              <th className="py-1.5 px-2 text-right font-medium">{t("column.amount")}</th>
              <th className="py-1.5 pl-2 font-medium">{t("column.type")}</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const itemLabel = p.budgetItem
                ? [p.budgetItem.category, p.budgetItem.subcategory]
                    .filter(Boolean)
                    .join(" — ")
                : t("fallback.noItem");
              return (
                <tr key={p.id} className="border-b border-border">
                  <td className="py-1 pr-2 align-top tabular-nums">{formatDate(p.date, undefined, locale)}</td>
                  <td className="py-1 px-2 align-top">{itemLabel}</td>
                  <td className="py-1 px-2 align-top text-muted-foreground">
                    {p.vendor ?? p.contact?.name ?? "—"}
                  </td>
                  <td className="py-1 px-2 text-right align-top tabular-nums">
                    {formatCzk(p.amount, locale)}
                  </td>
                  <td className="py-1 pl-2 align-top text-muted-foreground">{p.type}</td>
                </tr>
              );
            })}
            {payments.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-center text-xs text-muted-foreground">
                  {t("empty.payments")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ===== Patička ===== */}
      <footer className="border-t border-border pt-3 text-[10px] text-muted-foreground">
        {t("footer", {
          date: formatDate(new Date(), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }, locale),
          projectName,
        })}
      </footer>
    </div>
  );
}

// ============================================================
// Pomocné komponenty
// ============================================================

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "danger";
}) {
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-bold tabular-nums",
          tone === "ok" && "text-success",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function AlertLine({
  tone,
  label,
  items,
}: {
  tone: "danger" | "info";
  label: string;
  items: AlertItem[];
}) {
  return (
    <div className={cn(tone === "danger" ? "text-danger-strong" : "text-info-strong")}>
      <strong>{label}:</strong>{" "}
      {items.map((it) => it.subcategory || it.category).join(", ")}
    </div>
  );
}
