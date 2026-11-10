# Stavba — Správa rozpočtu staveb

Aplikace pro komplexní správu rozpočtu, nákladů a času staveb a rekonstrukcí.

## Přehled

Stavba je webová aplikace postavená na Next.js 16, která umožňuje:

- **Hierarchické rozpočtové položky** — Kategorie → Položka → Úkol s drag-and-drop řazením
- **Multi-měnové operace** — automatický přepočet pomocí denních kurzů ČNB
- **PDF reporty** — 2 vizuální styly (minimal/colorful), per-section orientace, per-table řazení, uložitelné šablony
- **Správa plateb** — faktury, opakující se platby, DPH, odkazy na faktury
- **Časové záznamy** — sledování práce dle pracovníka
- **Kontakty** — firmy + osoby, ARES IČO lookup, hodnocení
- **Sdílení projektů** — role-based (owner/editor/viewer), pozvánky
- **Audit logování** — sledování klíčových akcí
- **7 jazyků** — cs, en, pl, vi, hu, es, it

## Technologický stack

| Vrstva | Technologie |
|--------|-------------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Jazyk | TypeScript 5 (strict) |
| Databáze | PostgreSQL (Neon) + Prisma 6 ORM |
| Styling | Tailwind CSS 4 + shadcn/ui |
| State | Zustand (klient) + TanStack Query (server) |
| Auth | NextAuth v4 (JWT, Credentials + Google OAuth) |
| i18n | next-intl (7 lokalit) |
| PDF | @react-pdf/renderer (server-side) |
| Hosting | Vercel |

## Integrace

- **Neon PostgreSQL** — databáze s PgBouncer connection pooling
- **ČNB** — denní kurzy měn (cron job)
- **Brevo** — transakční e-maily
- **Google OAuth** — sociální přihlášení (volitelné)
- **ARES** — český registr firem (IČO lookup)

## Lokální vývoj

```bash
# Instalace závislostí
bun install

# Nastavení env (vytvoř .env.local s Neon DATABASE_URL + NEXTAUTH_SECRET)
# Viz .env.example pro seznam všech proměnných

# Spuštění dev serveru
bun run dev

# Lint + type check
bun run lint
npx tsc --noEmit
```

## Produkční nasazení

Aplikace je nasazena na Vercel — auto-deploy z `main` větve.

### Požadované env proměnné (Vercel dashboard)

| Proměnná | Popis |
|----------|-------|
| `DATABASE_URL` | Neon PostgreSQL connection string (pooler hostname) |
| `NEXTAUTH_SECRET` | JWT secret (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Produkční URL |
| `BREVO_API_KEY` | Brevo API klíč (volitelné — bez něj se e-maily neposílají) |
| `EMAIL_FROM` | Odesílatel e-mailů |
| `GOOGLE_CLIENT_ID` | Google OAuth (volitelné) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth (volitelné) |
| `CRON_SECRET` | Autentizace Vercel Cron jobs |

### Cron jobs

| Schedule | Path | Účel |
|----------|------|------|
| `0 3 * * *` | `/api/cron/finalize-deletions` | Trvalé smazání soft-deleted účtů |
| `0 15 * * 1-5` | `/api/cron/fetch-exchange-rates` | Fetch ČNB kurzů |
| `0 4 * * *` | `/api/cron/process-recurring-payments` | Opakující se platby |

## Struktura projektu

```
src/
├── app/
│   ├── [locale]/       # i18n routes (auth pages)
│   └── api/            # REST API (67 routes)
├── components/
│   ├── ui/             # shadcn/ui komponenty
│   ├── tabs/           # 12 hlavních tabů
│   └── pdf-export/     # modularizovaný PDF export
├── hooks/              # 12 custom hooks
├── lib/                # služby (auth, db, currency, email, ...)
└── messages/           # 7 locale JSON souborů
prisma/
└── schema.prisma       # 18 modelů, 894 řádků
```

## Dokumentace

- `docs/FINALIZATION-SUMMARY-BASELINE.md` — audit aplikace před finalizačním procesem
- `docs/ARCHIVE/` — archiv zavržených feature plánů (FLOORPLAN modul)
