-- =====================================================================
-- Phase migration: Czech legacy values → stable English IDs
-- ---------------------------------------------------------------------
-- This script converts `budget_items.phase` from localized Czech strings
-- (e.g. "Příprava") to stable English IDs (e.g. "preparation") so that:
--   • The DB stores language-independent values (translations happen in UI).
--   • Filtering `WHERE phase = 'preparation'` works regardless of locale.
--   • Sorting/order is stable.
--
-- MAPPING (see src/lib/format.ts → PHASE_LEGACY_TO_ID):
--   "Příprava"      → "preparation"
--   "Demolice"      → "demolition"
--   "Hrubá stavba"  → "shell"
--   "Zabydlování"   → "finishing"
--   "Do budoucna"   → "future"
--   "Neurčeno"      → "unspecified"
--
-- EXPANDED PHASES (2025): The phase list has been extended with finer-
-- grained construction phases. These new IDs have NO legacy Czech
-- counterpart — they were added directly as English IDs:
--   earthworks, foundation, installations, facade, roof, interior,
--   exterior, final_inspection
--
-- No migration step is required for the new phases (existing data with
-- the original 6 IDs remains valid). This script is unchanged in
-- behavior — it only converts the 6 legacy Czech strings.
--
-- Idempotent: values that are already English IDs are left untouched
-- (the WHERE clause only matches the legacy Czech strings).
--
-- VALIDATION (run this BEFORE the UPDATE to preview affected rows):
--   SELECT phase, COUNT(*) FROM budget_items GROUP BY phase ORDER BY phase;
--
-- VALIDATION (run this AFTER to confirm zero legacy values remain):
--   SELECT phase, COUNT(*) FROM budget_items
--   WHERE phase IN ('Příprava','Demolice','Hrubá stavba','Zabydlování','Do budoucna','Neurčeno')
--   GROUP BY phase;
--   → expected: 0 rows.
--
-- VALIDATION (new phases are accepted as-is — should return rows only
-- if any budget item uses them):
--   SELECT phase, COUNT(*) FROM budget_items
--   WHERE phase IN ('earthworks','foundation','installations','facade','roof','interior','exterior','final_inspection')
--   GROUP BY phase;
-- =====================================================================

-- Safety: wrap in a transaction so we can ROLLBACK if something looks wrong.
BEGIN;

-- Preview: how many rows will be updated?
-- (Commented out — uncomment to inspect before running)
-- SELECT phase, COUNT(*) AS affected FROM budget_items
--   WHERE phase IN ('Příprava','Demolice','Hrubá stavba','Zabydlování','Do budoucna','Neurčeno')
--   GROUP BY phase;

UPDATE budget_items SET phase = 'preparation' WHERE phase = 'Příprava';
UPDATE budget_items SET phase = 'demolition' WHERE phase = 'Demolice';
UPDATE budget_items SET phase = 'shell'       WHERE phase = 'Hrubá stavba';
UPDATE budget_items SET phase = 'finishing'   WHERE phase = 'Zabydlování';
UPDATE budget_items SET phase = 'future'      WHERE phase = 'Do budoucna';
UPDATE budget_items SET phase = 'unspecified' WHERE phase = 'Neurčeno';

-- NOTE: The expanded phases (earthworks, foundation, installations,
-- facade, roof, interior, exterior, final_inspection) need no
-- migration — they are NEW English IDs, not renames of existing ones.

-- Commit if the affected row counts look right. If not:
--   ROLLBACK;
COMMIT;
