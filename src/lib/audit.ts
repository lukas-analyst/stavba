import { db } from "@/lib/db";

// Helper to log changes to the audit log.
// Compares old and new values and logs only changed fields.
export async function logChanges(
  projectId: string,
  entityType: string,
  entityId: string,
  action: "create" | "update" | "delete",
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
) {
  if (action === "create" && newData) {
    await db.auditLog.create({
      data: {
        projectId,
        entityType,
        entityId,
        action: "create",
        field: null,
        oldValue: null,
        newValue: null,
      },
    });
    return;
  }

  if (action === "delete" && oldData) {
    await db.auditLog.create({
      data: {
        projectId,
        entityType,
        entityId,
        action: "delete",
        field: null,
        oldValue: JSON.stringify(oldData),
        newValue: null,
      },
    });
    return;
  }

  if (action === "update" && oldData && newData) {
    const entries = [];
    for (const key of Object.keys(newData)) {
      // Skip internal fields
      if (key === "updatedAt" || key === "createdAt") continue;
      const oldVal = oldData[key];
      const newVal = newData[key];
      // Compare as strings (handles Date objects)
      const oldStr = oldVal instanceof Date ? oldVal.toISOString() : oldVal === null || oldVal === undefined ? "" : String(oldVal);
      const newStr = newVal instanceof Date ? newVal.toISOString() : newVal === null || newVal === undefined ? "" : String(newVal);
      if (oldStr !== newStr) {
        entries.push({
          projectId,
          entityType,
          entityId,
          action: "update",
          field: key,
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
