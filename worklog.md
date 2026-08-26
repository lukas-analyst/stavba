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
