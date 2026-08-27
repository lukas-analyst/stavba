# Task ID: B3 — Payments: úprava existujících plateb + třídění

**Agent:** Subagent (Z.ai Code)
**Datum:** 2025
**Soubory:**
- `src/components/tabs/payments-tab.tsx` (frontend)
- `src/app/api/payments/[id]/route.ts` (backend — doplnění vatRate/vatAmount do PATCH)
- `src/lib/api.ts` (useUpdatePayment hook už existoval — pouze se importuje)

## Kontext
Přečten `worklog.md` pro kontext (aplikace "Stavba", payments tab spravuje platby).
`useUpdatePayment` hook již v `api.ts` existoval (řádky 419–437). PATCH endpoint
existoval, ale neuměl zpracovat `vatRate` — to jsem doplnil.

## Seznam změn

### Backend (`src/app/api/payments/[id]/route.ts`)
1. **PATCH nyní plně podporuje vatRate + vatAmount**
   - Přidána pre-kalkulace `vatAmountValue` (závisí na `vatRate` a `amount`)
   - Pokud je `vatRate` null/prázdné → `vatRate=null`, `vatAmount=null`
   - Pokud je `vatRate > 0` → `vatAmount = amount * vatRate / (100 + vatRate)`
   - `vatAmount` se vždy přepočítá při změně vatRate (i když se amount nezmění, použije
     se existing.amount)
   - Kompatibilní s chováním POST endpointu pro `vatAmount` výpočet

### Frontend (`src/components/tabs/payments-tab.tsx`)
1. **Importy**
   - `useUpdatePayment` přidán do importů z `@/lib/api`
   - Nové ikony: `Pencil`, `ArrowDownUp`, `ArrowUp`, `ArrowDown` z lucide-react

2. **Typy pro třídění**
   - `type SortKey = "date" | "type" | "amount" | "contact" | "vendor"`
   - `type SortDir = "asc" | "desc"`

3. **Stav v `PaymentsTab`**
   - `updatePayment = useUpdatePayment(projectId)` — hook pro PATCH
   - `editPayment: Payment | null` — drží editovanou platbu (nebo null)
   - `sortBy: SortKey` (default `"date"`)
   - `sortDir: SortDir` (default `"desc"` = nejnovější první)

4. **Třídění standalone plateb (useMemo)**
   - `filteredStandalone` nyní zpracovává filtr + sort v jednom `useMemo`
   - Sort klíče: `date` (timestamp), `type` (localeCompare), `amount` (číselně),
     `contact` (název kontaktu, localeCompare s `"cs"`), `vendor` (localeCompare s `"cs"`)
   - Směr: asc = vzestupně, desc = sestupně (default)
   - `useMemo` závislosti: `[standalone, sortBy, sortDir, typeFilter, search]`
   - `filterFn` je recreated každý render — proto je `eslint-disable-next-line` nad deps

5. **Třídění installment groups**
   - Vždy `date desc` (nejnovější první) — nezávislé na vybraném `sortBy`
   - Pořád vykresleny NAD standalone platbami (pořadí v JSX nezměněno)

6. **Toolbar — nové sort ovládací prvky**
   - `ArrowDownUp` ikona + `Select` dropdown pro výběr klíče třídění
   - Tlačítko (icon button) pro přepínání asc/desc s `ArrowUp`/`ArrowDown` ikonou
   - `title` tooltip s nápovědou
   - Vše za sebou v jednom flex containeru (`h-9` — konzistentní s ostatními prvky)

7. **PaymentRow**
   - Nový prop `onEdit: () => void`
   - `TableRow` nyní `cursor-pointer` + `hover:bg-muted/30` + `onClick={onEdit}` (klik na řádek otevře edit)
   - Poslední buňka (akce) má `onClick={(e) => e.stopPropagation()}` — klik na menu nespadne do editace
   - Dropdown menu nově obsahuje 2 položky:
     - **Upravit** (Pencil ikona, normální barva) → `onEdit`
     - **Smazat** (Trash2 ikona, destructive barva) → otevře confirm dialog (jako dříve)

