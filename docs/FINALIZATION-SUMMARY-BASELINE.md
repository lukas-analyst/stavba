# Finalizační Souhrn — BASELINE (Fáze 0)

> **Datum:** 9. listopadu 2026
> **Commit:** `7868887` (430 commits, branch `main`)
> **Verze:** `1.0.0-beta`
> **Účel:** Referenční bod pro porovnání s finálním souhrnem (Fáze 10)

---

## 1. Exekutivní přehled

**Stavba** je komplexní webová aplikace pro správu rozpočtu, nákladů a času staveb a rekonstrukcí. Postavena na Next.js 16 s App Router, nasazena na Vercel, databáze na Neon PostgreSQL. Aplikace podporuje 7 jazyků, multi-měnové operace s živými kurzy ČNB, hierarchické rozpočtové položky (Kategorie → Položka → Úkol), PDF reporty s per-section orientací a řazením, sdílení projektů s rolí (owner/editor/viewer), a audit logování.

---

## 2. Technologický stack

### Core
| Technologie | Verze | Účel |
|-------------|-------|------|
| Next.js | 16.1.3 (Turbopack) | Framework, App Router, API routes |
| React | 19.0.0 | UI knihovna |
| TypeScript | 5.x | Typování (strict) |
| Prisma | 6.11.1 | ORM (@prisma/adapter-pg + pg Pool) |
| PostgreSQL (Neon) | — | Databáze (PgBouncer transaction mode) |

### UI / UX
| Technologie | Účel |
|-------------|------|
| Tailwind CSS 4 | Styling |
| shadcn/ui (New York) | Komponentní knihovna (59 komponent) |
| Radix UI | Primitivy (accessible) |
| Lucide React | Ikony |
| Framer Motion | Animace |
| next-themes | Dark/Light mode |
| Vaul | Drawer (mobilní) |
| Sonner | Toast notifikace |

### State management & data
| Technologie | Účel |
|-------------|------|
| Zustand | Klient state (aktivní tab, vybraný projekt) |
| TanStack Query | Server state (data fetching, cache) |
| TanStack Table | Tabulky (virtualizace) |
| TanStack Virtual | Virtualizace dlouhých seznamů |
| @dnd-kit | Drag-and-drop (budget reorder) |

### Formátování & validace
| Technologie | Účel |
|-------------|------|
| Zod | Schema validace (API + forms) |
| react-hook-form | Formuláře |
| date-fns | Datum operace |
| Intl API | Lokalizovaná čísla/měna/data |

### Speciální
| Technologie | Účel |
|-------------|------|
| @react-pdf/renderer | Server-side PDF generování |
| recharts | Grafy (dashboard) |
| bcryptjs | Hesla (cost 10) |
| next-intl | i18n (7 lokalit) |
| next-auth v4 | Autentizace (JWT, Credentials + Google) |
| sharp | Zpracování obrázků |
| z-ai-web-dev-sdk | AI integrace (připraveno, nepoužito v produkci) |

---

## 3. Integrace

| Integrace | Účel | Konfigurace |
|-----------|------|-------------|
| **Neon PostgreSQL** | Databáze | `DATABASE_URL` (pooler hostname, PgBouncer) |
| **ČNB** (Česká národní banka) | Denní kurzy měn | Cron `0 15 * * 1-5`, text API |
| **Brevo** (Sendinblue) | Transakční e-maily | `BREVO_API_KEY`, `EMAIL_FROM` |
| **Google OAuth** | Sociální přihlášení | `GOOGLE_CLIENT_ID/SECRET` (volitelné) |
| **ARES** | Český registr firem (IČO lookup) | Veřejné API (vyžaduje API klíč od 2024) |
| **Vercel** | Hosting + Cron + Edge | Auto-deploy z `main` |

### Cron jobs (3)
| Schedule | Path | Účel |
|----------|------|------|
| `0 3 * * *` (denně 3:00) | `/api/cron/finalize-deletions` | Trvalé smazání soft-deleted účtů |
| `0 15 * * 1-5` (všední 15:00) | `/api/cron/fetch-exchange-rates` | Fetch ČNB kurzů |
| `0 4 * * *` (denně 4:00) | `/api/cron/process-recurring-payments` | Zpracování opakujících se plateb |

---

## 4. Architektura

