#!/usr/bin/env bun
// Automated backup script for Stavba app data.
// Usage: bun run scripts/backup.ts
// Creates a timestamped JSON backup in /home/z/my-project/backups/

import { db } from "../src/lib/db";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const backupDir = path.join(__dirname, "..", "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const [projects, budgetItems, payments, contacts, timeEntries, snapshots, comments, auditLogs] =
    await Promise.all([
      db.project.findMany({ orderBy: { createdAt: "asc" } }),
      db.budgetItem.findMany({ orderBy: { sortOrder: "asc" } }),
      db.payment.findMany({ orderBy: { createdAt: "asc" } }),
      db.contact.findMany({ orderBy: { createdAt: "asc" } }),
      db.timeEntry.findMany({ orderBy: { createdAt: "asc" } }),
      db.snapshot.findMany({ orderBy: { createdAt: "asc" } }),
      db.comment.findMany({ orderBy: { createdAt: "asc" } }),
      db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 1000 }),
    ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    version: 2,
    projects,
    budgetItems,
    payments,
    contacts,
    timeEntries,
    snapshots,
    comments,
    auditLogs,
  };

  const today = new Date().toISOString().slice(0, 10);
  const filename = `stavba-backup-${today}.json`;
  const filepath = path.join(backupDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(payload, null, 2));

  console.log(`✅ Záloha vytvořena: ${filepath}`);
  console.log(`   Projekty: ${projects.length}`);
  console.log(`   Položky: ${budgetItems.length}`);
  console.log(`   Platby: ${payments.length}`);
  console.log(`   Kontakty: ${contacts.length}`);
  console.log(`   Časové záznamy: ${timeEntries.length}`);
  console.log(`   Snímky: ${snapshots.length}`);
  console.log(`   Komentáře: ${comments.length}`);
  console.log(`   Audit logy: ${auditLogs.length}`);
  console.log(`   Velikost: ${(fs.statSync(filepath).size / 1024).toFixed(1)} KB`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error("❌ Chyba při záloze:", e);
  process.exit(1);
});
