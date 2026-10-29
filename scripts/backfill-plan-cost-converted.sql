-- =====================================================================
-- Backfill: Set planCostConverted = planCost for budget items without foreign currency
-- ---------------------------------------------------------------------
-- Same issue as payments — existing budget items had planCostConverted = null
-- after the column was added. Fix them:
--
-- For items where planCostCurrency IS NULL (project's default currency):
--   planCostConverted = planCost
-- =====================================================================

UPDATE budget_items
SET "planCostConverted" = "planCost"
WHERE "planCostConverted" IS NULL
  AND ("planCostCurrency" IS NULL OR "planCostCurrency" = '');
