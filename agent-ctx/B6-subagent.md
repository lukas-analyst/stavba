# Task ID: B6 — Subagent Work Record

**Agent:** Subagent B6 (Z.ai Code)
**Date:** $(date)
**Task:** Rework "Upozornění a akce" section + zpracování pole 'Vůle' (flexibilityPercent) v predikci nákladů

## Files Modified
1. `src/app/api/projects/[id]/dashboard/route.ts` — přidány 4 nové alert arrays + worstCase per phase
2. `src/lib/api.ts` — rozšířen `Dashboard` TypeScript typ o nové alert fields + `worstCase` v byPhase
3. `src/components/tabs/dashboard-tab.tsx` — přeuspořádány AlertGroup sekce + nové UI pro Vůli

## Changes Summary

### Backend (dashboard/route.ts)
- `_count` include pro payments + timeEntries (umožňuje mustPay/shouldStart filtry)
- Nové alert arrays:
  - `inProgress`: `!completed && (actualCost > 0 || actualHours > 0)`
  - `mustPay`: `!completed && _count.timeEntries > 0 && _count.payments === 0`
  - `shouldStart`: `!completed && dateFrom <= dnes+7d && _count.payments === 0 && _count.timeEntries === 0`
  - `overBudgetWorst`: `!completed && actualCost > planCost * (1 + vůle/100)`
- Všechny existující filtry (upcoming/overdue/overBudget/unscheduled) mají `!completed`
- `byPhase` agregace rozšířena o `worstCase` field

### UI (dashboard-tab.tsx)
- 3 alert kategorie s odlišnou barvou:
  - **Kritické (rose)**: mustPay, overBudgetWorst, overdue, overBudget
  - **Probíhající (sky)**: inProgress
  - **Informativní (amber)**: shouldStart, upcoming, unscheduled
- Summary badges v hlavičce card (kritické/probíhající/informativní s count)
- AlertGroup: nový `hint` prop, max-h-40 overflow-y-auto na seznamu
- Budget Projection card: nový "Nejhorší scénář (Vůle)" panel s 3 metrikami + stacked bar
- Phase progress cards: Vůle marker na progress baru, "Vůle" badge (Flame ikona) pokud `actual > worstCase`, "X% max" text

## Lint Status
- `npx eslint` na B6 souborech → **0 errors, 0 warnings**
- `bun run lint` (whole project): 2 PRE-EXISTING errors v `payments-tab.tsx:137` a `time-tab.tsx:473` (mimo B6 scope, nezasahuji)

## Notes pro další agenty
- `Dashboard` typ v `src/lib/api.ts` nyní vyžaduje `worstCase` field v `byPhase` položkách — backend ho vždy vrací
- AlertGroup komponenta nyní má optional `hint` prop (zadní text pro kontext)
- Pokud budete přidávat další alert typy, udržujte `!completed` podmínku ve všech filtrech
