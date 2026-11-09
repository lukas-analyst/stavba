-- ============================================================
-- Floorplan Module — SQL script pro vytvoření nových tabulek
-- ============================================================
-- Tento script vytvoří 5 nových tabulek pro modul Půdorys objektu.
--
-- BEZPEČNOST: Tento script pouze PŘIDÁVÁ nové tabulky (CREATE TABLE).
-- Nemodifikuje žádné existující tabulky. Všechna existující data
-- zůstávají beze změny.
--
-- Spuštění: NeonDB SQL Editor → vložte tento script → Run
-- ============================================================

-- 1. FloorplanFloor — patra a nárysy
CREATE TABLE IF NOT EXISTS "floorplan_floors" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "viewType" TEXT NOT NULL DEFAULT 'plan',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floorplan_floors_pkey" PRIMARY KEY ("id")
);

-- 2. FloorplanElement — jednotlivé prvky (zdi, okna, rozvody, ...)
CREATE TABLE IF NOT EXISTS "floorplan_elements" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "type" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "points" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "dxfHandle" TEXT,
    "dxfLayer" TEXT,
    "metadata" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floorplan_elements_pkey" PRIMARY KEY ("id")
);

-- 3. FloorplanElementBudgetItem — N:M junction (prvek ↔ BudgetItem)
CREATE TABLE IF NOT EXISTS "floorplan_element_budget_items" (
    "id" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "budgetItemId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'primary',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "floorplan_element_budget_items_pkey" PRIMARY KEY ("id")
);

-- 4. FloorplanSource — původní DXF soubory (záloha / re-import)
CREATE TABLE IF NOT EXISTS "floorplan_sources" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "floorId" TEXT,
    "fileName" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedBy" TEXT,
    "layerMappings" TEXT,
    "entityCount" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "floorplan_sources_pkey" PRIMARY KEY ("id")
);

-- 5. FloorplanEditLock — edit mode lock
CREATE TABLE IF NOT EXISTS "floorplan_edit_locks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floorplan_edit_locks_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- Foreign Keys
-- ============================================================

-- floorplan_floors → projects
ALTER TABLE "floorplan_floors"
  ADD CONSTRAINT "floorplan_floors_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- floorplan_elements → floorplan_floors
ALTER TABLE "floorplan_elements"
  ADD CONSTRAINT "floorplan_elements_floorId_fkey"
  FOREIGN KEY ("floorId") REFERENCES "floorplan_floors"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- floorplan_elements → projects (denormalized)
ALTER TABLE "floorplan_elements"
  ADD CONSTRAINT "floorplan_elements_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- floorplan_elements → floorplan_elements (self-reference — hierarchy)
ALTER TABLE "floorplan_elements"
  ADD CONSTRAINT "floorplan_elements_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "floorplan_elements"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- floorplan_element_budget_items → floorplan_elements
ALTER TABLE "floorplan_element_budget_items"
  ADD CONSTRAINT "floorplan_element_budget_items_elementId_fkey"
  FOREIGN KEY ("elementId") REFERENCES "floorplan_elements"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- floorplan_element_budget_items → budget_items
ALTER TABLE "floorplan_element_budget_items"
  ADD CONSTRAINT "floorplan_element_budget_items_budgetItemId_fkey"
  FOREIGN KEY ("budgetItemId") REFERENCES "budget_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- floorplan_sources → projects
ALTER TABLE "floorplan_sources"
  ADD CONSTRAINT "floorplan_sources_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- floorplan_sources → floorplan_floors (optional — SetNull on delete)
ALTER TABLE "floorplan_sources"
  ADD CONSTRAINT "floorplan_sources_floorId_fkey"
  FOREIGN KEY ("floorId") REFERENCES "floorplan_floors"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- floorplan_edit_locks → projects
ALTER TABLE "floorplan_edit_locks"
  ADD CONSTRAINT "floorplan_edit_locks_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- floorplan_edit_locks → users
ALTER TABLE "floorplan_edit_locks"
  ADD CONSTRAINT "floorplan_edit_locks_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- Indexes
-- ============================================================

