-- =====================================================================
-- Phase migration: VALIDATION script (read-only, safe to run anytime)
-- ---------------------------------------------------------------------
-- Run this BEFORE the migration to see what would change,
-- and AFTER to confirm the migration succeeded.
-- =====================================================================

-- 1. CURRENT STATE — distinct phase values + counts
SELECT
  phase AS current_value,
  CASE
    WHEN phase = 'Příprava'      THEN '→ preparation'
    WHEN phase = 'Demolice'      THEN '→ demolition'
    WHEN phase = 'Hrubá stavba'  THEN '→ shell'
    WHEN phase = 'Zabydlování'   THEN '→ finishing'
    WHEN phase = 'Do budoucna'   THEN '→ future'
    WHEN phase = 'Neurčeno'      THEN '→ unspecified'
    ELSE '✓ already English (no change)'
  END AS will_become,
  COUNT(*) AS row_count
FROM budget_items
GROUP BY phase
ORDER BY phase;

-- 2. POST-MIGRATION CHECK — should return ZERO rows once migration is done.
SELECT phase, COUNT(*) AS remaining_legacy
FROM budget_items
WHERE phase IN ('Příprava','Demolice','Hrubá stavba','Zabydlování','Do budoucna','Neurčeno')
GROUP BY phase;
