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
import {
  useDashboard,
  useBudgetItems,
  usePayments,
  type BudgetItem,
  type AlertItem,
  type Payment,
} from "@/lib/api";
import {
  formatCzk,
  formatNumber,
  formatDate,
  PHASE_COLORS,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

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

  const handleDownloadPdf = () => {
    if (!data) {
      toast.error("Data reportu nejsou načtena.");
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
        toast.error("Tisk se nezdařil. Zkuste to prosím znovu.");
      }
    }, 60);
  };

  const isDataReady = !isLoading && data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <DialogTitle>Report projektu — náhled PDF</DialogTitle>
          </div>
          <DialogDescription>
            Náhled reportu pro export do PDF. Klikněte „Stáhnout PDF" — v dialogu
            tisku prohlížeče zvolte cíl <strong>„Uložit jako PDF"</strong>.
          </DialogDescription>
        </DialogHeader>

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
          />
        )}

        <DialogFooter className="no-print">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zavřít
          </Button>
          <Button onClick={handleDownloadPdf} disabled={!isDataReady}>
            <Download className="mr-2 h-4 w-4" /> Stáhnout PDF
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
}: {
  projectName: string;
  data: NonNullable<ReturnType<typeof useDashboard>["data"]>;
  budgetItems: BudgetItem[];
  payments: Payment[];
}) {
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
              <span className="font-medium text-foreground">Vygenerováno:</span>{" "}
              {formatDate(new Date(), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </div>
            {project.startDate && (
              <div>Zahájení: {formatDate(project.startDate)}</div>
            )}
            {project.endDate && (
              <div>Dokončení: {formatDate(project.endDate)}</div>
            )}
          </div>
        </div>
      </header>

      {/* ===== KPI souhrn ===== */}
      <section className="print-section">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Shrnutí rozpočtu
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <KpiCard label="Plán" value={formatCzk(totals.planTotal)} />
          <KpiCard label="Skutečnost" value={formatCzk(totals.actualTotal)} />
          <KpiCard
            label="Zbývá"
            value={formatCzk(totals.remaining)}
            tone={totals.remaining < 0 ? "danger" : "ok"}
          />
          <KpiCard
            label="Ušetřeno"
            value={formatCzk(totals.savedTotal)}
            tone="ok"
          />
          <KpiCard
            label="Hotovo"
            value={`${totals.completedCount} / ${totals.itemCount}`}
          />
          <KpiCard
            label="Hodiny"
            value={formatNumber(totals.hoursTotal, " h")}
          />
        </div>
      </section>

      {/* ===== Upozornění ===== */}
      {(alerts.overdue.length > 0 ||
        alerts.upcoming.length > 0 ||
        alerts.overBudget.length > 0) && (
        <section className="print-section">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Upozornění
          </h2>
          <div className="space-y-1.5 text-xs">
            {alerts.overdue.length > 0 && (
              <AlertLine
                tone="danger"
                label={`Zpožděné (${alerts.overdue.length})`}
                items={alerts.overdue}
              />
            )}
            {alerts.upcoming.length > 0 && (
              <AlertLine
                tone="info"
                label={`Blížící se (${alerts.upcoming.length})`}
                items={alerts.upcoming}
              />
            )}
            {alerts.overBudget.length > 0 && (
              <AlertLine
                tone="danger"
                label={`Překročeno (${alerts.overBudget.length})`}
                items={alerts.overBudget}
              />
            )}
          </div>
        </section>
      )}

      {/* ===== Projekční odhad ===== */}
      <section className="print-section">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Projekční odhad
        </h2>
        {hasCompleted ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <KpiCard
              label="Prům. překročení"
              value={`${(totals.avgOverrunRatio * 100).toFixed(0)} %`}
              tone={totals.avgOverrunRatio > 1 ? "danger" : "ok"}
            />
            <KpiCard
              label="Predikce konečných nákladů"
              value={formatCzk(totals.projectedFinal)}
              tone={totals.projectedOverrun > 0 ? "danger" : "ok"}
            />
            <KpiCard
              label="Odhadované překročení"
              value={formatCzk(totals.projectedOverrun)}
              tone={totals.projectedOverrun > 0 ? "danger" : "ok"}
            />
            <KpiCard
              label="Podíl plánu"
              value={`${overPct.toFixed(0)} %`}
              tone={overPct > 100 ? "danger" : "ok"}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Žádné dokončené položky — projekce konečných nákladů není dostupná.
            Po dokončení prvních položek se zde zobrazí odhad na základě průměrné
            míry překročení plánu.
          </p>
        )}
      </section>

      {/* ===== Fáze ===== */}
      <section className="print-section print-break-before">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Rozpad podle fází
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-1.5 pr-2 font-medium">Fáze</th>
              <th className="py-1.5 px-2 text-right font-medium">Plán</th>
              <th className="py-1.5 px-2 text-right font-medium">Skutečnost</th>
              <th className="py-1.5 px-2 text-right font-medium">%</th>
              <th className="py-1.5 pl-2 text-right font-medium">Hodiny</th>
            </tr>
          </thead>
          <tbody>
            {byPhase.map((p) => {
              const burn = p.plan > 0 ? (p.actual / p.plan) * 100 : 0;
              return (
                <tr key={p.phase} className="border-b border-border">
                  <td className="py-1.5 pr-2">
                    <Badge
                      variant="outline"
                      className={cn("text-[10px]", PHASE_COLORS[p.phase] ?? "")}
                    >
                      {p.phase}
                    </Badge>
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {formatCzk(p.plan)}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {formatCzk(p.actual)}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 px-2 text-right tabular-nums font-medium",
                      burn > 100 ? "text-rose-600" : burn > 80 ? "text-amber-600" : "text-emerald-600",
                    )}
                  >
                    {burn.toFixed(0)} %
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums">
                    {formatNumber(p.hours, " h")}
                  </td>
                </tr>
              );
            })}
            {byPhase.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-center text-xs text-muted-foreground">
                  Žádné fáze k zobrazení.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ===== Kategorie (top 15) ===== */}
      <section className="print-section">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Rozpad podle kategorií {byCategory.length > 15 && "(top 15)"}
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-1.5 pr-2 font-medium">Kategorie</th>
              <th className="py-1.5 px-2 text-right font-medium">Plán</th>
              <th className="py-1.5 px-2 text-right font-medium">Skutečnost</th>
              <th className="py-1.5 pl-2 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {byCategory.slice(0, 15).map((c) => {
              const burn = c.plan > 0 ? (c.actual / c.plan) * 100 : 0;
              return (
                <tr key={c.category} className="border-b border-border">
                  <td className="py-1.5 pr-2">{c.category}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{formatCzk(c.plan)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{formatCzk(c.actual)}</td>
                  <td
                    className={cn(
                      "py-1.5 pl-2 text-right tabular-nums",
                      burn > 100 ? "text-rose-600" : "text-emerald-600",
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
                  Žádné kategorie k zobrazení.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ===== Položky rozpočtu ===== */}
      <section className="print-section print-break-before">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Položky rozpočtu ({budgetItems.length})
        </h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-1.5 pr-2 font-medium">Kategorie</th>
              <th className="py-1.5 px-2 font-medium">Název</th>
              <th className="py-1.5 px-2 text-right font-medium">Plán</th>
              <th className="py-1.5 px-2 text-right font-medium">Skut.</th>
              <th className="py-1.5 px-2 font-medium">Od</th>
              <th className="py-1.5 px-2 font-medium">Do</th>
              <th className="py-1.5 pl-2 font-medium">Stav</th>
            </tr>
          </thead>
          <tbody>
            {budgetItems.map((it) => {
              const name = it.subcategory || "(bez názvu)";
              const status = it.rejected
                ? "Zavrženo"
                : it.completed
                  ? "Hotovo"
                  : it.actualCost > 0 || it.actualHours > 0
                    ? "Aktivní"
                    : "Plán";
              const statusTone = it.rejected
                ? "bg-zinc-100 text-zinc-700 border-zinc-200"
                : it.completed
                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                  : it.actualCost > 0 || it.actualHours > 0
                    ? "bg-amber-100 text-amber-800 border-amber-200"
                    : "bg-sky-100 text-sky-800 border-sky-200";
              return (
                <tr key={it.id} className="border-b border-border">
                  <td className="py-1 pr-2 align-top text-muted-foreground">{it.category}</td>
                  <td className="py-1 px-2 align-top">{name}</td>
                  <td className="py-1 px-2 text-right align-top tabular-nums">
                    {formatCzk(it.planCost)}
                  </td>
                  <td className="py-1 px-2 text-right align-top tabular-nums">
                    {formatCzk(it.actualCost)}
                  </td>
                  <td className="py-1 px-2 align-top text-muted-foreground">
                    {formatDate(it.dateFrom)}
                  </td>
                  <td className="py-1 px-2 align-top text-muted-foreground">
                    {formatDate(it.dateTo)}
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
                  Žádné položky rozpočtu.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ===== Platby (posledních 10) ===== */}
      <section className="print-section print-break-before">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Platby (posledních {payments.length})
        </h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-1.5 pr-2 font-medium">Datum</th>
              <th className="py-1.5 px-2 font-medium">Položka</th>
              <th className="py-1.5 px-2 font-medium">Dodavatel</th>
              <th className="py-1.5 px-2 text-right font-medium">Částka</th>
              <th className="py-1.5 pl-2 font-medium">Typ</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const itemLabel = p.budgetItem
                ? [p.budgetItem.category, p.budgetItem.subcategory]
                    .filter(Boolean)
                    .join(" — ")
                : "(bez položky)";
              return (
                <tr key={p.id} className="border-b border-border">
                  <td className="py-1 pr-2 align-top tabular-nums">{formatDate(p.date)}</td>
                  <td className="py-1 px-2 align-top">{itemLabel}</td>
                  <td className="py-1 px-2 align-top text-muted-foreground">
                    {p.vendor ?? p.contact?.name ?? "—"}
                  </td>
                  <td className="py-1 px-2 text-right align-top tabular-nums">
                    {formatCzk(p.amount)}
                  </td>
                  <td className="py-1 pl-2 align-top text-muted-foreground">{p.type}</td>
                </tr>
              );
            })}
            {payments.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-center text-xs text-muted-foreground">
                  Žádné platby k zobrazení.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ===== Patička ===== */}
      <footer className="border-t border-border pt-3 text-[10px] text-muted-foreground">
        Report vygenerován aplikací Rozpočet Stavby dne{" "}
        {formatDate(new Date(), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}{" "}
        — {projectName}.
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
          tone === "ok" && "text-emerald-600",
          tone === "danger" && "text-rose-600",
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
    <div className={cn(tone === "danger" ? "text-rose-700" : "text-sky-700")}>
      <strong>{label}:</strong>{" "}
      {items.map((it) => it.subcategory || it.category).join(", ")}
    </div>
  );
}
