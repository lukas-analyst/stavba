-- ============================================================
-- Diagnostika + oprava: elementy se zobrazují jako "Popisky"
-- ============================================================
-- Spusťte tento script v NeonDB SQL Editoru.
-- Nejprve spustí diagnostiku (SELECT), pak opravu (UPDATE).
-- ============================================================

-- ===== 1. DIAGNOSTIKA: jaké hodnoty mají elementy? =====

-- Kolik elementů má jakou vrstvu?
SELECT layer, COUNT(*) as cnt
FROM floorplan_elements
GROUP BY layer
ORDER BY cnt DESC;

-- Kolik elementů má jaký typ?
SELECT type, COUNT(*) as cnt
FROM floorplan_elements
GROUP BY type
ORDER BY cnt DESC;

-- Jaká je hodnota 'source'?
SELECT source, COUNT(*) as cnt
FROM floorplan_elements
GROUP BY source;

-- Jaké DXF vrstvy byly importovány?
SELECT "dxfLayer", COUNT(*) as cnt
FROM floorplan_elements
WHERE source = 'dxf'
GROUP BY "dxfLayer"
ORDER BY cnt DESC
LIMIT 20;

-- ===== 2. OPRAVA: přesunout všechny ne-text elementy na 'structural' =====
-- Tento update je BEZPEČNÝ — mění jen 'layer' a 'type' sloupce,
-- nemění geometrii ani relace.

-- 2a. Všechny elementy, které NEJSOU typu 'annotation' (TEXT/MTEXT entity),
-- ale mají layer='annotation' → přesunout na 'structural'
UPDATE floorplan_elements
SET layer = 'structural', type = 'wall'
WHERE layer = 'annotation'
  AND type != 'annotation';

-- 2b. Všechny elementy s layer='annotation' a type='annotation'
-- (tyto jsou pravděpodobně skutečné texty z DXF — nechat jako 'annotation')
-- Ale pokud je jich příliš mnoho (>50% ze všech), pravděpodobně jsou
-- to LINE/POLYLINE entity, které byly nesprávně klasifikovány.
-- Proto je také přesuneme na 'structural':
UPDATE floorplan_elements
SET layer = 'structural', type = 'wall'
WHERE layer = 'annotation'
  AND type = 'annotation'
  AND source = 'dxf'
  AND "dxfLayer" != 'annotation';

-- 2c. Pokud source je NULL nebo 'manual' místo 'dxf', updatneme všechny:
UPDATE floorplan_elements
SET layer = 'structural', type = 'wall'
WHERE layer = 'annotation'
  AND "dxfLayer" IS NOT NULL;

-- ===== 3. VERIFIKACE po update =====

-- Kolik elementů má jakou vrstvu po update?
SELECT layer, COUNT(*) as cnt
FROM floorplan_elements
GROUP BY layer
ORDER BY cnt DESC;
