# Archiv — Zavržené a Implementované požadavky

> Tento dokument sleduje feature, které byly v průběhu vývoje buď **zavrženy** (nebudou implementovány) nebo **implementovány a následně odstraněny**. Slouží jako historický záznam rozhodnutí.

---

## Zavržené features

### 1. Modul „Půdorys objektu" (Floorplan)

**Status:** ❌ Zavrženo (revertováno)
**Datum revertu:** Říjen 2025
**Commit:** `03cd988` — revert: odstranění modulu Půdorys objektu

**Popis:**
Modul měl přidat vizuální nástroj pro správu rekonstrukce nemovitosti — import DXF půdorysů z CAD, interaktivní 2D pohled shora + z boku, úprava prvků (zdi, okna, rozvody) a jejich propojení s budget items.

**Důvod zavržení:**
- Komplexita modulu neodpovídala jeho přínosu pro hlavní use case (správa rozpočtu)
- Vyžadoval by specialised DXF parsování (žádná MIT knihovna)
- N:M propojení BudgetItem ↔ FloorplanElement by komplikovalo datový model

**Co zbylo:**
- Plánovací dokumenty archivovány v `docs/ARCHIVE/FLOORPLAN_*.{md,sql}`
- CSP komentář v `next.config.ts` odkazoval na floorplan — odstraněno ve Fázi 1

---

## Implementováno a následně odstraněno

### 2. Prisma WASM engine

**Status:** ❌ Odstraněno
**Datum:** Listopad 2025
**Commity:** `c2c1a0c`, `76976e8`, `10ed92a`

**Popis:**
Pokus o optimalizaci Vercel Function Storage pomocí Prisma WASM enginu místo standardního `@prisma/client`.

**Důvod odstranění:**
- Turbopack (Next.js 16) neumí resolvnout `@prisma/client/wasm` subpath import
- `serverExternalPackages` s `@prisma/client` rozbíjí subpath importy v Turbopacku
- Standard `@prisma/client` s `@prisma/adapter-pg` funguje spolehlivě

**Závěr:**
Ponechán standardní Prisma client s `PrismaPg` adapterem a `pg` Pool pro connection management.

---

### 3. Nepoužívané shadcn/ui komponenty (22)

**Status:** ❌ Odstraněno
**Datum:** Listopad 2025 (Fáze 1 finalizačního procesu)

**Popis:**
22 shadcn/ui komponent bylo nainstalováno během vývoje, ale nikdy nebylo importováno žádnou komponentou aplikace.

**Odstraněné komponenty:**
alert, aspect-ratio, breadcrumb, calendar, carousel, chart, command, context-menu, filter-chip, form, hover-card, input-otp, menubar, navigation-menu, pagination, progress, radio-group, resizable, responsive-dialog, sidebar, slider, toggle-group

**Důvod:**
Dead code — zbytečně zvětšovaly repozitář a mohly vést k chybám při budoucích upgrade.

---

### 4. Nepoužívané chart komponenty (4)

**Status:** ❌ Odstraněno
**Datum:** Listopad 2025 (Fáze 1)

**Popis:**
`src/components/charts/` obsahoval lazy-loaded wrappery pro `PhaseChart`, `CategoryChart`, `SpendingTrendChart`. Tyto komponenty byly duplikovány přímým použitím `recharts` v `dashboard-tab.tsx` a `portfolio-tab.tsx`.

**Důvod:**
Duplicitní implementace — nikdy neimportováno.

---

### 5. Dočasné auth řešení (`default-owner.ts`)

**Status:** ❌ Odstraněno
**Datum:** Listopad 2025 (Fáze 1)

**Popis:**
Před implementací autentizace byl všechny nové projekty přiřazeny hardcoded „default owner" uživateli (`hanzliklukas2@gmail.com`).

**Důvod odstranění:**
Auth vrstva (NextAuth v4 s Credentials + Google OAuth) je plně implementována — `default-owner.ts` byl nepoužívaný dead code.

---

## Vývojářské experimenty (archivováno)

### 6. Jednorázové migrační skripty

