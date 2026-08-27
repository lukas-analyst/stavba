# Task B2 — Gantt drag/resize oprava

**Agent:** Subagent B2 (Z.ai Code)
**Soubor:** `src/components/tabs/timeline-tab.tsx`
**Datum:** 2027-08-27

## Kontext
Přečten `worklog.md` (Task 1-11 + další). Aplikace "RekonstrukcePro" je Next.js 16 + Prisma + shadcn/ui aplikace pro správu rozpočtu rekonstrukcí. Timeline tab obsahuje interaktivní Gantt chart s `GanttBar` komponentou podporující drag (move) a resize (resize-start/resize-end) přes pointer events API.

## Problém
Uživatel: "Nejde interaktivně posouvat na časové ose konkrétní položky - jak rozšiřovat/smršťovat, tak přesouvat."

## Root causes (6 bugů)

1. **Bar se vizuálně nepohyboval během dragu** — pozice baru se počítala z `item.dateFrom`/`item.dateTo` z React Query cache. Cache se invalidovala až v `refreshAfterDrag` na pointer up. Během tažení uživatel neviděl žádnou odezvu.

2. **Incrementální API zápisy se stale closure** — `handlePointerMove` volal `onMove(daysToApply)` s INCREMENTAL delta (rozdíl od posledního save), ale `onMove` použil `start`/`end` z closure (původní datum). Každý increment přepisoval předchozí: `newFrom = originalStart + 1day` neustále dokola.

3. **Pravý resize handle mizel uprostřed dragu** — `{width > 40 && <right-handle/>}` odmountovával handle při zmenšení pod 40px → ztráta pointer capture.

4. **Resize handlům chybělo `touchAction: "none"`** — touch zařízení interpretovala gesture jako scroll.

5. **`setPointerCapture(e.target)`** křehké — `e.target` je libovolný potomek.

6. **`onPointerDown={dragging ? undefined : ...}`** zbytečné a matoucí.

## Fix

Kompletní rewrite `GanttBar`:

- **Lokální `drag` stav** (`{ mode, startClientX, deltaDays, moved }`).
- **Vizuální pozice živě**: `visualStartOffset = startOffset + drag.deltaDays` (pro move/resize-start), `visualWidthUnits = widthUnits ± drag.deltaDays` (pro resize). Bar se hýbe v reálném čase.
- **Jediný API zápis na pointer up** s kumulativním delta — rodičovské `onMove/onResizeStart/onResizeEnd` callbacky dostanou finální hodnotu jednou, matematika konečně sedí.
- **Oba resize handly vždy renderovány** (`shrink-0`).
- **`touchAction: "none"`** na parent div i na oba handly.
- **`setPointerCapture(e.currentTarget)`** místo `e.target`.
- **`onPointerCancel` handler** pro cleanup při přerušení.
- **Clamp vizuální pozice** — start nelze posunout za end.
- **Z-index 30** při aktivním dragu/resize.
- **Text `pointer-events-none`** aby pointerdown šel na parent/handle.
- **`e.button !== 0` guard** pro levé tlačítko myši.
- **`onDoubleClick`** nevolaný při skutečném dragu.
- **`refreshAfterDrag`** v `finally` bloku → UI vždy refetchne.

## Lint status

- `bunx eslint src/components/tabs/timeline-tab.tsx` → **0 errors, 0 warnings** ✓
- Plný `bun run lint` má 2 pre-existing chyby v `payments-tab.tsx` a `time-tab.tsx` — **mimo scope B2**, neintrodukováno tímto agentem.

## Dev log
Žádné runtime chyby. Kompilace OK. `/api/projects/[id]/dashboard` vrací 200.

## Poznámka pro další agenty
- API endpoint `/api/budget-items/[id]` PATCH přijímá `dateFrom`/`dateTo` jako ISO string — funguje. Není třeba jej měnit.
- Rodičovské handlery `onMove/onResizeStart/onResizeEnd` v `TimelineTab` (řádky ~426-440) přijímají kumulativní `deltaDays` a aplikují na původní `start`/`end` z dashboard query — správně, není třeba měnit.
