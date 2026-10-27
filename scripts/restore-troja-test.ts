#!/usr/bin/env bun
// Restore project "Troja-test" from the original CSV budget file.
//
// Usage:
//   bun run scripts/restore-troja-test.ts
//
// What it does:
//   1. (Optional) Backs up the entire database to /home/z/my-project/backups/
//      BEFORE making any changes — so we never lose data again.
//   2. Finds or creates a project named "Troja-test" (does NOT delete other
//      projects — only removes the "Troja-test" project if it already exists,
//      so the script is idempotent and safe to re-run).
//   3. Imports all budget items from
//      /home/z/my-project/upload/Troja - Rozpočet a náklady rekonstrukce - ...csv
//   4. Creates a few sample contacts (architekt, stavební firma, svépomoc)
//      so the user can start testing right away.
//
// IMPORTANT: This script NEVER touches other projects in the database.
// Only the "Troja-test" project (and its budget items / payments / time /
// contacts / notes / comments) is affected.

import { db } from "../src/lib/db";
import * as fs from "fs";
import * as path from "path";

// ===== CSV parsing helpers (copied from scripts/seed.ts) =====

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCzk(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[\s Kč]/g, "").replace(/\u00a0/g, "").trim();
  if (!cleaned) return null;
  const num = parseFloat(cleaned.replace(",", "."));
  return isNaN(num) ? null : num;
}

function parsePercent(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace("%", "").trim().replace(",", ".");
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseCzechDate(value: string): Date | null {
  if (!value) return null;
  const cleaned = value.trim();
  const m = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  const d = new Date(year, month - 1, day);
  return isNaN(d.getTime()) ? null : d;
}

function parseBoolean(value: string): boolean {
  const v = (value || "").trim().toUpperCase();
  return v === "TRUE" || v === "ANO" || v === "1" || v === "X";
}

// Generate a URL-safe slug from a project name (mirrors API logic)
function makeSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

// ===== Step 1: Backup the entire DB to a JSON file =====
async function backupDatabase(backupDir: string) {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const [projects, budgetItems, payments, contacts, timeEntries, snapshots, comments, notes, auditLogs] =
    await Promise.all([
      db.project.findMany({ orderBy: { createdAt: "asc" } }),
      db.budgetItem.findMany({ orderBy: { sortOrder: "asc" } }),
      db.payment.findMany({ orderBy: { createdAt: "asc" } }),
      db.contact.findMany({ orderBy: { createdAt: "asc" } }),
      db.timeEntry.findMany({ orderBy: { createdAt: "asc" } }),
      db.snapshot.findMany({ orderBy: { createdAt: "asc" } }),
      db.comment.findMany({ orderBy: { createdAt: "asc" } }),
      db.note.findMany({ orderBy: { createdAt: "asc" } }),
      db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 5000 }),
    ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    version: 3,
    projects,
    budgetItems,
    payments,
    contacts,
    timeEntries,
    snapshots,
    comments,
    notes,
    auditLogs,
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `stavba-backup-${stamp}.json`;
  const filepath = path.join(backupDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(payload, null, 2));

  console.log(`💾 Záloha vytvořena: ${filepath}`);
  console.log(
    `   Projekty: ${projects.length} · Položky: ${budgetItems.length} · Platby: ${payments.length} · ` +
    `Kontakty: ${contacts.length} · Čas: ${timeEntries.length} · Poznámky: ${notes.length}`,
  );
  console.log(`   Velikost: ${(fs.statSync(filepath).size / 1024).toFixed(1)} KB`);
  return filepath;
}

// ===== Step 2: Find or create the "Troja-test" project =====
async function findOrCreateTrojaTestProject() {
  const projectName = "Troja-test";
  const baseSlug = makeSlug(projectName);

  // Look for an existing project with this name OR slug
  const existing = await db.project.findFirst({
    where: { OR: [{ name: projectName }, { slug: baseSlug }] },
  });

  if (existing) {
    console.log(`🗑️  Projekt „${projectName}" již existuje — mažu jeho data (ostatní projekty zůstávají)...`);
    // Delete only this project's data (cascade will handle budgetItems, payments,
    // timeEntries, contacts, notes, snapshots, auditLogs that belong to it).
    // Comments belong to budgetItems, which cascade.
    await db.note.deleteMany({ where: { projectId: existing.id } });
    await db.snapshot.deleteMany({ where: { projectId: existing.id } });
    await db.auditLog.deleteMany({ where: { projectId: existing.id } });
    await db.timeEntry.deleteMany({ where: { budgetItem: { projectId: existing.id } } });
    await db.payment.deleteMany({ where: { budgetItem: { projectId: existing.id } } });
    await db.comment.deleteMany({ where: { budgetItem: { projectId: existing.id } } });
    await db.budgetItem.deleteMany({ where: { projectId: existing.id } });
    await db.contact.deleteMany({ where: { projectId: existing.id } });
    await db.project.delete({ where: { id: existing.id } });
    console.log(`   ✅ Smazáno.`);
  }

  // Generate a unique slug
  let slug = baseSlug;
  let suffix = 1;
  while (await db.project.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix++}`;
  }

  // Create the project
  const project = await db.project.create({
    data: {
      name: projectName,
      slug,
      address: "Praha - Troja (test)",
      description:
        "Testovací projekt pro ověření funkcí. Rozpočet obnoven z CSV souboru Troja - Rozpočet a náklady rekonstrukce.",
      starred: true,
      status: "active",
      startDate: parseCzechDate("20.8.2026")!,
      endDate: parseCzechDate("31.12.2029"),
    },
  });
  console.log(`✅ Vytvořen projekt: ${project.name} (slug: ${project.slug}, id: ${project.id})`);
  return project;
}

// ===== Step 3: Import budget items from CSV =====
async function importBudgetFromCsv(projectId: string) {
  const csvPath = path.join(
    __dirname,
    "..",
    "upload",
    "Troja - Rozpočet a náklady rekonstrukce - Rozpočet a náklady rekonstrukce.csv",
  );
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV soubor neexistuje: ${csvPath}`);
  }
  const csv = fs.readFileSync(csvPath, "utf-8");
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  // skip header
  const dataLines = lines.slice(1);

  let order = 0;
  let currentCategory = "";
  let imported = 0;

  for (const line of dataLines) {
    const cols = parseCSVLine(line);
    if (cols.length < 14) {
      console.log(`⚠️  Přeskočen neplatný řádek: ${line.substring(0, 60)}...`);
      continue;
    }
    const [
      category,
      subcategory,
      nutne,
      poznamka,
      fase,
      prvek,
      planKcz,
      vule,
      planDni,
      datumOd,
      datumDo,
      skutecnostKcz,
      skutecnostHod,
      _zbyva,
      _cerpani,
    ] = cols;

    const trimmedCategory = (category || "").trim();
    if (trimmedCategory) {
      currentCategory = trimmedCategory;
    }
    const finalSubcategory = (subcategory || "").trim();
    const finalPhase = (fase || "Neurčeno").trim() || "Neurčeno";

    if (!finalSubcategory && !trimmedCategory) {
      continue;
    }

    const useCategory = currentCategory || "(bez kategorie)";

    const planCost = parseCzk(planKcz);
    const actualCost = parseCzk(skutecnostKcz);
    const actualHours = skutecnostHod ? parseFloat(skutecnostHod.replace(",", ".")) : null;
    const flexibility = parsePercent(vule);
    const planDays = planDni ? parseFloat(planDni.replace(",", ".")) : null;

    const item = await db.budgetItem.create({
      data: {
        projectId,
        category: useCategory,
        subcategory: finalSubcategory || null,
        element: prvek?.trim() || null,
        phase: finalPhase,
        required: parseBoolean(nutne),
        note: poznamka?.trim() || null,
        planCost,
        flexibilityPercent: flexibility,
        planDays,
        dateFrom: parseCzechDate(datumOd),
        dateTo: parseCzechDate(datumDo),
        actualCost: actualCost || 0,
        actualHours: actualHours || 0,
        sortOrder: order++,
      },
    });

    imported++;
    if (imported <= 5 || imported % 10 === 0) {
      console.log(
        `  • [${order}] ${item.category} / ${item.subcategory || "-"} (plan: ${planCost ?? "-"} Kč)`,
      );
    }
  }
  console.log(`✅ Importováno ${imported} položek rozpočtu z CSV.`);
  return imported;
}

