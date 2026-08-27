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
import { useDashboard } from "@/lib/api";
import { formatCzk, formatNumber, formatDate, PHASE_COLORS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Printer, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
};

export function PrintReportDialog({ open, onOpenChange, projectId, projectName }: Props) {
  const { data, isLoading } = useDashboard(projectId);

  const handlePrint = () => {
    // Add a class to body to trigger print-specific styles
    document.body.classList.add("printing-report");
    // Small delay to ensure styles apply
    setTimeout(() => {
      window.print();
      document.body.classList.remove("printing-report");
    }, 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <DialogTitle>Report projektu</DialogTitle>
          </div>
          <DialogDescription>
            Náhled tiskového reportu. Klikněte „Tisk" pro otevření dialogu tisku (nebo uložení jako PDF).
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 rounded-lg border p-6 print:border-0 print:p-0">
            {/* Report header */}
            <div className="border-b pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold">{projectName}</h2>
                  {data.project.address && (
                    <p className="text-sm text-muted-foreground">{data.project.address}</p>
                  )}
                  {data.project.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{data.project.description}</p>
                  )}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>Vygenerováno: {formatDate(new Date())}</div>
                  {data.project.startDate && <div>Zahájení: {formatDate(data.project.startDate)}</div>}
                  {data.project.endDate && <div>Dokončení: {formatDate(data.project.endDate)}</div>}
                </div>
              </div>
            </div>

            {/* Summary KPIs */}
            <div data-print-card>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide">Shrnutí rozpočtu</h3>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded border p-2">
                  <div className="text-[10px] text-muted-foreground">Plán</div>
                  <div className="font-bold tabular-nums">{formatCzk(data.totals.planTotal)}</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-[10px] text-muted-foreground">Skutečnost</div>
                  <div className="font-bold tabular-nums">{formatCzk(data.totals.actualTotal)}</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-[10px] text-muted-foreground">Zbývá</div>
                  <div className={cn("font-bold tabular-nums", data.totals.remaining < 0 ? "text-rose-600" : "text-emerald-600")}>
                    {formatCzk(data.totals.remaining)}
                  </div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-[10px] text-muted-foreground">Ušetřeno</div>
                  <div className="font-bold tabular-nums text-emerald-600">{formatCzk(data.totals.savedTotal)}</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-[10px] text-muted-foreground">Hotovo</div>
                  <div className="font-bold tabular-nums">{data.totals.completedCount}/{data.totals.itemCount}</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-[10px] text-muted-foreground">Hodiny</div>
                  <div className="font-bold tabular-nums">{formatNumber(data.totals.hoursTotal, " h")}</div>
                </div>
              </div>
            </div>

            {/* Phase breakdown */}
            <div data-print-card>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide">Rozpad podle fází</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-1.5 pr-2 font-medium">Fáze</th>
                    <th className="py-1.5 px-2 text-right font-medium">Plán</th>
                    <th className="py-1.5 px-2 text-right font-medium">Skutečnost</th>
                    <th className="py-1.5 px-2 text-right font-medium">%</th>
                    <th className="py-1.5 pl-2 text-right font-medium">Hodiny</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byPhase.map((p) => {
                    const burn = p.plan > 0 ? (p.actual / p.plan) * 100 : 0;
                    return (
                      <tr key={p.phase} className="border-b">
                        <td className="py-1.5 pr-2">
                          <Badge variant="outline" className={cn("text-[10px]", PHASE_COLORS[p.phase] ?? "")}>
                            {p.phase}
                          </Badge>
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{formatCzk(p.plan)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{formatCzk(p.actual)}</td>
                        <td className={cn("py-1.5 px-2 text-right tabular-nums font-medium", burn > 100 ? "text-rose-600" : burn > 80 ? "text-amber-600" : "text-emerald-600")}>
                          {burn.toFixed(0)}%
                        </td>
                        <td className="py-1.5 pl-2 text-right tabular-nums">{formatNumber(p.hours, " h")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Category breakdown */}
            <div data-print-card>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide">Rozpad podle kategorií</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-1.5 pr-2 font-medium">Kategorie</th>
                    <th className="py-1.5 px-2 text-right font-medium">Plán</th>
                    <th className="py-1.5 px-2 text-right font-medium">Skutečnost</th>
                    <th className="py-1.5 pl-2 text-right font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byCategory.slice(0, 15).map((c) => {
                    const burn = c.plan > 0 ? (c.actual / c.plan) * 100 : 0;
                    return (
                      <tr key={c.category} className="border-b">
                        <td className="py-1.5 pr-2">{c.category}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{formatCzk(c.plan)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{formatCzk(c.actual)}</td>
                        <td className={cn("py-1.5 pl-2 text-right tabular-nums", burn > 100 ? "text-rose-600" : "text-emerald-600")}>
                          {burn.toFixed(0)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Alerts */}
            {(data.alerts.upcoming.length > 0 || data.alerts.overdue.length > 0 || data.alerts.overBudget.length > 0) && (
              <div data-print-card>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide">Upozornění</h3>
                <div className="space-y-1 text-xs">
                  {data.alerts.overdue.length > 0 && (
                    <div className="text-rose-700">
                      <strong>Zpožděné ({data.alerts.overdue.length}):</strong>{" "}
                      {data.alerts.overdue.map((it) => it.subcategory || it.category).join(", ")}
                    </div>
                  )}
                  {data.alerts.upcoming.length > 0 && (
                    <div className="text-sky-700">
                      <strong>Blížící se ({data.alerts.upcoming.length}):</strong>{" "}
                      {data.alerts.upcoming.map((it) => it.subcategory || it.category).join(", ")}
                    </div>
                  )}
                  {data.alerts.overBudget.length > 0 && (
                    <div className="text-rose-700">
                      <strong>Překročeno ({data.alerts.overBudget.length}):</strong>{" "}
                      {data.alerts.overBudget.map((it) => it.subcategory || it.category).join(", ")}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zavřít
          </Button>
          <Button onClick={handlePrint} disabled={isLoading}>
            <Printer className="mr-2 h-4 w-4" /> Tisk / Uložit jako PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
