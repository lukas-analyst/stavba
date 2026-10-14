import { db } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import {
  FIELD_LABELS,
  translateValue,
  getFieldLabel,
  getFieldValue,
} from "@/lib/audit-fields";

// Re-export for backwards compatibility
export { FIELD_LABELS, translateValue, getFieldLabel, getFieldValue };

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
  // Get the authenticated user's ID. If unauthenticated, log with null
  // userId (AuditLog.userId is String? with onDelete: SetNull) rather
  // than attributing to a hardcoded "default owner".
  const { user } = await requireUser();
  const userId = user?.id ?? null;

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
          // B28: Store RAW values (not translated). The comparison above
          // (oldStr !== newStr) is also on raw values — using raw values
          // for storage keeps the two consistent. Translation to a
          // human-readable Czech string happens in the UI layer
          // (audit-log-dialog.tsx via `translateValue`) so the DB keeps
          // lossless originals and the UI can be updated without
          // re-migrating old audit rows.
          oldValue: oldStr || null,
          newValue: newStr || null,
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