### Vrstvy
```
┌──────────────────────────────────────────────┐
│  Frontend (Next.js App Router)                │
│  ├─ src/app/[locale]/page.tsx (SPA entry)     │
│  ├─ src/components/ (UI + tabs)              │
│  ├─ src/hooks/ (12 custom hooks)             │
│  └─ src/lib/store.ts (Zustand)               │
├──────────────────────────────────────────────┤
│  API Layer (67 routes)                        │
│  ├─ src/app/api/**/route.ts                   │
│  ├─ Zod validace (src/lib/api-validation.ts)  │
│  ├─ AuthZ (src/lib/authz.ts — role-based)    │
│  └─ Rate limiting (src/lib/rate-limit.ts)    │
├──────────────────────────────────────────────┤
│  Business Logic (src/lib/)                    │
│  ├─ auth.ts (NextAuth config)                │
│  ├─ currency.ts (ČNB převody, batch)         │
│  ├─ email.ts (Brevo)                          │
│  ├─ audit.ts (change logging)                │
│  ├─ recurring.ts (opakující se platby)       │
│  └─ materialized-views.ts (dashboard cache)  │
├──────────────────────────────────────────────┤
│  Data Layer (Prisma + Neon)                   │
│  ├─ src/lib/db.ts (Pool + PrismaClient)       │
│  ├─ prisma/schema.prisma (18 modelů)         │
│  └─ Read replica (volitelná READ_DATABASE_URL)│
└──────────────────────────────────────────────┘
```

### Dataflow
1. **Klient** → Zustand state + TanStack Query cache
2. **API** → fetch → Zod validace → AuthZ → Prisma query → JSON response
3. **PDF** → API route → pdf-generator.ts → @react-pdf/renderer → Buffer → Blob download
4. **Cron** → Vercel scheduler → CRON_SECRET verify → business logic → DB

---

## 5. Features (12 tabů)

### Uživatelské taby
| Tab | Funkce |
|-----|--------|
| **Portfolio** | Přehled všech projektů uživatele, hvězdičky, filtry |
| **Dashboard** | KPI (plán/skut./zbývá), grafy trend, timeline, cashflow projekce, práce dle kontaktu |
| **Budget** | Hierarchie Kategorie → Položka → Úkol, drag-and-drop reorder, fáze, multi-měna, filtry (completion/category/saved/active) |
| **Payments** | Platby s fakturami (číslo + URL), opakující se, DPH, multi-měna s přepočtem |
| **Time** | Časové záznamy dle pracovníka, hodiny, propojení s budget items |
| **Contacts** | Kontakty s osobami, hodnocení, ARES IČO lookup, telefon/e-mail/IČO |
| **Timeline** | Vizuální timeline projektu (start/end datumy budget items) |
| **Notes** | Projektové poznámky |
| **Management** | Sdílení projektu, členové (role), pozvánky, audit log, exporty (CSV/PDF) |
| **Telemetry** | Analytics události (přihlášení, akce) |
| **Settings** | Profil uživatele, změna hesla, správa session, jazyk |
| **Admin** | Admin panel (pouze `isAdmin` uživatelé) |

### PDF Export
- 2 vizuální styly: **minimal** (monochrome, pro banky/hypotéky) + **colorful** (MD3 akcenty)
- Per-section orientace (Auto/Portrait/Landscape)
- Per-table řazení (field + direction)
- 3 presety: **mortgage** (13 sekcí), **summary** (8), **complete** (22)
- Export šablony (uložené na user profile, server-side)
- localStorage persistence nastavení
- Roboto font (podpora české diakritiky)
- Kategorie band (kategorie zobrazena jednou, pod ní Položky + Úkoly)

### Autentizace & bezpečnost
- **Credentials** (e-mail + heslo, bcrypt cost 10) + **Google OAuth** (volitelné)
- JWT strategie (stateless, tokenVersion pro invalidaci)
- E-mail verifikace, password reset (token-based)
- Session timeout warning
- Soft-delete s cooling-off period (deletedAt + cron finalize)
- Rate limiting (IP-based: login, reset-password, register)
- Audit logování (logChanges — klíčové akce)
- CRON_SECRET pro cron job autentizaci
- Role-based access (owner / editor / viewer)
- Public projekty (volitelné sdílení)

---

## 6. Databázové schéma

**18 Prisma modelů** (894 řádků schématu):

| Model | Účel | Klíčové vztahy |
|-------|------|----------------|
| User | Uživatel | → Project (owner), → ProjectMember, → Account |
| Account | OAuth account | → User |
| Project | Stavební projekt | → BudgetItem, → Payment, → TimeEntry, → Contact |
| ProjectMember | Člen projektu | → Project, → User (role) |
| ProjectInvitation | Pozvánka | → Project, → User (inviter) |
| Note | Projektová poznámka | → Project, → User |
| Snapshot | Snapshot projektu | → Project |
| AuditLog | Audit záznam | → User, → Project |
| BudgetItem | Rozpočtová položka | → Project, → BudgetItem (parent, hierarchie), → Payment, → TimeEntry, → Contact |
| Comment | Komentář k položce | → BudgetItem, → User |
| BudgetItemLink | Odkaz položky | → BudgetItem |
| Contact | Kontakt (firma/osoba) | → Project, → ContactPerson, → BudgetItem |
| ContactPerson | Osoba v kontaktu | → Contact |
| AnalyticsEvent | Analytics událost | → User, → Project |
| Payment | Platba | → Project, → BudgetItem, → TimeEntry |
| TimeEntry | Časový záznam | → Project, → BudgetItem, → Contact |
| ExchangeRate | Kurz měny | (samostatný, ČNB data) |
| ExportTemplate | PDF šablona | → User |

