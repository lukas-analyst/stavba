# API Reference — Stavba

> **Verze:** 1.0.0-beta
> **Base URL:** `https://<your-domain>/api`
> **Poslední aktualizace:** 10. listopadu 2026

---

## Obsah

1. [Přehled](#1-přehled)
2. [Konvence](#2-konvence)
3. [Autentizace](#3-autentizace)
4. [Projekty](#4-projekty)
5. [Budget Items](#5-budget-items)
6. [Payments](#6-payments)
7. [Time Entries](#7-time-entries)
8. [Contacts](#8-contacts)
9. [Users & Profile](#9-users--profile)
10. [Pozvánky](#10-pozvánky)
11. [Auth](#11-auth)
12. [Cron Jobs](#12-cron-jobs)
13. [Ostatní](#13-ostatní)

---

## 1. Přehled

Aplikace Stavba poskytuje **67 REST API routes** organizovaných podle doménových skupin. Všechny endpoints vrací JSON a používají standardní HTTP status kódy.

### Požadavky
- **Content-Type:** `application/json` (pro POST/PUT/PATCH)
- **Autentizace:** JWT Bearer token (pokud není route veřejná)
- **Rate limiting:** IP-based na citlivých endpointech

---

## 2. Konvence

### Request formát
```json
{
  "field1": "value",
  "field2": 123
}
```

### Response formát — úspěch
```json
{
  "id": "clxxx...",
  "field1": "value",
  "createdAt": "2026-11-10T12:00:00.000Z"
}
```

### Response formát — chyba
```json
{
  "error": "Lokalizovaná chybová zpráva",
  "code": "TOKEN_EXPIRED"
}
```

### Status kódy

| Kód | Význam |
|-----|--------|
| 200 | OK — request úspěšný |
| 201 | Created — vytvořeno (POST) |
| 400 | Bad Request — neplatný vstup |
| 401 | Unauthorized — není přihlášen |
| 403 | Forbidden — nedostatečná role |
| 404 | Not Found — zdroj neexistuje |
| 409 | Conflict — duplicita (např. stejný název) |
| 429 | Too Many Requests — rate limit překročen |
| 500 | Internal Server Error |

### Role hierarchie
```
owner > editor > viewer
```
- **owner** — plná kontrola (delete project, manage members)
- **editor** — úprava dat (budget, payments, time, contacts)
- **viewer** — čtení pouze

---

## 3. Autentizace

### JWT Bearer token
Většina endpointů vyžaduje autentizaci. Token se získá přihlášením a odesílá se jako cookie (`next-auth.session-token`).

### Auth helpery
| Helper | Popis |
|--------|-------|
| `requireUser()` | Musí být přihlášen (JWT valid) |
| `requireVerifiedUser()` | Přihlášen + e-mail ověřen |
| `requireProjectAccess(id, role)` | Přihlášen + ověřen + člen projektu s dostatečnou rolí |
| `verifyCronSecret(request)` | Cron job autentizace (`CRON_SECRET`) |

### Veřejné endpoints (bez auth)
- `GET /api/health`
- `GET /api/auth/[...nextauth]`
- `POST /api/auth/register`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/verify-token`
- `GET/POST /api/auth/verify-email`
- `GET /api/projects/[id]/public`

---

## 4. Projekty

### `GET /api/projects`
Seznam projektů vlastněných nebo sdílených s uživatelem.

**Auth:** `requireUser()`
**Response 200:**
```json
[
  {
    "id": "clxxx...",
    "name": "Rekonstrukce domu",
    "slug": "rekonstrukce-domu",
    "address": "Praha 1",
    "status": "active",
    "currency": "CZK",
    "starred": true,
    "createdAt": "2026-01-15T10:00:00.000Z"
  }
]
```

### `POST /api/projects`
Vytvoří nový projekt.

**Auth:** `requireUser()`
**Body:**
```json
{
  "name": "Rekonstrukce domu",
  "address": "Praha 1",
  "description": "Kompletní rekonstrukce",
  "currency": "CZK",
  "totalBudget": 5000000,
  "startDate": "2026-03-01",
  "endDate": "2026-12-31"
}
```

### `POST /api/projects/from-template`
Vytvoří projekt z předdefinované šablony (8 předloh).

**Auth:** `requireUser()`
**Body:**
```json
{
  "templateType": "house_renovation",
  "name": "Moje rekonstrukce"
}
```

### `GET /api/projects/[id]`
Detail projektu.

**Auth:** `requireProjectAccess(id, "viewer")`

### `PATCH /api/projects/[id]`
Aktualizace projektu.

**Auth:** `requireProjectAccess(id, "viewer")` (změna vlastníka vyžaduje owner)

### `DELETE /api/projects/[id]`
Smazání projektu (soft-delete).

**Auth:** `requireProjectAccess(id, "viewer")` — pouze owner může smazat

### `GET /api/projects/[id]/budget`
Seznam budget items s on-the-fly currency conversion.

**Auth:** `requireProjectAccess(id, "viewer")`
**Response:** Pole budget items s `planCostConverted` (live přepočet pro incomplete, frozen pro completed)

### `POST /api/projects/[id]/budget`
Vytvoří budget item (nebo child task přes `parentId`).

**Auth:** `requireProjectAccess(id, "editor")`
**Body:**
```json
{
  "category": "Stavební práce",
  "subcategory": "Základy",
  "planCost": 150000,
  "planCostCurrency": "CZK",
  "phase": "shell",
  "parentId": null
}
```

### `GET /api/projects/[id]/dashboard`
Agregovaná data pro dashboard (KPI, byPhase, byCategory, byContact, recentPayments, recentTimeEntries, timeline).

**Auth:** `requireProjectAccess(id, "viewer")`

### `GET /api/projects/[id]/payments`
Seznam plateb.

**Auth:** `requireProjectAccess(id, "viewer")`

### `POST /api/projects/[id]/payments`
Vytvoří platbu s automatickým currency conversion (`amountConverted`, `exchangeRateUsed`).

**Auth:** `requireProjectAccess(id, "editor")`
**Body:**
```json
{
  "budgetItemId": "clxxx...",
  "amount": 50000,
  "currency": "CZK",
  "date": "2026-03-15",
  "type": "invoice",
  "vendor": "Firma s.r.o.",
  "invoiceNumber": "2026/0123",
  "invoiceUrl": "https://...",
  "invoiceTotal": 150000,
  "installmentOf": null,
  "vatRate": 21,
  "recurringInterval": "none"
}
```

### `GET /api/projects/[id]/time`
Seznam časových záznamů.

**Auth:** `requireProjectAccess(id, "viewer")`

### `POST /api/projects/[id]/time`
Vytvoří časový záznam.

**Auth:** `requireProjectAccess(id, "editor")`
**Body:**
```json
{
  "budgetItemId": "clxxx...",
  "workerName": "Jan Novák",
  "hours": 8,
  "workerCount": 1,
  "date": "2026-03-15",
  "dateTo": "2026-03-15",
  "contactId": null,
  "description": "Výkopové práce"
}
```

### `GET /api/projects/[id]/contacts`
Seznam kontaktů.

**Auth:** `requireProjectAccess(id, "viewer")`

### `POST /api/projects/[id]/contacts`
Vytvoří kontakt.

**Auth:** `requireProjectAccess(id, "editor")`
**Body:**
```json
{
  "name": "Stavby s.r.o.",
  "type": "company",
  "ico": "12345678",
  "email": "info@stavby.cz",
  "phone": "+420 123 456 789",
  "rating": 5,
  "note": "Spolehlivý dodavatel"
}
```

### `GET /api/projects/[id]/contact-stats`
Statistiky kontaktů (počet, hodnocení, typy).

**Auth:** `requireProjectAccess(id, "viewer")`

### `GET /api/projects/[id]/spending-trend`
Trend čerpání rozpočtu za posledních 6 měsíců.

**Auth:** `requireProjectAccess(id, "viewer")`

### `GET /api/projects/[id]/dashboard`
Kompletní dashboard data.

**Auth:** `requireProjectAccess(id, "viewer")`

### `GET/POST /api/projects/[id]/notes`
Poznámky k projektu.

**Auth:** `requireProjectAccess(id, "viewer")`

### `PATCH/DELETE /api/projects/[id]/reorder`
Přeuspořádání budget items (drag-and-drop).

**Auth:** `requireProjectAccess(id, "editor")`
**Body:**
```json
{
  "items": [{"id": "clxxx...", "sortOrder": 0}],
  "categoryOrder": ["Stavební práce", "Instalace"]
}
```

### `GET /api/projects/[id]/audit`
Audit log projektu.

**Auth:** `requireProjectAccess(id, "viewer")`

### `GET /api/projects/[id]/audit/export`
Export audit logu (CSV/PDF).

**Auth:** `requireProjectAccess(id, "viewer")`

### `GET/POST /api/projects/[id]/snapshots`
Snímky projektu (historie).

**Auth:** `requireProjectAccess(id, "viewer")`

### `GET /api/projects/[id]/export-csv`
Export dat projektu do CSV.

**Auth:** `requireProjectAccess(id, "viewer")`

### `GET /api/projects/[id]/export-pdf`
Export PDF reportu.

**Auth:** `requireProjectAccess(id, "editor")`
**Query params:**
```
?locale=cs
&currency=EUR
&sections=header,summary,budget_items,plan_cost,actual_cost,phase
&reportStyle=minimal|colorful
&pageMargin=narrow|normal|wide
&orientationMode=auto|all-portrait|all-landscape|custom
&orientation-budget_items=portrait|landscape
&sort-budget_items=category&sortDir-budget_items=asc
```
**maxDuration:** 60s (Vercel)

### `GET /api/projects/[id]/public`
Veřejná data projektu (bez auth, pouze `isPublic === true`).

**Response:** Bezpečná podmnožina (žádné PII — kontakty, poznámky, audit log, vendor names)

### `POST /api/projects/[id]/request-access`
Žádost o přístup k veřejnému projektu (self-service join).

**Auth:** `requireUser()`
**Rate limit:** 5/hour per user+IP

### `GET/POST /api/projects/[id]/invitations`
Seznam / vytvoření pozvánek.

**Auth:** `requireProjectAccess(id, "viewer")`

### `DELETE /api/projects/[id]/invitations/[invitationId]`
Smazání pozvánky.

**Auth:** `requireProjectAccess(id, "owner")`

### `GET/POST /api/projects/[id]/members`
Seznam / přidání člena.

**Auth:** `requireProjectAccess(id, "viewer")`

### `PATCH /api/projects/[id]/members/[memberId]`
Změna role člena (viewer ↔ editor).

**Auth:** `requireProjectAccess(id, "owner")`

### `DELETE /api/projects/[id]/members/[memberId]`
Odstranění člena (owner může kohokoliv, člen může sebe).

**Auth:** `requireProjectAccess(id, "viewer")` — owner nebo self-delete

---

## 5. Budget Items

### `PATCH /api/budget-items/[id]`
Aktualizace budget item. Při `completed: true` se `planCostConverted` freezne.

**Auth:** `requireProjectAccess(existing.projectId, "editor")`

### `DELETE /api/budget-items/[id]`
Smazání budget item (s potomky kaskádově).

**Auth:** `requireProjectAccess(existing.projectId, "editor")`

### `POST /api/budget-items/[id]/duplicate`
Duplikovat budget item.

**Auth:** `requireProjectAccess(original.projectId, "editor")`

### `GET/POST /api/budget-items/[id]/comments`
Komentáře k budget item.

**Auth:** `requireProjectAccess(item.projectId, "viewer")` (POST vyžaduje editor)

---

## 6. Payments

### `PATCH /api/payments/[id]`
Aktualizace platby s re-conversion cizí měny.

**Auth:** `requireProjectAccess(budgetItem.projectId, "editor")`

### `DELETE /api/payments/[id]`
Smazání platby + aktualizace `actualCost` na budget item.

**Auth:** `requireProjectAccess(budgetItem.projectId, "editor")`

---

## 7. Time Entries

### `PATCH /api/time-entries/[id]`
Aktualizace časového záznamu.

**Auth:** `requireProjectAccess(budgetItem.projectId, "editor")`

### `DELETE /api/time-entries/[id]`
Smazání časového záznamu.

**Auth:** `requireProjectAccess(budgetItem.projectId, "editor")`

---

## 8. Contacts

### `PATCH /api/contacts/[id]`
Aktualizace kontaktu.

**Auth:** `requireProjectAccess(existing.projectId, "editor")`

### `DELETE /api/contacts/[id]`
Smazání kontaktu.

**Auth:** `requireProjectAccess(existing.projectId, "editor")`

### `GET/POST /api/contacts/[id]/persons`
Kontaktní osoby.

**Auth:** `requireProjectAccess(contact.projectId, "viewer")` (POST vyžaduje editor)

### `PATCH/DELETE /api/contacts/[id]/persons/[personId]`
Aktualizace/smazání kontaktní osoby.

**Auth:** `requireProjectAccess(contact.projectId, "editor")`

---

## 9. Users & Profile

### `GET /api/users`
Seznam uživatelů (admin only).

**Auth:** `requireVerifiedUser()` — pouze `isAdmin`

### `GET/PATCH /api/users/[id]`
Detail / úprava uživatele (admin only).

**Auth:** `requireVerifiedUser()` — pouze `isAdmin`

### `GET /api/users/profile`
Profil aktuálního uživatele.

**Auth:** `requireUser()`

### `POST /api/users/profile/password`
Změna hesla.

**Auth:** `requireVerifiedUser()`
**Body:**
```json
{
  "currentPassword": "old123",
  "newPassword": "new456"
}
```

### `POST /api/users/profile/sessions/revoke`
Invalidace všech sessions (tokenVersion increment).

**Auth:** `requireVerifiedUser()`

### `GET/POST /api/users/profile/export-templates`
Seznam / uložení PDF export šablon.

**Auth:** `requireVerifiedUser()`

### `PUT/DELETE /api/users/profile/export-templates/[templateId]`
Aktualizace / smazání šablony.

**Auth:** `requireVerifiedUser()`

---

## 10. Pozvánky

### `GET /api/invitations/pending`
Seznam čekajících pozvánek pro aktuálního uživatele.

**Auth:** `requireUser()`

### `GET /api/invitations/[token]/info`
Info o pozvánce (bez přijetí).

**Auth:** `requireUser()`

### `POST /api/invitations/[token]/accept`
Přijetí pozvánky.

**Auth:** `requireUser()`
**Rate limit:** 5/hour per IP

### `POST /api/invitations/[token]/reject`
Odmítnutí pozvánky.

**Auth:** `requireUser()`

---

## 11. Auth

### `POST /api/auth/register`
Registrace nového uživatele.

**Auth:** veřejné
**Rate limit:** 5/hour per IP
**Body:**
```json
{
  "email": "user@example.com",
  "password": "Pass123",
  "name": "Jan Novák"
}
```
**Response 201:**
```json
{
  "ok": true,
  "message": "Registrace proběhla. Zkontrolujte svůj e-mail pro ověření."
}
```

### `POST /api/auth/forgot-password`
Žádost o reset hesla (odešle e-mail s tokenem).

**Auth:** veřejné
**Rate limit:** 5/hour per IP

### `POST /api/auth/reset-password`
Reset hesla pomocí tokenu.

**Auth:** veřejné
**Rate limit:** 5/hour per IP
**Body:**
```json
{
  "token": "64hex...",
  "password": "NewPass123"
}
```
**Response 400 (s code):**
```json
{
  "error": "Odkaz pro obnovení hesla vypršel.",
  "code": "TOKEN_EXPIRED"
}
```
**Error kódy:** `TOKEN_EXPIRED`, `TOKEN_USED`, `TOKEN_INVALID`

### `GET/POST /api/auth/verify-email`
Ověření e-mailu pomocí tokenu.

**Auth:** veřejné
**Rate limit:** 3/hour per e-mail

### `GET /api/auth/verify-token`
Validace reset tokenu (pro UI feedback).

**Auth:** veřejné

### `POST /api/auth/audit-log`
Záznam auth události (login, logout, failed).

**Auth:** `requireUser()`
**Rate limit:** 30/hour per user

---

## 12. Cron Jobs

Všechny cron jobs jsou chráněny `CRON_SECRET` (Authorization: Bearer header).

### `GET /api/cron/fetch-exchange-rates`
Fetch denních kurzů ČNB (všední dny 15:00 CET).

**Auth:** `verifyCronSecret()`
**Schedule:** `0 15 * * 1-5`

### `GET /api/cron/finalize-deletions`
Trvalé smazání soft-deleted účtů po cooling-off period.

**Auth:** `verifyCronSecret()`
**Schedule:** `0 3 * * *`

### `GET /api/cron/process-recurring-payments`
Zpracování opakujících se plateb (klonování šablon).

**Auth:** `verifyCronSecret()`
**Schedule:** `0 4 * * *`

---

## 13. Ostatní

### `GET /api/health`
Health check (public, pro monitoring).

**Response 200:**
```json
{
  "status": "ok",
  "timestamp": "2026-11-10T12:00:00.000Z"
}
```

### `GET /api/exchange-rates`
Seznam kurzů měn (pro UI dropdown).

**Auth:** `requireUser()`

### `GET /api/ares?q=<ico>`
Vyhledání firmy v ARES registru.

**Auth:** `requireVerifiedUser()`
**Rate limit:** 10/hour per user+IP

### `GET/POST /api/analytics`
Analytics události.

**Auth:** `requireUser()`

### `POST /api/analytics/events`
Záznam analytics události.

**Auth:** `requireUser()`

### `GET /api/search`
Globální vyhledávání napříč projekty.

**Auth:** `requireVerifiedUser()`

### `POST /api/import`
Import dat (CSV/JSON).

**Auth:** `requireVerifiedUser()`

### `GET /api/export`
Hromadný export dat.

**Auth:** `requireVerifiedUser()`

### `POST /api/revalidate`
Revalidace cache (ISR).

**Auth:** `requireVerifiedUser()`

### `DELETE /api/snapshots/[id]`
Smazání snapshotu.

**Auth:** `requireProjectAccess(existing.projectId, "editor")`

### `PATCH/DELETE /api/notes/[id]`
Aktualizace/smazání poznámky.

**Auth:** `requireProjectAccess(existing.projectId, "editor")`

### `DELETE /api/comments/[id]`
Smazání komentáře.

**Auth:** `requireProjectAccess(budgetItem.projectId, "editor")`

### `GET /api/users`
Seznam uživatelů (admin only).

**Auth:** `requireVerifiedUser()` — `isAdmin`

### `POST /api/admin/backfill-converted`
Backfill `amountConverted` u starých plateb.

**Auth:** `requireVerifiedUser()` — `isAdmin`

### `POST /api/account/recover`
Obnova soft-deleted účtu.

**Auth:** `requireUser()`
**Rate limit:** 5/hour per IP

### `DELETE /api/account`
Soft-delete účtu (po cooling-off period cron trvale smaže).

**Auth:** `requireUser()`

---

## Rate Limity

| Endpoint | Limit | Klíč |
|----------|-------|------|
| `/api/auth/register` | 5/hour | IP |
| `/api/auth/forgot-password` | 5/hour | IP |
| `/api/auth/reset-password` | 5/hour | IP |
| `/api/auth/verify-email` | 3/hour | e-mail |
| `/api/auth/audit-log` | 30/hour | user |
| `/api/ares` | 10/hour | user+IP |
| `/api/invitations/[token]/accept` | 5/hour | IP |
| `/api/account/recover` | 5/hour | IP |
| `/api/projects/[id]/request-access` | 5/hour | user+IP |

---

## Poznámky

### Floorplan modul
API routes `/api/projects/[id]/floorplan/*` (14 routes) jsou součástí experimentálního modulu, který byl částečně revertován. Viz `docs/ARCHIVE/REJECTED-AND-IMPLEMENTED.md` §1 pro detaily. Tyto routes nejsou aktivně používány v produkčním UI.

### Multi-currency
Všechny částky se ukládají v původní měně (`planCost`, `amount`) + převedené hodnoty (`planCostConverted`, `amountConverted`) s uloženým kurzem (`exchangeRateUsed`). Completed items mají frozen kurzy; incomplete items se přepočítávají on-the-fly pomocí `getExchangeRates()` (batch query).

### Audit logování
Klíčové akce (create, update, delete) jsou logovány přes `logChanges()` do `AuditLog` tabulky. Každý záznam obsahuje: userId, projectId, model, recordId, action, before, after.
