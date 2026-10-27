// Quick test-data seeder — creates one project with budget items,
// a couple of payments, and a couple of time entries, so we can verify
// dashboard alerts, single-click on rows, double-click to edit,
// and the SearchableSelect dropdown scroll behavior.
//
// Run with: bun run scripts/seed-test.ts

import { db } from "../src/lib/db";

async function main() {
  console.log("🌱 Seeding test data…");

  // Clean
  await db.timeEntry.deleteMany();
  await db.payment.deleteMany();
  await db.comment.deleteMany();
  await db.budgetItem.deleteMany();
  await db.contact.deleteMany();
  await db.note.deleteMany();
  await db.snapshot.deleteMany();
  await db.auditLog.deleteMany();
  await db.project.deleteMany();

  // Project
  const project = await db.project.create({
    data: {
      name: "Test Rozpočet",
      slug: "test-rozpočet",
      address: "Praha",
      description: "Testovací projekt pro ověření nových funkcí.",
      starred: true,
      status: "active",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2027-12-31"),
    },
  });
  console.log(`✅ Project: ${project.name} (${project.id})`);

  // Contacts
  const [contact1, contact2] = await Promise.all([
    db.contact.create({
      data: {
        projectId: project.id,
        name: "Jan Svoboda",
        type: "craftsman",
        role: "Zedník",
        phone: "+420 777 111 222",
      },
    }),
    db.contact.create({
      data: {
        projectId: project.id,
        name: "Firma Stavby s.r.o.",
        type: "company",
        role: "Hrubá stavba",
        company: "Stavby s.r.o.",
        ico: "12345678",
      },
    }),
  ]);

  // Budget items — mix of states (planned, in-progress, completed, overdue, over-budget, unscheduled)
  const items: { id: string; category: string; subcategory: string }[] = [];
  const defs: Array<{
    category: string;
    subcategory: string;
    phase: string;
    planCost: number;
    actualCost?: number;
    actualHours?: number;
    planDays?: number;
    dateFrom?: Date;
    dateTo?: Date;
    completed?: boolean;
    rejected?: boolean;
    required?: boolean;
  }> = [
    // In-progress: has actualCost, not completed
    {
      category: "Příprava",
      subcategory: "Architekt - Projekt",
      phase: "Příprava",
      planCost: 100000,
      actualCost: 50000,
      actualHours: 12,
      planDays: 30,
      dateFrom: new Date("2026-01-01"),
      dateTo: new Date("2026-12-31"),
      required: true,
    },
    {
      category: "Příprava",
      subcategory: "Statický posudek",
      phase: "Příprava",
      planCost: 25000,
      actualCost: 12000,
      actualHours: 4,
      dateFrom: new Date("2026-02-01"),
      dateTo: new Date("2026-03-15"),
    },
    // Completed
    {
      category: "Demolice",
      subcategory: "Demoliční práce",
      phase: "Demolice",
      planCost: 80000,
      actualCost: 72000,
      actualHours: 80,
      planDays: 10,
      dateFrom: new Date("2026-03-01"),
      dateTo: new Date("2026-03-10"),
      completed: true,
      required: true,
    },
    // Overdue: dateTo in past, actualCost < planCost
    {
      category: "Hrubá stavba",
      subcategory: "Zdění - obvodové zdi",
      phase: "Hrubá stavba",
      planCost: 350000,
      actualCost: 100000,
      planDays: 30,
      dateFrom: new Date("2026-04-01"),
      dateTo: new Date("2026-04-30"), // past
      required: true,
    },
    // Over-budget: actualCost > planCost
    {
      category: "Hrubá stavba",
      subcategory: "Železobetonové věnce",
      phase: "Hrubá stavba",
      planCost: 120000,
      actualCost: 145000,
      actualHours: 50,
      dateFrom: new Date("2026-05-01"),
      dateTo: new Date("2026-05-15"),
    },
    // Unscheduled: no dates, has planCost
    {
      category: "Zabydlování",
      subcategory: "Podlahy - dřevo",
      phase: "Zabydlování",
      planCost: 60000,
    },
    // Upcoming: dateFrom in next 30 days, no actualCost
    {
      category: "Instalace",
      subcategory: "Elektroinstalace",
      phase: "Hrubá stavba",
      planCost: 90000,
      planDays: 14,
      dateFrom: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // +10 days
      dateTo: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
    },
    // Plain planned (later than 30 days)
    {
      category: "Zabydlování",
      subcategory: "Kuchyň",
      phase: "Zabydlování",
      planCost: 100000,
      planDays: 21,
      dateFrom: new Date("2027-01-01"),
      dateTo: new Date("2027-01-31"),
    },
  ];

  let sortOrder = 0;
  for (const def of defs) {
    const it = await db.budgetItem.create({
      data: {
        projectId: project.id,
        category: def.category,
        subcategory: def.subcategory,
        element: null,
        phase: def.phase,
        required: def.required ?? false,
        completed: def.completed ?? false,
        rejected: def.rejected ?? false,
        note: null,
        planCost: def.planCost,
        flexibilityPercent: 10,
        planDays: def.planDays ?? null,
        dateFrom: def.dateFrom ?? null,
        dateTo: def.dateTo ?? null,
        actualCost: def.actualCost ?? 0,
        actualHours: def.actualHours ?? 0,
        sortOrder: sortOrder++,
      },
    });
    items.push({ id: it.id, category: it.category, subcategory: it.subcategory || "" });
    console.log(`  - ${it.category} / ${it.subcategory}`);

    // Add payments for items with actualCost
    if (def.actualCost && def.actualCost > 0) {
      await db.payment.create({
        data: {
          budgetItemId: it.id,
          contactId: contact1.id,
          amount: def.actualCost,
          date: new Date(),
          type: "invoice",
          vendor: "Firma X",
          description: "Zálohová faktura",
        },
      });
    }

    // Add time entries for items with actualHours
    if (def.actualHours && def.actualHours > 0) {
      await db.timeEntry.create({
        data: {
          budgetItemId: it.id,
          contactId: contact2.id,
          workerName: "Jan Svoboda",
          workerType: "craftsman",
          date: new Date(),
          hours: def.actualHours,
          description: "Práce na položce",
        },
      });
    }
  }

  console.log(`✅ Created ${items.length} budget items`);
  console.log(`\n🔗 Open: http://localhost:3000/?project=${project.slug}`);
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