**Indexy:** 77 indexů/unique constraints pro výkon.

---

## 7. API (67 routes)

### Autentizace (8)
- `POST /api/auth/register`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- `POST /api/auth/verify-email`, `GET /api/auth/verify-token`
- `POST /api/auth/audit-log`
- `GET /api/auth/[...nextauth]` (NextAuth handler)

### Projekty (16)
- `GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/[id]`
- `POST /api/projects/from-template`
- `GET /api/projects/[id]/budget`, `GET /api/projects/[id]/dashboard`
- `GET /api/projects/[id]/payments`, `GET /api/projects/[id]/time`
- `GET /api/projects/[id]/contacts`, `GET /api/projects/[id]/contact-stats`
- `GET /api/projects/[id]/spending-trend`, `GET /api/projects/[id]/snapshots`
- `POST /api/projects/[id]/reorder`, `GET /api/projects/[id]/audit`
- `GET /api/projects/[id]/export-csv`, `GET /api/projects/[id]/export-pdf`
- `GET /api/projects/[id]/public`, `POST /api/projects/[id]/request-access`
- `GET/POST /api/projects/[id]/invitations`, `PUT/DELETE /api/projects/[id]/invitations/[invitationId]`
- `GET/POST /api/projects/[id]/members`, `PUT/DELETE /api/projects/[id]/members/[memberId]` ⚠️
- `GET/POST /api/projects/[id]/notes`

### Budget items (3)
- `GET/PUT/DELETE /api/budget-items/[id]`, `POST /api/budget-items/[id]/duplicate`
- `GET/POST /api/budget-items/[id]/comments`

### Payments & Time (3)
- `GET/PUT/DELETE /api/payments/[id]`
- `GET/PUT/DELETE /api/time-entries/[id]`

### Contacts (3)
- `GET/PUT/DELETE /api/contacts/[id]`
- `GET/POST /api/contacts/[id]/persons`, `PUT/DELETE /api/contacts/[id]/persons/[personId]`

### Users & profile (6)
- `GET/POST /api/users`, `GET/PUT /api/users/[id]`
- `GET/PUT /api/users/profile`, `POST /api/users/profile/password`
- `POST /api/users/profile/sessions/revoke`
- `GET/POST/PUT/DELETE /api/users/profile/export-templates`

### Pozvánky (4)
- `GET /api/invitations/pending`
- `GET /api/invitations/[token]/info`, `POST /api/invitations/[token]/accept`, `POST /api/invitations/[token]/reject`

### Ostatní (9)
- `GET /api/health`, `GET /api/exchange-rates`, `GET /api/ares`
- `GET /api/analytics`, `POST /api/analytics/events`
- `GET /api/search`, `GET/POST /api/import`, `GET /api/export`
- `GET /api/notes/[id]`, `PUT/DELETE /api/notes/[id]`, `GET/PUT/DELETE /api/comments/[id]`
- `POST /api/revalidate`
- `GET/PUT/DELETE /api/snapshots/[id]`
- `GET/PUT/DELETE /api/account`, `POST /api/account/recover`
- `GET /api/admin/backfill-converted`
- `GET/POST /api/cron/*` (3 cron routes)

---

## 8. i18n (7 lokalit)

| Kód | Jazyk | BCP-47 | Endonym |
|-----|-------|--------|---------|
| cs | Čeština | cs-CZ | Čeština 🇨🇿 |
| en | English | en-GB | English 🇬🇧 |
| pl | Polski | pl-PL | Polski 🇵🇱 |
| vi | Tiếng Việt | vi-VN | Tiếng Việt 🇻🇳 |
| hu | Magyar | hu-HU | Magyar 🇭🇺 |
| es | Español | es-ES | Español 🇪🇸 |
| it | Italiano | it-IT | Italiano 🇮🇹 |

- Všechny 7 souborů mají **identické klíče** (3140 řádků každý) — ověřeno
- Default locale: `cs`
- Lokalizovaná formátování: měna (0/2 desetinná), data (DD.MM.YYYY)

---

