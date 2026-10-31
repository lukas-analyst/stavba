# Modul "Půdorys objektu" — implementační plán (POC → Produkce)

> **Status:** Draft — čeká na finální odpovědi (Q31–Q40)
> **Datum:** 2025-10-30
> **Poslední aktualizace:** 2025-10-30
> **Autor:** Lukáš Hanzlík + AI asistent
> **Schváleno:** ❌ zatím neschváleno

---

## 1. Exekutivní shrnutí

Modul "Půdorys objektu" přidá do aplikace **vizuální nástroj** pro správu rekonstrukce nemovitosti. Uživatel importuje profesionální půdorys z CAD (DXF formát), vidí vizuální 2D pohled shora (půdorys) + pohled z boku (nárys), může interaktivně upravit jednotlivé prvky (zdi, okna, rozvody) a propojit je s položkami rozpočtu (BudgetItem).

**Klíčové principy:**
1. **Nulový dopad na existující funkcionalitu** — modul je izolovaný, lazy-loaded, additive migrace
2. **Inkrementální vývoj** — POC → Fáze 1 → Fáze 2 → ...
3. **MD3 design konzistentní** se zbytkem aplikace
4. **DXF jako zdroj** (DWG zamítnut — žádná MIT knihovna)
5. **N:M propojení** BudgetItem ↔ FloorplanElement (mnoho k mnoha)
6. **Side view (nárys)** — druhá sekce pod půdorysem

---

## 2. Rozhodnutí log (z odpovědí Q1–Q30)

| # | Otázka | Rozhodnutí | Poznámka |
|---|---|---|---|
| Q1 | Formát | **Pouze DXF** | PDF / ruční kresba později |
| Q2 | Soubory na projekt | **Jeden i více** | záleží na uživateli |
| Q3 | Re-import | **Zeptat se uživatele** | double-opt-in s vysvětlením dopadů |
| Q4 | Velikost souboru | **Variabilní** | bude řešeno případ od případu |
| Q5 | Stránka | **Nový tab v Sidebar** | `id: "floorplan"` |
| Q6 | Role přístup | **Owner + Admin** | viewer v budoucnu |
| Q7 | minRole | **`"owner"`** | admin bypass (existující mechanismus) |
| Q8 | Kompozitní prvky | **⏳ Čeká na dopadovou analýzu** | viz sekce 5 níže |
| Q9 | Okna/dveře | **⏳ Čeká na upřesnění** | viz sekce 6 níže |
| Q10 | Editace POC | **Jednoduchá v POC** | budoucnost: drag, resize, vertex, kreslení |
| Q11 | Přidat vrstvu izolace | **Ano** | interaktivně ke stávající zdi |
| Q12 | Rozvody detail | **C — trasy + body + napojení na spotřebiče** | propojení spotřebič ↔ rozvod |
| Q13 | Datové rozvody | **Od začátku** | smart home od POC |
| Q14 | Kuchyňské spotřebiče | **Budoucnost (ne POC)** | |
| Q15 | Spotřebiče model | **Jeden element + metadata** | napojení v `metadata` |
| Q16 | Vztah BudgetItem ↔ Element | **N:M (mnoho k mnoha)** | vyžaduje junction table |
| Q17 | Auto-vytvoření BudgetItem při importu | **NE** | user přiřazuje ručně, vždy se ptát |
| Q18 | Mazání elementu | **Zeptat se uživatele** | double-opt-in |
| Q19 | Mazání BudgetItem | **Zeptat se uživatele** | double-opt-in (SetNull default) |
| Q20 | Stropy/podlahy | **⏳ Čeká** | pravděpodobně samostatný element s metadaty |
| Q21 | Střecha | **C — top view + metadata** | sklon, orientace, materiál |
| Q22 | Terén | **⏳ Pravděpodobně samostatná floor** | level: -100, type: outdoor |
| Q23 | Exteriér v POC | **Ne** | budoucnost s rozvody sítí |
| Q24 | Více DXF | **Ano, více souborů** | jeden DXF může obsahovat i více pater |
| Q25 | K.O. kritérium POC | **Organicky** | |
| Q26 | Vizuální styl | **MD3 design** | konzistentní |
| Q27 | Barevné schéma | **Stejné jako zbytek app** | PHASE_COLORS |
| Q28 | Zobrazení stavu | **Toggle** | půdorys as-is ↔ stav rekonstrukce |
| Q29 | Počet prvků | **C — 500–2000** | větší rekonstrukce, i malé garáže |
| Q30 | Souběžná editace | **Ne v POC** | edit-lock uživatelem |

### Nový požadavek (z poslední zprávy)

**Side view (nárys / pohled zboku)** — druhá sekce hned pod půdorysem. User vidí:
1. Půdorys (top view)
2. Nárys (side view / elevation)

Obě zobrazení musí být vizuálně propojená (prvek v půdorysu ↔ odpovídající prvek v nárysu).

---

## 3. Co ještě potřebujeme odpovědět (Q31–Q40)

### Q31. Side view (nárys) — detail reprezentace

Pohled zboku je jiný než půdorys. Potřebuji vědět:

- **(a)** Side view je **další DXF import** (samostatný soubor "pohled zboku.dxf")?
- **(b)** Side view je **odvozen z půdorysu** (automaticky generovaný řez)?
- **(c)** Side view je **ručně kreslený** uživatelem v aplikaci (kreslí výšku zdi, okna, dveře ze strany)?
- **(d)** Side view je **speciální floor** s `viewType: "elevation"` (paralelní k floor s `viewType: "plan"`)?