// ===== Step 4: Create sample contacts =====
async function createSampleContacts(projectId: string) {
  await db.contact.create({
    data: {
      projectId,
      name: "Ing. Pavel Novák",
      type: "architect",
      role: "Architekt",
      phone: "+420 777 123 456",
      email: "pavel.novak@architekt.cz",
      notes: "Projektová dokumentace pro Troja.",
      rating: 5,
    },
  });
  await db.contact.create({
    data: {
      projectId,
      name: "Stavební firma Hrázek s.r.o.",
      type: "company",
      role: "Hrubá stavba / Demolice",
      phone: "+420 222 333 444",
      email: "info@hrazek.cz",
      company: "Hrázek s.r.o.",
      notes: "Demolice + hrubá stavba.",
      rating: 4,
    },
  });
  await db.contact.create({
    data: {
      projectId,
      name: "Jan Svoboda (svépomoc)",
      type: "self",
      role: "Svépomoc - elektro, odpady, rozvody",
      phone: "+420 555 666 777",
      notes: "Svépomoc - rodinná výpomoc.",
    },
  });
  console.log(`✅ Vytvořeni 3 ukázkoví kontakty.`);
}

// ===== Main =====
async function main() {
  console.log("🔄 Obnova projektu Troja-test z CSV\n");
  console.log("=".repeat(60));

  // Step 1: Backup first
  const backupDir = path.join(__dirname, "..", "backups");
  console.log("\n📦 Krok 1: Záloha databáze");
  await backupDatabase(backupDir);

  // Step 2: Find/create the project
  console.log("\n📦 Krok 2: Vytvoření projektu Troja-test");
  const project = await findOrCreateTrojaTestProject();

  // Step 3: Import budget items from CSV
  console.log("\n📦 Krok 3: Import rozpočtu z CSV");
  const imported = await importBudgetFromCsv(project.id);

  // Step 4: Create sample contacts
  console.log("\n📦 Krok 4: Ukázkové kontakty");
  await createSampleContacts(project.id);

  console.log("\n" + "=".repeat(60));
  console.log(`🎉 Hotovo!`);
  console.log(`   Projekt: ${project.name}`);
  console.log(`   Slug:    ${project.slug}`);
  console.log(`   ID:      ${project.id}`);
  console.log(`   Položky: ${imported}`);
  console.log(`\n🔗 Otevřete v aplikaci: http://localhost:3000/?project=${project.slug}`);
  console.log(`\n💾 Záloha uložena v: ${backupDir}/`);
}

main()
  .catch((e) => {
    console.error("\n❌ Chyba:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
