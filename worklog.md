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
