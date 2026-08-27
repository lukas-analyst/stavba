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

---
Task ID: 10
Agent: Cron review asistent (Z.ai Code) - první revize
Task: QA testování, oprava chyb, stylingová vylepšení a nové funkce (CSV export, Poznámky, filtry, mini-stats, phase cards)

Work Log:
- Přečetl worklog, ověřil že aplikace je stabilní (lint čistý, 0 chyb)
- QA testování přes agent-browser: všechny taby fungovaly bez chyb
- VLM analýza budget screenshotu: identifikoval oblasti pro zlepšení (prázdný sidebar, chybějící progress indikátory, lepší hierarchie)
- Styling vylepšení:
  * Project header: lepší hierarchie s MapPin ikonou pro adresu, deadline countdown badge ("za X dní"), stats strip s ikonami (Zahájení, Dokončení, položky, kontakty, čerpání s progress barem), podtržené taby místo pozadí
  * Budget tab: barevný levý okraj řádků dle fáze (PHASE_BORDER_COLORS), hover efekty, completion filter pills (Vše/Aktivní/Hotovo)
  * Sidebar: MiniProjectStats widget v prázdném prostoru - burn rate, completion progress bar, 4 quick stats (Zbývá, Ušetřeno, Hodiny, Plán dní)
  * Dashboard: nová sekce "Postup podle fází" s kartami pro každou fázi (progress bar, skutečnost/plán, hodiny, %)
- Nové funkce:
  * CSV export API (/api/projects/[id]/export-csv?type=budget|payments|time) - s BOM pro Excel UTF-8, české datumy, vč. Ušetřeno sloupce
  * CSV export tlačítka v Rozpočet, Platby a Čas tabech
  * Poznámky tab: markdown editor s auto-save (1.5s debounce), edit/preview modes, markdown toolbar (bold, italic, heading, list, todo, quote, code, link), vlastní markdown renderer, počítadla (slova, řádky, úkoly)
  * Project.notes pole v DB (Prisma schema + API PATCH)
  * daysUntilLabel() helper pro lidsky čitelný countdown ("za 5 dní", "před 3 dny", "dnes")
- Bug fixy:
  * "button cannot contain nested button" hydratační chyba - změnil project list item z <button> na <div role="button">
  * ReferenceError: cn not defined v dashboard-tab.tsx - přidal chybějící import cn z utils
  * setState-in-effect v NotesTab - refaktoroval na derived state pattern (localContent + serverContent + isDirty)
- Lint: prošel bez chyb (0 errors, 0 warnings)
- Verifikace přes Agent Browser: dashboard, budget (filtry+CSV), notes (editor+toolbar), payments (CSV) - vše funkční, 0 chyb
- VLM potvrdila: "vidím nové KPI karty vč. Ušetřeno a Hotovo, sekci Postup podle fází, mini-statistiky v sidebaru"

Stage Summary:
- ✅ Aplikace stabilní: 0 runtime chyb, 0 lint chyb
- ✅ Styling výrazně vylepšen: lepší hierarchie, barevné fázové okraje, mini-stats v sidebaru, deadline countdown
- ✅ Nové funkce: CSV export (budget/payments/time), Poznámky s markdown, completion filter, phase progress cards
- ✅ Bug fixy: nested button hydration error, missing cn import, setState-in-effect pattern
- 📊 Dashboard nyní má 6 KPI karet + phase progress sekci + alerts + grafy + breakdown
- 📝 Poznámky tab s auto-save a markdown podporou (úkoly, nadpisy, seznamy, odkazy)

Unresolved issues / Next steps:
- Google Sheets přímá integrace zatím neimplementována (CSV export slouží jako most)
- Supabase Auth ještě neaktivní (utility jsou passthrough)
- Pro budoucí fázi: drag-and-drop reorder (dnd-kit) místo šipek, PDF export faktur, e-mail notifikace na termíny

---
Task ID: 11
Agent: Cron review asistent (Z.ai Code) - druhá revize
Task: QA testování, stylingová vylepšení (tabular-nums, empty states, card shadows), nové funkce (duplikace položky, leaderboard kontaktů, contact-stats API)

Work Log:
- Přečetl worklog, ověřil stabilitu (lint čistý, 0 chyb)
- QA testování přes agent-browser: všech 7 tabů funguje bez chyb
- VLM analýza dashboardu: identifikoval oblasti pro zlepšení (tabulátorové zarovnání čísel, prázdné stavy, vizuální kotvy)
- Styling vylepšení:
  * globals.css: tabular-nums utility pro zarovnání čísel, custom scrollbar styling, animate-number transition
  * Dashboard KPI karty: tabular-nums pro všechna čísla (Plán, Čerpání, Zbývá, Odpracováno, Ušetřeno, Hotovo)
  * Contacts tab: barevné badge (amber pro platby, violet pro časy) místo neutrálních šedých
  * Empty states: EmptyStateBox komponenta s ikonou v kruhu, nadpisem, popisem a CTA tlačítkem - aplikováno v Platby, Čas a Kontakty tabech
