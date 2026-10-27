// Cleanup script for I1: migrate `element` field on BudgetItems.
// - Top-level items (parentId=null) with element set → create a new child
//   BudgetItem with subcategory = element, parentId = this item, then null
//   the element on the parent.
// - Child items (parentId!=null) with element set → migrate element to
//   subcategory if subcategory is empty; otherwise just null element.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const items = await prisma.budgetItem.findMany({
    where: { element: { not: null } },
  });

  console.log(`Found ${items.length} budget items with element != null`);

  let parentsMigrated = 0;
  let childrenMigrated = 0;
  let childrenCleaned = 0;
  let whitespaceOnly = 0;

  for (const it of items) {
    const elementValue = it.element?.trim() ?? "";
    if (!elementValue) {
      // Element is just whitespace or empty — null it directly
      await prisma.budgetItem.update({
        where: { id: it.id },
        data: { element: null },
      });
      whitespaceOnly++;
      continue;
    }

    if (it.parentId === null) {
      // Top-level item with element — create a new child BudgetItem (Úkol)
      const maxOrder = await prisma.budgetItem.aggregate({
        where: { projectId: it.projectId },
        _max: { sortOrder: true },
      });
      const child = await prisma.budgetItem.create({
        data: {
          projectId: it.projectId,
          category: it.category,
          subcategory: elementValue, // task name from element
          element: null,
          phase: it.phase, // inherited from parent
          required: false,
          completed: false,
          rejected: false,
          note: null,
          parentId: it.id,
          dependsOnId: null,
          planCost: null,
          flexibilityPercent: null,
          planDays: null,
          dateFrom: null,
          dateTo: null,
          actualCost: 0,
          actualHours: 0,
          sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        },
      });
      // Null the element on the parent (parent keeps its own plan/dates/actuals)
      await prisma.budgetItem.update({
        where: { id: it.id },
        data: { element: null },
      });
      console.log(
        `[parent] Migrated element "${elementValue}" from parent ${it.id} -> new child ${child.id}`,
      );
      parentsMigrated++;
    } else {
      // Child with element — migrate to subcategory if empty, otherwise null
      if (!it.subcategory || !it.subcategory.trim()) {
        await prisma.budgetItem.update({
          where: { id: it.id },
          data: { subcategory: elementValue, element: null },
        });
        console.log(
          `[child] Migrated element "${elementValue}" -> subcategory on child ${it.id}`,
        );
        childrenMigrated++;
      } else {
        await prisma.budgetItem.update({
          where: { id: it.id },
          data: { element: null },
        });
        console.log(
          `[child] Nulled element on child ${it.id} (subcategory already set: "${it.subcategory}")`,
        );
        childrenCleaned++;
      }
    }
  }

  console.log(`\n=== Cleanup summary ===`);
  console.log(`Parents migrated to new children: ${parentsMigrated}`);
  console.log(`Children with element -> subcategory: ${childrenMigrated}`);
  console.log(`Children with element nulled (subcategory already set): ${childrenCleaned}`);
  console.log(`Whitespace-only elements nulled: ${whitespaceOnly}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
