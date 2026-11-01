#!/usr/bin/env bun
// Seed test users for project sharing & permissions testing.
//
// Creates 13 users with Czech names + emails. Idempotent — if a user
// with the given email already exists, it is skipped (no update).
//
// Usage: bun run scripts/seed-test-users.ts

import { db } from "../src/lib/db";

const TEST_USERS = [
  { email: "testovaci@uzivatel.cz", name: "Tomáš Testovací" },
  { email: "architekt@studio.cz", name: "Eva Architektová" },
  { email: "projekt@kancelar.cz", name: "Pavel Projektor" },
  { email: "elektro@instalace.cz", name: "Marek Elektrikář" },
  { email: "zednik@stavba.cz", name: "Josef Zedník" },
  { email: "instalater@vodovod.cz", name: "František Instalatér" },
  { email: "truhlarka@dyha.cz", name: "Anna Truhlářková" },
  { email: "majitel@rodinnudum.cz", name: "Karel Majitel" },
  { email: "manazer@firma.cz", name: "Petra Manažerka" },
  { email: "ucetni@kancelar.cz", name: "Lucie Účetní" },
  { email: "dozor@stavba.cz", name: "Oldřich Stavební dozor" },
  { email: "geodet@mereni.cz", name: "Radovan Geodet" },
  { email: "vykupce@reality.cz", name: "Michaela Reality" },
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const u of TEST_USERS) {
    const existing = await db.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`  ⏭️  Skipped (exists): ${u.email}`);
      skipped++;
      continue;
    }
    await db.user.create({ data: { email: u.email, name: u.name } });
    console.log(`  ✅ Created: ${u.email} (${u.name})`);
    created++;
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped (already existed).`);
  console.log(`Total test users in DB: ${TEST_USERS.length}`);
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
