// =====================================================================
// Audit field translations — pure functions, no DB/server dependencies
// ---------------------------------------------------------------------
// This file is safe to import from client components.
// It contains only the translation logic (FIELD_LABELS, translateValue,
// getFieldValue, getFieldLabel) that was previously in audit.ts.
//
// audit.ts re-exports from here for backwards compatibility.
// =====================================================================

export const FIELD_LABELS: Record<string, string> = {
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

/** Translate raw field value to human-readable string. Pure function. */
export function translateValue(field: string, val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";

  // Handle objects (e.g., contact, budgetItem relations) — extract readable name
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    // Try common name fields
    if (typeof obj.name === "string") return obj.name;
    if (typeof obj.subcategory === "string") return obj.subcategory;
    if (typeof obj.category === "string") return obj.category;
    if (typeof obj.workerName === "string") return obj.workerName;
    if (typeof obj.author === "string") return obj.author;
    if (typeof obj.email === "string") return obj.email;
    if (typeof obj.firstName === "string" && typeof obj.lastName === "string") {
      return `${obj.firstName} ${obj.lastName}`;
    }
    // For objects with just an id, show the id (short)
    if (typeof obj.id === "string") return `ID: ${obj.id.slice(-8)}`;
    // Fallback: try JSON stringify but truncate
    try {
      const json = JSON.stringify(obj);
      return json.length > 60 ? json.slice(0, 60) + "…" : json;
    } catch {
      return "[objekt]";
    }
  }

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

/** Get human-readable field label. Pure function. */
export function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/** Get human-readable value. Pure function. */
export function getFieldValue(field: string, val: string | null): string {
  if (val === null || val === undefined) return "—";
  return translateValue(field, val);
}
