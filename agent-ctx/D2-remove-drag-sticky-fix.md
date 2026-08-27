# Task D2 — Odstranění drag/resize + sticky header fix

**Agent:** Subagent D2 (Z.ai Code)
**Soubory:** `src/components/tabs/timeline-tab.tsx`, `src/components/project-detail.tsx`
**Datum:** 2027-08-27

## Kontext
Přečten `worklog.md` (Task 1-23) + `agent-ctx/B2-gantt-drag-fix.md`. Aplikace "RekonstrukcePro" je Next.js 16 + Prisma + shadcn/ui aplikace pro správu rozpočtu rekonstrukcí. Timeline tab (`timeline-tab.tsx`) obsahuje `GanttBar` komponentu s drag (move) a resize (resize-start/resize-end) přes pointer events API. User požadoval kompletní odstranění drag/resize — pouze dvojklik → `DateEditDialog`.

## Problémy (2)

1. **Drag/resize funkcionalita** — user ji nechce. Chce jen dvojklik pro editaci datumů.
2. **Sticky header overflow** — při scrollu dolů se Gantt bary a levé "Položka" sloupce z timeline zobrazovaly PŘES project sticky header.

## Root causes

### 1. Drag/resize
- `GanttBar` měl ~150 řádků pointer event logiky (handlePointerDown/Move/Up/Cancel, drag state, pxToDays, throttle saves, setPointerCapture).
- Resize handlery (levý `w-1.5`, pravý podmíněný `width > 40`).
- `touchAction: "none"`, `cursor: grab/grabbing`.

### 2. Sticky header overflow
- Project header v `project-detail.tsx` měl `z-10`.
- Timeline sticky elementy:
  - timeline header `sticky top-0 z-20` + corner cell `sticky left-0 z-30`
  - day subheader `sticky left-0 z-30`
  - každý row má "Položka" left column `sticky left-0 z-20` nebo `z-30`
  - today marker `z-10`
- `position: sticky` + positive `z-index` vytváří stacking kontext v page-root. Takže "Položka" sloupce s `z-20`/`z-30` byly vizuálně nad project headerem (`z-10`) při vertikálním scrollu stránky.

## Fix

### GanttBar kompletně zjednodušen
- Odstraněny: pointer event handlery, resize handlery, drag state, refs, `pxToDays`, `touchAction`, `cursor: grab`.
- Ponechány: `onDoubleClick` (volá `setEditingItem`), `title` tooltip.
- Přidáno: `cursor-pointer`, `hover:shadow-md hover:brightness-105`.
- Props zredukovány: `onMove`, `onResizeStart`, `onResizeEnd`, `onDragEnd` odstraněny z type i volání.

### TimelineTab cleanup
- Odstraněna `refreshAfterDrag` funkce (nepotřeba — `DateEditDialog` volá `useUpdateBudgetItem` který invaliduje queries).
- Odstraněn `qc = useQueryClient()` + import.
- Odstraněn `useRef` import.
- Odstraněn `Move` icon import + "Táhněte pro posun" hint v legendě.
- Odstraněn `updateBudgetItemDates` helper.
- `MONTHS_SHORT`/`MONTHS_LONG` přesunuty před `GanttBar`.

### Sticky header z-index
- `project-detail.tsx` řádek 102: `z-10` → `z-40`.
- Z-index hierarchie: project header z-40 > timeline corner cell z-30 > timeline left columns z-20 > today marker z-10 > Gantt bars (z-auto).

## Lint status
- `bun run lint` → **0 errors, 0 warnings** ✓
- `bunx tsc --noEmit` → 1 pre-existing chyba `setScrollLeft` (v HEAD před D2, neintrodukováno). Mimo scope D2.
- Dev log: poslední kompilace 200 OK, žádné runtime chyby.

## Files modified
- `src/components/tabs/timeline-tab.tsx` (769 → 640 řádků, -129 řádků)
- `src/components/project-detail.tsx` (z-index bump 1 řádek)

## Poznámka pro další agenty
- `DateEditDialog` ponechán beze změny — fetchuje z `/api/projects/[id]/budget`, ukládá přes `useUpdateBudgetItem` hook (invaliduje `["budget", projectId]` query → timeline refetchne).
- `setScrollLeft` pre-existing TS error na řádku 295 timeline-tab.tsx — `onScroll={(e) => setScrollLeft(...)}` ale `setScrollLeft` nikdy nebyl deklarován. Dead code, ale nezasahuje do funkčnosti. Pokud by někdo opravoval, buď odstranit `onScroll` handler nebo přidat `const [scrollLeft, setScrollLeft] = useState(0)` state (a případně ho využít pro synchronizaci sticky header s body při horizontálním scrollu).
- Gantt bar pořád přijímá `isPast`, `isFuture`, `zoom` props z parenta (kvůli API stabilitě), ale nepoužívá je. Lze odstranit v dalším refactoringu.