- Nové funkce:
  * Duplikace položky rozpočtu: POST /api/budget-items/[id]/duplicate - vytvoří kopii s "(kopie)" příponou, resetuje completed/actualCost/actualHours, umístí na konec
  * "Duplikovat" akce v budget row dropdown menu (Copy ikona)
  * Contact-stats API: GET /api/projects/[id]/contact-stats - agreguje totalPaid, totalHours, paymentCount, timeEntryCount, lastActivity per kontakt + workerStats (pro time entries bez kontaktu)
  * Leaderboard v Contacts tab: dvě karty "Největší náklady" a "Nejvíce odpracováno" s top 4 přispěvateli, medaile (#1 zvýrazněná), emoji ikony typů
  * useDuplicateBudgetItem a useContactStats hooks v api.ts
- Bug fixy: žádné (aplikace byla stabilní)
- Lint: prošel bez chyb (0 errors, 0 warnings)
- Verifikace přes Agent Browser: dashboard, budget (duplicate v menu), contacts (leaderboard), payments (empty state) - vše funkční, 0 chyb
- VLM potvrdila leaderboard: "Největší náklady - žlutý blok, Nejvíce odpracováno - fialový blok s Ing. Pavel Novák 25 h jako #1"

Stage Summary:
- ✅ Aplikace stabilní: 0 runtime chyb, 0 lint chyb
- ✅ Styling: tabular-nums pro čísla, custom scrollbar, vylepšené empty states s ikonami a CTA
- ✅ Nové funkce: duplikace položky rozpočtu, leaderboard kontaktů (náklady + hodiny), contact-stats API
- 📊 Contacts tab nyní má leaderboard sekci + karty kontaktů s barevnými badge
- 📝 Budget tab má "Duplikovat" akci v row menu pro rychlé klonování

Unresolved issues / Next steps:
- Google Sheets přímá integrace zatím neimplementována (CSV export + JSON import/export slouží jako most)
- Supabase Auth ještě neaktivní (utility jsou passthrough)
- Pro budoucí fázi: drag-and-drop reorder (dnd-kit), PDF export faktur, e-mail notifikace na termíny, AI asistent pro optimalizaci rozpočtu

---
Task ID: 12
Agent: Cron review asistent (Z.ai Code) - třetí revize
Task: QA testování, stylingová vylepšení (burn-rate progress bar, search v sidebaru), nové funkce (spending trend graf, vyhledávání projektů)

Work Log:
- Přečetl worklog, ověřil stabilitu (lint čistý, 0 chyb)
- QA testování přes agent-browser: všech 7 tabů funguje bez chyb
- VLM analýza dashboardu: identifikoval oblasti pro zlepšení (progress bar pro čerpání, vyhledávání, graf trendu)
- Styling vylepšení:
  * Dashboard KPI karta "Čerpání": přidal progress bar (zelená/amber/rose dle burn rate) s procenty a "z {planTotal}" popisem, ne jen textový údaj
  * Sidebar: přidal search input "Hledat projekt…" s Search ikonou a X tlačítkem pro vyčištění
  * Sidebar: counter ukazuje "N/{total}" při filtrování
  * Sidebar: "no results" state s tlačítkem "Zrušit hledání"
- Nové funkce:
  * Spending trend API: GET /api/projects/[id]/spending-trend - vrací měsíční údaje (spend, hours) za posledních 12 měsíců + celkové součty
  * SpendingTrendCard v dashboardu: AreaChart s gradient výplní (amber pro výdaje, violet pro hodiny), tooltip, pravý Y-axis, plus mini monthly bars vždy viditelné (i s 0 daty)
  * useSpendingTrend hook v api.ts
  * Vyhledávání projektů v sidebaru: filtruje dle name, address, description (case-insensitive), s clear buttonem a no-results state
- Bug fixy: žádné (aplikace byla stabilní)
- Lint: prošel bez chyb (0 errors, 0 warnings)
- Verifikace přes Agent Browser: dashboard (trend graf + progress bar), sidebar (search filtruje) - vše funkční, 0 chyb
- VLM potvrdila: progress bar v kartě Čerpání, search v sidebaru

Stage Summary:
- ✅ Aplikace stabilní: 0 runtime chyb, 0 lint chyb
- ✅ Styling: burn-rate progress bar v Čerpání KPI kartě, vylepšené vyhledávání v sidebaru
- ✅ Nové funkce: spending trend graf (AreaChart + mini bars), vyhledávání projektů s filtrováním
- 📊 Dashboard nyní má: 6 KPI karet (s progress barem v Čerpání) + phase cards + spending trend graf + alerts + 2 grafy + breakdown
- 🔍 Sidebar má search s live filtrováním a no-results state

Unresolved issues / Next steps:
- Google Sheets přímá integrace zatím neimplementována (CSV export + JSON import/export slouží jako most)
- Supabase Auth ještě neaktivní (utility jsou passthrough)
- Pro budoucí fázi: drag-and-drop reorder (dnd-kit), PDF export faktur, e-mail notifikace na termíny, AI asistent pro optimalizaci rozpočtu, fotogalerie dokumentace

---
Task ID: 13
Agent: Cron review asistent (Z.ai Code) - čtvrtá revize
Task: QA testování, stylingová vylepšení (dark mode toggle), nové funkce (predikce překročení rozpočtu)

Work Log:
- Přečetl worklog, ověřil stabilitu (lint čistý, 0 chyb)
- QA testování přes agent-browser: všech 7 tabů funguje bez chyb
- VLM analýza dashboardu: identifikoval oblasti pro zlepšení (dark mode, prediktivní analýza)
- Styling vylepšení:
  * Dark mode: ThemeProvider (next-themes) v providers.tsx s attribute="class", defaultTheme="light", enableSystem
  * ThemeToggle komponenta v sidebar headeru - CSS-based ikona (Sun/Moon) bez hydration mismatch
  * Aplikace plně podporuje světlý i tmavý motiv (všechny komponenty mají dark: varianty)
- Nové funkce:
  * Predikce překročení rozpočtu: dashboard API nyní počítá projectedFinal, projectedOverrun, avgOverrunRatio
    - avgOverrunRatio = průměr (actualCost/planCost) pro dokončené položky s plánem
    - projectedRemaining = součet planCost * avgOverrunRatio pro nedokončené položky
    - projectedFinal = actualTotal + projectedRemaining
    - projectedOverrun = projectedFinal - planTotal
  * Budget Projection Card v dashboardu: 4 KPI (čerpáno, odhad zbytku, odhad celkem, vs plán), vizuální comparison bar s plán markerem (100%), legendou, a barevným indikátorem (rose pro překročení, emerald pro úsporu)
  * Card se zobrazí jen když jsou nějaké dokončené položky (completedCount > 0)
- Bug fixy: žádné (aplikace byla stabilní)
- Lint: prošel bez chyb (0 errors, 0 warnings)
- Verifikace přes Agent Browser: dashboard (projection card), dark mode toggle (přepíná motiv) - vše funkční, 0 chyb
- VLM potvrdila: "aplikace je v tmavém motivu, vidím přepínač motivu v levém horním rohu"

Stage Summary:
- ✅ Aplikace stabilní: 0 runtime chyb, 0 lint chyb
- ✅ Styling: plná podpora dark/light motivu s toggle tlačítkem v sidebaru
- ✅ Nové funkce: predikce konečných nákladů na základě burn rate dokončených položek
- 📊 Dashboard nyní má: 6 KPI karet + phase cards + budget projection card + spending trend graf + alerts + 2 grafy + breakdown
- 🌙 Dark mode plně funkční s CSS-based toggle (bez hydration mismatch)

Unresolved issues / Next steps:
- Google Sheets přímá integrace zatím neimplementována (CSV export + JSON import/export slouží jako most)
- Supabase Auth ještě neaktivní (utility jsou passthrough)
- Pro budoucí fázi: drag-and-drop reorder (dnd-kit), PDF export faktur, e-mail notifikace na termíny, AI asistent pro optimalizaci rozpočtu, fotogalerie dokumentace

---
Task ID: 14
Agent: Cron review asistent (Z.ai Code) - pátá revize
Task: QA testování, stylingová vylepšení (print CSS), nové funkce (tiskový report, hromadné akce v rozpočtu)

Work Log:
- Přečetl worklog, ověřil stabilitu (lint čistý, 0 chyb)
- QA testování přes agent-browser: všech 7 tabů funguje bez chyb
- VLM analýza dashboardu: identifikoval oblasti pro zlepšení (tiskový report, hromadné akce)
- Styling vylepšení:
  * Print CSS v globals.css: @media print skrývá sidebar/nav/tlačítka, force light theme colors, page breaks, break-inside: avoid pro karty
  * .no-print třída pro prvky které se nemají tisknout
- Nové funkce:
  * Tiskový report: PrintReportDialog komponenta s náhledem reportu (projekt header, shrnutí KPI, rozpad fází, rozpad kategorií, upozornění)
    - Tlačítko "Report" v project header (vedle Upravit)
    - "Tisk / Uložit jako PDF" button volá window.print() s print CSS styly
    - Report obsahuje: název/adresa/popis projektu, datum vygenerování, Zahájení/Dokončení, 6 KPI (plán, skutečnost, zbývá, ušetřeno, hotovo, hodiny), tabulka fází (plán/skut/%/hodiny), tabulka kategorií (top 15), upozornění (zpožděné/blížící se/překročené)
  * Hromadné akce v rozpočtu: multi-select checkboxy (appear on hover), bulk action bar (sticky top) s "N vybráno" badge, "Označit jako hotové" button, "Zrušit výběr"
    - selectedIds state v BudgetTab
    - bulkComplete() aplikuje completed:true na všechny vybrané paralelně
    - Selection checkbox v BudgetRow (opacity-0 → group-hover:opacity-100)
- Bug fixy: žádné (aplikace byla stabilní)
- Lint: prošel bez chyb (0 errors, 0 warnings)
- Verifikace přes Agent Browser: report dialog (náhled + tisk), budget tab (bulk select) - vše funkční, 0 chyb
- Report dialog obsahuje: "Report projektu", "Shrnutí rozpočtu", "Tisk / Uložit jako PDF"

Stage Summary:
- ✅ Aplikace stabilní: 0 runtime chyb, 0 lint chyb
- ✅ Styling: print CSS pro čistý tiskový výstup, .no-print třída
- ✅ Nové funkce: tiskový report s náhledem (PDF export přes prohlížeč), hromadné označování položek jako hotové
- 📊 Dashboard/project header má nyní tlačítko "Report" pro generování PDF reportu
- ✅ Budget tab má multi-select s bulk action barem

Unresolved issues / Next steps:
- Google Sheets přímá integrace zatím neimplementována (CSV export + JSON import/export slouží jako most)
- Supabase Auth ještě neaktivní (utility jsou passthrough)
- Pro budoucí fázi: drag-and-drop reorder (dnd-kit), e-mail notifikace na termíny, AI asistent pro optimalizaci rozpočtu, fotogalerie dokumentace

---
Task ID: 15
Agent: Cron review asistent (Z.ai Code) - šestá revize
Task: QA testování, stylingová vylepšení (collapsible sidebar), nové funkce (audit log/historie změn, klávesové zkratky)

Work Log:
- Přečetl worklog, ověřil stabilitu (lint čistý, 0 chyb)
- QA testování přes agent-browser: všech 7 tabů funguje bez chyb
- VLM analýza dashboardu: identifikoval oblasti pro zlepšení (historie změn, klávesové zkratky, responzivita)
- Nové funkce:
  * Audit log / historie změn: AuditLog model v Prisma schématu (entityType, entityId, action, field, oldValue, newValue, createdAt)
    - logChanges() helper v src/lib/audit.ts - porovnává old vs new data, loguje jen změněné fieldy
    - Integrováno do budget-items PATCH a DELETE routes (automatické logování všech úprav a mazání)
    - GET /api/projects/[id]/audit endpoint s ?limit parametrem
    - useAuditLog hook v api.ts
    - AuditLogDialog komponenta s timeline pohledem - ikony pro create/update/delete (Plus/Pencil/Trash2), barevné odlišení (emerald/sky/rose), field labely v češtině, old→new value diff s strikethrough
    - Tlačítko "Historie změn" (History ikona) v project header
  * Klávesové zkratky: useKeyboardShortcuts hook
    - Cmd/Ctrl+K: focus na search input v sidebaru
    - Cmd/Ctrl+B: toggle sidebar viditelnosti (custom event)
    - Cmd/Ctrl+N: new project (custom event, připraveno pro budoucí napojení)
- Styling vylepšení:
  * Collapsible sidebar: sidebar lze skrýt/zobrazit pomocí tlačítka "Skrýt panel" / "Zobrazit panel" nebo Cmd+B
  * Smooth transition animace (w-0 ↔ w-80, duration-200)
  * Mobile-friendly: na mobilech je collapse button fixed vlevo nahoře
  * Collapse button je fixed na hraně sidebaru (desktop)
- Bug fixy: žádné (aplikace byla stabilní)
- Lint: prošel bez chyb (0 errors, 0 warnings)
- Verifikace přes Agent Browser: audit log dialog (otevře se, zobrazí "Historie změn"), sidebar collapse (tlačítko funguje), ESC zavírá dialog - vše funkční, 0 chyb

Stage Summary:
- ✅ Aplikace stabilní: 0 runtime chyb, 0 lint chyb
- ✅ Nové funkce: audit log s automatickým logováním změn budget items, klávesové zkratky (Cmd+K, Cmd+B, Cmd+N)
- ✅ Styling: collapsible sidebar s smooth animací, mobile-friendly toggle
- 📝 Project header má nyní 3 akční tlačítka: Historie změn, Report, Upravit
- ⌨️ Klávesové zkratky: Cmd+K (search), Cmd+B (sidebar toggle), Cmd+N (new project)

Unresolved issues / Next steps:
- Audit log zatím loguje jen BudgetItem changes - v budoucnu rozšířit na Payments, TimeEntries, Contacts
- Google Sheets přímá integrace zatím neimplementována
- Supabase Auth ještě neaktivní
- Pro budoucí fázi: e-mail notifikace na termíny, AI asistent pro optimalizaci rozpočtu, fotogalerie dokumentace

---
Task ID: 16
Agent: Cron review asistent (Z.ai Code) - sedmá revize
Task: QA testování, bug fix (SelectItem empty value), nové funkce (VAT/DPH sledování v platbách)

Work Log:
- Přečetl worklog, ověřil stabilitu (lint čistý, 0 chyb)
- QA testování přes agent-browser: všech 7 tabů funguje bez chyb
- VLM analýza dashboardu: identifikoval oblasti pro zlepšení (VAT/DPH, fakturace)
- Bug fix:
  * SelectItem empty value error: <SelectItem value=""> v VAT selectu způsoboval runtime chybu "A <SelectItem /> must have a value prop that is not an empty string". Opraveno použitím value="none" s onValueChange handlerem který převádí "none" → ""
- Nové funkce:
  * VAT/DPH sledování v platbách: Přidáno vatRate a vatAmount pole do Payment modelu v Prisma schématu
    - payments POST API: přijímá vatRate, automaticky počítá vatAmount = amount * vatRate / (100 + vatRate)
    - Payment type v api.ts aktualizován o vatRate a vatAmount
    - PaymentDialog: přidal DPH sazba select (Bez DPH, 21%, 12%, 10%, 0%) s live výpočtem DPH a základu
    - PaymentRow: zobrazuje "vč. DPH {rate}%" pod částkou pokud má platba VAT
    - Payments tab toolbar: "z toho DPH" summary pokud nějaká platba má VAT
    - tabular-nums pro všechny částky v payments tab
- Bug fixy: SelectItem empty value error (critical runtime bug)
- Lint: prošel bez chyb (0 errors, 0 warnings)
- Verifikace přes Agent Browser: payment dialog (DPH select funguje), payments tab (načte se) - vše funkční, 0 chyb
- VLM potvrdila: "vidím DPH sekci v dialogu pro přidání platby"

Stage Summary:
- ✅ Aplikace stabilní: 0 runtime chyb, 0 lint chyb
- ✅ Bug fix: SelectItem empty value runtime error (critical)
- ✅ Nové funkce: VAT/DPH sledování v platbách s automatickým výpočtem a live preview
- 💰 Payments tab má nyní DPH sazbu, výpočet DPH a základu, VAT summary v toolbaru
- 📊 Payment rows zobrazují "vč. DPH {rate}%" pokud má platba VAT

Unresolved issues / Next steps:
- Audit log zatím loguje jen BudgetItem changes - v budoucnu rozšířit na Payments, TimeEntries, Contacts
- Google Sheets přímá integrace zatím neimplementována
- Supabase Auth ještě neaktivní
- Pro budoucí fázi: e-mail notifikace na termíny, AI asistent pro optimalizaci rozpočtu, fotogalerie dokumentace

---
Task ID: 17
Agent: Cron review asistent (Z.ai Code) - osmá revize
Task: QA testování, rozšíření audit logu na Payments a TimeEntries, nové funkce (project snapshots)

Work Log:
- Přečetl worklog, ověřil stabilitu (lint čistý, 0 chyb)
- QA testování přes agent-browser: všech 7 tabů funguje bez chyb
- VLM analýza dashboardu: identifikoval oblasti pro zlepšení (snapshots, audit log rozšíření)
- Rozšíření audit logu:
  * Payments PATCH/DELETE: přidáno logChanges() pro "Payment" entitu - získá projectId přes budgetItem, loguje update a delete akce
  * TimeEntries PATCH/DELETE: přidáno logChanges() pro "TimeEntry" entitu - stejný pattern jako Payments
  * Audit log nyní pokrývá BudgetItem, Payment i TimeEntry změny
- Nové funkce:
  * Project snapshots: Snapshot model v Prisma schématu (label, planTotal, actualTotal, remaining, burnRate, hoursTotal, daysPlanned, itemCount, completedCount, savedTotal, createdAt)
    - GET /api/projects/[id]/snapshots - seznam snímků
    - POST /api/projects/[id]/snapshots - vytvoří snímek s aktuálními totals (body: { label })
    - DELETE /api/snapshots/[id] - smazání snímku
    - useSnapshots, useCreateSnapshot, useDeleteSnapshot hooks v api.ts
    - SnapshotsCard komponenta v dashboardu:
      - Input pro label + "Uložit snímek" button (Enter uloží)
      - Seznam snímků s grid statistik (Plán, Čerpáno, Čerpání %, Hotovo)
      - Diffs vs aktuální stav: "+X Kč od snímku", "+X % čerpání", "+X hotových"
      - Barevné odlišení diffs (amber pro nárůst, emerald pro úsporu/pokles)
      - Delete button na hover
      - Empty state: "Zatím žádné snímky"
- Bug fixy: žádné (aplikace byla stabilní)
- Lint: prošel bez chyb (0 errors, 0 warnings)
- Verifikace přes Agent Browser: dashboard se načetl, "Uložit snímek" button viditelný, 0 chyb
- VLM potvrdila: "vidím detail projektu Troja se všemi prvky"

Stage Summary:
- ✅ Aplikace stabilní: 0 runtime chyb, 0 lint chyb
- ✅ Audit log rozšířen na Payments a TimeEntries (ne jen BudgetItem)
- ✅ Nové funkce: project snapshots pro porovnání „plán vs. realita" v čase
- 📸 SnapshotsCard v dashboardu s create/list/delete + diffs vs aktuální stav
- 📝 Audit log nyní pokrývá 3 entity: BudgetItem, Payment, TimeEntry

Unresolved issues / Next steps:
- Audit log zatím loguje jen update/delete, ne create - v budoucnu rozšířit
- Google Sheets přímá integrace zatím neimplementována
- Supabase Auth ještě neaktivní
- Pro budoucí fázi: e-mail notifikace na termíny, AI asistent pro optimalizaci rozpočtu, fotogalerie dokumentace

---
Task ID: 18
Agent: Cron review asistent (Z.ai Code) - devátá revize
Task: QA testování, stylingová vylepšení (status filter pills), nové funkce (komentáře k budget items)

Work Log:
- Přečetl worklog, ověřil stabilitu (lint čistý, 0 chyb)
- QA testování přes agent-browser: všech 7 tabů funguje bez chyb
- VLM analýza dashboardu: identifikoval oblasti pro zlepšení (filtry, komentáře)
- Nové funkce:
  * Status filter v sidebaru: 4 pill tlačítka (Vše/Aktivní/Plánování/Hotovo) s count badge pro každý status
    - Filtruje projekty dle status (active/planning/completed)
    - Pill s shadow-sm pro aktivní filtr, hover effect pro ostatní
    - Count badge ukazuje počet projektů v každém statusu
  * Komentáře k budget items: Comment model v Prisma schématu (budgetItemId, author, text, createdAt)
    - GET /api/budget-items/[id]/comments - seznam komentářů
    - POST /api/budget-items/[id]/comments - přidání komentáře (body: { author, text })
    - DELETE /api/comments/[id] - smazání komentáře
    - useComments, useCreateComment, useDeleteComment hooks v api.ts
    - CommentSection komponenta: seznam komentářů s autor/datum/text, add form (author + text + Send button), delete on hover, scroll area (max-h-48)
    - CommentSection zobrazena v BudgetItemDialog (jen při editaci existující položky)
    - Comment count badge v budget tab řádku (sky barva s MessageSquare ikonou)
    - Budget GET API vrací _count.comments
- Styling vylepšení:
  * Status filter pills s flex-1 layout, count badge, shadow-sm pro aktivní
  * Comment count badge v budget row (sky barva, MessageSquare ikona)
- Bug fixy: žádné (aplikace byla stabilní)
- Lint: prošel bez chyb (0 errors, 0 warnings)
- Verifikace přes Agent Browser: status filter pills (Vše 1, Aktivní 1), comment section v edit dialog (Jméno, Napište komentář) - vše funkční, 0 chyb

Stage Summary:
- ✅ Aplikace stabilní: 0 runtime chyb, 0 lint chyb
- ✅ Nové funkce: status filter v sidebaru (4 pills s counts), komentáře k budget items (inline discussion)
- 🔍 Sidebar má nyní search + status filter pills s count badges
- 💬 Budget items mají comment section v edit dialogu s add/delete + count badge v tabulce

Unresolved issues / Next steps:
- Audit log zatím loguje jen update/delete, ne create
- Google Sheets přímá integrace zatím neimplementována
- Supabase Auth ještě neaktivní
- Pro budoucí fázi: e-mail notifikace na termíny, AI asistent pro optimalizaci rozpočtu, fotogalerie dokumentace

---
Task ID: 19
Agent: Cron review asistent (Z.ai Code) - desátá revize
Task: QA testování, stylingová vylepšení, nové funkce (globální vyhledávání / command palette)

Work Log:
- Přečetl worklog, ověřil stabilitu (lint čistý, 0 chyb)
- QA testování přes agent-browser: všech 7 tabů funguje bez chyb
- VLM analýza dashboardu: identifikoval oblasti pro zlepšení (globální search, responzivita)
- Nové funkce:
  * Globální vyhledávání (Command Palette): Cmd/Ctrl+K otevírá modal dialog pro vyhledávání napříč aplikací
    - GET /api/search?q=query - prohledává projekty (name, address, description), budget items (category, subcategory, element, note), kontakty (name, role, company, email, phone)
    - GlobalSearchDialog komponenta s command palette designem:
      - Search input s auto-focus, ESC pro zavření
      - Seskupené výsledky: Projekty, Položky rozpočtu, Kontakty
      - Ikony pro každý typ (FolderKanban, Package, Users)
      - Klávesnice navigace: ↑↓ pro pohyb, Enter pro výběr
      - Hover highlight + selected state
      - Phase badge pro budget items, price badge, starred indicator pro projekty
      - Empty state s nápovědou
      - Loading skeleton
      - Klik na výsledek: přepne na příslušný projekt + tab (dashboard/budget/contacts)
    - GlobalSearchInner komponenta (key-based remount pattern pro reset při otevření)
    - Fixed search button v pravém horním rohu s ⌘K kbd indikátorem
  * Keyboard shortcuts aktualizovány: Cmd+K nyní otevírá global search (místo focus na sidebar search)
- Styling vylepšení:
  * Fixed search button v top-right s backdrop-blur, ⌘K kbd badge
  * Command palette design: clean grouped results, hover states, keyboard navigation hints
  * Phase color badges ve výsledcích vyhledávání
- Bug fixy:
  * setState-in-effect lint errors: refaktoroval GlobalSearchDialog na wrapper + inner component pattern (key-based remount), odstranil useEffect pro reset query
  * ref-during-render lint error: nahrazen derived state (safeSelectedIndex = Math.min(...))
- Lint: prošel bez chyb (0 errors, 0 warnings)
- Verifikace přes Agent Browser: global search button visible, dialog se otevře, zadání "tro" najde projekt Troja, ESC zavírá - vše funkční, 0 chyb

Stage Summary:
- ✅ Aplikace stabilní: 0 runtime chyb, 0 lint chyb
- ✅ Nové funkce: globální vyhledávání (command palette) s klávesnicí navigací napříč projekty/položkami/kontakty
- 🔍 Cmd+K otevírá global search modal s seskupenými výsledky a keyboard navigation
- ⌨️ Klávesové zkratky: Cmd+K (global search), Cmd+B (sidebar toggle), Cmd+N (new project)

Unresolved issues / Next steps:
- Audit log zatím loguje jen update/delete, ne create
- Google Sheets přímá integrace zatím neimplementována
- Supabase Auth ještě neaktivní
- Pro budoucí fázi: e-mail notifikace na termíny, AI asistent pro optimalizaci rozpočtu, fotogalerie dokumentace, multi-project comparison view

---
Task ID: 20
Agent: Hlavní asistent (Z.ai Code) - mobilní responzivita
Task: Odstranění Supabase middleware (runtime error), mobilní responzivita (hamburger drawer, responzivní layout)

Work Log:
- Odstranil src/middleware.ts který způsoboval runtime error "Your project's URL and Key are required to create a Supabase client!" - middleware se snažil inicializovat Supabase klienta na každý request i když nepoužíváme Supabase pro data
- Mobilní responzivita:
  * page.tsx: kompletně přepsán s desktop/mobile rozlišením
    - Desktop (md+): sidebar je inline (w-80), lze skrýt přes "Skrýt panel" button na hraně nebo Cmd+B
    - Mobile (<md): sidebar je drawer (overlay) - defaultně zavřený, otevře se přes hamburger menu v mobilním top bar
    - Mobilní top bar: hamburger menu vlevo, název projektu uprostřed, search ikona vpravo
    - Backdrop overlay (bg-black/50 backdrop-blur) při otevřeném draweru, klik zavře drawer
    - Drawer se zavře při výběru projektu (onSelectProject callback)
  * app-sidebar.tsx: přidán onSelectProject prop pro callback při výběru projektu (zavře mobilní drawer), h-full pro správnou výšku v draweru
  * project-detail.tsx: responzivní úpravy
    - Padding: px-4 na mobilu, px-6 na desktopu
    - Nadpis: text-xl na mobilu, text-2xl na desktopu
    - Tlačítka (Historie/Report/Upravit): jen ikony na mobilu (px-2), ikony+text na desktopu (px-3, hidden md:inline)
    - Stats strip: menší gap na mobilu (gap-x-4 → md:gap-x-5)
    - Taby: shrink-0, jen ikony na mobilu (hidden sm:inline pro label), scrollbar-thin, menší padding na mobilu
    - Tab content padding: px-4 py-4 na mobilu, md:px-6 md:py-6 na desktopu
  * dashboard-tab.tsx: KPI karty grid
    - grid-cols-2 na mobilu (2 karty vedle sebe), md:grid-cols-3, lg:grid-cols-6
    - Menší gap na mobilu (gap-2 → sm:gap-3 → lg:gap-4)
    - KPI hodnoty: text-lg na mobilu, md:text-2xl na desktopu
- Lint: prošel bez chyb (0 errors, 0 warnings)
- Verifikace přes Agent Browser:
  * Mobile (390x844 - iPhone 14): hamburger menu, mobilní top bar, 2-sloupcový KPI grid, drawer se otevře se seznamem projektů, 0 chyb
  * Desktop (1280x800): sidebar visible, collapse/expand funguje, 0 chyb
  * VLM potvrdila: "Aplikace je plně responzivní, hamburger menu v levém horním rohu, 2-sloupcový grid karet"

Stage Summary:
- ✅ Bug fix: Supabase middleware runtime error odstraněn
- ✅ Mobilní responzivita: hamburger drawer, mobilní top bar, responzivní KPI grid, ikonové taby
- ✅ Desktop: beze změny funkčnosti, sidebar collapse funguje
- 📱 Aplikace je plně použitelná na mobilu (390px+) i desktopu (1280px+)

Unresolved issues / Next steps:
- Google Sheets přímá integrace zatím neimplementována
- Pro budoucí fázi: e-mail notifikace, AI asistent, fotogalerie dokumentace

---
Task ID: B6
Agent: Subagent B6 (Z.ai Code) — Upozornění & Vůle rework

Task: Rework sekce "Upozornění a akce" v dashboardu (in-progress / mustPay / shouldStart / overBudgetWorst) + zpracování pole 'Vůle' (flexibilityPercent) v predikci nákladů a indikátorech fází.

Work Log:
- Přečetl worklog a existující kód (`src/app/api/projects/[id]/dashboard/route.ts`, `src/components/tabs/dashboard-tab.tsx`, `src/lib/api.ts`, `prisma/schema.prisma`, `src/lib/format.ts`)
- **Backend — `src/app/api/projects/[id]/dashboard/route.ts`:**
  - Přidán `include: { _count: { select: { payments: true, timeEntries: true } } }` k dotazu na budget items, abychom mohli filtrovat "mustPay" a "shouldStart" bez dalších roundtripů
  - Nové alert arrays v odpovědi:
    - `inProgress`: items kde `!completed && (actualCost > 0 || actualHours > 0)` — probíhající práce
    - `mustPay`: items kde `!completed && _count.timeEntries > 0 && _count.payments === 0` — práce bez platby (KRITICKÉ)
    - `shouldStart`: items kde `!completed && dateFrom <= dnes+7d && _count.payments === 0 && _count.timeEntries === 0` — mělo by začít
    - `overBudgetWorst`: items kde `!completed && planCost > 0 && actualCost > planCost * (1 + flexibilityPercent/100)` — překročeno i s vůlí (KRITICKÉ)
  - Existující filtry (`upcoming`, `overdue`, `overBudget`, `unscheduled`) vylepšeny: všechny nyní mají `!it.completed` podmínku (dříve `overBudget` a `upcoming` zobrazovaly i dokončené položky)
  - `byPhase` agregace rozšířena o `worstCase` (= součet `planCost * (1 + vůle/100)` pro každou fázi) — umožňuje UI indikovat, kdy fáze přesahuje i svou horní hranici
- **TypeScript typy — `src/lib/api.ts`:**
  - `Dashboard.alerts` rozšířeno o `overBudgetWorst`, `inProgress`, `mustPay`, `shouldStart` (vše `BudgetItem[]`)
  - `Dashboard.byPhase` rozšířeno o `worstCase: number` field
- **UI — `src/components/tabs/dashboard-tab.tsx`:**
  - Importovány nové ikony: `Activity`, `Rocket`, `Flame`, `Banknote` (z lucide-react)
  - `totalAlerts` rozdělen na 3 kategorie: `criticalAlerts` (mustPay + overdue + overBudget + overBudgetWorst), `progressAlerts` (inProgress), `infoAlerts` (upcoming + shouldStart + unscheduled)
  - Alerts banner redesign:
    - Card header nyní obsahuje 3 summary badges (kritické / probíhající / informativní) s příslušnou barvou (rose / sky / amber)
    - Card body má 3 vizuálně oddělené group boxy:
      - **Kritické (rose)**: mustPay (Banknote ikona), overBudgetWorst (Flame), overdue (AlertTriangle), overBudget (TrendingDown)
      - **Probíhající (sky)**: inProgress (Activity)
      - **Informativní (amber)**: shouldStart (Rocket), upcoming (CalendarClock), unscheduled (CalendarClock)
    - Každá skupina má vlastní rounded-lg box s borderem a podtlakem v odpovídající barvě (světlá + dark mode)
  - AlertGroup komponenta rozšířena:
    - Nový `hint?: string` prop pro podtitul (kontext proč je to upozornění)
    - `max-h-40 overflow-y-auto` na seznamu (prevence UI exploze u velkých projektů)
  - **Budget Projection card — Nejhorší scénář panel:**
    - Nový vložený panel (violet themed) nad existujícím Plán → Odhad barem
    - Zobrazí: Horní hranici (plán + vůle), Rezervu do vůle (worstCase - actualTotal), Odhad vs. vůli (projectedFinal - worstCase)
    - "Odhad přesahuje vůli" badge (rose) pokud `projectedFinal > worstCase`
    - Stacked bar: actual vs. worstCase s plánovacím markerem (foreground/50) ukazující plánovou pozici v rámci vůle
  - **Phase progress cards — Vůle indikátor:**
    - Pokud `actual > worstCase` (i s vůlí překročeno): celá karta dostane rose border + bg, "Vůle" badge s Flame ikonou, hodnota barva rose, "X% max" text vedle %
    - Pokud vůle existuje ale není překročena: jemný violet marker na progress baru ukazující pozici vůle (jako % plánu)
    - Sub-text pod hodinami: `max {worstCase}` ve fialové barvě
    - `worstBurn` % (actual / worstCase * 100) zobrazeno v tooltipu + badge pokud přesahuje
- **Lint výsledek:**
  - Spuštěno `bun run lint`: 2 errors (PRE-EXISTING v `payments-tab.tsx:137` a `time-tab.tsx:473` — nesaší B6 soubory, ty byly upraveny jinými agenty v minulosti)
  - `npx eslint src/components/tabs/dashboard-tab.tsx src/lib/api.ts "src/app/api/projects/[id]/dashboard/route.ts"` → exit code 0 (žádné chyby v B6 souborech)

Stage Summary:
- ✅ Backend: 4 nové alert arrays (inProgress, mustPay, shouldStart, overBudgetWorst) + worstCase per fáze + !completed filtry všude
- ✅ UI: Alerts banner přeuspořádán do 3 skupin (Kritické → Probíhající → Informativní) s odlišnými barvami a ikonami, summary badges v hlavičce
- ✅ Vůle (flexibilityPercent): zobrazena v Budget Projection card (Nejhorší scénář panel s 3 metrikami + stacked bar) + v phase progress cards (marker + "Vůle" badge pokud překročeno)
- ✅ Hotové položky vyloučeny ze všech alert filtrů
- ✅ Lint: 0 chyb v B6 souborech (2 pre-existing chyby v payments-tab/time-tab jsou mimo B6 scope)

Unresolved issues / Next steps:
- Pre-existing lint chyby v payments-tab.tsx (preserve-manual-memoization) a time-tab.tsx (set-state-in-effect) — nutno opravit v samostatném tasku
- V budoucnu otestovat nové alerts UI na živém projektu (potvrzení že mustPay / shouldStart zobrazují správně s reálnými daty)

---
Task ID: B3
Agent: Subagent (Z.ai Code) — payments edit + sort
Task: Přidat úpravu existujících plateb + třídění v payments tabu

Work Log:
- Přečetl worklog pro kontext (aplikace "Stavba", payments tab)
- Backend: PATCH /api/payments/[id] rozšířen o vatRate/vatAmount podporu
  * Pre-kalkulace vatAmountValue podle vatRate a amount
  * null/empty vatRate → null vatRate i vatAmount
  * Kompatibilní s POST endpoint výpočtem
- Frontend (src/components/tabs/payments-tab.tsx):
  * useUpdatePayment hook importován z api.ts (už existoval)
  * Nové SortKey ("date"|"type"|"amount"|"contact"|"vendor") a SortDir ("asc"|"desc") typy
  * Sort ovládací prvky v toolbaru: ArrowDownUp ikona + Select pro klíč + icon button pro asc/desc
  * filteredStandalone zpracovává filtr + sort v jednom useMemo s esc-disable pro filterFn
  * Sort podle: date (timestamp), type (localeCompare), amount (číselně), contact (cs locale), vendor (cs locale)
  * Installment groups zůstávají nad standalone (pořadí JSX nezměněno) + vždy date desc
  * PaymentRow: nový onEdit prop, cursor-pointer na TableRow, onClick otevírá edit dialog
  * Dropdown menu v PaymentRow: 2 položky (Upravit s Pencil ikonou + Smazat destructive)
  * Poslední buňka (akce) má stopPropagation, aby klik na menu nespustil editaci
  * PaymentDialog podporuje edit mód přes volitelné payment? a updatePayment? props
  * isInvoiceParent detekce pro editaci existující faktury
  * Všechny useState inicializovány z payment (při editaci) — key-based remount v rodiči
  * Submit handler v edit módu volá updatePayment.mutateAsync({ id, data: patch })
  * Patch obsahuje: budgetItemId, contactId, amount, date, type, vendor, invoiceNumber, description
  * V edit módu: invoiceTotal (pokud parent), vatRate (number nebo null)
  * Installment toggle skrytý v edit módu (nelze konvertovat na fakturu)
  * Submit button: "Uložit změny" v edit módu
  * Dialog title/description: "Upravit platbu" / "Upravte údaje existující platby a uložte změny."
  * Druhá instance PaymentDialog v PaymentsTab podmíněně renderovaná přes editPayment (key=payment.id)
- Lint: prošel bez chyb (0 errors, 0 warnings, EXIT=0)
- Dev server log: čistý, žádné runtime chyby, API 200 OK
- Záznam v /agent-ctx/B3-payments-edit-sort.md

Stage Summary:
- ✅ Úprava existujících plateb: klik na řádek / "Upravit" v menu otevře edit dialog s předvyplněnými hodnotami
- ✅ PATCH /api/payments/[id] nyní podporuje i vatRate/vatAmount (původně chybělo)
- ✅ Třídění standalone plateb: Datum (default), Typ, Částka, Kontakt, Firma — s asc/desc přepínačem
- ✅ Installment groups zůstávají nad standalone, default date desc
- ✅ Lint čistý, 0 errors
- 🔧 Editace faktury (invoice parent): upraví invoiceTotal + metadata, jednotlivé splátky přes installment list

---
Task ID: B4
Agent: Subagent B4 — Time tab: úpravy, filtrování/třídění, "Hotovo" checkbox
Task: Přidat možnost upravovat časové záznamy, filtrovat/třídit, a přidat "Hotovo" checkbox propojující časový záznam s dokončením budget item.

Work Log:
- Přečetl worklog, identifikoval existující API endpointy (PATCH /api/time-entries/[id], PATCH /api/budget-items/[id]) a existující hook useUpdateBudgetItem
- Přidal `useUpdateTimeEntry` hook do `src/lib/api.ts` (mutateAsync na PATCH /api/time-entries/[id], invaliduje time/budget/dashboard query)
- Kompletně refaktoroval `src/components/tabs/time-tab.tsx`:
  * **Editace časových záznamů**: přidána "Upravit" položka v dropdown menu každého TimeRow (Pencil ikona), otevírá TimeDialog v edit módu s předvyplněnými hodnotami (budgetItemId, contactId, workerName, workerType, date, dateTo, hours, description). Po uložení volá PATCH /api/time-entries/[id].
  * **TimeDialog refaktor**: wrapper + inner komponenta pattern (key-based remount přes editEntry?.id ?? "new") - čistý useState initializer bez useEffect, žádné setState-in-effect lint errory.
  * **Filtrování podle kategorie**: nový Select dropdown "Všechny kategorie" s unikátními kategoriemi z budget items (dle kategorie budgetItem.category, na každém time entry). Přidáno do toolbaru.
  * **Třídění**: nový Select dropdown s ikonou ArrowUpDown - 4 možnosti: Datum (nejnovější, default), Pracovník (A→Z), Hodiny (sestupně), Typ pracovníka. Implementováno přes useMemo na filtered array.
  * **"Hotovo" checkbox v TimeDialog**: přidán Checkbox "Označit položku rozpočtu jako hotovou" ve fialovém rámečku. Po vytvoření/úpravě časového záznamu, pokud je zaškrtnut, volá PATCH /api/budget-items/[budgetItemId] s { completed: true }. Defaultně nezaškrtnutý. Zobrazuje hint "Položka je již označena jako hotová." pokud je completed=true.
  * V SelectItem pro budget items se zobrazuje "✓" indikátor u již dokončených položek.
  * Submit button zobrazuje CheckCircle2 ikonu (fialová) když je checkbox zaškrtnutý a není pending.
- Bug fixy (paralelní agenti, lint čištění):
  * `src/components/tabs/budget-tab.tsx`: chybějící import Checkbox způsobil 2× "Checkbox is not defined" runtime error — znovu přidán import
  * `src/components/tabs/payments-tab.tsx`: odstraněn unused eslint-disable directive
- Lint: prošel bez chyb (0 errors, 0 warnings)

Stage Summary:
- ✅ Aplikace stabilní: 0 runtime chyb, 0 lint chyb
- ✅ Editace časových záznamů: plnohodnotný edit dialog s předvyplněním a PATCH endpointem
- ✅ Filtrování + třídění: typ pracovníka, kategorie, hledání + 4 možnosti třídění
- ✅ "Hotovo" checkbox: propojí časový záznam s dokončením budget item přes PATCH /api/budget-items/[id]
- 🔧 Čištění: opravený chybějící Checkbox import v budget-tab, odstraněn unused eslint-disable v payments-tab

---
Task ID: B5
Agent: Subagent B5 (Z.ai Code)
Task: Přidat website field k kontaktům a vylepšit souhrn času+financí per kontakt

Work Log:
- Přečetl worklog pro kontext (předchozí úkoly 1-20)
- Website field pro kontakty:
  * Přidáno `website String?` do Contact modelu v prisma/schema.prisma
  * Spuštěn `bun run db:push` — schéma aplikováno bez datové ztráty
  * Aktualizován POST /api/projects/[id]/contacts pro přijetí `website`
  * Aktualizován PATCH /api/contacts/[id] pro přijetí `website`
  * Aktualizován Contact type v src/lib/api.ts: `website: string | null`
  * V ContactDialog přidán Input pro website s Globe ikonou vlevo a placeholder "např. www.firma.cz"
  * V ContactCard zobrazen website jako odkaz (Globe ikona, target="_blank", rel="noopener noreferrer", ExternalLink ikona)
  * V CSV export přidán nový `type=contacts` (header: Jméno/Typ/Role/Firma/Telefon/E-mail/Web/Hodnocení/Poznámky) — `useExportCsv` hook typ rozšířen o "contacts"
  * Na kontakty tab přidán CSV export button (vedle "Přidat kontakt")
- Souhrn času+financí per kontakt:
  * Endpoint /api/projects/[id]/contact-stats rozšířen o `budgetItems` (per-contact agregace: budgetItemId, category, subcategory, element, phase, amount, hours) — setříděno dle relevance
  * Nový type `ContactBudgetItemStat` v api.ts + `budgetItems` a `website` pole přidána do `ContactStat`
  * V ContactCard přidán CardFooter se 4 StatPill (2x2 grid):
    - Zaplaceno (amber, Wallet ikona, formatCzk)
    - Hodiny (violet, Clock3 ikona, formatNumber s " h")
    - Plateb (amber, PackageCheck ikona, počet)
    - Časů (violet, Clock3 ikona, počet)
  - Staty se zobrazují jen pokud jsou > 0 (hasStats kontrola)
  * useContactStats hook invalidace přidána do useCreateContact/useUpdateContact/useDeleteContact (dříve se contactStats neinvalidovaly při změnách kontaktu)
- Rozkliknutí kontaktu pro detail:
  * ContactCard je nyní klikací (cursor-pointer + hover:shadow-md), otevírá ContactDetailDialog
  * Stop propagation na odkazech (tel/mailto/website) a DropdownMenu tlačítkách aby se detail neotevíral při kliku na ně
  * ContactDetailDialog (max-w-2xl, max-h-90vh, scrollable):
    - Header: avatar emoji, jméno, badge typu, role, hvězdičky hodnocení, "Upravit" button
    - Sekce "Kontakt": grid 2 sloupců DetailRow (Firma/Telefon/E-mail/Web/Poslední aktivita) + poznámky box
    - Sekce "Souhrn času a financí": 4 DetailStat karty (Celkem zaplaceno/Celkem hodin/Počet plateb/Časových záznamů) s amber/violet barvou
    - Sekce "Položky rozpočtu": tabulka s budget items (Kategorie/Prvek, Fáze badge, Kč amber, Hodiny violet) — data z `stat.budgetItems`
    - Empty state: "Kontakt zatím nepracoval na žádné položce rozpočtu."
    - Footer: "Zavřít" button
- Helper funkce `normalizeWebsite(raw)` — přijímá "www.firma.cz", "firma.cz", nebo "https://firma.cz" a vrací plnou URL s https:// prefixem pokud chybí
- Lint: prošel bez chyb (0 errors, 0 warnings) — exit code 0
- Dev log: čistý, žádné runtime chyby

Stage Summary:
- ✅ Website field kompletně napojen: schema → API (POST/PATCH) → type → dialog input → card link → CSV export
- ✅ Souhrn času+financí per kontakt zobrazen v card footeru (4 stat pills s amber/violet barvou)
- ✅ Detail dialog otevíraný klikem na kartu: základní info + 4 stat karty + tabulka budget items s hodinami a částkami
- ✅ Contact-stats endpoint rozšířen o per-contact budget items agregaci
- ✅ CSV export přidán nový "contacts" typ s Web sloupcem

Unresolved issues / Next steps:
- Stejně jako předchozí úkoly — Supabase Auth, Google Sheets integrace, e-mail notifikace
- V budoucnu možná rozšířit detail dialog o seznam konkrétních plateb a časových záznamů (nejen agregace per budget item)

---
Task ID: B1
Agent: Subagent B1 (Budget Tab Refactor)
Task: Refaktor Budget tab — odstranit zbytečné checkboxy, předělat Hotovo toggle na tlačítko, přidat sloupec Prvek/Úkol, opravit scrollbar na všech tab panelech.

Work Log:
- Načetl `src/components/tabs/budget-tab.tsx` (953 řádků) a kontext `worklog.md`.
- Identifikoval strukturu BudgetRow: 1. Required checkbox, 2. Selection checkbox (multi-select), 3. Completed toggle (Circle/CheckCircle2 icon button), pak Položka (s elementem jako malým textem), Fáze, Poznámka, atd.
- Identifikoval redundantní `<div className="overflow-x-auto">` wrapper kolem `<Table>` v budget-tab.tsx (line 461) a payments-tab.tsx (line 387) — Table komponenta už má `overflow-x-auto` vestavěný (src/components/ui/table.tsx:11).
- Ověřil ostatní taby (timeline, contacts, dashboard, time, notes): pouze `overflow-hidden` u progress barů (OK, žádná chyba) a timeline-tab.tsx:307 má `overflow-x-auto` na custom Gantt (bez `<Table>`) — to je oprávněné, nechat beze změny.

Provedené změny v `src/components/tabs/budget-tab.tsx`:
1. **Odstraněn Required checkbox** (první Checkbox pro `item.required`) — místo něj přidán vizuální "!" badge (rounded plný kruh, bg-rose-100/text-rose-700, dark mode varianty) vedle názvu položky, podmíněný `item.required === true`. S `title="Nutné"` a `aria-label="Nutné"` pro accessibility. Není to interaktivní checkbox — pouze vizuální indikátor.
2. **Odstraněn Selection checkbox** (druhý Checkbox pro `isSelected`) a veškerá multi-select/bulk logic:
   - Smazán `selectedIds` state, `toggleSelect`, `bulkComplete`, `clearSelection` funkce
   - Smazán Bulk action bar UI (sticky panel nahoře s "X vybráno" + "Označit jako hotové" tlačítkem + "Zrušit výběr")
   - Z `BudgetRow` props odstraněny `isSelected` a `onToggleSelect`
   - Z TableRow className odstraněn `isSelected && "bg-primary/5"`
3. **Completed toggle předělán na tlačítko "Hotovo"**:
   - Starý Circle/CheckCircle2 icon button na začátku řádku odstraněn
   - Nový `<Button>` s `size="sm"`, `variant={item.completed ? "default" : "outline"}`, zelené zbarvení (emerald) v obou stavech:
     - Nehotovo: `variant="outline"`, `text-emerald-700`, hover `bg-emerald-50`, Circle ikona
     - Hotovo: `variant="default"`, `bg-emerald-600 text-white`, hover `bg-emerald-700`, CheckCircle2 ikona
   - Umístěn na konec řádku v novém sloupci "Stav" (w-28 text-center), PŘED akčním menu (tři tečky)
   - `onClick={() => update("completed", !item.completed)}` — přepíná `completed` field přes PATCH
   - `aria-pressed={item.completed}` pro accessibility
   - `disabled={updateItem.isPending}` — disabled stav při API volání
4. **Přidán nový sloupec "Prvek / Úkol"** s `min-w-[140px]`:
   - V hlavičce tabulky hned po "Položka"
   - V buňce body zobrazuje `item.element` s `line-clamp-2` (zalamování na 2 řádky) a hover underline pro editaci
   - Pokud je element null/empty, zobrazí "—" placeholder
   - `element` už není zobrazen jako malý text pod subcategory v Položka sloupci (odstraněn)
5. **Aktualizována hlavička tabulky** — nové pořadí sloupců: Položka (min-w-200), Prvek/Úkol (min-w-140), Fáze, Poznámka, Plán, Vůle, Dny, Datum od, Datum do, Skut., Ušetřeno, Hod., Stav (w-28 text-center), Akce (w-8).
6. **Odstraněn redundantní `<div className="overflow-x-auto">` wrapper** kolem `<Table>` — Table komponenta už má vestavěný overflow-x-auto, takže dvojí scrollbar zmizel. Snížení zbytečného scrollbaru.

Provedené změny v `src/components/tabs/payments-tab.tsx`:
7. **Odstraněn redundantní `<div className="overflow-x-auto">` wrapper** kolem `<Table>` v sekci "Installments list" (expandbox splátek) — opět, Table komponenta už má vestavěný overflow-x-auto.

Cleanup:
- Z imports v budget-tab.tsx odstraněn `Checkbox` (už nepoužíván) a `GripVertical` (nebyl použit)
- Z imports odstraněn také `Label` (nebyl použit) a `PHASE_DOT_COLORS` (nebyl použit)

Lint:
- `bun run lint` prošel bez chyb (exit code 0, 0 errors, 0 warnings).

Stage Summary:
- ✅ Required checkbox odstraněn — místo něj vizuální "!" badge vedle názvu
- ✅ Multi-select checkbox a bulk action bar kompletně odstraněny
- ✅ Hotovo toggle předělán na zelené tlačítko "Hotovo" na konci řádku (před akčním menu)
- ✅ Nový sloupec "Prvek / Úkol" (min-w-140) zobrazuje element jako samostatnou buňku
- ✅ Redundantní overflow-x-auto wrappery odstraněny v budget-tab.tsx i payments-tab.tsx
- ✅ Lint prošel (0 errors)

---
Task ID: 21
Agent: Hlavní asistent (Z.ai Code) - velká dávka oprav a funkcí
Task: Oprava bugů + nové funkce (filtr, timeline drag, platby edit, čas edit, kontakty souhrn, alerts rework, Vůle, edit projektu)

Work Log:
- Bug fix: completionFilter chyběl v dependency array useMemo → filtr Hotovo/Aktivní/Vše nefungoval (opraveno)
- Bug fix: ProjectDialog vždy volal createProject i v edit módu → přidán useUpdateProject a isEditMode logika
- Subagent B1: Budget tab - odstraněn 1. checkbox (required = vizuální "!" badge), Hotovo toggle předělán na tlačítko na konci řádku, odstraněn multi-select, přidán sloupec 'Prvek/Úkol', opraven scrollbar
- Subagent B2: Timeline drag/resize - kompletní rewrite GanttBar s live visual feedback, single API write na pointer up, touch support, resize handles vždy viditelné, touchAction:none
- Subagent B3: Platby - možnost upravit existující platby (klik na řádek/ikona v menu), třídění podle datum/typ/částka/kontakt/firma
- Subagent B4: Čas - možnost upravit záznamy, filtrovat podle kategorie, třídit podle datum/pracovník/hodiny/typ, "Hotovo" checkbox při zaznamenání času (označí budget item jako completed)
- Subagent B5: Kontakty - website field, ContactDetailDialog s souhrnem času+financí a seznamem budget items, statistiky (zaplaceno/hodiny) v card footer
- Subagent B6: Alerts rework - mustPay (práce bez platby), inProgress, shouldStart, overBudgetWorst (překročeno i s vůlí), kritické/informativní/probíhající sekce, hotové položky nikdy nezobrazeny, Vůle zpracována v predikci a phase cards
- Lint: prošel bez chyb (0 errors, 0 warnings)
- Verifikace: budget filtr, payments edit, time edit, contacts, alerts - vše funkční, 0 chyb

Stage Summary:
- ✅ Bug fix: filtr Hotovo/Aktivní/Vše, editace projektu, timeline drag/resize
- ✅ Platy: editace + třídění (datum/typ/částka/kontakt/firma)
- ✅ Čas: editace + filtrování + třídění + Hotovo checkbox → budget item
- ✅ Kontakty: website field + detail dialog s souhrnem času/financí/budget items
- ✅ Alerts: kritické (mustPay, overBudgetWorst, overdue) / probíhající (inProgress) / informativní (shouldStart, upcoming, unscheduled), hotové nikdy
- ✅ Vůle: zpracována v predikci (worstCase) a phase cards (indikace překročení)
- ✅ Budget: "Hotovo" tlačítko místo checkboxu, "Prvek/Úkol" sloupec, odstraněn zbytečný checkbox

Unresolved issues / Next steps:
- Šablony projektů podle typu výstavby (nová stavba/rekonstrukce/interiér) - neimplementováno
- Fáze: časová složka (overrun) - částečně hotovo (B6 přidal worstCase), ale časový overrun per fáze ještě není

---
Task ID: 22
Agent: Hlavní asistent (Z.ai Code) - šablony a fáze
Task: Šablony projektů podle typu výstavby + časový/finanční overrun per fáze

Work Log:
- Šablony projektů:
  * src/lib/project-templates.ts: 4 šablony (Rekonstrukce, Nová stavba, Interiér, Přístavba) s předvyplněnými budget items (kategorie, podkategorie, fáze, plánované částky, vůle, dny, poznámky)
    - Rekonstrukce má askScope=true (částečná/kompletní/strukturní) - při částečné se vyfiltrují jen relevantní items
    - Nová stavba: 27 položek od zemních prací po fasádu a mobiliář
    - Interiér: 16 položek (malování, podlahy, kuchyň, koupelna)
    - Přístavba: 15 položek
  * POST /api/projects/from-template: vytvoří projekt + nasype budget items ze šablony
  * useCreateProjectFromTemplate hook v api.ts
  * NewProjectDialog: 2-krokový wizard
    - Krok 1: název, adresa, popis, datum + výběr "Ze šablony" nebo "Kopírovat existující"
    - Krok 2: výběr typu stavby (4 karty s ikonami a preview počtu položek a plán), scope pro rekonstrukci, nebo výběr zdrojového projektu ke kopírování
    - Náhled položek šablony (scrollable)
    - Při kopírování: vytvoří prázdný projekt + zkopíruje budget items (reset completed/actuals)
  * Sidebar "Přidat" tlačítko nyní otevírá NewProjectDialog místo původního ProjectDialog
- Časový a finanční overrun per fáze:
  * Dashboard API: byPhase agregace rozšířena o plannedHours (planDays*8), completedCount, worstCase (s vůlí), costOverrun, timeOverrun
  * Dashboard typ v api.ts: byPhase rozšířen o plannedHours, completedCount, worstCase, costOverrun, timeOverrun
  * Phase progress cards v dashboardu:
    - Finance progress bar (emerald/amber/rose)
    - Čas progress bar (violet/amber/rose) — pokud má fáze plánované hodiny
    - Overrun indikátory: +Kč (rose) pro cost overrun, +h (amber) pro time overrun
    - Completed count badge (X/N ✓)
    - Rose border pokud actual > worstCase (překročeno i s vůlí)
- Lint: prošel bez chyb (0 errors, 0 warnings)
- Verifikace: NewProject dialog (Ze šablony / Kopírovat existující), dashboard phase cards - vše funkční, 0 chyb

Stage Summary:
- ✅ Šablony projektů: 4 typy (rekonstrukce/nová stavba/interiér/přístavba) s předvyplněnými položkami
- ✅ Kopírování existujícího projektu (včetně budget items)
- ✅ Fáze: časový i finanční overrun zobrazen v phase progress cards
- ✅ Vůle zpracována v worstCase (border indikace překročení)

Unresolved issues / Next steps:
- Aplikace je připravena na společnou revizi s uživatelem
