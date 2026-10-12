import { db } from "@/lib/db";
import { getDefaultOwnerId } from "@/lib/default-owner";

// ============================================================
// Human-readable field value translations
// ------------------------------------------------------------
// Maps DB field names + raw values to Czech human-readable strings.
// Used by logChanges when storing oldValue/newValue so the audit
// log UI can display "Povinné" instead of "true", "Čtenář" instead
// of "viewer", etc.
// ============================================================

const FIELD_LABELS: Record<string, string> = {
  required: "Povinnost",
  completed: "Hotovo",
  rejected: "Zavrženo",
  starred: "Oblíbený",
  status: "Stav",
  role: "Role",
  phase: "Fáze",
  category: "Kategorie",
  subcategory: "Název",
  planCost: "Plán (Kč)",
  actualCost: "Skutečnost (Kč)",
  planDays: "Plán (dní)",
  flexibilityPercent: "Vůle (%)",
  dateFrom: "Datum od",
  dateTo: "Datum do",
  note: "Poznámka",
  name: "Jméno",
  email: "E-mail",
  phone: "Telefon",
  address: "Adresa",
  description: "Popis",
  currency: "Měna",
  ownerId: "Vlastník",
  contactId: "Kontakt",
  workerName: "Pracovník",
  workerType: "Typ pracovníka",
  workerCount: "Počet pracovníků",
  hours: "Hodiny",
  amount: "Částka",
  type: "Typ",
  vendor: "Firma",
  invoiceNumber: "Číslo faktury",
  vatRate: "Sazba DPH",
  vatAmount: "Částka DPH",
  website: "Web",
  company: "Firma",
  ico: "IČO",
  dic: "DIČ",
  rating: "Hodnocení",
  sortOrder: "Pořadí",
  text: "Text",
  author: "Autor",
};

// Translate raw field value to human-readable string
function translateValue(field: string, val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";

  const str = String(val);

  // Boolean fields → Czech
  if (field === "required") return str === "true" ? "Povinné" : "Nepovinné";
  if (field === "completed") return str === "true" ? "Hotovo" : "Nedokončeno";
  if (field === "rejected") return str === "true" ? "Zavrženo" : "Aktivní";
  if (field === "starred") return str === "true" ? "Oblíbený" : "Neoblíbený";

  // Role fields
  if (field === "role") {
    if (str === "viewer") return "Čtenář";
    if (str === "editor") return "Editor";
    if (str === "owner") return "Správce";
    return str;
  }

  // Status fields
  if (field === "status") {
    const map: Record<string, string> = {
      planning: "Plánování",
      active: "Aktivní",
      paused: "Pozastaveno",
      completed: "Dokončeno",
    };
    return map[str] ?? str;
  }

  // Worker type
  if (field === "workerType") {
    const map: Record<string, string> = {
      company: "Firma",
      craftsman: "Řemeslník",
      self: "Svépomoc",
      family: "Rodina",
    };
    return map[str] ?? str;
  }

  // Payment type
  if (field === "type") {
    const map: Record<string, string> = {
      receipt: "Účtenka",
      invoice: "Faktura",
      work: "Práce",
      material: "Materiál",
      person: "Osoba",
      other: "Jiné",
    };
    return map[str] ?? str;
  }

  // Contact type
  if (field === "contactType" || field === "type") {
    const map: Record<string, string> = {
      company: "Firma",
      craftsman: "Řemeslník",
      self: "Svépomoc",
      family: "Rodina",
      supplier: "Dodavatel",
      architect: "Architekt",
      office: "Úřad",
    };
    return map[str] ?? str;
  }

  // Currency
  if (field === "currency") return str;

  // Dates — format as dd.mm.yyyy
  if (field === "dateFrom" || field === "dateTo" || field === "startDate" || field === "endDate") {
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        return `${day}.${month}.${d.getFullYear()}`;
      }
    } catch {
      // fall through
    }
  }

  return str;
}

// Get human-readable field label
export function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

// Get human-readable value
export function getFieldValue(field: string, val: string | null): string {
  if (val === null || val === undefined) return "—";
  return translateValue(field, val);
}