**Dopad:** (a) je nejjednodušší, (b) vyžaduje složitou logiku, (c) vyžaduje editor, (d) je hybrid.

### Q32. Side view — propojení s top view

Jak vizuálně propojit prvek v půdorysu s odpovídajícím prvkem v nárysu?

- **(a)** Klik na zeď v půdorysu → zvýrazní se odpovídající zeď v nárysu (a naopak)
- **(b)** Společná selection — vyberu zeď, vidím ji v obou pohledech
- **(c)** Žádné propojení (nezávislé pohledy)

### Q33. N:M vztah BudgetItem ↔ FloorplanElement — datový model

Q16 říká N:M (mnoho k mnoha). Existují 2 způsoby, jak to modelovat:

**Varianta A: Junction table (doporučeno pro N:M)**
```prisma
model FloorplanElementBudgetItem {
  id              String   @id @default(cuid())
  elementId       String
  budgetItemId    String
  // role propojení (co tento vztah znamená)
  role            String   // "primary" | "layer" | "connection" | "appliance"
  metadata        String?  // dodatečná metadata (např. "napájení", "přívod vody")
  createdAt       DateTime @default(now())

  @@unique([elementId, budgetItemId, role])  // jeden pár element-item-role
  @@index([elementId])
  @@index([budgetItemId])
}
```
**Výhody:** Flexibilní, každé propojení má vlastní metadata (role), snadné query
**Nevýhody:** Další tabulka, více JOINů

**Varianta B: Pole FK na obou stranách (nelze pro N:M)**
Nelze — N:M vyžaduje junction.

**Doporučení:** Varianta A (junction table s `role` a `metadata`).

**Otázka pro vás:** Souhlasíte s junction table `FloorplanElementBudgetItem`?

### Q34. Edit mode lock — jak dlouho a co při odchodu

Q30: souběžná editace blokována uživatelem v Edit módu.

- **(a)** Edit lock s **timeoutem** (např. 30 min neaktivity → uvolnit)?
- **(b)** Edit lock **dokud uživatel nezavře tab** (při unload → unlock)?
- **(c)** Edit lock **dokud uživatel neklikne "Ukončit editaci"** (explicitní akce)?
- **(d)** Kombinace — explicitní ukončení + timeout fallback?

**Dopad:** Pokud uživatel zavře prohlížeč bez ukončení editace, ostatní nemohou editovat (dokud nevyprší timeout).

### Q35. Verzování půdorysu / snapshot

Aplikace už má `Snapshot` model (pro rozpočet). Má mít půdorys také verzování?

- **(a)** Ano — snapshot půdorysu před každou editací (rollback možný)
- **(b)** Ne — jen aktuální stav, editace se logují do AuditLog
- **(c)** Ano, ale jen při DXF re-importu (každý import = nová verze)

**Dopad:** Verzování zvyšuje storage nároky (velké JSON payloady).

### Q36. Více DXF souborů — organizace

Q24: více souborů, jeden může obsahovat více pater. Jak organizovat?

- **(a)** Každý DXF = jedna `FloorplanSource` (s `floorId`), více souborů = více záznamů
- **(b)** Jeden DXF s více patry = parser detekuje floors automaticky (podle LAYER jména nebo BLOCK sekce) → rozdělí do více `FloorplanFloor`
- **(c)** User ručně přiřadí DXF k patru při importu

**Dopad:** (b) je nejsložitější — detekce pater v DXF není standardizovaná.

### Q37. Audit log pro půdorys

Má se každá změna v půdorysu zapisovat do AuditLog?

- **(a)** Ano — `entityType: "FloorplanElement"`, loguje create/update/delete
- **(b)** Ne — jen kritické změny (DXF import, propojení s BudgetItem)
- **(c)** Ano, kompletní (i změny pozice x, y, width, height)

**Dopad:** (c) může generovat mnoho záznamů (každý drag = 1 log).

### Q38. Barevné schéma vrstev

Jaké barvy použít pro vrstvy (rozvodné sítě)?

Existující PHASE_COLORS (z `src/lib/format.ts`):
- `preparation` — info-blue
- `demolition` — danger-red
- `shell` — warning-yellow
- `installations` — info-blue
- ...

Pro vrstvy půdorysu navrhuji:

| Vrstva | Návrh barvy | Tailwind token |
|---|---|---|
| `structural` (zdi, dveře, okna) | Šedá | `bg-muted` |
| `electrical` | Žlutá | `bg-warning` |
| `data` | Modrá | `bg-info` |
| `plumbing` (voda) | Azurová | `bg-info-soft` |
| `gas` | Oranžová | `bg-warning-soft` |
| `drainage` | Hnědá | `bg-muted-foreground` |
| `terrain` | Zelená | `bg-success` |
| `annotation` | Bílá/transparent | `bg-background` |

**Otázka:** Souhlasíte s tímto schématem? Máte vlastní preference?

### Q39. Stavový režim (Q28) — konkrétní vizualizace

Q28: toggle mezi "půdorys as-is" ↔ "stav rekonstrukce".

- **(a)** Toggle button v toolbaru (ikonka) — přepíná mezi "Geometrie" a "Stav"
- **(b)** Radio button (přepínač) — "Geometrie" / "Fáze" / "Stav" (3 režimy)
- **(c)** Overlay (překryv) — stav jako barevný overlay přes geometrii

