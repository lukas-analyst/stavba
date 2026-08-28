# Task O3 — React Query Optimizations

**Agent:** Subagent O3 (Z.ai Code)
**Date:** 2025
**Status:** ✅ Completed

## Scope
2 optimalizace React Query:
1. Optimistic updates pro 4 mutation hooky
2. Prefetch na hover + background prefetch

## Changes

### `src/lib/api.ts` — Optimistic updates

4 hooky refaktorovány z `onSuccess: invalidate` pattern na plný optimistic flow:

| Hook | Query Key | Cache Update |
|---|---|---|
| `useUpdateProject(id)` | `["projects"]` | map → `{ ...p, ...data }` pro `p.id === id` |
| `useUpdateBudgetItem(projectId)` | `["budget", projectId]` | map → `{ ...item, ...data }` pro `item.id === id` |
| `useUpdatePayment(projectId)` | `["payments", projectId]` | map → `{ ...p, ...data }` pro `p.id === id` |
| `useUpdateTimeEntry(projectId)` | `["time", projectId]` | map → `{ ...e, ...data }` pro `e.id === id` |

Každý hook má:
- **`onMutate`**: `cancelQueries` → snapshot předchozí hodnoty → `setQueryData` optimistic update
- **`onError`**: rollback na snapshot
- **`onSettled`**: invalidace původních query keys (zachováno z `onSuccess`)

### `src/components/project-detail.tsx` — Prefetch

1. **`prefetchTab(tabId: TabId)`** funkce — volá `qc.prefetchQuery()` pro daný tab:
   - dashboard / timeline → `["dashboard", pid]`
   - budget → `["budget", pid]`
   - payments → `["payments", pid]`
   - time → `["time", pid]`
   - contacts → `["contacts", pid]`
   - notes → no-op (čte z globálně načtených `useProjects()`)

2. Tab tlačítka mají `onMouseEnter` + `onFocus` (keyboard accessibility) → `prefetchTab(tab.id)`.

3. **Background prefetch v `useEffect`**: když `activeTab === "dashboard"`, na pozadí se nacachují `["budget", pid]` a `["payments", pid]` — nejčastější následující akce. Deps: `[activeTab, project.id, qc]`.

## Lint
- `bun run lint` → 0 errors, 0 warnings ✅

## Files Changed
- `src/lib/api.ts`
- `src/components/project-detail.tsx`

## UX dopad
- Inline editace budget items: okamžitá UI odezva, bez spinneru
- Hvězdičkování / editace projektu: okamžitá odezva v sidebaru
- Přepínání tabů: instantní díky prefetch na hover + background prefetch
- Rollback při chybě: UI se vrátí na původní hodnotu (žádný "flicker" rozbitých dat)