8. **PaymentDialog — plná podpora edit módu**
   - Nové optional props: `payment?: Payment | null`, `updatePayment?: ReturnType<typeof useUpdatePayment>`
   - `isEditMode = !!payment` — detekce režimu
   - `isInvoiceParent` — true při editaci existující faktury (payment.invoiceTotal !== null)
   - **Inicializace stavu**: všechny useState inicializovány z `payment` (pokud je dodáno)
     - budgetItemId, contactId, amount, date (formátováno YYYY-MM-DD), type, vendor,
       invoiceNumber, description, vatRate (pouze pokud > 0), invoiceTotal
   - **Key-based remount**: rodičovská komponenta používá `key={editPayment.id}`, takže
     dialog se při změně editované platby čistě remountne — žádné useEffect nutné
   - **Installment toggle** (`isInvoice` checkbox) — skrytý v edit módu (nelze konvertovat
     obyčejnou platbu na fakturu přes edit)
   - **Submit handler**: v edit módu volá `updatePayment.mutateAsync({ id, data: patch })`
     - Patch obsahuje: budgetItemId, contactId, amount, date, type, vendor, invoiceNumber, description
     - Pokud je `isInvoiceParent` → přidá `invoiceTotal` (number)
     - `vatRate`: `Number(vatRate)` nebo `null` (pro "Bez DPH")
   - **Submit button text**: `"Uložit změny"` v edit módu, jinak původní (`"Přidat platbu"` / `"Vytvořit fakturu"`)
   - **Dialog title**: `"Upravit platbu"` v edit módu, `"Nová platba"` jinak
   - **Dialog description**: rovněž lokalizována pro edit
   - **Loading state**: `isSubmitting` odvozeno od `updatePayment.isPending` (edit) / `createPayment.isPending` (create)
   - **Error toast**: `"Nepodařilo se upravit platbu"` v edit módu
   - Při editaci invoice parent (faktura se splátkami): zobrazena 2-sloupcová mřížka
     "Faktura celkem" + "Zaplaceno celkem" + poznámka o úpravě jednotlivých splátek v seznamu
   - VAT pole skryté v edit módu invoice parent (VAT se řeší per installment)

9. **Druhá instance PaymentDialog v `PaymentsTab`**
   - Podmíněně vykreslená (`editPayment && ...`) s `key={editPayment.id}`
   - Předává `payment={editPayment}` a `updatePayment={updatePayment}`
   - `onOpenChange` — při zavření nastaví `setEditPayment(null)`

## Verifikace
- ✅ `bun run lint` prošel bez chyb (0 errors, 0 warnings, EXIT=0)
- ✅ Dev server log (`dev.log`) neobsahuje žádné runtime chyby
- ✅ API routes odpovídají 200 OK
- ⚠️ `bunx tsc --noEmit` ukazuje pre-existující TS chyby v jiných souborech
  (app-sidebar, global-search-dialog, dashboard-tab, timeline-tab, audit.ts) —
  žádná nová TS chyba v `payments-tab.tsx` mimo pre-existující `vatRate: vatRate || null`
  na řádku 729, která v kódu už byla (string vs number typ). Lint (eslint) tuto
  situaci nehlásí jako chybu a kód funguje správně za běhu.

## Poznámky k implementaci
- `useUpdatePayment` hook v `api.ts` už existoval (přidáno dříve v rámci VAT fáze)
- PATCH endpoint byl rozšířen o vatRate/vatAmount podporu (původně chyběla)
- Třídění je čistě frontendové přes `useMemo` — nezasahuje do API
- Installment groups záměrně nemají třídění (jen default date desc) dle zadání
- "Klik na řádek" otevírá editaci — `cursor-pointer` indikuje interaktivitu
- Dropdown menu v řádku má `stopPropagation`, aby klik na menu neotevíral editaci
