# RekonstrukcePro — Worklog

## Projekt: Aplikace pro správu rozpočtu rekonstrukcí

---
Task ID: 1-11
Agent: Hlavní asistent (Z.ai Code)
Task: Vytvořit komplexní aplikaci pro sledování rozpočtu, nákladů a času pro rekonstrukce s více projekty, napojením na data z CSV a profesionálním UI.

Work Log:
- Načetl CSV soubor "Troja - Rozpočet a náklady rekonstrukce" (49 budget items v 8 kategoriích)
- Navrhl Prisma schéma: Project, BudgetItem, Payment, Contact, TimeEntry (vše s provázaností a onDelete Cascade)
- Vytvořil seed skript (`scripts/seed.ts`) s parserem CSV (české datumy, formát "25 000 Kč", procenta "vůle")
- Opravil seed: prázdné kategorie dědí z předchozího řádku (CSV pattern)
- Push schématu do SQLite + seed 49 budget items + 3 ukázkové kontakty
- Vytvořil kompletní REST API:
  - `/api/projects` (GET, POST) + `/api/projects/[id]` (GET, PATCH, DELETE)
  - `/api/projects/[id]/budget` (GET, POST) + `/api/budget-items/[id]` (PATCH, DELETE)
  - `/api/projects/[id]/payments` (GET, POST) + `/api/payments/[id]` (PATCH, DELETE) — s automatickým přepočtem actualCost
  - `/api/projects/[id]/time` (GET, POST) + `/api/time-entries/[id]` (PATCH, DELETE) — s automatickým přepočtem actualHours
  - `/api/projects/[id]/contacts` (GET, POST) + `/api/contacts/[id]` (PATCH, DELETE)
  - `/api/projects/[id]/dashboard` (GET) — agregované statistiky, upozornění, timeline
- Postavil UI pomocí Next.js 16 + shadcn/ui + Tailwind + recharts:
  - `app-sidebar.tsx` — sidebar s projekty, hvězdičkami, burn-rate bary, mazáním
  - `project-detail.tsx` — hlavička projektu + 6 tabů (Přehled, Rozpočet, Platby, Čas, Kontakty, Časová osa)
  - `tabs/dashboard-tab.tsx` — 4 KPI karty, bar+pie grafy, sekce upozornění, breakdown kategorií
  - `tabs/budget-tab.tsx` — skládací tabulka seskupená dle kategorie, inline editace všech polí, filtry
  - `tabs/payments-tab.tsx` — tabulka plateb, filtry, dialog pro přidání
  - `tabs/time-tab.tsx` — časové záznamy, statistiky dle pracovníka, typ (firma/řemeslník/svépomoc)
  - `tabs/contacts-tab.tsx` — karty kontaktů s hvězdičkovým hodnocením
  - `tabs/timeline-tab.tsx` — Gantt-like harmonogram s zoomem (měsíce/kvartály/roky), dnes marker
- Použil React Query pro data fetching, Zustand pro view state
- Lokalizace: česká (cs-CZ), formátování Kč, datumy DD.MM.YYYY
- Opravil lint chyby: unterminated strings, setState-in-effect (přešel na key pattern pro dialogy)
- Spustil dev server (Next.js 16.1.3 Turbopack) na portu 3000
- Verifikace přes Agent Browser: dashboard se načetl, budget tab se načetl s plnou tabulkou, žádné chyby v konzoli
- VLM analýza screenshotu: "velmi kvalitní, moderní dashboard", "čistá vizuální hierarchie", "dobré barevné kódování"

Stage Summary:
- ✅ Aplikace plně funkční: 49 budget items, 3 kontakty, dashboard s KPI/grafy/upozorněními
- ✅ Kompletní CRUD pro projekty, budget items, platby, čas, kontakty
- ✅ Inline editace rozpočtu, skládací kategorie, filtry, vyhledávání
- ✅ Gantt timeline s zoomem a dnes markerem
- ✅ Profesionální UI v češtině, žádné runtime chyby
- 📊 Celkový plán rozpočtu Troja: 3 243 000 Kč, 49 položek, 215 plánovaných dní
- ⚠️ Datový model je připraven pro budoucí migraci na PostgreSQL (stačí změnit datasource v schema.prisma)
- 📝 Google Sheets integrace zatím neimplementována (doporučeno jako další fáze — viz doporučení níže)

Unresolved issues / Next steps:
- Google Sheets import/export zatím jen budoucí (CSV seed funguje jako most)
- Autentizace (NextAuth) zatím neimplementována — vhodné pro multi-user verzi
- Notifikace (e-mail upozornění na blížící se termíny) zatím nejsou
- Mobilní responsivita je funkční, ale Gantt pohled by mohl mít mobilní zjednodušení
- Pro akceptaci plateb od klientů (faktury) by bylo vhodné přidat export do PDF/CSV

