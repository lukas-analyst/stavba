-- ============================================================
-- Oprava: přesunout elementy z 'annotation' na 'structural'
-- ============================================================
-- Problém: 1155 elementů má layer='annotation' ale type='wall'.
-- Předchozí SQL hledalo type='annotation' což nenašlo nic.
-- Tento update přesune VŠECHNY elementy s layer='annotation'
-- (kromě skutečných text anotací) na 'structural'.
-- ============================================================

-- UPDATE: všechny DXF elementy s layer='annotation' → 'structural'
UPDATE floorplan_elements
SET layer = 'structural'
WHERE layer = 'annotation'
  AND source = 'dxf';

-- Verifikace
SELECT layer, COUNT(*) as cnt
FROM floorplan_elements
GROUP BY layer
ORDER BY cnt DESC;
