import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/projects/[id]/export-csv?type=budget|payments|time
// Returns a CSV file with the project's data, ready for Excel/Google Sheets.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "budget";

    const project = await db.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const escapeCsv = (val: unknown): string => {
      const s = val === null || val === undefined ? "" : String(val);
      // Escape quotes and wrap in quotes if needed
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const formatCsvDate = (d: Date | null): string => {
      if (!d) return "";
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      return `${day}.${month}.${d.getFullYear()}`;
    };

    let header: string[];
    let rows: string[][];
    let filename: string;

    if (type === "payments") {
      const payments = await db.payment.findMany({
        where: { budgetItem: { projectId: id } },
        orderBy: { date: "desc" },
        include: {
          budgetItem: { select: { category: true, subcategory: true } },
          contact: { select: { name: true } },
        },
      });
      header = [
        "Datum",
        "Kategorie",
        "Položka",
        "Typ",
        "Částka",
        "Faktura celkem",
        "Splátka z",
        "Firma",
        "Číslo faktury",
        "Kontakt",
        "Popis",
      ];
      const typeLabels: Record<string, string> = {
        receipt: "Účtenka",
        invoice: "Faktura",
        work: "Práce",
        material: "Materiál",
        person: "Osoba",
        other: "Jiné",
      };
      rows = payments.map((p) => [
        formatCsvDate(p.date),
        p.budgetItem?.category ?? "",
        p.budgetItem?.subcategory ?? "",
        typeLabels[p.type] ?? p.type,
        String(p.amount),
        p.invoiceTotal ? String(p.invoiceTotal) : "",
        p.installmentOf ? "Ano" : "",
        p.vendor ?? "",
        p.invoiceNumber ?? "",
        p.contact?.name ?? "",
        p.description ?? "",
      ]);
      filename = `${project.name}-platby.csv`;
    } else if (type === "time") {
      const entries = await db.timeEntry.findMany({
        where: { budgetItem: { projectId: id } },
        orderBy: { date: "desc" },
        include: {
          budgetItem: { select: { category: true, subcategory: true } },
          contact: { select: { name: true } },
        },
      });
      header = [
        "Datum od",
        "Datum do",
        "Kategorie",
        "Položka",
        "Pracovník",
        "Typ",
        "Hodiny",
        "Kontakt",
        "Popis",
      ];
      const workerTypeLabels: Record<string, string> = {
        company: "Firma",
        craftsman: "Řemeslník",
        self: "Svépomoc",
        family: "Rodina",
      };
      rows = entries.map((t) => [
        formatCsvDate(t.date),
        formatCsvDate(t.dateTo),
        t.budgetItem?.category ?? "",
        t.budgetItem?.subcategory ?? "",
        t.workerName,
        workerTypeLabels[t.workerType] ?? t.workerType,
        String(t.hours),
        t.contact?.name ?? "",
        t.description ?? "",
      ]);
      filename = `${project.name}-cas.csv`;
    } else {
      // budget
      const items = await db.budgetItem.findMany({
        where: { projectId: id },
        orderBy: [{ sortOrder: "asc" }],
      });
      header = [
        "Kategorie",
        "Podkategorie",
        "Prvek",
        "Fáze",
        "Nutné",
        "Hotovo",
        "Poznámka",
        "Jednotková cena",
        "Plán (Kč)",
        "Vůle (%)",
        "Plán (dní)",
        "Datum od",
        "Datum do",
        "Skutečnost (Kč)",
        "Skutečnost (hod)",
        "Ušetřeno",
      ];
      rows = items.map((it) => {
        const saved =
          it.completed && it.planCost
            ? Math.max(0, it.planCost - (it.actualCost || 0))
            : 0;
        return [
          it.category,
          it.subcategory ?? "",
          it.element ?? "",
          it.phase,
          it.required ? "Ano" : "",
          it.completed ? "Ano" : "",
          it.note ?? "",
          it.unitPrice ?? "",
          it.planCost ? String(it.planCost) : "",
          it.flexibilityPercent ? String(it.flexibilityPercent) : "",
          it.planDays ? String(it.planDays) : "",
          formatCsvDate(it.dateFrom),
          formatCsvDate(it.dateTo),
          String(it.actualCost),
          String(it.actualHours),
          String(saved),
        ];
      });
      filename = `${project.name}-rozpocet.csv`;
    }

    // BOM for Excel UTF-8 detection
    const csv = "\uFEFF" + [header, ...rows].map((r) => r.map(escapeCsv).join(",")).join("\r\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error) {
    console.error("GET export-csv error:", error);
    return NextResponse.json({ error: "Failed to export CSV" }, { status: 500 });
  }
}