-- floorplan_floors indexes
CREATE INDEX IF NOT EXISTS "floorplan_floors_projectId_idx"
  ON "floorplan_floors"("projectId");
CREATE INDEX IF NOT EXISTS "floorplan_floors_projectId_sortOrder_idx"
  ON "floorplan_floors"("projectId", "sortOrder");
CREATE INDEX IF NOT EXISTS "floorplan_floors_projectId_viewType_idx"
  ON "floorplan_floors"("projectId", "viewType");

-- floorplan_elements indexes
CREATE INDEX IF NOT EXISTS "floorplan_elements_floorId_idx"
  ON "floorplan_elements"("floorId");
CREATE INDEX IF NOT EXISTS "floorplan_elements_projectId_idx"
  ON "floorplan_elements"("projectId");
CREATE INDEX IF NOT EXISTS "floorplan_elements_parentId_idx"
  ON "floorplan_elements"("parentId");
CREATE INDEX IF NOT EXISTS "floorplan_elements_layer_idx"
  ON "floorplan_elements"("layer");
CREATE INDEX IF NOT EXISTS "floorplan_elements_type_idx"
  ON "floorplan_elements"("type");
CREATE INDEX IF NOT EXISTS "floorplan_elements_projectId_layer_idx"
  ON "floorplan_elements"("projectId", "layer");
CREATE INDEX IF NOT EXISTS "floorplan_elements_projectId_type_idx"
  ON "floorplan_elements"("projectId", "type");

-- floorplan_element_budget_items indexes
CREATE INDEX IF NOT EXISTS "floorplan_element_budget_items_elementId_idx"
  ON "floorplan_element_budget_items"("elementId");
CREATE INDEX IF NOT EXISTS "floorplan_element_budget_items_budgetItemId_idx"
  ON "floorplan_element_budget_items"("budgetItemId");
CREATE UNIQUE INDEX IF NOT EXISTS "floorplan_element_budget_items_elementId_budgetItemId_role_key"
  ON "floorplan_element_budget_items"("elementId", "budgetItemId", "role");

-- floorplan_sources indexes
CREATE INDEX IF NOT EXISTS "floorplan_sources_projectId_idx"
  ON "floorplan_sources"("projectId");
CREATE INDEX IF NOT EXISTS "floorplan_sources_floorId_idx"
  ON "floorplan_sources"("floorId");

-- floorplan_edit_locks indexes
CREATE INDEX IF NOT EXISTS "floorplan_edit_locks_projectId_idx"
  ON "floorplan_edit_locks"("projectId");
CREATE UNIQUE INDEX IF NOT EXISTS "floorplan_edit_locks_projectId_key"
  ON "floorplan_edit_locks"("projectId");

-- ============================================================
-- Update updatedAt trigger (pro automatické aktualizace)
-- ============================================================
-- NeonDB (PostgreSQL) potřebuje trigger pro automatické updatedAt.
-- Prisma to nastavuje přes @updatedAt, ale na DB úrovni je potřeba trigger.

CREATE OR REPLACE FUNCTION "update_updatedAt_column"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS "floorplan_floors_updatedAt"
  BEFORE UPDATE ON "floorplan_floors"
  FOR EACH ROW EXECUTE FUNCTION "update_updatedAt_column"();

CREATE TRIGGER IF NOT EXISTS "floorplan_elements_updatedAt"
  BEFORE UPDATE ON "floorplan_elements"
  FOR EACH ROW EXECUTE FUNCTION "update_updatedAt_column"();

-- ============================================================
-- Verifikace — po spuštění zkontrolujte:
-- ============================================================
-- SELECT COUNT(*) FROM floorplan_floors;       -- mělo by být 0
-- SELECT COUNT(*) FROM floorplan_elements;     -- mělo by být 0
-- SELECT COUNT(*) FROM floorplan_sources;      -- mělo by být 0
-- SELECT COUNT(*) FROM floorplan_edit_locks;  -- mělo by být 0
--
-- Existující tabulky (nesmí se změnit):
-- SELECT COUNT(*) FROM budget_items;  -- musí být stejné jako před
-- SELECT COUNT(*) FROM projects;      -- musí být stejné jako před
