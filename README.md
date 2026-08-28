# Stavba — Správa rozpočtu staveb

Aplikace pro komplexní správu rozpočtu, nákladů a času pro stavby a rekonstrukce.

## 🚀 Nasazení na Vercel — Kompletní návod

### Co potřebujete
- GitHub účet (už máte ✅)
- Vercel účet (už máte ✅)
- Neon PostgreSQL databázi (už máme ✅)

---

### Krok 1: Synchronizace kódu s GitHub

#### 1a. Vytvořte nový repozitář na GitHub

1. Jděte na **https://github.com/new**
2. **Repository name:** `stavba`
3. Nastavte na **Private** (soukromý)
4. **NEzaškrtávejte** „Add a README" ani „.gitignore" (už je v kódu)
5. Klikněte **„Create repository"**
6. GitHub vám ukáže URL — uložte si ho (např. `https://github.com/vas-ucet/stavba.git`)

#### 1b. Nainstalujte Git (pokud nemáte)

**Mac:** `brew install git` nebo stáhněte z https://git-scm.com/download/mac
**Windows:** Stáhněte z https://git-scm.com/download/win
**Linux:** `sudo apt install git`

Ověřte: `git --version`

#### 1c. Přihlaste se do Gitu (pokud ještě ne)

Otevřete **Terminal** (Mac) nebo **Git Bash** (Windows) a zadejte:

```bash
git config --global user.name "Vaše Jméno"
git config --global user.email "vas@email.cz"
```

#### 1d. Připojte GitHub jako remote

V terminálu jděte do složky projektu a přidejte GitHub remote:

```bash
# Jděte do složky projektu (nahraďte cestou k projektu)
cd /cesta/k/projektu

# Přidejte GitHub remote (nahraďte URL vaším)
git remote add origin https://github.com/vas-ucet/stavba.git

# Ověřte
git remote -v
# Mělo by ukázat: origin  https://github.com/vas-ucet/stavba.git
```

#### 1e. Nahrajte kód na GitHub

```bash
# Přidejte všechny soubory
git add -A

# Vytvořte commit
git commit -m "Aplikace Stavba — připraveno na Vercel"

# Nahrajte na GitHub (poprvé může trvat pár minut)
git push -u origin main
```

**⚠️ Důležité:** `.env` soubor je v `.gitignore` — **heslo k databázi se nenahraje na GitHub**. To je správně! Heslo nastavíme později ve Vercelu.

#### 1f. Ověřte na GitHub

Jděte na `https://github.com/vas-ucet/stavba` — měli byste vidět všechny soubory projektu.

---

### Krok 2: Nasazení na Vercel

#### 2a. Import projektu

1. Jděte na **https://vercel.com/new**
2. V sekci „Import Git Repository" najděte váš repozitář `stavba`
3. Klikněte **„Import"**

#### 2b. Nastavení projektu

Vercel automaticky detekuje Next.js. Nastavte:

| Pole | Hodnota |
|------|---------|
| **Framework Preset** | Next.js (automaticky) |
| **Root Directory** | `./` (default) |
| **Build Command** | `prisma generate && next build` (už v package.json) |
| **Output Directory** | `.next` (automaticky) |
| **Install Command** | `npm install` (nechte default) |

#### 2c. Nastavení Environment Variables (KRITICKÉ!)

V sekci **„Environment Variables"** přidejte:

| Name | Value |
|------|-------|
| `DATABASE_URL` | `postgresql://neondb_owner:npg_tjaDHGg7ms3c@ep-quiet-breeze-b1x58rmg-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require` |

**⚠️ Toto je jediná env proměnná, kterou aplikace potřebuje.**

#### 2d. Deploy!

1. Klikněte **„Deploy"**
2. Počkejte 2-3 minuty (Vercel buildí aplikaci)
3. Až uvidíte **„Congratulations!"** — aplikace je živá!
4. URL bude něco jako `https://stavba-xxxx.vercel.app`

#### 2e. Ověřte

Otevřete svou Vercel URL v prohlížeči:
- Měli byste vidět aplikaci „Stavba"
- Projekt „Troja" s 49 položkami rozpočtu
- Data pocházejí z Neon PostgreSQL

---

### Krok 3: Automatické nasazení (volitelné)

Od teď, kdyžkoli nahrajete kód na GitHub:

```bash
git add -A
git commit -m "popis změny"
git push
```

Vercel **automaticky** rebuildí a nasadí aplikaci. Trvá to 2-3 minuty.

---

## 🔧 Řešení problémů

### „Can't reach database server"
→ Ověřte, že `DATABASE_URL` ve Vercelu je správně (zkopírujte celý Neon connection string včetně `?sslmode=require`)

### „Prisma Client not found"
→ Vercel build automaticky spouští `postinstall: prisma generate` (nastaveno v package.json)

### „Build failed"
→ Zkontrolujte build logy ve Vercel dashboardu → záložka „Build Logs"

### „Application error"
→ Zkontrolujte runtime logy ve Vercel dashboardu → záložka „Runtime Logs"

---

## 📂 Struktura projektu

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes (Prisma → Neon)
│   ├── page.tsx           # Hlavní stránka
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Globální styly
├── components/             # React komponenty
│   ├── tabs/              # 7 tabů (Přehled, Rozpočet, Platby, Čas, Kontakty, Časová osa, Poznámky)
│   ├── ui/                # shadcn/ui komponenty
│   └── ...
├── lib/                    # Utility
│   ├── api.ts             # React Query hooks
│   ├── db.ts              # Prisma client
│   ├── format.ts          # Formátování (Kč, datumy)
│   └── ...
├── hooks/                  # Custom hooks
└── prisma/
    └── schema.prisma       # Databázové schéma

prisma/
└── schema.prisma           # Databázové schéma (PostgreSQL)
```

## 🛠 Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- **Backend:** Next.js API Routes, Prisma ORM
- **Databáze:** Neon PostgreSQL (cloud, free 3GB)
- **Hosting:** Vercel (free, globální Edge Network)
- **State:** React Query (server state), Zustand (client state)