// ============================================================
// Main audit logging function
// ============================================================
export async function logChanges(
  projectId: string,
  entityType: string,
  entityId: string,
  action: "create" | "update" | "delete",
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
  entityLabel?: string | null,
) {
  const userId = await getDefaultOwnerId();

  // Derive entityLabel from old/new data if not provided
  const label =
    entityLabel ??
    (newData as Record<string, unknown> | null)?.subcategory as string | null ??
    (newData as Record<string, unknown> | null)?.name as string | null ??
    (newData as Record<string, unknown> | null)?.workerName as string | null ??
    (newData as Record<string, unknown> | null)?.author as string | null ??
    (newData as Record<string, unknown> | null)?.firstName as string | null ??
    (oldData as Record<string, unknown> | null)?.subcategory as string | null ??
    (oldData as Record<string, unknown> | null)?.name as string | null ??
    null;

  if (action === "create" && newData) {
    await db.auditLog.create({
      data: {
        projectId,
        userId,
        entityType,
        entityId,
        entityLabel: label,
        action: "create",
        field: null,
        oldValue: null,
        // Store human-readable summary of what was created
        newValue: summarizeCreateData(entityType, newData),
      },
    });
    return;
  }

  if (action === "delete" && oldData) {
    await db.auditLog.create({
      data: {
        projectId,
        userId,
        entityType,
        entityId,
        entityLabel: label,
        action: "delete",
        field: null,
        // Store human-readable summary of what was deleted
        oldValue: summarizeDeleteData(entityType, oldData),
        newValue: null,
      },
    });
    return;
  }

  if (action === "update" && oldData && newData) {
    const entries = [];
    for (const key of Object.keys(newData)) {
      if (key === "updatedAt" || key === "createdAt") continue;
      const oldVal = oldData[key];
      const newVal = newData[key];
      const oldStr = oldVal instanceof Date ? oldVal.toISOString() : oldVal === null || oldVal === undefined ? "" : String(oldVal);
      const newStr = newVal instanceof Date ? newVal.toISOString() : newVal === null || newVal === undefined ? "" : String(newVal);
      if (oldStr !== newStr) {
        entries.push({
          projectId,
          userId,
          entityType,
          entityId,
          entityLabel: label,
          action: "update",
          field: key,
          // Store HUMAN-READABLE values (translated)
          oldValue: translateValue(key, oldVal) || null,
          newValue: translateValue(key, newVal) || null,
        });
      }
    }
    if (entries.length > 0) {
      await db.auditLog.createMany({ data: entries });
    }
  }
}

// ============================================================
// Summarize create/delete data as human-readable string
// ============================================================
function summarizeCreateData(entityType: string, data: Record<string, unknown>): string {
  const parts: string[] = [];

  switch (entityType) {
    case "ProjectMember": {
      const email = data.userEmail ?? data.email ?? "neznámý";
      const role = data.role === "editor" ? "Editor" : data.role === "owner" ? "Správce" : "Čtenář";
      return `Přidán člen (${role}): ${email}`;
    }
    case "BudgetItem": {
      if (data.subcategory) parts.push(String(data.subcategory));
      else if (data.category) parts.push(String(data.category));
      if (data.phase) parts.push(`Fáze: ${data.phase}`);
      if (data.planCost) parts.push(`Plán: ${data.planCost} Kč`);
      return `Vytvořena položka${parts.length > 0 ? " — " + parts.join(", ") : ""}`;
    }
    case "Payment": {
      if (data.amount) parts.push(`${data.amount} Kč`);
      if (data.type) parts.push(`Typ: ${translateValue("type", data.type)}`);
      if (data.vendor) parts.push(`Firma: ${data.vendor}`);
      return `Vytvořena platba${parts.length > 0 ? " — " + parts.join(", ") : ""}`;
    }
    case "TimeEntry": {
      if (data.workerName) parts.push(String(data.workerName));
      if (data.hours) parts.push(`${data.hours} h`);
      return `Vytvořen časový záznam${parts.length > 0 ? " — " + parts.join(", ") : ""}`;
    }
    case "Contact": {
      if (data.name) parts.push(String(data.name));
      if (data.type) parts.push(`Typ: ${translateValue("type", data.type)}`);
      return `Vytvořen kontakt${parts.length > 0 ? " — " + parts.join(", ") : ""}`;
    }
    case "ContactPerson": {
      const name = [data.firstName, data.lastName].filter(Boolean).join(" ");
      if (name) parts.push(name);
      if (data.role) parts.push(`Role: ${data.role}`);
      return `Vytvořena kontaktní osoba${parts.length > 0 ? " — " + parts.join(", ") : ""}`;
    }
    case "Note": {
      if (data.author) parts.push(`Autor: ${data.author}`);
      return `Vytvořena poznámka${parts.length > 0 ? " — " + parts.join(", ") : ""}`;
    }
    case "Project": {
      if (data.name) parts.push(String(data.name));
      return `Vytvořen projekt${parts.length > 0 ? " — " + parts.join(", ") : ""}`;
    }
    default:
      return JSON.stringify(data);
  }
}

function summarizeDeleteData(entityType: string, data: Record<string, unknown>): string {
  switch (entityType) {
    case "ProjectMember": {
      const email = data.userEmail ?? data.email ?? "neznámý";
      const role = data.role === "editor" ? "Editor" : data.role === "owner" ? "Správce" : "Čtenář";
      return `Odebrán člen (${role}): ${email}`;
    }
    case "BudgetItem": {
      const name = data.subcategory ?? data.category ?? "neznámá";
      return `Smazána položka: ${name}`;
    }
    case "Payment": {
      return `Smazána platba${data.amount ? ` (${data.amount} Kč)` : ""}`;
    }
    case "TimeEntry": {
      return `Smazán časový záznam${data.workerName ? ` (${data.workerName})` : ""}`;
    }
    case "Contact": {
      return `Smazán kontakt: ${data.name ?? "neznámý"}`;
    }
    case "ContactPerson": {
      const name = [data.firstName, data.lastName].filter(Boolean).join(" ");
      return `Smazána kontaktní osoba: ${name || "neznámá"}`;
    }
    case "Note": {
      return `Smazána poznámka${data.author ? ` (${data.author})` : ""}`;
    }
    case "Project": {
      return `Smazán projekt: ${data.name ?? "neznámý"}`;
    }
    default:
      return JSON.stringify(data);
  }
}
