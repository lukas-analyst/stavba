import { NextResponse } from "next/server";
import { dbRead } from "@/lib/db";
import { requireProjectAccess } from "@/lib/authz";

// GET /api/projects/[id]/audit/export
// Exports the full audit log as CSV (for compliance, archiving).
// Returns a CSV file with all entries, most recent first.
// Requires viewer+ access to the project.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireProjectAccess(id, "viewer");
    if (!access.ok) return access.response;

    const logs = await dbRead.auditLog.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 10000, // safety cap
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    const escapeCsv = (val: unknown): string => {
      const s = val === null || val === undefined ? "" : String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const formatCsvDate = (d: Date | null): string => {
      if (!d) return "";
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return `${day}.${month}.${d.getFullYear()} ${hours}:${minutes}`;
    };

    const header = [
      "Datum",
      "Autor",
      "Email",
      "Akce",
      "Typ entity",
      "Název entity",
      "Pole",
      "Původní hodnota",
      "Nová hodnota",
    ];

    const rows = logs.map((log) => [
      formatCsvDate(log.createdAt),
      log.user?.name ?? "Neznámý",
      log.user?.email ?? "",
      log.action === "create" ? "Vytvořeno" : log.action === "update" ? "Upraveno" : log.action === "delete" ? "Smazáno" : log.action,
      log.entityType,
      log.entityLabel ?? "",
      log.field ?? "",
      log.oldValue ?? "",
      log.newValue ?? "",
    ]);

    // BOM for Excel UTF-8 detection
    const csv = "\uFEFF" + [header, ...rows].map((r) => r.map(escapeCsv).join(",")).join("\r\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-log-${id}.csv"`,
      },
    });
  } catch (error) {
    console.error("GET audit export error:", error);
    return NextResponse.json({ error: "Failed to export audit log" }, { status: 500 });
  }
}