**Status:** 📦 Archivováno v `scripts/archive/`
**Datum archivace:** Listopad 2025 (Fáze 2)

**Popis:**
Následující skripty byly jednorázové migrace použité během vývoje. Jsou archivovány pro historickou referenci, ale nejsou potřeba pro produkci:

| Skript | Účel |
|--------|------|
| `add-pdf-export-i18n.py` | Přidání i18n klíčů pro PDF export |
| `add-pdf-report-i18n.py` | Přidání i18n klíčů pro PDF report sekcí |
| `migrate-color-tokens.py` | Migrace barevných tokenů na MD3 |
| `cleanup-element.mts` | Čištění element field v budget items |
| `backfill-amount-converted.sql` | Backfill `amountConverted` u plateb |
| `backfill-plan-cost-converted.sql` | Backfill `planCostConverted` u budget items |
| `migrate-completed-at.sql` | Migrace `completedAt` timestampu |
| `migrate-phases-to-ids.sql` | Migrace českých názvů fází na stabilní ID |
| `validate-phases-migration.sql` | Validace migrace fází |

**Poznámka:**
Skripty `migrate-export-templates.sh` a `migrate-payment-invoice-url.sh` zůstávají v `scripts/` — tyto DB migrace je nutné spustit na Neon databázi před plným nasazením odpovídajících feature.

---

## Budoucí úvahy (zatím nerozhodnuto)

### 7. Nonce-based CSP

**Status:** 🔮 Zvažováno
**Lokace:** `next.config.ts` (CSP hlavičky)

**Popis:**
Aktuální CSP používá `'unsafe-inline'` pro script-src a style-src. To je nutné pro Next.js hydration a React inline styly.

**Možná budoucí implementace:**
Generovat `crypto.randomUUID()` per request v middleware, nastavit jako `<script nonce="...">` — umožnilo by odstranit `'unsafe-inline'`.

**Proč zatím neimplementováno:**
Komplexní změna vyžadující úpravy v middleware + Next.js config. Není kritická pro produkční release.

---

### 8. Sentry/Slack error reporting webhook

**Status:** 🔧 Připraveno, nekonfigurováno
**Lokace:** `src/lib/error-reporting.ts`, env `ERROR_REPORTING_WEBHOOK_URL`

**Popis:**
Aplikace má připravený error reporting webhook (Sentry/Slack/Discord). Stačí nastavit `ERROR_REPORTING_WEBHOOK_URL` v env proměnných.

**Proč zatím nekonfigurováno:**
Vyžaduje rozhodnutí o cílové službě (Sentry vs Slack vs Discord) a vytvoření webhook endpointu.

---

### 9. Začlenění AI skills do projektu

**Status:** 🔮 Zvažováno (otázka k zodpovězení v budoucnu)
**Lokace:** `skills/` (aktuálně gitignored)

**Popis:**
Složka `skills/` obsahuje 18 vývojářských nástrojů (ASR, LLM, TTS, VLM, agent-browser, charts, docx, fullstack-dev, image-edit, image-generation, image-search, pdf, pptx, skill-creator, skill-finder-cn, task-review, video-understand, xlsx) — celkem 80+ SKILL.md souborů. Tyto skills používá AI asistent (Z.ai Code) při vývoji aplikace.

**Aktuální stav:**
- `skills/` je v `.gitignore` (není sledováno gitem)
- Nenahraje se na GitHub ani na Vercel
- Nejsou součástí aplikace — jsou to environment-specific vývojářské nástroje

**Otázky k zodpovězení v budoucnu:**
1. Měli bychom vytvořit `docs/DEV-ENVIRONMENT.md` s dokumentací použitých AI skills?
2. Měli bychom některé skills zveřejnit jako reference pro jiné vývojáře?
3. Jak zachovat kontinuitu znalostí při předání projektu jinému týmu?

**Proč zatím nezačleněno:**
Skills jsou generické (nesouvisí se Stavbou), environment-specific (jen Z.ai Code sandbox) a zbytečně by zvětšily repozitář. Ponecháno jako otázka k budoucímu rozhodnutí.
