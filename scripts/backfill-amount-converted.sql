-- =====================================================================
-- Backfill: Set amountConverted = amount for payments without foreign currency
-- ---------------------------------------------------------------------
-- Before multi-currency was implemented, payments had amountConverted = 0
-- (the column didn't exist). After adding the column with @default(0),
-- all existing payments got 0. This script fixes them:
--
-- For payments where currency IS NULL (project's default currency):
--   amountConverted = amount (no conversion needed, they're the same)
--
-- For payments where currency IS NOT NULL (foreign currency):
--   These should have been converted at creation time. If amountConverted = 0,
--   it means the rate was missing. We can't fix them here without historical
--   rates — leave them as 0 and they'll be fixed when the payment is edited.
-- =====================================================================

UPDATE payments
SET "amountConverted" = amount
WHERE "amountConverted" = 0
  AND (currency IS NULL OR currency = '');