---
Task ID: 8
Agent: Supabase + Export/Import subagent
Task: Setup Supabase utility klientů a vytvoření Export/Import JSON API

Work Log:
- Přečetl worklog a existující strukturu (Prisma + SQLite, modely Project/BudgetItem/Payment/Contact/TimeEntry)
- Nainstaloval balíčky `@supabase/supabase-js@2.112.4` a `@supabase/ssr@0.12.5` (`bun add`)
- Vytvořil `src/utils/supabase/server.ts` — server client přes `createServerClient` z `@supabase/ssr` s `cookies()` storem z `next/headers`
- Vytvořil `src/utils/supabase/client.ts` — browser client přes `createBrowserClient`
- Vytvořil `src/utils/supabase/middleware.ts` — factory pro middleware client; opravil drobný TS problém v šabloně (`request.cookies.set()` na NextRequest nepřijímá `options` jako 3. argument — options se aplikují až na `supabaseResponse.cookies`)
- Do `.env` přidal (append, nepřepsal `DATABASE_URL`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Vytvořil `src/middleware.ts` — passthrough middleware, který volá `createClient(request)` ze supabase utility (refresh cookies pro budoucí auth); matcher vylučuje statické soubory a obrázky
- Vytvořil `src/app/api/export/route.ts` — GET endpoint, který sériově načte všechny projekty, budget items, platby, kontakty a time entries; vrátí JSON s hlavičkou `Content-Disposition: attachment; filename="stavba-export-YYYY-MM-DD.json"`, struktura `{ exportedAt, version, projects, budgetItems, payments, contacts, timeEntries }`
- Vytvořil `src/app/api/import/route.ts` — POST endpoint, který přijme JSON z exportu; v `db.$transaction` smaže vše v FK pořadí (TimeEntry → Payment → BudgetItem → Contact → Project) a poté nasype nová data v pořadí Project → Contact → BudgetItem → Payment → TimeEntry (zachová původní ID, takže zůstanou vztahy); ISO string → Date konverze pro všechna DateTime pole; vrací `{ success: true, imported: { projects, contacts, budgetItems, payments, timeEntries } }` s počty
- Spustil `bun run lint` — prošlo bez chyb; `bunx tsc --noEmit` — v mých souborech žádné TS chyby
- Důležité označení v `.env` komentářem, že Supabase proměnné jsou pro budoucí auth/client, nikoliv pro Prisma (Prisma stále používá `DATABASE_URL`)

Stage Summary:
- ✅ Supabase utility klienti připraveni (server, browser, middleware factory) — passthrough pro budoucí auth, neovlivňují současnou funkčnost aplikace
- ✅ Middleware.ts aktivní pro všechny nestatické routy, ale pouze refreshuje cookies (žádné blokování, žádné auth checky)
- ⚠️ Nelze hned přepnout Prisma na Postgres přes Supabase: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` je anon/publishable klíč, ne connection string. Prisma potřebuje `DATABASE_URL` ve formátu `postgresql://user:password@host:port/db` s DB heslem. Aby bylo možné migrovat, musí uživatel v Supabase dashboardu najít "Connection string" (Settings → Database) a nastavit `DATABASE_URL` + změnit `provider` v `prisma/schema.prisma` z `sqlite` na `postgresql` + spustit `bun run db:push`. Schéma je už PostgreSQL-compatible (viz komentář v schema.prisma z Task 1-11).
- ✅ Export endpoint `GET /api/export` vrací kompletní stav aplikace jako stažitelný JSON
- ✅ Import endpoint `POST /api/import` přijímá stejný JSON, je idempotentní (lze volat opakovaně), zachovává ID a vztahy, vrací počty importovaných záznamů; celé v transakci
- 📁 Vytvořené soubory:
  - src/utils/supabase/server.ts
  - src/utils/supabase/client.ts
  - src/utils/supabase/middleware.ts
  - src/middleware.ts
  - src/app/api/export/route.ts
  - src/app/api/import/route.ts
- ✅ `bun run lint` prošel bez chyb

---
Task ID: 9
Agent: Hlavní asistent (Z.ai Code) - druhá fáze
Task: Implementace všech uživatelských požadavků z druhé zprávy: přejmenování, hvězdička ikonka, export/import, platby ve splátkách, dokončenost+ušetřeno, interaktivní Gantt s drag/resize, reorder, multi-day čas, Supabase příprava

Work Log:
- Aktualizoval Prisma schéma: BudgetItem.completed, Payment.invoiceTotal + installmentOf, TimeEntry.dateTo, Project.categoryOrder
- Push schématu do DB, Prisma Client regenerován
- Aktualizoval API routes: budget-items PATCH (completed), payments POST/PATCH (invoiceTotal, installmentOf), time POST/PATCH (dateTo)
- Vytvořil /api/projects/[id]/reorder endpoint (items sortOrder + categoryOrder JSON)
- Aktualizoval dashboard endpoint: completedCount, savedTotal v totals, completed v timeline
- Aktualizoval typy v api.ts: Project.categoryOrder, BudgetItem.completed, Payment.invoiceTotal/installmentOf, TimeEntry.dateTo, Dashboard.totals (completedCount, savedTotal), timeline.completed
- Přidal hooks: useReorder, useExportState, useImportState
- Přejmenoval aplikaci "RekonstrukcePro" → "Stavba" (layout metadata, sidebar header, empty-state)
- Odebral hvězdičku (Switch) z project-dialog.tsx; hvězdička je nyní klikatelná ikonka v sidebar project list + v project header
- Přidal typ stavby (Rekonstrukce/Nová stavba/Přístavba/Interiér) do project dialogu
- Přidal Export/Import tlačítka do sidebar footer (hidden file input pro import JSON)
- Budget tab: přidal completed toggle (Circle/CheckCircle2), "Ušetřeno" sloupec, reorder šipky (ArrowUp/ArrowDown) pro items i kategorie, toolbar ukazatel Ušetřeno + Hotovo celkem
- Budget-item dialog: přidal "Hotovo" checkbox
- Payments tab: přepsán s podporou instalmentů - InstallmentGroupCard seskupuje parent fakturu + splátky, progress bar zaplaceno/faktura/zbývá, inline formulář "Přidat splátku", PaymentDialog má toggle "Platba ve splátkách"
- Time tab: přidal dateTo (vícedenní záznam), počítadlo dnů a h/den, zobrazení rozsahu datumů v tabulce
- Timeline tab: kompletně přepsán s interaktivním Ganttem - pointer-events drag pro posun, resize handles pro zkracovat/prodlužovat, dvojklik otevírá DateEditDialog s přesnými datumy, zoom úrovně Dny/Měsíce/Kvartály/Roky (denní granularita s víkendovým podbarvením), today marker, invalidate po dragu
- Dashboard tab: přidal "Ušetřeno" (zelená PiggyBank karta) a "Hotovo" (teal karta s progress barem) do KPI grid (nyní 6 karet)
- Lint: prošel bez chyb (0 errors, 0 warnings)
- Verifikace přes Agent Browser: dashboard se načetl, budget tab s novými sloupci a reorder šipkami, timeline s 4 zoom levels, payments s fakturou, time tab - vše funkční, žádné runtime chyby
- VLM analýza screenshotu: potvrdila nové karty Ušetřeno a Hotovo, "velmi přehledný a funkční" dashboard

Stage Summary:
- ✅ Aplikace přejmenována na "Stavba" (univerzální pro stavbu i rekonstrukci)
- ✅ Hvězdičkování přes klikatelnou ikonku (ne v dialogu)
- ✅ Export/Import JSON stavu (tlačítka v sidebaru)
- ✅ Platby ve splátkách: parent faktura + děti splátky, progress bar, inline přidávání
- ✅ Budget: completed toggle + "Ušetřeno" (plan - actual když hotovo)
- ✅ Timeline: drag posun, resize zkracovat/prodlužovat, dvojklik=datumy, zoom Dny/Měsíce/Kvartály/Roky
- ✅ Budget reorder: šipky nahoru/dolů pro items i kategorie (uloženo categoryOrder na projektu)
- ✅ Čas: vícedenní záznamy (dateTo), počítadlo dnů a h/den
- ✅ Supabase utility připraveny (server/client/middleware), export/import jako datový most
- 📝 Pro plnou PostgreSQL migraci: uživatel musí doplnit DATABASE_URL s heslem z Supabase dashboardu a změnit provider v schema.prisma (schéma je už Postgres-compatible)

Unresolved issues / Next steps:
- Drag-and-drop (dnd-kit) místo šipek pro reorder - šipky fungují spolehlivě, dnd by byl hezčí ale vyžaduje více práce
- Supabase Auth ještě neaktivní (utility jsou passthrough, připraveno pro budoucí přihlašování)
- Google Sheets import/export zatím neimplementován (může využít export JSON jako mezistupeň)