## 9. Struktura repa

```
stavba/
├── src/
│   ├── app/
│   │   ├── [locale]/          # i18n routes (auth pages)
│   │   ├── api/               # 67 API routes
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                # 59 shadcn/ui komponent
│   │   ├── tabs/              # 12 hlavních tabů + sub-komponenty
│   │   ├── pdf-export/        # modularizovaný PDF export dialog
│   │   ├── charts/            # grafy
│   │   └── ...                # top-bar, sidebar, dialogs
│   ├── hooks/                 # 12 custom hooks
│   ├── i18n/                  # config, routing, detect
│   ├── lib/                   # 30 service souborů (auth, db, currency...)
│   ├── messages/              # 7 locale JSON souborů
│   └── middleware.ts          # i18n routing + auth guard
├── prisma/
│   ├── schema.prisma         # 18 modelů, 894 řádků
│   └── (migrace v git historii)
├── scripts/                   # 19 utility skriptů (seed, migrate, backup)
├── docs/                      # 3 FLOORPLAN soubory (ZAVRŽENÝ modul)
├── public/                    # favicon, loga, fonts, robots.txt
├── skills/                    # 18 dev skill souborů (gitignored)
└── (config: next.config.ts, tailwind.config.ts, vercel.json, ...)
```

---

## 10. Současný stav vs. produkční readiness

### ✅ Co funguje dobře
- Core funkcionalita (budget, payments, time, contacts) kompletní
- PDF export s pokročilými features (orientace, řazení, šablony, 2 styly)
- i18n — 7 jazyků, klíče aligned
- Multi-měna s batch převodem (optimalizováno)
- Auth vrstva (JWT, role-based, rate limiting, audit)
- Refaktorovaný kód (PDF komponenty + export dialog modularizovány)
- Lint + TypeScript clean
- Vercel deploy pipeline funkční (auto-deploy z GitHub)

### ⚠️ Co chybí / co je k řešení
| Oblast | Issue | Fáze |
|--------|-------|------|
| **Dead code** | API route typo: `members/emberId]` → `members/[memberId]` | F1 |
| **Dead code** | `next.config.ts` CSP comment odkazuje na reverted floorplan modul | F1 |
| **Dead docs** | `docs/FLOORPLAN_*.md` (3 soubory) — modul byl revertován, plány zůstaly | F2 |
| **Dead docs** | `scripts/` obsahuje one-time migrace (migrate-*.sh/sql) — archivovat | F2 |
| **Typografie** | Není auditovaná konzistence `type-body/label/headline/overline` napříč taby | F3 |
| **i18n texty** | Není ověřeno, že texty neobsahují vývojářské poznámky (fáze, TODO) | F4 |
| **Převod měny** | Potřebuje end-to-end verifikaci všech cest | F5 |
| **UX** | 54 icon-only buttonů bez `aria-label` (WCAG) | F6 |
| **API docs** | Žádná API dokumentace neexistuje | F7 |
| **Backend** | `maxDuration` chybí na těžkých routes (reorder, invitations) | F8 |
| **Logování** | Není konzistentní pattern; error zprávy ne vždy uživatelsky přívětivé | F9 |
| **Error kódy** | Pouze reset-password API má `code` pole — ostatní ne | F9 |

### 📊 Metriky
| Metrika | Hodnota |
|---------|---------|
| Řádky kódu (src/) | ~60 198 |
| API routes | 67 |
| Prisma modely | 18 |
| UI komponenty | 59 |
| i18n lokalit | 7 |
| Hooks | 12 |
| Lib services | 30 |
| Commits | 430 |
| TODO/FIXME značky | 6 (všechny false positives — "cat:XXX" ID komentáře) |

---

## 11. Závěr baseline

Aplikace je **funkčně kompletní** — všechny hlavní features (budget, payments, time, contacts, PDF export, multi-měna, i18n, auth, sdílení projektů) jsou implementovány a funkční. Kód je refaktorovaný a čistý (lint + tsc projíždějí bez chyb).

**Mezera do produkčního releasu** je primárně v:
1. **Dokumentaci** — API není zdokumentované, backend služby nemají konzistentní JSDoc
2. **UX polish** — typografie neprošla konzistentním auditem, accessibility chybí (aria-label)
3. **Log management** — error zprávy nejsou konzistentně uživatelsky přívětivé s actionovatelnými pokyny
4. **Cleanup** — zbytky zavrženého modulu (FLOORPLAN docs, CSP komentář), dead API route typo
5. **Verifikace** — převod měny, i18n texty potřebují end-to-end ověření

Tyto mezery budou systematicky uzavřeny ve fázích 1–9, s finálním srovnáním ve Fázi 10.
