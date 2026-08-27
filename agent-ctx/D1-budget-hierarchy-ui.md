# Task D1 — Budget Tab Hierarchy UI & Subcategory Prefill

**Agent:** Subagent D1 (Z.ai Code)
**Datum:** 2027-08-27
**Task ID:** D1
**Status:** ✅ Hotovo

## Kontext
Aplikace "Stavba/RekonstrukcePro" — Next.js 16 + Prisma + shadcn/ui. Budget tab (`src/components/tabs/budget-tab.tsx`) má parent-child hierarchii (Položky a Úkoly). User identifikoval 3 problémy:
1. Při kliknutí na zelené "+" u Položky se v `BudgetItemDialog` nepředvyplnila Podkategorie z rodiče.
2. UI pro úkoly bylo nepřehledné — děti renderované stejně jako parenty (chevron, subcategory, …), bez vizuální hierarchie.
3. `border-l-2` barevný pruh na poslední položce v kategorii měl vizuální problém s `rounded-lg` corners na `Collapsible` containeru.

Přečteno: `worklog.md` (Tasks 1-23 + B1/B2/B3/B6/D2), `agent-ctx/B1-budget-tab-refactor.md`, `agent-ctx/D2-remove-drag-sticky-fix.md`, `src/components/tabs/budget-tab.tsx` (1413 řádků), `src/components/budget-item-dialog.tsx`, `src/lib/format.ts`, `src/components/ui/table.tsx`, `src/components/ui/collapsible.tsx`.

## Root causes

### 1. Missing `defaultSubcategory` prop
`BudgetItemDialog` props byly `defaultCategory`, `defaultPhase`, `parentId` — ale žádný `defaultSubcategory`. `subcategory` state byl inicializován jako `item?.subcategory ?? ""` (bez fallbacku na prop). Budget-tab volal dialog s `defaultCategory={addTaskFor.category}` + `defaultPhase={addTaskFor.phase}` ale nepředával subcategory.

### 2. Children renderovaní jako parenti
`BudgetItemRows` vždy volal `BudgetRow` s `isChild={false}` (hard-coded). To znamenalo:
- Children zobrazovali `subcategory` jako hlavní název (místo `element`).
- Children měli chevron (rozbalitelní — zbytečné pro úkoly).
- Children měli `border-l-2` jako parenti.
- `└` marker v kódu existoval ale nikdy se nezobrazoval (`{isChild && ...}` s `isChild=false`).
- Children renderovali `DetailPanelRow` (Poznámka, Vůle, Ušetřeno) — zbytečně vysoké řádky.

### 3. Rounded-corner clipping na `border-l-2`
`Collapsible` měl `rounded-lg border bg-card`. Table uvnitř byl obdélníkový (žádné rounded corners). `border-l-2` na TableRow sahal až k levému okraji, kde Collapsible měl zakulacený roh. Vizuální artefakt u posledního řádku v kategorii.

## Řešení

### 1. Predvyplnění Podkategorie (`budget-item-dialog.tsx`)
- Přidán `defaultSubcategory?: string` do `Props` a do `BudgetItemForm` signature.
- Prop se propaguje přes `BudgetItemDialog` → `BudgetItemForm`.
- `subcategory` state: `item?.subcategory ?? defaultSubcategory ?? ""`.
- Budget-tab předává `defaultSubcategory={addTaskFor.subcategory ?? undefined}` při otevírání "Nový úkol" dialogu.

### 2. UI redesign pro děti (`budget-tab.tsx`)
- `BudgetItemRows` nový prop `isChild?: boolean` (default false).
- `BudgetRow` volán s `isChild={isChild}` (místo hard-coded `false`).
- `DetailPanelRow` se vykreslí pouze pro parenty (`!isChild`).
- Rekurzivní volání pro děti předává `isChild` (boolean shorthand `isChild`).
- `BudgetRow` pro `isChild=true`:
  - TableRow className: `bg-muted/30 hover:bg-muted/40` (+ `opacity-70` pokud rejected) — vizuálně distinktní od parentů.
  - První TableCell: `pl-8` indent (32px z levého okraje tabulky) + `└` marker (text-muted-foreground/60, aria-hidden, select-none). Žádný chevron.
  - Položka cell: zobrazuje `item.element` (název úkolu) místo `item.subcategory` (fallback: subcategory → "(bez názvu)").
  - Položka cell: `text-xs` místo `text-sm`.
  - Prvek cell: prázdná (`null`).
  - `+` tlačítko: automaticky skryté přes `{!isChild && onAddTask && (...)}` guard (již dříve implementováno).
  - "X úkolů" badge: automaticky skryté přes `childCount > 0` (dětí `childCount=0`).
