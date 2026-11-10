-- =====================================================================
-- Currency integration — completedAt column on budget_items
-- ---------------------------------------------------------------------
-- Adds the `completedAt` timestamp to track when a budget item was
-- marked as completed. This is used to "freeze" the exchange rate:
-- once completed, planCostConverted is calculated using the rate from
-- this date and no longer changes.
-- =====================================================================

ALTER TABLE "budget_items" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