Co se zobrazí v režimu "Stav":
- Zelená výplň = `BudgetItem.completed = true`
- Oranžová výplň = `!completed && !rejected`
- Červená výplň = `rejected = true`
- Šedá = bez propojení s BudgetItem

**Otázka:** (a), (b) nebo (c)?

### Q40. Side view — propojení s BudgetItem

Side view (nárys) také umožňuje propojení s BudgetItem?

- **(a)** Ano — každý prvek v nárysu může mít BudgetItem (nezávisle na půdorysu)
- **(b)** Ne — nárys je jen vizualizace, propojení jen v půdorysu
- **(c)** Sdílené — prvek existuje v obou pohledech, jeden BudgetItem pro obě

---

## 5. Dopadová analýza Q8 — kompozitní prvky

Q8: jak reprezentovat zeď s více vrstvami (izolace, omítka, okno, dveře, instalace).

### Varianta A: Single FloorplanElement s `metadata.layers`

```json
{
  "id": "wall-1",
  "type": "wall",
  "x": 100, "y": 50, "width": 300, "height": 20,
  "metadata": {
    "layers": [
      { "material": "cihla", "thickness": 140 },
      { "material": "EPS", "thickness": 80 },
      { "material": "fólie", "thickness": 0.2 },
      { "material": "omítka", "thickness": 5 }
    ],
    "openings": [
      { "type": "window", "x": 80, "width": 120, "height": 140, "sillHeight": 90 },
      { "type": "door", "x": 200, "width": 90 }
    ],
    "installations": [
      { "type": "zásuvka", "x": 50, "y": 5 }
    ]
  },
  "budgetItemId": ["item-1"]  // jeden BudgetItem pro celou zeď
}
```

**Výhody:**
- ✅ Jednoduché — jeden row v DB
- ✅ Snadné query (jedna tabulka)
- ✅ Rychlé renderování

**Nevýhody:**
- ❌ Všechny vrstvy sdílí jeden BudgetItem (nelze přiřadit izolaci samostatně)
- ❌ Nelze přiřadit oknu vlastní BudgetItem
- ❌ Metadata JSON roste s komplexitou (pomalejší update)
- ❌ N:M vztah (Q16) nelze naplnit — nelze říct "izolace patří BudgetItem X, omítka BudgetItem Y"

### Varianta B: Hierarchie (parent + children)

```
FloorplanElement (parent)
  id: "wall-1", type: "wall"
  parentId: null
  budgetItemId: null (nebo jeden hlavní)
├── FloorplanElement (child)
  id: "wall-1-layer-1", type: "layer"
  parentId: "wall-1"
  metadata: { material: "cihla", thickness: 140 }
  budgetItemId: "item-cihla"
├── FloorplanElement (child)
  id: "wall-1-layer-2", type: "layer"
  parentId: "wall-1"
  metadata: { material: "EPS", thickness: 80 }
  budgetItemId: "item-eps"
├── FloorplanElement (child)
  id: "wall-1-window-1", type: "window"
  parentId: "wall-1"
  budgetItemId: "item-okno"
├── FloorplanElement (child)
  id: "wall-1-outlet-1", type: "outlet"
  parentId: "wall-1"
  budgetItemId: "item-elektrikar"
```

**Výhody:**
- ✅ Každá vrstva / dílčí prvek má vlastní BudgetItem (naplňuje Q16)
- ✅ Hierarchie — přirozená reprezentace (zeď → okno → zásuvka)
- ✅ Snadné přidat/odebrat vrstvu (jen insert/delete child)
- ✅ Audit log granularity (víme přesně která vrstva se změnila)
- ✅ Každý child může mít vlastní metadata (materiál, tloušťka)

**Nevýhody:**
- ⚠️ Více row v DB (typická zeď = 4-8 vrstev + 1-3 openingy = 5-11 elementů)
- ⚠️ Více JOINů při query (children)
- ⚠️ Parent-child manipulace složitější

### Varianta C: Hybrid (doporučeno)

- **Parent element** (zeď) — hlavní geometrie, `type: "wall"`
- **Child elements** (vrstvy) — `type: "layer"`, v `metadata` materiál + tloušťka
- **Child elements** (openingy) — `type: "window"` / `type: "door"`
- **Child elements** (instalace) — `type: "outlet"`, `type: "pipe"`, atd.
- **Junction table** `FloorplanElementBudgetItem` — pro N:M propojení

**Výhody:**
- ✅ Flexibilita (Q16 N:M naplněno)
- ✅ Každá vrstva má vlastní BudgetItem (Q11)
- ✅ Snadné query (parent + children přes `parentId`)
- ✅ Audit log granularity
- ✅ Lze rozšiřovat (nové typy vrstev = nový `type`)

**Nevýhody:**
- ⚠️ Složitější datový model
- ⚠️ Více JOINů

### Naše doporučení: Varianta C (hybrid)

Důvody:
1. Splňuje Q11 (přidat vrstvu izolace ke stávající zdi)
2. Splňuje Q16 (N:M — každá vrstva může mít vlastní BudgetItem)
3. Je rozšiřitelná (nové typy vrstev nevyžadují změnu schématu)
4. Hierarchie `parentId` je už v aplikaci (BudgetItem parent-child)

**Otázka pro vás:** Schvalujete Variantu C (hybrid)?

---

## 6. Upřesnění Q9 — reprezentace oken/dveří

Q9 byla: jak reprezentovat okna a dveře v půdorysu?

### Co jsem měl na mysli

V CAD systémech existují 2 přístupy:

### (a) Opening ve zdi (subtraction)

Zeď je polyline/polygon s "dírou" pro okno:

```
████████████████████████████████████████████████  ← zeď (s dírou)
████████        ████████████████        ████████
████████ okno   ████████████████ dveře  ████████
████████        ████████████████        ████████
████████████████████████████████████████████████
```

**Výhody:** Vizuálně přesné (zeď má skutečně díru)
**Nevýhody:** Složité pro SVG (musíme použít `<path>` s `evenodd` fill rule), při posunu okna musíme přepočítat zeď

### (b) Samostatný element na pozici

Okno je samostatný element (rectangle) umístěný "na" zdi:

```
zeď:    ████████████████████████████████████████████████
okno:   ░░░░░░░░░░░░              (překryv)
dveře:                   ▓▓▓▓▓▓▓▓▓ (překryv)
```

**Výhody:** Jednoduché (každý element je nezávislý), snadná editace
**Nevýhody:** Vizuálně se překrývají (okno "leží na" zdi)

### (c) Child element pod zdí (kompozitní)

Okno je `parentId = wall.id` — dítě zdi:

```
zeď (parent):
  - vrstva: cihla
  - vrstva: izolace
  - child: okno (x=80, w=120)
  - child: dveře (x=200, w=90)
```

**Výhody:** Flexibilní, okno dědí pozici zdi, snadné přidání/odebrání
**Nevýhody:** Hierarchie může být matoucí

### Naše doporučení: (c) Child element

Okna a dveře jako **child elements** pod zdí (`parentId = wall.id`). Render:
- Zeď se vykreslí jako plná polyline
- Okno se vykreslí jako překryv (jiná barva/pattern)
- Dveře se vykreslí s obloukem otevení

**Výhody:**
- Splňuje Q11 (interaktivní úprava zdi)
- Konstantní se Q16 (okno může mít vlastní BudgetItem)
- Vizuálně čisté (okno je součást zdi)

**Otázka pro vás:** Schvalujete (c) child element?

---

## 7. Architektura modulu

### 7.1 Komponenty vysoké úrovně

```
┌─────────────────────────────────────────────────────────┐
│ Sidebar                                                 │
│  - Portfolio    - Dashboard                             │
│  - Budget       - Payments       - Time                 │
│  - Contacts     - Timeline       - Notes                │
│  - Management   - Telemetry                             │
│  - PŮDORYS (nový) ← minRole: "owner"                   │
│  - Admin (isAdmin)                                      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ FloorplanTab (lazy-loaded)                              │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Toolbar                                             │ │
│ │  - Floor switcher (Přízemí / 1.patro / Sklep)      │ │
│ │  - View mode toggle (Geometrie / Stav)              │ │
│ │  - Layer filter (structural / electrical / ...)      │ │
│ │  - Edit mode toggle (Read-only / Edit)              │ │
│ │  - Import DXF button                                │ │
│ │  - Export button (future)                           │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Section 1: PŮDORYS (Top view)                       │ │
│ │  <FloorplanCanvas                                    │ │
│ │    viewType="plan"                                   │ │
│ │    floorId={selectedFloorId}                          │ │
│ │    elements={...}                                     │ │
│ │    layers={visibleLayers}                            │ │
│ │    mode={viewMode}  // "geometry" | "status"         │ │
│ │    editMode={editMode}  // "read" | "edit"           │ │
│ │    onElementClick={...}                              │ │
│ │    onElementDrag={...}  // future                    │ │
│ │  />                                                  │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Section 2: NÁRYS (Side view / elevation)            │ │
│ │  <FloorplanCanvas                                    │ │
│ │    viewType="elevation"                              │ │
│ │    floorId={selectedFloorId}                          │ │
│ │    elements={...}  // stejné nebo odvozené           │ │
│ │    layers={visibleLayers}                            │ │
│ │    mode={viewMode}                                    │ │
│ │    editMode={editMode}                                │ │
│ │    onElementClick={...}                              │ │
│ │  />                                                  │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Side panel (pravý sloupec nebo modal)                │ │
│ │  - Detail vybraného elementu                         │ │
│ │  - Vrstvy (materiály, tloušťka)                      │ │
│ │  - Propojené BudgetItem (N:M)                         │ │
│ │  - Stav (completed / rejected)                        │ │
│ │  - Akce: Přidat vrstvu, Odebrat, Přiřadit BudgetItem │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 7.2 Datový model (finální návrh)

#### Nové tabulky (additive — nezasahují do existujících)

```prisma
// ============================================================
// FLOORPLAN MODULE — nové tabulky (additive, nezasahují do existujících)
// ============================================================

