import { db } from "../src/lib/db";
import * as fs from "fs";
import * as path from "path";

// CSV is comma-separated with quoted fields that may contain commas
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

// Parse "25 000 Kč" -> 25000
function parseCzk(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[\s Kč]/g, "").replace(/\u00a0/g, "").trim();
  if (!cleaned) return null;
  const num = parseFloat(cleaned.replace(",", "."));
  return isNaN(num) ? null : num;
}

// Parse "50%" -> 50
function parsePercent(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace("%", "").trim().replace(",", ".");
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Parse "20.8.2026" -> Date
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
  console.log("🌱 Starting seed...");

  const csvPath = path.join(
    __dirname,
    "..",
    "upload",
    "Troja - Rozpočet a náklady rekonstrukce - Rozpočet a náklady rekonstrukce.csv",
  );
  const csv = fs.readFileSync(csvPath, "utf-8");
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  // skip header
  const dataLines = lines.slice(1);

  // Clean existing data
  await db.timeEntry.deleteMany();
  await db.payment.deleteMany();
  await db.budgetItem.deleteMany();
  await db.contact.deleteMany();
  await db.project.deleteMany();

  // Create the Troja project
  const project = await db.project.create({
    data: {
      name: "Troja",
      address: "Praha - Troja",
      description:
        "Rekonstrukce domu v Troji - kompletní přestavba 56 m² + 21 m² spodku a 56 m² horního patra.",
      starred: true,
      status: "active",
      startDate: parseCzechDate("20.8.2026")!,
      endDate: parseCzechDate("31.12.2029"),
    },
  });
  console.log(`✅ Created project: ${project.name} (${project.id})`);

  let order = 0;
  let currentCategory = ""; // tracks the "inherited" category from previous rows
  for (const line of dataLines) {
    const cols = parseCSVLine(line);
    if (cols.length < 14) {
      console.log(`⚠️ Skipping malformed line: ${line.substring(0, 60)}...`);
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
    // If category is present on this row, it becomes the new "current" category
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
        projectId: project.id,
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

    console.log(
      `  • [${order}] ${item.category} / ${item.subcategory || "-"} (plan: ${planCost ?? "-"} Kč)`,
    );
  }

  // Add a couple of sample contacts to demonstrate the feature
  await db.contact.create({
    data: {
      projectId: project.id,
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
      projectId: project.id,
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
      projectId: project.id,
      name: "Jan Svoboda (svépomoc)",
      type: "self",
      role: "Svépomoc - elektro, odpady, rozvody",
      phone: "+420 555 666 777",
      notes: "Svépomoc - rodinná výpomoc.",
    },
  });

  console.log(`✅ Created 3 sample contacts`);
  console.log(`🎉 Seed complete! Project ID: ${project.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
