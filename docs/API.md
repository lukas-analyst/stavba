# API Reference — Stavba

> **Verze:** 1.0.0-beta
> **Base URL:** `https://<your-domain>/api`
> **Poslední aktualizace:** 10. listopadu 2026
> **Zod version:** 4.x (runtime validace všech request bodů)

---

## Obsah

1. [Přehled](#1-přehled)
2. [Konvence](#2-konvence)
3. [Autentizace & autorizace](#3-autentizace--autorizace)
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
14. [Rate limity](#14-rate-limity)
15. [Datové typy](#15-datové-typy)

---

## 1. Přehled

Aplikace Stavba poskytuje **67 REST API routes** organizovaných podle doménových skupin. Všechny endpoints:

- Vracejí **JSON** (`Content-Type: application/json`)
- Používají **standardní HTTP metody** (GET, POST, PATCH, PUT, DELETE)
- Validují request body pomocí **Zod schemas** (runtime type safety)
- Vracejí **lokalizované chybové zprávy** (7 jazyků: cs, en, pl, vi, hu, es, it)
- Logují chyby přes `console.error` s kontextovým prefixem `[module]`
- Auditují klíčové akce přes `logChanges()` do `AuditLog` tabulky

### Technologický stack API vrstvy
- **Next.js 16 App Router** — `src/app/api/**/route.ts`
- **Prisma 6** s `@prisma/adapter-pg` (Neon PostgreSQL + PgBouncer)
- **Zod 4** pro request body validaci
- **NextAuth v4** pro JWT autentizaci
- **next-intl** pro lokalizované error zprávy

---

## 2. Konvence

### Request formát

Všechny POST/PUT/PATCH endpointy přijímají JSON body s hlavičkou `Content-Type: application/json`:

```http
POST /api/projects HTTP/1.1
Content-Type: application/json
Cookie: next-auth.session-token=eyJ...

{
  "name": "Rekonstrukce domu",
  "currency": "CZK"
}
```

### Response formát — úspěch (2xx)

```json
{
  "id": "cly123abc456def789ghi012jkl345mno678",
  "name": "Rekonstrukce domu",
  "createdAt": "2026-11-10T12:00:00.000Z",
  "updatedAt": "2026-11-10T12:00:00.000Z"
}
```

### Response formát — chyba (4xx/5xx)

```json
{
  "error": "Lokalizovaná chybová zpráva pro uživatele",
  "code": "TOKEN_EXPIRED"
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| `error` | `string` | Lokalizovaná zpráva (v jazyce `Accept-Language` nebo default `cs`) |
| `code` | `string?` | Machine-readable kód (pouze u některých endpointů, např. reset-password) |

### HTTP status kódy

| Kód | Název | Kdy se vrací |
|-----|-------|--------------|
| **200** | OK | GET úspěšný, PATCH/PUT úspěšný |
| **201** | Created | POST vytvořil nový záznam |
| **400** | Bad Request | Neplatný request body (Zod validace selhala), chybějící povinná pole |
| **401** | Unauthorized | Chybějící/neplatný JWT token, session expirovala |
| **403** | Forbidden | Nedostatečná role (viewer zkouší editovat), e-mail neověřen |
| **404** | Not Found | Zdroj neexistuje nebo uživatel k němu nemá přístup |
| **409** | Conflict | Duplicita (např. stejný název šablony, e-mail už existuje) |
| **429** | Too Many Requests | Rate limit překročen (viz `Retry-After` hlavička) |
| **500** | Internal Server Error | Neošetřená výjimka, DB chyba, externí API selhalo |

### Error kódy (machine-readable)

Následující endpointy vrací `code` pole pro programmatic handling:

| Endpoint | Kód | Význam |
|----------|-----|--------|
| `POST /api/auth/reset-password` | `TOKEN_EXPIRED` | Reset token vypršel (14 dní) |
| `POST /api/auth/reset-password` | `TOKEN_USED` | Token už byl použit (atomic guard) |
| `POST /api/auth/reset-password` | `TOKEN_INVALID` | Token neexistuje nebo je neplatného formátu |

### Idempotence

| Operace | Chování |
|---------|---------|
| `POST /api/projects/[id]/request-access` | Idempotentní — pokud už je člen, vrací 200 (no-op) |
| `POST /api/invitations/[token]/accept` | Idempotentní — pokud už je přijata, vrací 200 |
| `POST /api/auth/register` | Idempotentní — pokud e-mail existuje, vrací 409 |
| `POST /api/cron/*` | Idempotentní — `syncExchangeRates` používá upsert (unique na `[currency, date]`) |

### Caching

| Endpoint | Cache strategie |
|----------|-----------------|
| `GET /api/projects/[id]/contacts` | In-memory cache (`getCachedContacts`) |
| `GET /api/projects/[id]/dashboard` | Materialized views (Postgres) + in-memory cache |
| `GET /api/exchange-rates` | ČNB text API cache (`revalidate: 3600` — 1 hodina) |
| `GET /api/projects/[id]/budget` | TanStack Query (klient, `staleTime: 15s`) |

---

## 3. Autentizace & autorizace

### JWT autentizace

Aplikace používá **NextAuth v4** s JWT strategií (stateless). Session token se odesílá jako HTTP-only cookie:

```
Cookie: next-auth.session-token=<JWT>
```

JWT payload obsahuje:
```json
{
  "sub": "user_id",
  "email": "user@example.com",
  "emailVerified": "2026-01-15T10:00:00.000Z",
  "tokenVersion": 3,
  "isAdmin": false,
  "iat": 1731240000,
  "exp": 1731326400,
  "jti": "unique_token_id"
}
```

- **`tokenVersion`** — inkrementuje se při změně hesla nebo "odhlásit všude" (invaliduje všechny existující JWT)
- **`emailVerified`** — `null` = e-mail neověřen (omezený přístup)
- **`isAdmin`** — admin bypass (přístup ke všem projektům)

### Auth helpery

| Helper | Popis | Kdy použít |
|--------|-------|-----------|
| `requireUser()` | Musí být přihlášen (JWT valid) | Většina endpointů |
| `requireVerifiedUser()` | Přihlášen + e-mail ověřen | Import, search, admin |
| `requireProjectAccess(id, role)` | Přihlášen + ověřen + člen projektu s rolí | Projekt-specifické endpointy |
| `verifyCronSecret(request)` | Cron autentizace (`CRON_SECRET`) | Cron jobs |

### Role hierarchie

```
owner > editor > viewer
```

| Role | Oprávnění |
|------|-----------|
| **owner** | Plná kontrola: delete project, manage members, change ownership, delete invitations |
| **editor** | Úprava dat: budget items, payments, time entries, contacts, notes |
| **viewer** | Čtení pouze (GET endpointy) |

### Veřejné endpoints (bez auth)

| Endpoint | Účel |
|----------|------|
| `GET /api/health` | Health check (monitoring) |
| `GET /api/auth/[...nextauth]` | NextAuth handler (login, logout, callback) |
| `POST /api/auth/register` | Registrace nového uživatele |
| `POST /api/auth/forgot-password` | Žádost o reset hesla |
| `POST /api/auth/reset-password` | Reset hesla pomocí tokenu |
| `GET /api/auth/verify-token` | Validace tokenu (pro UI feedback) |
| `GET/POST /api/auth/verify-email` | Ověření e-mailu pomocí tokenu |
| `GET /api/projects/[id]/public` | Veřejná data projektu (pouze `isPublic === true`) |

---

## 4. Projekty

### `GET /api/projects`

Seznam projektů vlastněných uživatelem nebo sdílených s ním.

**Auth:** `requireUser()`
**Admin bypass:** `isAdmin` uživatelé vidí všechny projekty

**Response 200:**
```json
[
  {
    "id": "cly123abc456def789ghi012jkl345mno678",
    "name": "Rekonstrukce domu",
    "slug": "rekonstrukce-domu",
    "address": "Praha 1, Národní 25",
    "description": "Kompletní rekonstrukce rodinného domu",
    "status": "active",
    "currency": "CZK",
    "starred": true,
    "ownerId": "cly987...",
    "createdAt": "2026-01-15T10:00:00.000Z",
    "updatedAt": "2026-03-20T14:30:00.000Z"
  }
]
```

---

### `POST /api/projects`

Vytvoří nový projekt. Slug se generuje z názvu (kebab-case, bez diakritiky). Pokud slug již existuje, přidá se číselná přípona.

**Auth:** `requireUser()`

**Request body:**
```json
{
  "name": "Rekonstrukce domu",
  "address": "Praha 1, Národní 25",
  "description": "Kompletní rekonstrukce rodinného domu",
  "starred": false,
  "status": "planning",
  "currency": "CZK",
  "startDate": "2026-03-01",
  "endDate": "2026-12-31"
}
```

| Pole | Typ | Povinné | Validace |
|------|-----|---------|----------|
| `name` | `string` | ✅ | 1-200 znaků, neprázdný |
| `address` | `string?` | ❌ | Max 500 znaků |
| `description` | `string?` | ❌ | Max 2000 znaků |
| `starred` | `boolean?` | ❌ | Default `false` |
| `status` | `enum?` | ❌ | `planning` \| `active` \| `paused` \| `completed` (default: `planning`) |
| `currency` | `enum?` | ❌ | `CZK` \| `EUR` \| `USD` \| `GBP` \| `HUF` \| `PLN` \| `AUD` (default: `CZK`) |
| `startDate` | `date?` | ❌ | ISO 8601 (`YYYY-MM-DD`) |
| `endDate` | `date?` | ❌ | ISO 8601, musí být po `startDate` |

**Response 201:**
```json
{
  "id": "cly123abc456def789ghi012jkl345mno678",
  "name": "Rekonstrukce domu",
  "slug": "rekonstrukce-domu",
  "ownerId": "cly987...",
  "status": "planning",
  "currency": "CZK",
  "createdAt": "2026-11-10T12:00:00.000Z"
}
```

**Slug generování:**
```
"Rekonstrukce domu" → "rekonstrukce-domu"
"Řeč a písmo!" → "rec-a-pismo"
"🎉 Party!" → "projekt-lh3xyz" (fallback, pokud slug je prázdný)
"Rekonstrukce domu" (existuje) → "rekonstrukce-domu-1"
```

---

### `POST /api/projects/from-template`

Vytvoří projekt z předdefinované šablony (8 předloh: `house_renovation`, `apartment_renovation`, `new_build`, ...).

**Auth:** `requireUser()`

**Request body:**
```json
{
  "templateType": "house_renovation",
  "name": "Moje rekonstrukce",
  "currency": "EUR"
}
```

**Response 201:** Stejný jako `POST /api/projects` + `budgetItems` (pole vytvořených položek)

---

### `GET /api/projects/[id]`

Detail projektu.

**Auth:** `requireProjectAccess(id, "viewer")`

**Response 200:**
```json
{
  "id": "cly123...",
  "name": "Rekonstrukce domu",
  "slug": "rekonstrukce-domu",
  "address": "Praha 1, Národní 25",
  "description": "Kompletní rekonstrukce",
  "status": "active",
  "currency": "CZK",
  "totalBudget": 5000000,
  "starred": true,
  "isPublic": false,
  "startDate": "2026-03-01T00:00:00.000Z",
  "endDate": "2026-12-31T00:00:00.000Z",
  "floorArea": "120",
  "floors": "2",
  "energyRating": "B",
  "heatLoss": "4500",
  "propertyNote": "Dům z roku 1985, panelová konstrukce",
  "ownerId": "cly987...",
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-03-20T14:30:00.000Z"
}
```

---

### `PATCH /api/projects/[id]`

Aktualizace projektu. Změna vlastníka (`ownerId`) vyžaduje owner roli.

**Auth:** `requireProjectAccess(id, "viewer")` — změna `ownerId` vyžaduje owner

**Request body** (všechna pole volitelná):
```json
{
  "name": "Nový název",
  "address": "Nová adresa",
  "starred": true,
  "status": "completed",
  "currency": "EUR",
  "ownerId": "cly987...",
  "startDate": "2026-04-01",
  "endDate": "2026-11-30",
  "floorArea": "125",
  "floors": "2",
  "energyRating": "A",
  "heatLoss": "4200",
  "propertyNote": "Aktualizovaná poznámka"
}
```

**Response 200:** Aktualizovaný projekt (stejný formát jako GET)

---

### `DELETE /api/projects/[id]`

Smazání projektu (soft-delete — projekt se přesune do koše, po 30 dnech cron job trvale smaže).

**Auth:** `requireProjectAccess(id, "viewer")` — pouze owner může smazat

**Response 200:**
```json
{ "success": true }
```

---

### `GET /api/projects/[id]/budget`

Seznam budget items s on-the-fly currency conversion.

**Auth:** `requireProjectAccess(id, "viewer")`

**Response 200:**
```json
[
  {
    "id": "cly123...",
    "category": "Stavební práce",
    "subcategory": "Základy",
    "element": null,
    "phase": "foundation",
    "planCost": 150000,
    "planCostCurrency": "CZK",
    "planCostConverted": 150000,
    "actualCost": 145000,
    "completed": true,
    "completedAt": "2026-03-15T10:00:00.000Z",
    "rejected": false,
    "required": true,
    "dateFrom": "2026-03-01T00:00:00.000Z",
    "dateTo": "2026-03-10T00:00:00.000Z",
    "actualHours": 80,
    "sortOrder": 0,
    "parentId": null,
    "contactId": null,
    "contactName": null,
    "note": "Výkop + betonáž"
  }
]
```

**Currency conversion:**
- **Completed items** — `planCostConverted` je frozen (uložen při `completedAt` datu)
- **Incomplete items** — `planCostConverted` se re-computuje on-the-fly pomocí dnešního kurzu (batch query přes `getExchangeRates`)
- **Stejná měna** — `planCostConverted = planCost` (žádný přepočet)

---

### `POST /api/projects/[id]/budget`

Vytvoří budget item (nebo child task přes `parentId`).

**Auth:** `requireProjectAccess(id, "editor")`

**Request body:**
```json
{
  "category": "Stavební práce",
  "subcategory": "Základy",
  "element": null,
  "phase": "foundation",
  "required": true,
  "completed": false,
  "note": "Výkop + betonáž",
  "parentId": null,
  "planCost": 150000,
  "planCostCurrency": "CZK",
  "flexibilityPercent": 10,
  "planDays": 10,
  "dateFrom": "2026-03-01",
  "dateTo": "2026-03-10",
  "contactId": null,
  "links": [
    { "label": "Faktura", "url": "https://..." }
  ]
}
```

| Pole | Typ | Povinné | Validace |
|------|-----|---------|----------|
| `category` | `string` | ✅ | 1-200 znaků |
| `subcategory` | `string?` | ❌ | Název položky |
| `element` | `string?` | ❌ | Název úkolu (child) |
| `phase` | `enum?` | ❌ | `preparation` \| `demolition` \| `earthworks` \| `foundation` \| `shell` \| `installations` \| `finishing` \| `facade` \| `roof` \| `interior` \| `exterior` \| `final_inspection` \| `future` \| `unspecified` |
| `planCost` | `number?` | ❌ | Kladné číslo |
| `planCostCurrency` | `string?` | ❌ | ISO 4217 (3 velká písmena) |
| `parentId` | `cuid?` | ❌ | ID parent položky (vytvoří child task) |
| `links` | `array?` | ❌ | Max 100 položek, každá `{label, url}` |
| `flexibilityPercent` | `number?` | ❌ | 0-100 (%) |
| `planDays` | `number?` | ❌ | Nezáporné |

**Hierarchy:**
- **Parent** (`parentId: null`) → "Položka" (top-level)
- **Child** (`parentId: <id>`) → "Úkol" (pod parent položkou)

---

### `GET /api/projects/[id]/dashboard`

Agregovaná data pro dashboard.

**Auth:** `requireProjectAccess(id, "viewer")`

**Response 200:**
```json
{
  "totals": {
    "planTotal": 5000000,
    "actualTotal": 2350000,
    "remaining": 2650000,
    "hoursTotal": 480,
    "completedCount": 12,
    "itemCount": 45,
    "savedTotal": 150000
  },
  "byPhase": [
    { "phase": "foundation", "plan": 800000, "actual": 780000, "hours": 120 }
  ],
  "byCategory": [
    { "category": "Stavební práce", "plan": 2500000, "actual": 1200000 }
  ],
  "byContact": [
    { "contactId": "cly...", "name": "Stavby s.r.o.", "plan": 800000, "actual": 750000 }
  ],
  "recentPayments": [],
  "recentTimeEntries": [],
  "timeline": [],
  "alerts": {
    "overdue": [],
    "upcoming": [],
    "overBudget": []
  },
  "projection": {
    "projectedFinal": 5100000,
    "estimatedOverrun": 100000
  }
}
```

---

### `GET /api/projects/[id]/payments`

Seznam plateb (seřazeno dle `date desc`).

**Auth:** `requireProjectAccess(id, "viewer")`

**Response 200:**
```json
[
  {
    "id": "cly123...",
    "budgetItemId": "cly456...",
    "contactId": null,
    "amount": 50000,
    "currency": null,
    "amountConverted": 50000,
    "exchangeRateUsed": null,
    "invoiceTotal": null,
    "installmentOf": null,
    "vatRate": 21,
    "vatAmount": 10500,
    "date": "2026-03-15T00:00:00.000Z",
    "type": "invoice",
    "vendor": "Stavby s.r.o.",
    "invoiceNumber": "2026/0123",
    "invoiceUrl": "https://drive.google.com/...",
    "description": "Záloha na základy",
    "budgetItem": {
      "id": "cly456...",
      "category": "Stavební práce",
      "subcategory": "Základy"
    }
  }
]
```

---

### `POST /api/projects/[id]/payments`

Vytvoří platbu s automatickým currency conversion.

**Auth:** `requireProjectAccess(id, "editor")`

**Request body:**
```json
{
  "budgetItemId": "cly456...",
  "contactId": null,
  "amount": 50000,
  "currency": "CZK",
  "invoiceTotal": null,
  "installmentOf": null,
  "vatRate": 21,
  "date": "2026-03-15",
  "type": "invoice",
  "vendor": "Stavby s.r.o.",
  "invoiceNumber": "2026/0123",
  "invoiceUrl": "https://drive.google.com/...",
  "description": "Záloha na základy",
  "recurringInterval": "none"
}
```

| Pole | Typ | Povinné | Validace |
|------|-----|---------|----------|
| `budgetItemId` | `cuid` | ✅ | Musí patřit do projektu |
| `amount` | `number` | ✅ | Kladné, konečné číslo |
| `currency` | `string?` | ❌ | ISO 4217 (3 velká písmena); `null` = projektová měna |
| `invoiceTotal` | `number?` | ❌ | Celková faktura (pro installments) |
| `installmentOf` | `cuid?` | ❌ | ID parent platby (pro splátky) |
| `vatRate` | `number?` | ❌ | 0-100 (%) |
| `date` | `date?` | ❌ | ISO 8601 (default: dnes) |
| `type` | `enum?` | ❌ | `invoice` \| `cash` \| `card` \| `transfer` \| `other` |
| `recurringInterval` | `enum?` | ❌ | `none` \| `weekly` \| `monthly` \| `quarterly` \| `yearly` |

**Currency conversion:**
- Pokud `currency !== projectCurrency`, volá se `convertAmount()` (2 DB dotazy pro from/to kurzy)
- Výsledky se ukládají: `amountConverted` (převedená částka) + `exchangeRateUsed` (použitý kurz)
- Po vytvoření/úpravě/smazání se re-computuje `actualCost` na budget item (součet `amountConverted`)

---

### `GET /api/projects/[id]/time`

Seznam časových záznamů.

**Auth:** `requireProjectAccess(id, "viewer")`

**Response 200:**
```json
[
  {
    "id": "cly123...",
    "budgetItemId": "cly456...",
    "contactId": null,
    "workerName": "Jan Novák",
    "workerType": "worker",
    "date": "2026-03-15T00:00:00.000Z",
    "dateTo": "2026-03-15T00:00:00.000Z",
    "hours": 8,
    "workerCount": 1,
    "description": "Výkopové práce",
    "budgetItem": {
      "id": "cly456...",
      "category": "Stavební práce",
      "subcategory": "Základy"
    }
  }
]
```

---

### `POST /api/projects/[id]/time`

Vytvoří časový záznam.

**Auth:** `requireProjectAccess(id, "editor")`

**Request body:**
```json
{
  "budgetItemId": "cly456...",
  "contactId": null,
  "workerName": "Jan Novák",
  "workerType": "worker",
  "date": "2026-03-15",
  "dateTo": "2026-03-15",
  "hours": 8,
  "workerCount": 1,
  "description": "Výkopové práce"
}
```

| Pole | Typ | Povinné | Validace |
|------|-----|---------|----------|
| `budgetItemId` | `cuid` | ✅ | Musí patřit do projektu |
| `workerName` | `string?` | ❌ | Max 200 znaků |
| `workerType` | `enum?` | ❌ | `worker` \| `subcontractor` \| `self` |
| `hours` | `number` | ✅ | Kladné, konečné |
| `workerCount` | `int?` | ❌ | Min 1 (default: 1) |
| `date` | `date?` | ❌ | ISO 8601 (default: dnes) |
| `dateTo` | `date?` | ❌ | Musí být >= `date` |

---

### `GET /api/projects/[id]/contacts`

Seznam kontaktů (s persons).

**Auth:** `requireProjectAccess(id, "viewer")`

**Response 200:**
```json
[
  {
    "id": "cly123...",
    "name": "Stavby s.r.o.",
    "type": "company",
    "role": "Dodavatel",
    "phone": "+420 123 456 789",
    "email": "info@stavby.cz",
    "company": null,
    "ico": "12345678",
    "dic": "CZ12345678",
    "website": "https://stavby.cz",
    "notes": "Spolehlivý dodavatel",
    "rating": 5,
    "persons": [
      {
        "id": "cly789...",
        "firstName": "Petr",
        "lastName": "Novák",
        "phone": "+420 777 123 456",
        "email": "petr@stavby.cz"
      }
    ]
  }
]
```

---

### `POST /api/projects/[id]/contacts`

Vytvoří kontakt.

**Auth:** `requireProjectAccess(id, "editor")`

**Request body:**
```json
{
  "name": "Stavby s.r.o.",
  "type": "company",
  "role": "Dodavatel",
  "phone": "+420 123 456 789",
  "email": "info@stavby.cz",
  "company": null,
  "ico": "12345678",
  "dic": "CZ12345678",
  "website": "https://stavby.cz",
  "notes": "Spolehlivý dodavatel",
  "rating": 5
}
```

| Pole | Typ | Povinné | Validace |
|------|-----|---------|----------|
| `name` | `string` | ✅ | 1-200 znaků |
| `type` | `enum?` | ❌ | `company` \| `person` \| `supplier` \| `subcontractor` \| `other` |
| `rating` | `int?` | ❌ | 0-5 (0 = nehodnoceno) |
| `ico` | `string?` | ❌ | 8 číslic (pro ARES lookup) |

---

### `GET /api/projects/[id]/export-pdf`

Export PDF reportu projektu.

**Auth:** `requireProjectAccess(id, "editor")`
**maxDuration:** 60s (Vercel)

**Query params:**
```
?locale=cs
&currency=EUR
&sections=header,summary,budget_items,plan_cost,actual_cost,phase,payments,invoice
&reportStyle=minimal
&pageMargin=normal
&orientationMode=custom
&orientation-budget_items=landscape
&sort-budget_items=category
&sortDir-budget_items=asc
```

| Param | Typ | Default | Popis |
|-------|-----|---------|-------|
| `locale` | `enum` | `cs` | `cs` \| `en` \| `pl` \| `vi` \| `hu` \| `es` \| `it` |
| `currency` | `enum` | projektová | Cílová měna reportu |
| `sections` | `string` | — | Čárkou oddělený seznam sekcí |
| `reportStyle` | `enum` | `minimal` | `minimal` \| `colorful` |
| `pageMargin` | `enum` | `normal` | `narrow` (20pt) \| `normal` (40pt) \| `wide` (60pt) |
| `orientationMode` | `enum` | `auto` | `auto` \| `all-portrait` \| `all-landscape` \| `custom` |
| `orientation-<section>` | `enum` | — | Per-section: `portrait` \| `landscape` |
| `sort-<table>` | `string` | — | Řadicí pole |
| `sortDir-<table>` | `enum` | `asc` | `asc` \| `desc` |

**Response 200:** `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="..."`

---

### Ostatní projektové endpointy

| Endpoint | Metoda | Auth | Popis |
|----------|--------|------|-------|
| `/api/projects/[id]/contact-stats` | GET | viewer | Statistiky kontaktů |
| `/api/projects/[id]/spending-trend` | GET | viewer | Trend čerpání (6 měsíců) |
| `/api/projects/[id]/notes` | GET/POST | viewer/editor | Poznámky |
| `/api/projects/[id]/reorder` | PATCH | editor | Přeuspořádání budget items |
| `/api/projects/[id]/audit` | GET/POST | viewer | Audit log |
| `/api/projects/[id]/audit/export` | GET | viewer | Export audit logu (CSV/PDF) |
| `/api/projects/[id]/snapshots` | GET/POST | viewer | Snímky projektu |
| `/api/projects/[id]/export-csv` | GET | viewer | Export CSV |
| `/api/projects/[id]/public` | GET | veřejné | Veřejná data (jen `isPublic`) |
| `/api/projects/[id]/request-access` | POST | user | Self-service join (rate limit 5/h) |

---

## 5. Budget Items

### `PATCH /api/budget-items/[id]`

Aktualizace budget item. Při `completed: true` se `planCostConverted` freezne.

**Auth:** `requireProjectAccess(existing.projectId, "editor")`

**Freezing logic:**
- `completed: false → true` → nastaví `completedAt = now`, `planCostConverted = convert(planCost, planCostCurrency, projectCurrency, now)`
- `completed: true → false` → smaže `completedAt` (live přepočet obnoven)
- Změna `planCost`/`planCostCurrency` → re-compute `planCostConverted`

### `DELETE /api/budget-items/[id]`
Smazání budget item (child tasks se smažou kaskádově).
**Auth:** `requireProjectAccess(existing.projectId, "editor")`

### `POST /api/budget-items/[id]/duplicate`
Duplikovat (včetně child tasks, bez actualCost/hours).
**Auth:** `requireProjectAccess(original.projectId, "editor")`

### `GET/POST /api/budget-items/[id]/comments`
Komentáře k budget item.
**Auth:** `requireProjectAccess(item.projectId, "viewer")` (POST: editor)

---

## 6. Payments

### `PATCH /api/payments/[id]`
Aktualizace platby. Při změně `amount`/`currency` se re-computuje `amountConverted` + `exchangeRateUsed`.
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
Smazání kontaktu (persons kaskádově).
**Auth:** `requireProjectAccess(existing.projectId, "editor")`

### `GET/POST /api/contacts/[id]/persons`
Kontaktní osoby.
**Auth:** `requireProjectAccess(contact.projectId, "viewer")` (POST: editor)

### `PATCH/DELETE /api/contacts/[id]/persons/[personId]`
Aktualizace/smazání kontaktní osoby.
**Auth:** `requireProjectAccess(contact.projectId, "editor")`

---

## 9. Users & Profile

### `GET /api/users`
Seznam uživatelů (admin only).
**Auth:** `requireVerifiedUser()` — `isAdmin: true`

### `GET/PATCH /api/users/[id]`
Detail / úprava uživatele (admin only).
**Auth:** `requireVerifiedUser()` — `isAdmin: true`

### `GET /api/users/profile`
Profil aktuálního uživatele.
**Auth:** `requireUser()`

### `POST /api/users/profile/password`
Změna hesla.
**Auth:** `requireVerifiedUser()`

**Request body:**
```json
{
  "currentPassword": "OldPass123",
  "newPassword": "NewPass456"
}
```

### `POST /api/users/profile/sessions/revoke`
Invalidace všech sessions (tokenVersion++).
**Auth:** `requireVerifiedUser()`

### `GET/POST /api/users/profile/export-templates`
PDF export šablony.
**Auth:** `requireVerifiedUser()`

**POST body:**
```json
{
  "name": "Bankovní report",
  "sections": ["header", "summary", "budget_items"],
  "locale": "cs",
  "currency": "CZK",
  "sectionOrientations": { "budget_items": "landscape" },
  "tableSorts": { "budget_items": { "field": "category", "direction": "asc" } },
  "reportStyle": "minimal"
}
```

**Errors:** 409 pokud šablona se stejným názvem existuje.

### `PUT/DELETE /api/users/profile/export-templates/[templateId]`
Aktualizace / smazání šablony.
**Auth:** `requireVerifiedUser()`

---

## 10. Pozvánky

### `GET /api/invitations/pending`
Čekající pozvánky pro uživatele.
**Auth:** `requireUser()`

### `GET /api/invitations/[token]/info`
Info o pozvánce.
**Auth:** `requireUser()`

### `POST /api/invitations/[token]/accept`
Přijetí pozvánky (idempotentní).
**Auth:** `requireUser()` | **Rate limit:** 5/hour per IP

### `POST /api/invitations/[token]/reject`
Odmítnutí pozvánky.
**Auth:** `requireUser()`

### `GET/POST /api/projects/[id]/invitations`
Seznam / vytvoření pozvánek.
**Auth:** `requireProjectAccess(id, "viewer")` (POST: owner)

### `DELETE /api/projects/[id]/invitations/[invitationId]`
Smazání pozvánky.
**Auth:** `requireProjectAccess(id, "owner")`

---

## 11. Auth

### `POST /api/auth/register`
Registrace nového uživatele.
**Auth:** Veřejné | **Rate limit:** 5/hour per IP

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "Pass123",
  "name": "Jan Novák"
}
```

| Pole | Typ | Povinné | Validace |
|------|-----|---------|----------|
| `email` | `string` | ✅ | Validní e-mail, normalizovaný (trim + lowercase) |
| `password` | `string` | ✅ | Min 8 znaků, min 1 písmeno + 1 číslo |
| `name` | `string?` | ❌ | Bez HTML tagů / control znaků |

**Po registraci:** Vytvoří se User s `emailVerified: null`, odešle se verifikační e-mail.

### `POST /api/auth/forgot-password`
Žádost o reset hesla.
**Auth:** Veřejné | **Rate limit:** 5/hour per IP

Vždy vrací 200 (prevence e-mail enumeration).

### `POST /api/auth/reset-password`
Reset hesla pomocí tokenu.
**Auth:** Veřejné | **Rate limit:** 5/hour per IP

**Error kódy:**
| Status | `code` | Kdy |
|--------|--------|-----|
| 400 | `TOKEN_EXPIRED` | Token vypršel (14 dní) |
| 400 | `TOKEN_USED` | Token už byl použit |
| 400 | `TOKEN_INVALID` | Token neexistuje |

### `GET/POST /api/auth/verify-email`
Ověření e-mailu.
**Auth:** Veřejné | **Rate limit:** 3/hour per e-mail

### `GET /api/auth/verify-token`
Validace reset tokenu.
**Auth:** Veřejné

### `POST /api/auth/audit-log`
Záznam auth události.
**Auth:** `requireUser()` | **Rate limit:** 30/hour per user

### `GET /api/auth/[...nextauth]`
NextAuth handler (Credentials + Google OAuth).

---

## 12. Cron Jobs

### `GET /api/cron/fetch-exchange-rates`
Fetch denních kurzů ČNB.
**Auth:** `verifyCronSecret()` | **Schedule:** `0 15 * * 1-5`

**Response 200:**
```json
{
  "success": true,
  "synced": 7,
  "skipped": 0,
  "date": "2026-11-10T00:00:00.000Z"
}
```

### `GET /api/cron/finalize-deletions`
Trvalé smazání soft-deleted účtů (30 dní cooling-off).
**Auth:** `verifyCronSecret()` | **Schedule:** `0 3 * * *`

### `GET /api/cron/process-recurring-payments`
Zpracování opakujících se plateb.
**Auth:** `verifyCronSecret()` | **Schedule:** `0 4 * * *`

---

## 13. Ostatní

### `GET /api/health`
Health check (public).
```json
{ "status": "ok", "timestamp": "2026-11-10T12:00:00.000Z" }
```

### `GET /api/exchange-rates`
Seznam kurzů měn.
**Auth:** `requireUser()`

### `GET /api/ares?q=<ico>`
ARES lookup firmy.
**Auth:** `requireVerifiedUser()` | **Rate limit:** 10/hour per user+IP

### `GET/POST /api/analytics`
Analytics události.
**Auth:** `requireUser()`

### `GET /api/search?q=<query>&limit=10`
Globální vyhledávání.
**Auth:** `requireVerifiedUser()`

### `POST /api/import`
Import dat (CSV/JSON).
**Auth:** `requireVerifiedUser()`

### `GET /api/export`
Hromadný export.
**Auth:** `requireVerifiedUser()`

### `POST /api/revalidate`
Revalidace ISR cache.
**Auth:** `requireVerifiedUser()`

### `DELETE /api/snapshots/[id]`
Smazání snapshotu.
**Auth:** `requireProjectAccess(existing.projectId, "editor")`

### `PATCH/DELETE /api/notes/[id]`
Poznámka.
**Auth:** `requireProjectAccess(existing.projectId, "editor")`

### `DELETE /api/comments/[id]`
Komentář.
**Auth:** `requireProjectAccess(budgetItem.projectId, "editor")`

### `POST /api/admin/backfill-converted`
Backfill `amountConverted` (admin skript).
**Auth:** `requireVerifiedUser()` — `isAdmin`

### `POST /api/account/recover`
Obnova soft-deleted účtu.
**Auth:** `requireUser()` | **Rate limit:** 5/hour per IP

### `DELETE /api/account`
Soft-delete účtu (30 dní cooling-off).
**Auth:** `requireUser()`

---

## 14. Rate limity

| Endpoint | Limit | Klíč |
|----------|-------|------|
| `POST /api/auth/register` | 5/hour | IP |
| `POST /api/auth/forgot-password` | 5/hour | IP |
| `POST /api/auth/reset-password` | 5/hour | IP |
| `GET/POST /api/auth/verify-email` | 3/hour | e-mail |
| `POST /api/auth/audit-log` | 30/hour | user |
| `GET /api/ares` | 10/hour | user+IP |
| `POST /api/invitations/[token]/accept` | 5/hour | IP |
| `POST /api/account/recover` | 5/hour | IP |
| `POST /api/projects/[id]/request-access` | 5/hour | user+IP |

**Rate limit response (429):**
```json
{
  "error": "Příliš mnoho pokusů. Zkuste to znovu za 45 minut."
}
```

---

## 15. Datové typy

### `cuid`
ID formát (24+ znaků, prefix `cly`).
**Příklad:** `cly123abc456def789ghi012jkl345mno678`

### `date`
ISO 8601 (`YYYY-MM-DD`).
**Příklad:** `2026-03-15`

### `datetime`
ISO 8601 s časem (`YYYY-MM-DDTHH:mm:ss.sssZ`).
**Příklad:** `2026-03-15T10:00:00.000Z`

### `currency`
ISO 4217 (3 velká písmena).
**Podporované:** `CZK`, `EUR`, `USD`, `GBP`, `HUF`, `PLN`, `AUD`

### `enum: phase`

| Hodnota | Popis |
|---------|-------|
| `preparation` | Příprava |
| `demolition` | Demolice |
| `earthworks` | Zemní práce |
| `foundation` | Základy |
| `shell` | Hrubá stavba |
| `installations` | Instalace |
| `finishing` | Dokončovací práce |
| `facade` | Fasáda |
| `roof` | Střecha |
| `interior` | Interiér |
| `exterior` | Exteriér |
| `final_inspection` | Závěrečná inspekce |
| `future` | Do budoucna |
| `unspecified` | Neurčeno |

### `enum: paymentType`

| Hodnota | Popis |
|---------|-------|
| `invoice` | Faktura |
| `cash` | Hotovost |
| `card` | Karta |
| `transfer` | Převod |
| `other` | Jiné |

### `enum: recurringInterval`

| Hodnota | Popis |
|---------|-------|
| `none` | Jednorázová |
| `weekly` | Týdně |
| `monthly` | Měsíčně |
| `quarterly` | Čtvrtletně |
| `yearly` | Ročně |

---

## Poznámky

### Floorplan modul
API routes `/api/projects/[id]/floorplan/*` (14 routes) jsou součástí experimentálního modulu. Viz `docs/ARCHIVE/REJECTED-AND-IMPLEMENTED.md` §1.

### Multi-currency
- **Completed items** — `planCostConverted` frozen (kurz z `completedAt`)
- **Incomplete items** — live přepočet on-the-fly (batch query `getExchangeRates`)
- **Payments** — `amountConverted` + `exchangeRateUsed` uloženy při vytvoření/úpravě

### Audit logování
Klíčové akce (create, update, delete) logovány přes `logChanges()` do `AuditLog` tabulky. Záznam: `userId, projectId, model, recordId, action, before, after`.
