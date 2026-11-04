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
// Sensitive field redaction (audit fix L1)
// ------------------------------------------------------------
// Defensive allow-list of field names that MUST NEVER be persisted
// to AuditLog.oldValue / AuditLog.newValue, even if a future entity
// starts passing them through `logChanges`. Currently `logChanges`
// is only called for project-scoped entities (BudgetItem, Payment,
// TimeEntry, Contact, ContactPerson, Note, Project, ProjectMember,
// BudgetItemLink) which don't hold secrets — but a future entity
// with a `password`, `apiKey`, `token`, or `*_token` field would
// otherwise have its value written to the audit log in plaintext.
//
// When a redacted field appears in a diff, we store the literal
// string "[REDACTED]" instead of the actual value. This preserves
// the audit signal "the field changed" without leaking the secret.
// ============================================================
const REDACTED_FIELDS = new Set([
  "password",
  "passwordHash",
  "token",
  "secret",
  "apiKey",
  "api_key",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "idToken",
  "id_token",
  "emailVerifyToken",
  "passwordResetToken",
  "clientSecret",
  "client_secret",
  "cronSecret",
  "nextauthSecret",
  "nextauth_secret",
  "brevoApiKey",
  "brevo_api_key",
]);

function isRedactedField(key: string): boolean {
  // Exact match (case-sensitive — field names in our schema are camelCase).
  if (REDACTED_FIELDS.has(key)) return true;
  // Heuristic: any key ending in `_token`, `_secret`, `_key`, `Token`,
  // `Secret`, `Key` is treated as sensitive. Catches future fields
  // without requiring an update to the set above.
  return (
    /Token$/.test(key) ||
    /Secret$/.test(key) ||
    /Key$/.test(key) ||
    /_token$/.test(key) ||
    /_secret$/.test(key) ||
    /_key$/.test(key)
  );
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

      // SECURITY (audit fix L1): redact sensitive fields (password,
      // tokens, secrets, API keys) before storing in AuditLog. This
      // is a defensive guard — currently no project-scoped entity has
      // these fields, but a future one might.
      if (isRedactedField(key)) {
        const oldRedacted = oldVal === null || oldVal === undefined ? "" : "[REDACTED]";
        const newRedacted = newVal === null || newVal === undefined ? "" : "[REDACTED]";
        if (oldRedacted !== newRedacted) {
          entries.push({
            projectId,
            userId,
            entityType,
            entityId,
            entityLabel: label,
            action: "update",
            field: key,
            oldValue: oldRedacted || null,
            newValue: newRedacted || null,
          });
        }
        continue;
      }

      // Convert values to storable strings. Objects (e.g. Prisma relations
      // like `contact: { id, name }`) would produce "[object Object]" via
      // String() — instead, extract a readable value or JSON-stringify.
      const toStr = (v: unknown): string => {
        if (v instanceof Date) return v.toISOString();
        if (v === null || v === undefined) return "";
        if (typeof v === "object") {
          // Try common name fields for relation objects
          const obj = v as Record<string, unknown>;
          if (typeof obj.name === "string") return obj.name;
          if (typeof obj.subcategory === "string") return obj.subcategory;
          if (typeof obj.email === "string") return obj.email;
          if (typeof obj.id === "string") return `ID: ${obj.id.slice(-8)}`;
          // Fallback: JSON stringify (truncated)
          try {
            const json = JSON.stringify(obj);
            return json.length > 80 ? json.slice(0, 77) + "…" : json;
          } catch {
            return "[objekt]";
          }
        }
        return String(v);
      };
      const oldStr = toStr(oldVal);
      const newStr = toStr(newVal);
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
