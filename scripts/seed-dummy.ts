#!/usr/bin/env bun
// Seed script: creates dummy data for two projects under owner
// hanzliklukas2@gmail.com (Lukáš Hanzlík).
//
// Usage:
//   bun run scripts/seed-dummy.ts
//
// This is idempotent — it first deletes all existing data (except the
// owner user), then creates two fresh projects:
//   1. "Testovací projekt" — a simple 8-item budget for testing
//   2. "Troja Test" — a 49-item budget restored from CSV
//
// All projects are owned by hanzliklukas2@gmail.com.

import { db } from "../src/lib/db";
import * as fs from "fs";
import * as path from "path";

// ===== CSV parsing helpers (for Troja CSV import) =====
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

async function main() {
  console.log("🌱 Seeding dummy data...\n");

  // ===== Clean existing data =====
  console.log("🗑️  Cleaning existing data...");
  await db.timeEntry.deleteMany();
  await db.payment.deleteMany();
  await db.comment.deleteMany();
  await db.budgetItem.deleteMany();
  await db.contact.deleteMany();
  await db.note.deleteMany();
  await db.snapshot.deleteMany();
  await db.auditLog.deleteMany();
  await db.projectInvitation.deleteMany();
  await db.projectShareLink.deleteMany();
  await db.projectMember.deleteMany();
  await db.project.deleteMany();
  await db.account.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  console.log("   ✅ All data deleted\n");

  // ===== Create owner user =====
  console.log("👤 Creating owner user...");
  const owner = await db.user.create({
    data: {
      email: "hanzliklukas2@gmail.com",
      name: "Lukáš Hanzlík",
    },
  });
  console.log(`   ✅ User: ${owner.email} (id: ${owner.id})\n`);

  // ===== Create Project 1: Testovací projekt =====
  console.log("📦 Creating 'Testovací projekt'...");
  const testProject = await db.project.create({
    data: {
      name: "Testovací projekt",
      slug: "testovaci-projekt",
      address: "Praha 7, Holešovice",
      description: "Jednoduchý testovací projekt pro ověření funkcí aplikace. Obsahuje 8 položek rozpočtu v různých fázích.",
      ownerId: owner.id,
      starred: true,
      status: "active",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2027-06-30"),
    },
  });
  console.log(`   ✅ Project: ${testProject.name} (id: ${testProject.id})\n`);

  // ===== Create dummy budget items for Testovací projekt =====
  console.log("📝 Creating 8 budget items for Testovací projekt...");
  const testItems = [
    { category: "Příprava", subcategory: "Architekt - Projekt", phase: "Příprava", planCost: 150000, actualCost: 75000, actualHours: 12, planDays: 30, dateFrom: "2026-01-01", dateTo: "2026-01-31", required: true },
    { category: "Příprava", subcategory: "Statický posudek", phase: "Příprava", planCost: 25000, actualCost: 18000, actualHours: 4, planDays: 10, dateFrom: "2026-02-01", dateTo: "2026-02-10" },
    { category: "Demolice", subcategory: "Demoliční práce", phase: "Demolice", planCost: 80000, actualCost: 72000, actualHours: 80, planDays: 10, dateFrom: "2026-03-01", dateTo: "2026-03-10", required: true, completed: true },
    { category: "Hrubá stavba", subcategory: "Zdění - obvodové zdi", phase: "Hrubá stavba", planCost: 350000, actualCost: 120000, planDays: 30, dateFrom: "2026-04-01", dateTo: "2026-04-30", required: true },
    { category: "Hrubá stavba", subcategory: "Železobetonové věnce", phase: "Hrubá stavba", planCost: 120000, actualCost: 145000, actualHours: 50, planDays: 14, dateFrom: "2026-05-01", dateTo: "2026-05-15" },
    { category: "Zabydlování", subcategory: "Podlahy - dřevo", phase: "Zabydlování", planCost: 60000 },
    { category: "Instalace", subcategory: "Elektroinstalace", phase: "Hrubá stavba", planCost: 90000, planDays: 14, dateFrom: "2026-09-01", dateTo: "2026-09-15" },
    { category: "Zabydlování", subcategory: "Kuchyň", phase: "Zabydlování", planCost: 100000, planDays: 21, dateFrom: "2027-01-01", dateTo: "2027-01-31" },
  ];
  let testOrder = 0;
  for (const it of testItems) {
    await db.budgetItem.create({
      data: {
        projectId: testProject.id,
        category: it.category,
        subcategory: it.subcategory,
        phase: it.phase,
        required: it.required ?? false,
        completed: it.completed ?? false,
        planCost: it.planCost,
        flexibilityPercent: 10,
        planDays: it.planDays ?? null,
        dateFrom: it.dateFrom ? new Date(it.dateFrom) : null,
        dateTo: it.dateTo ? new Date(it.dateTo) : null,
        actualCost: it.actualCost ?? 0,
        actualHours: it.actualHours ?? 0,
        sortOrder: testOrder++,
      },
    });
  }
  console.log(`   ✅ 8 budget items created\n`);

  // ===== Create contacts for Testovací projekt =====
  console.log("👥 Creating 3 contacts for Testovací projekt...");
  const [architect, builder, self] = await Promise.all([
    db.contact.create({
      data: {
        projectId: testProject.id,
        name: "Ing. Pavel Novák",
        type: "architect",
        role: "Architekt",
        phone: "+420 777 123 456",
        email: "pavel.novak@architekt.cz",
        rating: 5,
      },
    }),
    db.contact.create({
      data: {
        projectId: testProject.id,
        name: "Stavební firma Hrázek s.r.o.",
        type: "company",
        role: "Hrubá stavba / Demolice",
        phone: "+420 222 333 444",
        email: "info@hrazek.cz",
        company: "Hrázek s.r.o.",
        ico: "12345678",
        rating: 4,
      },
    }),
    db.contact.create({
      data: {
        projectId: testProject.id,
        name: "Jan Svoboda (svépomoc)",
        type: "self",
        role: "Svépomoc - elektro, odpady",
        phone: "+420 555 666 777",
      },
    }),
  ]);
  console.log(`   ✅ 3 contacts created\n`);

  // ===== Create a few payments and time entries for Testovací projekt =====
  console.log("💰 Creating sample payments and time entries...");
  await db.payment.create({
    data: {
      budgetItemId: (await db.budgetItem.findFirst({ where: { projectId: testProject.id, subcategory: "Architekt - Projekt" } }))!.id,
      contactId: architect.id,
      amount: 75000,
      date: new Date("2026-01-20"),
      type: "invoice",
      vendor: "Ing. Pavel Novák",
      description: "Zálohová faktura - projektová dokumentace",
    },
  });
  await db.payment.create({
    data: {
      budgetItemId: (await db.budgetItem.findFirst({ where: { projectId: testProject.id, subcategory: "Demoliční práce" } }))!.id,
      contactId: builder.id,
      amount: 72000,
      date: new Date("2026-03-12"),
      type: "invoice",
      vendor: "Hrázek s.r.o.",
      description: "Faktura za demoliční práce",
    },
  });
  await db.timeEntry.create({
    data: {
      budgetItemId: (await db.budgetItem.findFirst({ where: { projectId: testProject.id, subcategory: "Demoliční práce" } }))!.id,
      contactId: self.id,
      workerName: "Jan Svoboda",
      workerType: "self",
      date: new Date("2026-03-05"),
      hours: 8,
      description: "Úklid po demolici",
    },
  });
  console.log(`   ✅ 2 payments + 1 time entry created\n`);

  // ===== Create Project 2: Troja Test (from CSV) =====
  console.log("📦 Creating 'Troja Test' (from CSV)...");
  const trojaProject = await db.project.create({
    data: {
      name: "Troja Test",
      slug: "troja-test",
      address: "Praha - Troja",
      description: "Rekonstrukce domu v Troji. Kompletní rozpočet obnoven z CSV souboru 'Troja - Rozpočet a náklady rekonstrukce'.",
      ownerId: owner.id,
      starred: false,
      status: "active",
      startDate: new Date("2026-08-20"),
      endDate: new Date("2029-12-31"),
    },
  });
  console.log(`   ✅ Project: ${trojaProject.name} (id: ${trojaProject.id})\n`);

  // ===== Import budget items from CSV for Troja Test =====
  console.log("📝 Importing budget items from CSV...");
  const csvPath = path.join(__dirname, "..", "upload", "Troja - Rozpočet a náklady rekonstrukce - Rozpočet a náklady rekonstrukce.csv");
  if (fs.existsSync(csvPath)) {
    const csv = fs.readFileSync(csvPath, "utf-8");
    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const dataLines = lines.slice(1);
    let order = 0;
    let currentCategory = "";
    let imported = 0;
    for (const line of dataLines) {
      const cols = parseCSVLine(line);
      if (cols.length < 14) continue;
      const [category, subcategory, nutne, poznamka, fase, prvek, planKcz, vule, planDni, datumOd, datumDo, skutecnostKcz, skutecnostHod, _zbyva, _cerpani] = cols;
      const trimmedCategory = (category || "").trim();
      if (trimmedCategory) currentCategory = trimmedCategory;
      const finalSubcategory = (subcategory || "").trim();
      const finalPhase = (fase || "Neurčeno").trim() || "Neurčeno";
      if (!finalSubcategory && !trimmedCategory) continue;
      const useCategory = currentCategory || "(bez kategorie)";
      const planCost = parseCzk(planKcz);
      const actualCost = parseCzk(skutecnostKcz);
      const actualHours = skutecnostHod ? parseFloat(skutecnostHod.replace(",", ".")) : null;
      const flexibility = parsePercent(vule);
      const planDays = planDni ? parseFloat(planDni.replace(",", ".")) : null;
      await db.budgetItem.create({
        data: {
          projectId: trojaProject.id,
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
    }
    console.log(`   ✅ ${imported} budget items imported from CSV\n`);
  } else {
    console.log("   ⚠️  CSV file not found, skipping Troja Test import\n");
  }

  // ===== Refresh materialized views =====
  console.log("🔄 Refreshing materialized views...");
  const VIEWS = ["mv_project_phase_stats", "mv_project_category_stats", "mv_project_totals", "mv_rolled_up_items"];
  for (const view of VIEWS) {
    try {
      await db.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY "${view}"`);
      console.log(`   ✅ ${view}`);
    } catch (err) {
      console.log(`   ⚠️  ${view}: ${(err as Error).message}`);
    }
  }

  // ===== Summary =====
  console.log("\n" + "=".repeat(60));
  console.log("🎉 Seed complete!");
  console.log("=".repeat(60));
  console.log(`\n👤 Owner: ${owner.email} (${owner.name})`);
  console.log(`   ID: ${owner.id}\n`);
  console.log("📦 Projects:");
  console.log(`   1. ${testProject.name} (slug: ${testProject.slug})`);
  console.log(`      - 8 budget items`);
  console.log(`      - 3 contacts`);
  console.log(`      - 2 payments + 1 time entry`);
  console.log(`   2. ${trojaProject.name} (slug: ${trojaProject.slug})`);
  console.log(`      - ~49 budget items (from CSV)`);
  console.log(`\n🔗 Open: http://localhost:3000/?project=${testProject.slug}`);
  console.log(`🔗 Open: http://localhost:3000/?project=${trojaProject.slug}`);

  await db.$disconnect();
}

main()
  .catch((e) => {
    console.error("\n❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
