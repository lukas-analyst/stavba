# Task B1 — Budget Tab Refactor

**Agent:** Subagent B1 (Budget Tab Refactor)
**Datum:** 2026-08-27
**Status:** ✅ Hotovo

## Co bylo provedeno

### 1. Odstraněn Required checkbox
- Odstraněn první `<Checkbox>` v BudgetRow (označoval `item.required`).
- Nahrazen vizuálním "!" badge (rounded-full, bg-rose-100/text-rose-700, dark mode varianty) vedle názvu položky.
- Badge je podmíněn `item.required === true`, není to interaktivní checkbox.
- `title="Nutné"`, `aria-label="Nutné"` pro accessibility.

### 2. Hotovo toggle předělán na tlačítko
- Starý Circle/CheckCircle2 icon button na začátku řádku odstraněn.
- Nový `<Button>` s `size="sm"`, na konci řádku v novém sloupci "Stav" (w-28 text-center), PŘED akčním menu.
- Dva stavy:
  - **Není hotovo:** `variant="outline"`, text "Hotovo" + `Circle` ikona, emerald barvy (`text-emerald-700`, hover `bg-emerald-50`)
  - **Hotovo:** `variant="default"`, text "Hotovo" + `CheckCircle2` ikona, plně zelený (`bg-emerald-600 text-white`)
- `onClick={() => update("completed", !item.completed)}` — přepíná `completed` field přes PATCH `/api/budget-items/[id]`.
- `aria-pressed={item.completed}` a `disabled={updateItem.isPending}`.

### 3. Odstraněn multi-select checkbox a bulk action bar
- Smazán `selectedIds` state, `toggleSelect`, `bulkComplete`, `clearSelection` funkce.
- Smazán sticky Bulk action bar UI nahoře (panel s "X vybráno" + "Označit jako hotové" + "Zrušit výběr").
- Z BudgetRow props odstraněny `isSelected` a `onToggleSelect`.
- Z TableRow className odstraněn `isSelected && "bg-primary/5"`.

### 4. Přidán sloupec "Prvek / Úkol"
- Nový sloupec v hlavičce hned po "Položka", `min-w-[140px]`.
- Buňka body zobrazuje `item.element` s `line-clamp-2` (zalamování na 2 řádky).
- Hover underline → otevře edit dialog (`onClick={onEdit}`).
- Prázdný element zobrazí "—".
- `element` už není zobrazen jako malý text pod subcategory v Položka sloupci.

### 5. Oprava scrollbaru
- `src/components/tabs/budget-tab.tsx`: odstraněn redundantní `<div className="overflow-x-auto">` wrapper kolem `<Table>`. Table komponenta (`src/components/ui/table.tsx:11`) už má vestavěný `<div className="relative w-full overflow-x-auto">`, takže dříve vznikal dvojí scrollbar container.
- `src/components/tabs/payments-tab.tsx`: stejné odstranění (Installments list sekce).
- Ostatní taby ověřeny: timeline-tab.tsx má `overflow-x-auto` na custom Gantt (oprávněné, bez `<Table>`, nechat), ostatní taby mají pouze `overflow-hidden` u progress barů (OK).

### Cleanup
- Imports v budget-tab.tsx odstraněny: `Checkbox` (už nepoužíván), `GripVertical` (nebyl použit), `Label` (nebyl použit), `PHASE_DOT_COLORS` (nebyl použit).

## Lint
- `bun run lint` → **exit code 0** (0 errors, 0 warnings).

## Poznámky pro další agenty
- Hlavička tabulky má nyní 14 sloupců (Položka, Prvek/Úkol, Fáze, Poznámka, Plán, Vůle, Dny, Datum od, Datum do, Skut., Ušetřeno, Hod., Stav, Akce).
- Body má také 14 buněk — header a body jsou konzistentní.
- Hotovo tlačítko je vždy viditelné (nejen na hover), aby uživatel jasně viděl stav položky.
- Tlačítko zachovává `disabled` stav při pending PATCH requestu.
- Zelené zbarvení používá emerald škálu ( Tailwind `emerald-50/100/300/600/700/800/900`), ne indigo/blue.