model FloorplanFloor {
  id          String   @id @default(cuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name        String   // "Přízemí", "1. patro", "Sklep", "Terén"
  level       Int      // -1=sklep, 0=přízemí, 1=1.patro, ...
  sortOrder   Int      @default(0)
  // viewType: "plan" (půdorys) nebo "elevation" (nárys)
  viewType    String   @default("plan")  // "plan" | "elevation"
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  elements    FloorplanElement[]
  sources     FloorplanSource[]

  @@index([projectId])
  @@index([projectId, sortOrder])
  @@map("floorplan_floors")
}

model FloorplanElement {
  id            String   @id @default(cuid())
  floorId       String
  floor         FloorplanFloor @relation(fields: [floorId], references: [id], onDelete: Cascade)
  projectId     String   // denormalizováno pro snadné query
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  // Hierarchie — kompozitní prvky (zeď → vrstvy, okna, dveře)
  parentId      String?
  parent        FloorplanElement? @relation("FloorplanElementHierarchy", fields: [parentId], references: [id], onDelete: Cascade)
  children      FloorplanElement[] @relation("FloorplanElementHierarchy")

  // Typ elementu
  type          String   // "wall", "window", "door", "room", "stairs",
                         // "chimney", "column", "ceiling", "floor", "roof",
                         // "cable", "pipe", "drain", "outlet", "switch",
                         // "light", "sensor", "appliance", "tree", "fence",
                         // "annotation", ...

  // Vrstva (pro filter / zobrazení)
  layer         String   // "structural" | "electrical" | "data" |
                         // "plumbing" | "gas" | "drainage" |
                         // "terrain" | "annotation"

  // Geometrie (v cm — reálné jednotky, render převede na px)
  x             Float    // bounding box left
  y             Float    // bounding box top
  width         Float?   // bounding box width
  height        Float?   // bounding box height
  rotation      Float    @default(0)  // stupně
  points        String?  // JSON: [[x,y],[x,y],...] pro polyline/polygon

  // Původ (DXF import vs user-drawn)
  source        String   @default("manual")  // "dxf" | "manual"
  dxfHandle     String?  // DXF entity handle (pro re-import matching)
  dxfLayer      String?  // původní DXF vrstva (např. "A-WALL")

  // Metadata (materiál zdi, typ okna, průměr trubky, ...)
  metadata      String?  // JSON: { material, thickness, color, ... }

  sortOrder     Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // Relace (propojení s BudgetItem je přes junction table — viz níže)
  budgetItems   FloorplanElementBudgetItem[]

  @@index([floorId])
  @@index([projectId])
  @@index([parentId])
  @@index([layer])
  @@index([type])
  @@index([projectId, layer])
  @@map("floorplan_elements")
}

model FloorplanElementBudgetItem {
  // Junction table pro N:M vztah (Q16)
  id              String   @id @default(cuid())
  elementId       String
  element         FloorplanElement @relation(fields: [elementId], references: [id], onDelete: Cascade)
  budgetItemId    String
  budgetItem      BudgetItem @relation(fields: [budgetItemId], references: [id], onDelete: Cascade)

  // Role propojení — co tento vztah znamená
  role            String   @default("primary")
  // "primary"    — hlavní propojení (např. zeď = "Vyzdívka")
  // "layer"      — vrstva (např. izolace v této zdi)
  // "appliance"  — spotřebič (např. lednice napojená na elektro)
  // "connection" — rozvod (např. kabel napojený na zásuvku ve zdi)

  metadata        String?  // JSON: dodatečné info (např. "napájení 230V")

  createdAt       DateTime @default(now())

  @@unique([elementId, budgetItemId, role])  // jeden pár element-item-role
  @@index([elementId])
  @@index([budgetItemId])
  @@map("floorplan_element_budget_items")
}

model FloorplanSource {
  // Původní DXF soubor (záloha / re-import)
  id            String   @id @default(cuid())
  projectId     String
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  floorId       String?  // do kterého patra patří (null = multi-floor DXF)
  floor         FloorplanFloor? @relation(fields: [floorId], references: [id], onDelete: SetNull)

  fileName      String   // "pudorys_prizemi.dxf"
  blobUrl       String   // Vercel Blob URL
  fileSize      Int      // bytes
  importedAt    DateTime @default(now())
  importedBy    String?  // userId
  // Metadata o importu
  layerMappings String?  // JSON: {"A-WALL": "structural", "E-LITE": "electrical"}
  entityCount   Int      // kolik entit se naimportovalo
  // Verze (pro re-import tracking)
  version       Int      @default(1)

  @@index([projectId])
  @@index([floorId])
  @@map("floorplan_sources")
}

model FloorplanEditLock {
  // Edit mode lock (Q30) — blokuje souběžnou editaci
  id            String   @id @default(cuid())
  projectId     String
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  userId        String   // kdo drží lock
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  acquiredAt    DateTime @default(now())
  expiresAt     DateTime  // timeout (např. now + 30 min)

  @@index([projectId])
  @@unique([projectId])  // jeden lock na projekt
  @@map("floorplan_edit_locks")
}
```

#### Změny v existujících modelech (pouze přidání relace)

```prisma
// V modelu BudgetItem — PŘIDÁNÍ relace (žádné změny existujících polí)
model BudgetItem {
  // ... všechna existující pole zůstávají beze změny ...

  // NOVÉ — relace na půdorys (N:M junction table)
  floorplanElementLinks FloorplanElementBudgetItem[]
}

// V modelu Project — PŘIDÁNÍ relace
model Project {
  // ... všechna existující pole zůstávají beze změny ...

  // NOVÉ — relace na půdorys
  floorplanFloors    FloorplanFloor[]
  floorplanSources   FloorplanSource[]
  floorplanEditLock  FloorplanEditLock?
}

// V modelu User — PŘIDÁNÍ relace
model User {
  // ... všechna existující pole zůstávají beze změny ...

  // NOVÉ — relace na edit lock
  floorplanEditLocks  FloorplanEditLock[]
}
```

### 7.3 API design

#### Nové endpointy

```
# DXF import
POST   /api/projects/[id]/floorplan/import
       Body: multipart/form-data { file: .dxf, floorId?, layerMappings? }
       Response: { floorId, elementCount, sources: [...] }

# Načtení půdorysu
GET    /api/projects/[id]/floorplan
       Query: ?floorId=xxx&viewType=plan|elevation
       Response: { floors: [...], elements: [...], sources: [...] }

# Editace elementu
PATCH  /api/projects/[id]/floorplan/elements/[elementId]
       Body: { x?, y?, width?, height?, metadata?, type?, layer? }
       Response: { element }

# Vytvoření elementu (včetně child vrstev)
POST   /api/projects/[id]/floorplan/elements
       Body: { floorId, type, layer, x, y, width, height, parentId?, metadata? }
       Response: { element }

# Smazání elementu (s dotazem na propojené BudgetItem)
DELETE /api/projects/[id]/floorplan/elements/[elementId]
       Query: ?cascadeBudgetItems=true|false
       Response: { deleted: true, affectedBudgetItems?: [...] }

# Propojení element ↔ BudgetItem (N:M)
POST   /api/projects/[id]/floorplan/elements/[elementId]/links
       Body: { budgetItemId, role, metadata? }
       Response: { link }

DELETE /api/projects/[id]/floorplan/elements/[elementId]/links/[linkId]
       Response: { deleted: true }

# Edit mode lock
POST   /api/projects/[id]/floorplan/lock
       Response: { lockId, expiresAt }

DELETE /api/projects/[id]/floorplan/lock
       Response: { released: true }

# Floor management
POST   /api/projects/[id]/floorplan/floors
       Body: { name, level, viewType }
       Response: { floor }

PATCH  /api/projects/[id]/floorplan/floors/[floorId]
       Body: { name?, level?, sortOrder? }
       Response: { floor }

DELETE /api/projects/[id]/floorplan/floors/[floorId]
       Response: { deleted: true }

# Re-import (s dotazem na existující data)
POST   /api/projects/[id]/floorplan/reimport
       Body: { sourceId, strategy: "replace"|"new-version"|"merge" }
       Response: { ... }

# Layer mapping (uložení user konfigurace)
GET    /api/projects/[id]/floorplan/layer-mappings
       Response: { mappings: [...] }

PATCH  /api/projects/[id]/floorplan/layer-mappings
       Body: { mappings: { dxfLayer: ourLayer, ... } }
       Response: { mappings }
```

### 7.4 Komponenty (UI)

```
src/components/tabs/floorplan/
├── floorplan-tab.tsx              # Hlavní komponenta tabu
├── floorplan-canvas.tsx           # SVG renderer (top + side view)
├── floorplan-toolbar.tsx          # Toolbar (floor switcher, layers, mode)
├── floorplan-side-panel.tsx        # Detail elementu + propojení
├── floorplan-import-dialog.tsx     # DXF import dialog
├── floorplan-layer-filter.tsx      # Filter vrstev
├── floorplan-element-shape.tsx     # Render jedné entity (SVG)
├── floorplan-budget-linker.tsx    # Propojení s BudgetItem (N:M)
├── floorplan-edit-lock.tsx         # Edit mode lock indicator
└── floorplan-skeleton.tsx          # Loading skeleton

src/components/tabs/floorplan-tab.tsx  # Vstupní bod (lazy-loaded z project-detail.tsx)
```

### 7.5 Knihovny

```
Nové dependencies:
  - dxf-parser    (MIT, 192KB)  — parsuje DXF soubory
  - @vercel/blob  (MIT)          — upload DXF souborů do Blob storage
```

Žádné další knihovny. SVG rendering čistý React. Žádný Three.js (3D zamítnut).

---

## 8. Implementační fáze

### Fáze 0 — Příprava (1 den)

- [ ] Schválit finální odpovědi Q31–Q40
- [ ] Vytvořit feature branch `feat/floorplan-module`
- [ ] Nainstalovat `dxf-parser`, `@vercel/blob`
- [ ] Nastavit Vercel Blob storage
- [ ] Vytvořit Prisma migration (additive only)
- [ ] Spustit `prisma db push` (lokálně + Vercel)

### Fáze 1 — POC: Import + read-only (5 dní)

- [ ] **Datový model** — Prisma schema (FloorplanFloor, FloorplanElement, FloorplanSource)
- [ ] **API: POST /import** — DXF upload + parsing + uložení elementů
- [ ] **API: GET /floorplan** — vrátí floors + elements
- [ ] **UI: FloorplanTab** — nový tab v sidebar (lazy-loaded)
- [ ] **UI: FloorplanCanvas** — SVG renderer (jen top view, read-only)
- [ ] **UI: Import dialog** — upload DXF, výběr patra, layer mapping
- [ ] **UI: Layer filter** — toggle vrstev (structural, electrical, ...)
- [ ] **UI: Floor switcher** — přepínač pater
- [ ] **i18n** — kópie cs/en

**K.O. kritérium:** DXF se naimportuje, půdorys se vykreslí, vrstvy se filtrují.

### Fáze 2 — Propojení s BudgetItem (3 dny)

- [ ] **Datový model** — FloorplanElementBudgetItem junction table
- [ ] **API: POST /links** — propojení element ↔ BudgetItem (N:M)
- [ ] **API: DELETE /links/[id]** — zrušení propojení (double-opt-in dialog)
- [ ] **UI: Side panel** — detail elementu + propojené BudgetItem
- [ ] **UI: BudgetItem dropdown** — výběr z existujících items
- [ ] **UI: Stavový režim** — toggle Geometrie / Stav (zelená/oranžová/červená)
- [ ] **UI: Smazání elementu** — double-opt-in dialog (co s propojenými BudgetItem)

**K.O. kritérium:** Klik na prvek → přiřadím BudgetItem → stav se změní barevně.

### Fáze 3 — Side view (nárys) (2 dny)

- [ ] **UI: Section 2** — druhá sekce pod půdorysem
- [ ] **UI: FloorplanCanvas viewType="elevation"** — render nárysu
- [ ] **API: GET /floorplan?viewType=elevation** — vrátí elevation elements
- [ ] **UI: Propojení top ↔ side** — klik v top view zvýrazní v side view
- [ ] **DXF import pro elevation** — samostatný DXF nebo stejný soubor

**K.O. kritérium:** Nárys se zobrazí + klik propojí s půdorysem.

### Fáze 4 — Editace geometrie (5 dní)

- [ ] **Edit mode lock** — FloorplanEditLock + API
- [ ] **UI: Edit mode toggle** — přepínač Read / Edit
- [ ] **UI: Drag elementu** — posun celého prvku
- [ ] **UI: Resize handles** — změna velikosti ( handles na rozích)
- [ ] **UI: Add vertex** — přidání bodu polyline (budoucnost — pro POC ne)
- [ ] **UI: Draw new element** — kreslení od nuly (budoucnost)
- [ ] **API: PATCH /elements/[id]** — update geometrie
- [ ] **API: POST /elements** — vytvoření nového
- [ ] **Audit log** — logChanges pro FloorplanElement

**K.O. kritérium:** Přetáhnu zeď → uloží se → reload ukazuje novou pozici.

### Fáze 5 — Kompozitní prvky + vrstvy (4 dny)

- [ ] **UI: Add layer dialog** — přidat vrstvu izolace/omítky ke zdi
- [ ] **UI: Layer list v side panelu** — seznam vrstev s materiálem + tloušťkou
- [ ] **UI: Remove layer** — odebrat vrstvu (double-opt-in)
- [ ] **UI: Add opening** — přidat okno/dveře do zdi
- [ ] **API: POST /elements s parentId** — child element
- [ ] **API: DELETE /elements/[id] s cascade** — smazání rodiče = smazání dětí

**K.O. kritérium:** Přidám izolaci ke zdi → má vlastní BudgetItem → cena se započítá.

### Fáze 6 — Rozvodné sítě (4 dny)

- [ ] **Layer: electrical** — kabely, zásuvky, vypínače, osvětlení
- [ ] **Layer: data** — LAN, smart home senzory, termostaty
- [ ] **Layer: plumbing** — studená/teplá voda, odpady
- [ ] **Layer: gas** — plynové rozvody
- [ ] **UI: Layer filter** — zap/vyp vrstvy
- [ ] **UI: Appliance connection** — propojení spotřebič ↔ rozvod (N:M s rolí "connection")
- [ ] **UI: Connection visualization** — čára mezi spotřebičem a rozvodním bodem

**K.O. kritérium:** Vedu kabel od rozvaděče k lednici → propojím s BudgetItem "Elektřina kuchyně".

### Fáze 7 — Produkční vylepšení (volitelné)

- [ ] Export do DXF / SVG / PDF
- [ ] Verzování půdorysu (snapshoty)
- [ ] Mobilní read-only zobrazení
- [ ] Multi-user souběžná editace (WebSocket)
- [ ] Audit log granularity (konfigurovatelné)
- [ ] Performance optimalizace (virtuální render)
- [ ] Terén / zahrada / exteriér
- [ ] Kuchyňské spotřebiče (lednice, sporák, myčka)
- [ ] Chytrá domácnost (senzory, žaluzie, termostaty)

---

## 9. Rizika a mitigace

| Riziko | Pravděpodobnost | Dopad | Mitigace |
|---|---|---|---|
| **Rozbití existujících dat** | Nízká | Katastrofální | Additive migrace, žádné ALTER existujících tabulek, feature flag |
| **DXF parser neumí některé entity** | Střední | Střední | dxf-parser podporuje běžné entity, unknown entity → fallback na "annotation" |
| **Vercel Blob storage limit** | Nízká | Nízký | Free 1GB = ~200 DXF souborů, upgrade na Pro při potřebě |
| **Performance 2000+ prvků** | Střední | Střední | SVG virtualizace (render jen visible), lazy-load pater |
| **Edit mode lock zasekne** | Střední | Střední | Timeout 30 min, manuální release tlačítko |
| **N:M junction table komplexita** | Střední | Střední | Indexy, query optimalizace, paginace |
| **Layer mapping user neumí** | Vysoká | Střední | Default mapping + UI průvodce |
| **Side view bez DXF** | Vysoká | Střední | User kreslí elevation ručně (Fáze 4) nebo import samostatný DXF |
| **DXF re-import ztratí úpravy** | Vysoká | Vysoký | Double-opt-in dialog + verzování (snapshot před re-importem) |
| **Mobilní zobrazení** | Vysoká | Střední | Read-only na mobilu, edit desktop-only |

---

## 10. Testovací strategie

### 10.1 Regression test (existující funkcionalita)

Před merge každé fáze:
- [ ] Všechny existující taby fungují (Budget, Payments, Time, Contacts, Timeline, Notes, Management, Telemetry)
- [ ] Audit log se zapisuje pro existující entity
- [ ] Snapshot funguje pro rozpočet
- [ ] Import/Export JSON funguje
- [ ] Auth + role check fungují
- [ ] Cizí projekty nejsou viditelné

### 10.2 Půdorys modul test

- [ ] DXF import — malý soubor (< 100 entit)
- [ ] DXF import — velký soubor (> 1000 entit)
- [ ] DXF import — neplatný soubor (error handling)
- [ ] DXF re-import — double-opt-in dialog
- [ ] Edit mode lock — acquire / release / timeout
- [ ] N:M propojení — více BudgetItem na jeden element
- [ ] N:M propojení — více elementů na jeden BudgetItem
- [ ] Smazání elementu — double-opt-in
- [ ] Smazání BudgetItem — reference se zruší (SetNull)
- [ ] Side view — nezávislý DXF
- [ ] Side view — propojení s top view
- [ ] Vrstvy — filter
- [ ] Vrstvy — přidat izolaci
- [ ] Performance — 2000 prvků (FPS > 30)

### 10.3 Datový test (nulový dopad)

```sql
-- Před migrací
SELECT COUNT(*) FROM budget_items;  -- zapis číslo
SELECT COUNT(*) FROM payments;
SELECT COUNT(*) FROM projects;

-- Po migraci (additive only)
SELECT COUNT(*) FROM budget_items;  -- musí být stejné
SELECT COUNT(*) FROM payments;
SELECT COUNT(*) FROM projects;

-- Nové tabulky existují
SELECT * FROM floorplan_floors;  -- prázdné
SELECT * FROM floorplan_elements;  -- prázdné
```

---

## 11. Rollback plán

Pokud POC failne nebo rozbije něco:

### 11.1 Rollback kódu
```bash
git revert <commit-hash>  # revert změn
# nebo
git checkout main         # zpět na main bez modulu
```

### 11.2 Rollback dat (Pokud nové tabulky způsobí problémy)

```sql
-- Nové tabulky jsou prázdné (pokud nic neimportovali), bezpečné smazat:
DROP TABLE IF EXISTS floorplan_element_budget_items;
DROP TABLE IF EXISTS floorplan_elements;
DROP TABLE IF EXISTS floorplan_sources;
DROP TABLE IF EXISTS floorplan_edit_locks;
DROP TABLE IF EXISTS floorplan_floors;

-- BudgetItem zůstává beze změny (jen jsme přidali relaci, která je teď prázdná)
```

### 11.3 Rollback feature flag

```ts
// V src/lib/navigation.tsx — zakomentovat nový tab
// { id: "floorplan", labelKey: "floorplan", icon: Ruler, section: "organization", minRole: "owner" },
```

---

## 12. Open questions checklist (Q31–Q40)

Tyto otázky potřebujeme odpovědět PŘED začátkem implementace:

- [ ] **Q31** Side view reprezentace — (a)/(b)/(c)/(d)?
- [ ] **Q32** Side view propojení s top view — (a)/(b)/(c)?
- [ ] **Q33** N:M junction table `FloorplanElementBudgetItem` — souhlas?
- [ ] **Q34** Edit mode lock — (a)/(b)/(c)/(d)?
- [ ] **Q35** Verzování půdorysu — (a)/(b)/(c)?
- [ ] **Q36** Více DXF organizace — (a)/(b)/(c)?
- [ ] **Q37** Audit log granularity — (a)/(b)/(c)?
- [ ] **Q38** Barevné schéma vrstev — souhlas s návrhem?
- [ ] **Q39** Stavový režim toggle — (a)/(b)/(c)?
- [ ] **Q40** Side view propojení s BudgetItem — (a)/(b)/(c)?
- [ ] **Q8** Kompozitní prvky — schválení Varianty C (hybrid)?
- [ ] **Q9** Okna/dveře jako child element — schválení?

---

## 13. Další otázky (pro budoucí fáze)

Tyto neblokují implementaci, ale budou potřeba později:

- Q41. Kuchyňské spotřebiče — jaké typy? (lednice, sporák, myčka, pračka, sušička, dřez, varná deska, trouba, mikrovlnka, kávovar, myčka nádobí)
- Q42. Smart home — jaké senzory? (pohyb, teplota, vlhkost, CO2, otevření okna, kouř, zaplavení)
- Q43. Chytré žaluzie — typy? (venkovní, interiérové, lamelové, látkové)
- Q44. Terén — prvky? (plot, brána, příjezdová cesta, trávník, záhony, stromy, altán, skleník, bazén, jezírko, studna, jímák)
- Q45. Export — formáty? (DXF, SVG, PDF, PNG)
- Q46. Multi-user editace — algoritmus konfliktu? (CRDT, OT, last-write-wins)
- Q47. Mobilní zobrazení — pouze read-only, nebo i partial edit?
- Q48. Audit log — jak dlouho uchovávat? (90 dní, 1 rok, navždy)

---

## 14. Příští kroky

1. **Vy** odpovíte na Q31–Q40 + schválíte Q8 (Variantu C) a Q9 (child element)
2. **My** aktualizujeme tento dokument (status: Schváleno)
3. **My** vytvoříme feature branch `feat/floorplan-module`
4. **My** implementujeme Fázi 0 (příprava)
5. **My** implementujeme Fázi 1 (POC)
6. **Vy** otestujete POC
7. **My** pokračujeme Fází 2+

---

## Historie změn

| Datum | Změna | Autor |
|---|---|---|
| 2025-10-30 | Vytvoření dokumentu, Q1–Q30 odpovědi, Q31–Q40 otázky | AI asistent |
| 2025-10-30 | Přidán side view (nárys) požadavek | Lukáš Hanzlík |