- Hlavička tabulky: první sloupec `w-8` (32px) → `w-12` (48px) aby se `└` marker s `pl-8` vlezl do buňky bez overflow.

### 3. Oprava rounded-corner border (`budget-tab.tsx` + `format.ts`)
- Přidán nový mapping `PHASE_BG_COLORS` v `format.ts` (paralelní k `PHASE_BORDER_COLORS` ale s `bg-*` třídami).
- `BudgetRow` (parent): smazán `border-l-2` a phase border color z TableRow className. Přidán absolutní pruh:
  ```tsx
  <TableCell className="relative align-middle">
    <div aria-hidden className={cn(
      "absolute inset-y-0 left-0 w-1",
      item.rejected ? "bg-rose-500" : PHASE_BG_COLORS[item.phase] ?? "bg-zinc-300"
    )} />
    <button ...>chevron</button>
  </TableCell>
  ```
- `DetailPanelRow`: stejný approach — absolutní pruh uvnitř `colSpan={12}` TableCell (s `relative py-3`).
- `PHASE_BORDER_COLORS` import odstraněn z budget-tab.tsx (už se v tomto souboru nepoužívá). Mapping ale zůstává v `format.ts` — používá ho `timeline-tab.tsx` pro gantt bary.

Výsledek: barevná linka vlevo je rovná, konzistentní pro všechny položky včetně poslední, bez zakulacení.

## Lint status
- `bun run lint` → **EXIT_CODE=0** (0 errors, 0 warnings). ✓
- `bunx tsc --noEmit` → moje 3 soubory (`format.ts`, `budget-item-dialog.tsx`, `budget-tab.tsx`) neprodukují žádné TS chyby. Pre-existing chyby v jiných modulech (contacts-tab, dashboard-tab, payments-tab, timeline-tab, audit.ts, project-templates.ts) nejsou v scope D1.

## Soubory modifikované
- `src/lib/format.ts` (+10 řádků: PHASE_BG_COLORS mapping)
- `src/components/budget-item-dialog.tsx` (+6 řádků: defaultSubcategory prop)
- `src/components/tabs/budget-tab.tsx` (~90 řádků změn)

## Zachované funkce (verifikováno)
- ✓ Inline editace Plán/Dny/Datumy/Skutečnost/Hodiny pro parenty i děti.
- ✓ Reorder šipky (nahoru/dolů) pro parenty i děti.
- ✓ Filtry (search, fáze, completion pills).
- ✓ CSV export tlačítko.
- ✓ Comment count badge, Hotovo/Zavrženo badges.
- ✓ Rejected (X) button.
- ✓ Skrytá pole (Poznámka, Vůle, Ušetřeno) v DetailPanelRow — vykresluje se pro parenty. Děti editují poznámku přes dropdown → "Upravit detail" → BudgetItemDialog (Textarea).
- ✓ Category reorder arrows + burn-rate bar v hlavičce kategorie.
- ✓ `BudgetItemDialog` CommentSection pro existující položky.
- ✓ `defaultCategory`, `defaultPhase`, `defaultSubcategory` — všechny 3 se předvyplní z rodiče.

## Poznámky pro další agenty
- `PHASE_BORDER_COLORS` zůstává v `format.ts` — používá se v timeline-tab.tsx. NEODSTRAŇOVAT.
- `PHASE_BG_COLORS` je nový mapping — výhradně pro absolutní pruhy v budget-tab.
- Children `pl-8` indent = 32px z levého okraje tabulky. Chevron parenta je na 8px (p-2 padding). Vizuální indent mezi parent chevronem a `└` markerem dítěte = 24px.
- Children NEJSOU rozbalitelní (žádný chevron). Note/flexibility/saved editovatelné přes dropdown → "Upravit detail" → BudgetItemDialog.
- `onAddTask` prop je `undefined` pro rekurzivní volání dětí → `+` tlačítko auto-skryté (guard existuje od dřívějška).
- První sloupec tabulky (hlavička i body) je nyní `w-12` (48px). Pokud někdo bude měnit šířku sloupců, nezapomenout zachovat `w-12` nebo upravit `pl-8` indent u dětí.
- DetailPanelRow pozor: přidal jsem `relative` na `colSpan={12}` TableCell a absolutní pruh uvnitř. TableCell má defaultně `p-2` padding, ale DetailPanelRow override na `py-3` (top/bottom padding 12px, left/right zůstává `p-2` = 8px). Absolutní pruh `left-0` je na levém okraji buňky (levý okraj tabulky). Vizualizace pruhu je konzistentní s parentním řádkem.
