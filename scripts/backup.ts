#!/usr/bin/env bun
// Automated + encrypted backup script for Stavba app data.
// Usage: bun run scripts/backup.ts
//
// Creates a timestamped backup of all project-scoped tables, encrypts
// it with AES-256-GCM (if BACKUP_ENCRYPTION_KEY is set), and writes it
// to /home/z/my-project/backups/. Old backups beyond the retention
// window are deleted automatically.
//
// SECURITY (audit fix H8): previously this script wrote plain-text
// JSON to disk containing contact names, phones, e-mails, payment
// vendors + invoice numbers, worker names, audit log entries — all
// unencrypted. Anyone with filesystem read on the dev box (or a CI
// log aggregator if backups/ is ever synced) got a full PII dump.
//
// The fix:
//   1. If BACKUP_ENCRYPTION_KEY (32-byte base64) is set, encrypt the
//      JSON payload with AES-256-GCM and write `.enc` instead of `.json`.
//      Format: base64(iv) || base64(tag) || base64(ciphertext) — all
//      concatenated with '.' so the file is a single string.
//   2. If BACKUP_ENCRYPTION_KEY is NOT set, refuse to run with an
//      error in non-interactive contexts. (We allow --insecure-plaintext
//      flag for local dev where encryption isn't feasible.)
//   3. Retention: keep only the last N days of backups (default 30),
//      delete the rest. Prevents PII accumulation on disk.
//
// The `users` table is intentionally NOT dumped (would leak password
// hashes + tokens). PII in the dumped tables (contacts, payments, etc.)
// is now encrypted at rest via the AES key.
//
// To restore from an encrypted backup:
//   bun run scripts/restore.ts backups/stavba-backup-2024-01-15.json.enc

import { db } from "../src/lib/db";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// =====================================================================
// Encryption helpers (AES-256-GCM)
// =====================================================================
// AES-256-GCM provides:
//   - Confidentiality (AES-256)
//   - Integrity + authenticity (GCM tag — tampering is detected)
//
// Format of the encrypted file (single line, ASCII-safe):
//   <base64(iv)>.<base64(tag)>.<base64(ciphertext)>
//
// iv:  12 bytes (96-bit, the recommended length for GCM)
// tag: 16 bytes (128-bit authentication tag)
// key: 32 bytes (256-bit) — loaded from BACKUP_ENCRYPTION_KEY env var,
//      which must be base64-encoded.

function loadEncryptionKey(): Buffer | null {
  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (!raw) return null;
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error(
      "BACKUP_ENCRYPTION_KEY is set but is not valid base64. " +
        "Expected a 32-byte (44-character base64) value.",
    );
  }
  if (key.length !== 32) {
    throw new Error(
      `BACKUP_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). ` +
        "Generate one with: openssl rand -base64 32",
    );
  }
  return key;
}

function encrypt(plaintext: Buffer, key: Buffer): string {
  // 12-byte IV is the GCM standard. NEVER reuse an IV with the same key.
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

// =====================================================================
// Retention — delete backups older than RETENTION_DAYS
// =====================================================================
function rotateOldBackups(backupDir: string, retentionDays: number): number {
  const files = fs.readdirSync(backupDir);
  const now = Date.now();
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  let deleted = 0;
  for (const file of files) {
    // Only touch our own backup files — leave other files alone.
    if (!file.startsWith("stavba-backup-") || (!file.endsWith(".json") && !file.endsWith(".enc"))) {
      continue;
    }
    const filepath = path.join(backupDir, file);
    try {
      const stat = fs.statSync(filepath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filepath);
        console.log(`   🗑️  Smazána stará záloha: ${file} (stará ${Math.floor((now - stat.mtimeMs) / (24 * 60 * 60 * 1000))} dní)`);
        deleted++;
      }
    } catch {
      // Ignore — file may have been removed concurrently.
    }
  }
  return deleted;
}

// =====================================================================
// Main
// =====================================================================
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);
const ALLOW_PLAINTEXT = process.argv.includes("--insecure-plaintext");

async function main() {
  const backupDir = path.join(__dirname, "..", "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Load encryption key (optional — see header comment).
  const encKey = loadEncryptionKey();
  if (!encKey && !ALLOW_PLAINTEXT) {
    console.error("❌ BACKUP_ENCRYPTION_KEY is not set.");
    console.error("   The backup contains PII (contact names, phones, e-mails, payment");
    console.error("   vendors, invoice numbers, audit-log entries). Refusing to write");
    console.error("   plaintext to disk without explicit opt-in.");
    console.error("");
    console.error("   To fix:");
    console.error("     1. Generate a key:  openssl rand -base64 32");
    console.error("     2. Set BACKUP_ENCRYPTION_KEY in your env (NOT in committed .env).");
    console.error("     3. Re-run this script.");
    console.error("");
    console.error("   For local dev where you accept the risk, use --insecure-plaintext.");
    process.exit(1);
  }
  if (!encKey && ALLOW_PLAINTEXT) {
    console.warn("⚠️  BACKUP_ENCRYPTION_KEY not set — writing PLAINTEXT backup.");
    console.warn("   This is acceptable ONLY for local dev. NEVER do this in production.");
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
    version: 3, // bumped: now encrypted when key is set
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
  const jsonStr = JSON.stringify(payload, null, 2);

  let filepath: string;
  let fileLabel: string;
  if (encKey) {
    const encrypted = encrypt(Buffer.from(jsonStr, "utf8"), encKey);
    filepath = path.join(backupDir, `stavba-backup-${today}.json.enc`);
    fileLabel = "encrypted (.enc)";
    fs.writeFileSync(filepath, encrypted, { mode: 0o600 });
  } else {
    filepath = path.join(backupDir, `stavba-backup-${today}.json`);
    fileLabel = "plaintext (.json)";
    // 0o600 = owner read+write only.
    fs.writeFileSync(filepath, jsonStr, { mode: 0o600 });
  }

  const sizeKb = (fs.statSync(filepath).size / 1024).toFixed(1);
  console.log(`✅ Záloha vytvořena: ${filepath}  [${fileLabel}]`);
  console.log(`   Projekty: ${projects.length}`);
  console.log(`   Položky: ${budgetItems.length}`);
  console.log(`   Platby: ${payments.length}`);
  console.log(`   Kontakty: ${contacts.length}`);
  console.log(`   Časové záznamy: ${timeEntries.length}`);
  console.log(`   Snímky: ${snapshots.length}`);
  console.log(`   Komentáře: ${comments.length}`);
  console.log(`   Audit logy: ${auditLogs.length}`);
  console.log(`   Velikost: ${sizeKb} KB`);

  // Rotate old backups.
  const deleted = rotateOldBackups(backupDir, RETENTION_DAYS);
  if (deleted > 0) {
    console.log(`   Rotace: smazáno ${deleted} záloh starších než ${RETENTION_DAYS} dní.`);
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error("❌ Chyba při záloze:", e);
  process.exit(1);
});
