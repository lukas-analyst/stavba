# Modul "Půdorys objektu" — implementační plán (POC → Produkce)

> **Status:** Schváleno pro implementaci (Phase 0)
> **Datum:** 2025-10-31
> **Poslední aktualizace:** 2025-10-31
> **Autor:** Lukáš Hanzlík + AI asistent
> **Schváleno:** ✅ Ano (všechny Q1–Q40 odpovězeny)

---

## 1. Exekutivní shrnutí

Modul "Půdorys objektu" přidá do aplikace **vizuální nástroj** pro správu rekonstrukce nemovitosti. Uživatel importuje profesionální půdorys z CAD (DXF formát), vidí vizuální 2D pohled shora (půdorys) + pohled z boku (nárys), může interaktivně upravit jednotlivé prvky (zdi, okna, rozvody) a propojit je s položkami rozpočtu (BudgetItem).

**Klíčové principy:**
1. **Nulový dopad na existující funkcionalitu** — modul je izolovaný, lazy-loaded, additive migrace
2. **Inkrementální vývoj** — POC → Fáze 1 → Fáze 2 → ...
3. **MD3 design konzistentní** se zbytkem aplikace
4. **DXF jako zdroj** (DWG zamítnut — žádná MIT knihovna)
5. **N:M propojení** BudgetItem ↔ FloorplanElement (mnoho k mnoha) přes junction table
6. **Side view (nárys)** — druhá sekce pod půdorysem, nezávislé na top view
7. **Kompozitní prvky** — zeď = parent, vrstvy/okna/dveře/instalace = children (Q8 Varianta C)
8. **Okna/dveře jako child elementy** pod zdí (Q9 varianta c)

---

## 2. Rozhodnutí log (Q1–Q40)

| # | Otázka | Rozhodnutí | Poznámka |
|---|---|---|---|
| Q1 | Formát | **Pouze DXF** | PDF / ruční kresba později |
| Q2 | Soubory na projekt | **Jeden i více** | záleží na uživateli |
| Q3 | Re-import | **Zeptat se uživatele** | double-opt-in s vysvětlením dopadů |
| Q4 | Velikost souboru | **Variabilní** | řešeno případ od případu |
| Q5 | Stránka | **Nový tab v Sidebar** | `id: "floorplan"` |
| Q6 | Role přístup | **Owner + Admin** | viewer v budoucnu |
| Q7 | minRole | **`"owner"`** | admin bypass (existující mechanismus) |
| Q8 | Kompozitní prvky | **✅ Varianta C (hybrid)** | parent + children + junction table |
| Q9 | Okna/dveře | **✅ Child element pod zdí** | `parentId = wall.id` |
| Q10 | Editace POC | **Jednoduchá v POC** | budoucnost: drag, resize, vertex, kreslení |
| Q11 | Přidat vrstvu izolace | **Ano** | interaktivně ke stávající zdi |
| Q12 | Rozvody detail | **C — trasy + body + napojení na spotřebiče** | propojení spotřebič ↔ rozvod |
| Q13 | Datové rozvody | **Od začátku** | smart home od POC |
| Q14 | Kuchyňské spotřebiče | **Budoucnost (ne POC)** | |
| Q15 | Spotřebiče model | **Jeden element + metadata** | napojení v `metadata` |
| Q16 | Vztah BudgetItem ↔ Element | **N:M (mnoho k mnoha)** | junction table s `role` |
| Q17 | Auto-vytvoření BudgetItem při importu | **NE** | user přiřazuje ručně, vždy se ptát |
| Q18 | Mazání elementu | **Zeptat se uživatele** | double-opt-in |
| Q19 | Mazání BudgetItem | **Zeptat se uživatele** | double-opt-in (SetNull default) |
| Q20 | Stropy/podlahy | **Samostatný element s metadaty** | type: "ceiling" / "floor" |
| Q21 | Střecha | **C — top view + metadata** | sklon, orientace, materiál |
| Q22 | Terén | **Samostatná floor** | level: -100, type: outdoor |
| Q23 | Exteriér v POC | **Ne** | budoucnost s rozvody sítí |
| Q24 | Více DXF | **Ano, více souborů** | jeden DXF může obsahovat i více pater |
| Q25 | K.O. kritérium POC | **Organicky** | |
| Q26 | Vizuální styl | **MD3 design** | konzistentní |
| Q27 | Barevné schéma | **Stejné jako zbytek app** | PHASE_COLORS |
| Q28 | Zobrazení stavu | **Toggle** | půdorys as-is ↔ stav rekonstrukce |
| Q29 | Počet prvků | **C — 500–2000** | větší rekonstrukce, i malé garáže |
| Q30 | Souběžná editace | **Ne v POC** | edit-lock uživatelem |
| Q31 | Side view reprezentace | **2 samostatné DXF soubory** | jeden pro plan, druhý pro elevation |
| Q32 | Side view propojení s top | **Ano — klik zvýrazní v obou** | (a) |
| Q33 | Junction table | **✅ Ano, schváleno** | `FloorplanElementBudgetItem` |
| Q34 | Edit mode lock | **User klikne "Uložit" → odemkne** | explicitní uložení |
| Q35 | Verzování půdorysu | **Nechat na uživateli** | user se rozhodne |
| Q36 | DXF detekce pater | **NE — user importuje jako 1 patro** | auto-detekce v budoucnosti |
| Q37 | Audit log granularity | **Bez drag event, ale úpravy ano** | loguje pouze save akce |
| Q38 | Barevné schéma vrstev | **✅ Schváleno** | viz sekce 7 |
| Q39 | Stavový režim toggle | **Button** | (a) |
| Q40 | Side view propojení s BudgetItem | **Nezávislé na top view** | (a) |

---

## 3. Architektura — komponenty vysoké úrovně

```
┌─────────────────────────────────────────────────────────┐
│ Sidebar                                                 │
│  - Portfolio, Dashboard, Budget, Payments, Time        │
│  - Contacts, Timeline, Notes                            │
│  - Management, Telemetry                                │
│  - PŮDORYS (nový) ← minRole: "owner"                   │
│  - Admin (isAdmin)                                      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ FloorplanTab (lazy-loaded)                              │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Toolbar                                             │ │
│ │  - Floor switcher (Přízemí / 1.patro / Sklep)       │ │
│ │  - View type (Plan / Elevation)                     │ │
│ │  - View mode toggle (Geometrie / Stav) — button     │ │
│ │  - Layer filter (structural / electrical / ...)       │ │
│ │  - Edit mode toggle (Read-only / Edit)              │ │
│ │  - Import DXF button                                │ │
│ │  - Save button (odemkne edit mode pro ostatní)      │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Section 1: PŮDORYS (Top view, viewType="plan")     │ │
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
│ │ Section 2: NÁRYS (Side view, viewType="elevation")  │ │
│ │  <FloorplanCanvas                                    │ │
│ │    viewType="elevation"                              │ │
│ │    floorId={selectedFloorId}                          │ │
│ │    elements={...}  // nezávislé (Q40)                │ │
│ │    layers={visibleLayers}                            │ │
│ │    mode={viewMode}                                    │ │
│ │    editMode={editMode}                                │ │
│ │    onElementClick={...}                              │ │
│ │  />                                                  │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Side panel (pravý sloupec)                           │ │
│ │  - Detail vybraného elementu                         │ │
│ │  - Vrstvy (materiály, tloušťka) — children          │ │
│ │  - Propojené BudgetItem (N:M junction)               │ │
│ │  - Stav (completed / rejected)                        │ │
│ │  - Akce: Přidat vrstvu, Odebrat, Přiřadit BudgetItem │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Datový model — finální Prisma schéma

### 4.1 Nové tabulky (additive — nezasahují do existujících)

```prisma
// ============================================================
// FLOORPLAN MODULE — nové tabulky (additive, nezasahují do existujících)
// Všechny modely mají @map("floorplan_*") — konzistentní prefix
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
  @@index([projectId, viewType])
  @@map("floorplan_floors")
}

model FloorplanElement {
  id            String   @id @default(cuid())
  floorId       String
  floor         FloorplanFloor @relation(fields: [floorId], references: [id], onDelete: Cascade)
  projectId     String   // denormalizováno pro snadné query
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  // Hierarchie — kompozitní prvky (Q8 Varianta C)
  // zeď (parent) → vrstvy, okna, dveře, instalace (children)
  parentId      String?
  parent        FloorplanElement? @relation("FloorplanElementHierarchy", fields: [parentId], references: [id], onDelete: Cascade)
  children      FloorplanElement[] @relation("FloorplanElementHierarchy")

  // Typ elementu (Q9 — okna/dveře jsou child elements)
  type          String   // "wall", "window", "door", "room", "stairs",
                         // "chimney", "column", "ceiling", "floor", "roof",
                         // "cable", "pipe", "drain", "outlet", "switch",
                         // "light", "sensor", "appliance", "tree", "fence",
                         // "annotation", "layer", ...
                         // "layer" = materiálová vrstva (izolace, omítka, fólie)

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

  // Metadata (materiál zdi, typ okna, průměr trubky, sklon střechy, ...)
  metadata      String?  // JSON

  sortOrder     Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // Relace (N:M propojení s BudgetItem)
  budgetItemLinks FloorplanElementBudgetItem[]

  @@index([floorId])
  @@index([projectId])
  @@index([parentId])
  @@index([layer])
  @@index([type])
  @@index([projectId, layer])
  @@index([projectId, type])
  @@map("floorplan_elements")
}

model FloorplanElementBudgetItem {
  // Junction table pro N:M vztah (Q16, Q33)
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
  floorId       String?  // do kterého patra patří (null = nezařazeno)
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
  // Edit mode lock (Q30, Q34) — blokuje souběžnou editaci
  // Lock se uvolní, když user klikne "Uložit" (explicitní akce)
  id            String   @id @default(cuid())
  projectId     String
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  userId        String   // kdo drží lock
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  acquiredAt    DateTime @default(now())
  expiresAt     DateTime  // timeout fallback (např. now + 30 min)

  @@index([projectId])
  @@unique([projectId])  // jeden lock na projekt
  @@map("floorplan_edit_locks")
}
```

### 4.2 Změny v existujících modelech (pouze přidání relace)

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

### 4.3 Garance nulového dopadu

| Aspekt | Záruka |
|---|---|
| Existující tabulky | ✅ Žádné změny struktury |
| Existující pole v BudgetItem | ✅ Žádné nové sloupce (jen virtuální relace) |
| Existující API endpoints | ✅ Žádné změny |
| Migrace | ✅ Additive only (jen CREATE TABLE) |
| Rollback | ✅ DROP TABLE nových tabulek (existující netknuty) |

---

## 5. API specifikace

### 5.1 DXF import

```
POST /api/projects/[id]/floorplan/import
  Auth: requireProjectAccess(id, "owner")
  Body: multipart/form-data
    - file: .dxf soubor (binary)
    - floorId?: String (existující floor, kam importovat)
    - floorName?: String (pokud vytváříme nové patro)
    - floorLevel?: Int
    - viewType?: "plan" | "elevation" (default "plan")
    - layerMappings?: JSON (override default mapping)
  Response 201:
    {
      floorId: String,
      sourceId: String,
      elementCount: Int,
      layers: String[],  // detekované DXF vrstvy
      unmappedLayers: String[],  // vrstvy bez default mappingu
    }
  Response 400: { error: "Invalid DXF file" }
  Response 413: { error: "File too large (max 10MB)" }
```

### 5.2 Načtení půdorysu

```
GET /api/projects/[id]/floorplan
  Auth: requireProjectAccess(id, "viewer")
  Query: ?floorId=xxx&viewType=plan|elevation
  Response 200:
    {
      floors: [
        { id, name, level, sortOrder, viewType, _count: { elements } }
      ],
      elements: [
        { id, floorId, parentId, type, layer, x, y, width, height,
          rotation, points, metadata, budgetItemLinks: [...] }
      ],
      sources: [
        { id, fileName, fileSize, importedAt, entityCount }
      ],
      layerMappings: { ... },
    }
```

### 5.3 Editace elementu

```
PATCH /api/projects/[id]/floorplan/elements/[elementId]
  Auth: requireProjectAccess(id, "owner") + edit lock check
  Body:
    {
      x?: Float, y?: Float, width?: Float, height?: Float,
      rotation?: Float, points?: String,
      type?: String, layer?: String, metadata?: String,
      sortOrder?: Int
    }
  Response 200: { element }
  Response 409: { error: "Edit lock held by another user" }
```

### 5.4 Vytvoření elementu

```
POST /api/projects/[id]/floorplan/elements
  Auth: requireProjectAccess(id, "owner") + edit lock check
  Body:
    {
      floorId: String,
      parentId?: String,  // child element (Q9)
      type: String,
      layer: String,
      x: Float, y: Float,
      width?: Float, height?: Float,
      rotation?: Float, points?: String,
      metadata?: String
    }
  Response 201: { element }
```

### 5.5 Smazání elementu (double-opt-in)

```
DELETE /api/projects/[id]/floorplan/elements/[elementId]
  Auth: requireProjectAccess(id, "owner") + edit lock check
  Query: ?confirm=true (double-opt-in)
  Response 200 (bez confirm):
    {
      requiresConfirmation: true,
      element: { ... },
      linkedBudgetItems: [{ id, subcategory, role }],
      childrenCount: Int
    }
  Response 200 (s confirm=true):
    { deleted: true, deletedChildren: Int, unlinkedBudgetItems: Int }
```

### 5.6 Propojení element ↔ BudgetItem (N:M)

```
POST /api/projects/[id]/floorplan/elements/[elementId]/links
  Auth: requireProjectAccess(id, "owner") + edit lock check
  Body:
    {
      budgetItemId: String,
      role: "primary" | "layer" | "appliance" | "connection",
      metadata?: String
    }
  Response 201: { link }

DELETE /api/projects/[id]/floorplan/elements/[elementId]/links/[linkId]
  Auth: requireProjectAccess(id, "owner") + edit lock check
  Query: ?confirm=true (double-opt-in)
  Response 200 (bez confirm):
    { requiresConfirmation: true, link: {...} }
  Response 200 (s confirm=true):
    { deleted: true }
```

### 5.7 Edit mode lock (Q34)

```
POST /api/projects/[id]/floorplan/lock
  Auth: requireProjectAccess(id, "owner")
  Response 201: { lockId, expiresAt }
  Response 409: { error: "Lock held by another user", heldBy: {...} }

DELETE /api/projects/[id]/floorplan/lock
  Auth: requireProjectAccess(id, "owner")
  Response 200: { released: true }
```

### 5.8 Re-import (Q3)

```
POST /api/projects/[id]/floorplan/reimport
  Auth: requireProjectAccess(id, "owner")
  Body:
    {
      sourceId: String,
      strategy: "replace" | "new-version" | "merge",
      // "replace" — smazat existující elements, naimportovat znovu
      // "new-version" — vytvořit novou verzi, zachovat starou
      // "merge" — zachovat existující elements, přidat nové
    }
  Query: ?confirm=true (double-opt-in)
  Response 200 (bez confirm):
    {
      requiresConfirmation: true,
      existingElements: Int,
      existingBudgetLinks: Int,
      impactSummary: "..."
    }
  Response 200 (s confirm=true):
    { reimported: true, newElementCount: Int, ... }
```

### 5.9 Floor management

```
POST /api/projects/[id]/floorplan/floors
  Auth: requireProjectAccess(id, "owner")
  Body: { name, level, viewType }
  Response 201: { floor }

PATCH /api/projects/[id]/floorplan/floors/[floorId]
  Body: { name?, level?, sortOrder? }
  Response 200: { floor }

DELETE /api/projects/[id]/floorplan/floors/[floorId]
  Query: ?confirm=true (double-opt-in)
  Response 200 (bez confirm):
    { requiresConfirmation: true, elementsCount: Int, sourcesCount: Int }
  Response 200 (s confirm=true):
    { deleted: true }
```

### 5.10 Layer mapping

```
GET /api/projects/[id]/floorplan/layer-mappings
  Response 200: { mappings: { dxfLayer: ourLayer, ... } }

PATCH /api/projects/[id]/floorplan/layer-mappings
  Body: { mappings: { dxfLayer: ourLayer, ... } }
  Response 200: { mappings }
```

---

## 6. UI komponenty

```
src/components/tabs/floorplan/
├── floorplan-tab.tsx              # Hlavní komponenta tabu
├── floorplan-canvas.tsx           # SVG renderer (top + side view)
├── floorplan-toolbar.tsx          # Toolbar (floor switcher, layers, mode)
├── floorplan-side-panel.tsx       # Detail elementu + propojení
├── floorplan-import-dialog.tsx    # DXF import dialog
├── floorplan-layer-filter.tsx     # Filter vrstev
├── floorplan-element-shape.tsx    # Render jedné entity (SVG)
├── floorplan-budget-linker.tsx    # Propojení s BudgetItem (N:M)
├── floorplan-edit-lock-banner.tsx # Edit mode lock indicator
└── floorplan-skeleton.tsx         # Loading skeleton

src/lib/floorplan/
├── layer-mapping.ts               # Default DXF→layer mapping
├── types.ts                       # TypeScript typy
├── dxf-parser.ts                  # Wrapper kolem dxf-parser
└── api.ts                         # React Query hooks (useFloorplan, useUpdateElement, ...)

src/app/api/projects/[id]/floorplan/
├── import/route.ts
├── elements/[elementId]/route.ts
├── elements/[elementId]/links/route.ts
├── elements/[elementId]/links/[linkId]/route.ts
├── floors/route.ts
├── floors/[floorId]/route.ts
├── lock/route.ts
├── reimport/route.ts
├── layer-mappings/route.ts
└── route.ts                       # GET /floorplan
```

---

## 7. Barevné schéma vrstev (Q38)

| Vrstva | Tailwind token | Hex | Popis |
|---|---|---|---|
| `structural` | `bg-muted` | šedá | Zdi, dveře, okna, schody, komín |
| `electrical` | `bg-warning` | žlutá | Kabely, zásuvky, osvětlení |
| `data` | `bg-info` | modrá | LAN, smart home senzory |
| `plumbing` | `bg-info-soft` | azurová | Studená/teplá voda |
| `gas` | `bg-warning-soft` | oranžová | Plynové rozvody |
| `drainage` | `bg-muted-foreground` | hnědá | Odpady, kanalizace |
| `terrain` | `bg-success` | zelená | Plot, zahrada, stromy |
| `annotation` | `bg-background` | bílá | Texty, rozměry, šipky |

---

## 8. DXF layer mapping (default)

```ts
// src/lib/floorplan/layer-mapping.ts
export const DEFAULT_LAYER_MAPPING: Record<string, { layer: string; type: string }> = {
  // Stavební prvky
  "A-WALL": { layer: "structural", type: "wall" },
  "A-DOOR": { layer: "structural", type: "door" },
  "A-WIND": { layer: "structural", type: "window" },
  "A-FLOR": { layer: "structural", type: "floor" },
  "A-ROOF": { layer: "structural", type: "roof" },
  "A-STAIR": { layer: "structural", type: "stairs" },
  "A-CLNG": { layer: "structural", type: "ceiling" },
  // Rozvodné sítě
  "E-LITE": { layer: "electrical", type: "light" },
  "E-POWR": { layer: "electrical", type: "outlet" },
  "E-DATA": { layer: "data", type: "data" },
  "P-COLD": { layer: "plumbing", type: "pipe-cold" },
  "P-HOT": { layer: "plumbing", type: "pipe-hot" },
  "P-DRAIN": { layer: "drainage", type: "drain" },
  "P-GAS": { layer: "gas", type: "pipe-gas" },
  // Terén
  "Q-BOUND": { layer: "terrain", type: "boundary" },
  "Q-PATH": { layer: "terrain", type: "path" },
};
```

---

## 9. Implementační fáze (detailní)

### Fáze 0 — Příprava (1 den)

- [ ] Vytvořit feature branch `feat/floorplan-module`
- [ ] Nainstalovat dependencies:
  ```bash
  bun add dxf-parser @vercel/blob
  ```
- [ ] Nastavit Vercel Blob storage (env vars)
- [ ] Vytvořit Prisma migration (additive only):
  ```bash
  bun run db:push
  ```
- [ ] Vytvořit prázdné soubory komponent + API routes (stubs)
- [ ] Přidat tab do `NAV_ITEMS` (s feature flag)

### Fáze 1 — POC: Import + read-only (5 dní)

**Den 1: Datový model + API skeleton**
- [ ] Přidat nové modely do `prisma/schema.prisma`
- [ ] Přidat relace na BudgetItem, Project, User
- [ ] Spustit `bun run db:push`
- [ ] Vytvořit API route stubs (vracejí 501 Not Implemented)
- [ ] Přidat tab "Půdorys" do `NAV_ITEMS` + `ProjectDetail`

**Den 2: DXF import pipeline**
- [ ] Implementovat `POST /api/projects/[id]/floorplan/import`
- [ ] Upload DXF do Vercel Blob
- [ ] Parse pomocí `dxf-parser`
- [ ] Layer mapping (default + user override)
- [ ] Vytvořit `FloorplanFloor` + `FloorplanElement[]`
- [ ] Uložit `FloorplanSource` (záloha)

**Den 3: GET endpoint + React Query**
- [ ] Implementovat `GET /api/projects/[id]/floorplan`
- [ ] Vytvořit `src/lib/floorplan/api.ts` — React Query hooks
- [ ] `useFloorplan(projectId)` — načte floors + elements
- [ ] `useImportFloorplan()` — mutation pro import

**Den 4: SVG renderer**
- [ ] Vytvořit `floorplan-canvas.tsx` — SVG renderer
- [ ] Render LINE, CIRCLE, ARC, LWPOLYLINE, TEXT, INSERT
- [ ] Zoom/pan přes `viewBox`
- [ ] Layer filter (toggle vrstev)
- [ ] Floor switcher (přepínač pater)

**Den 5: UI + i18n**
- [ ] `floorplan-tab.tsx` — hlavní layout (toolbar + canvas + side panel)
- [ ] `floorplan-import-dialog.tsx` — upload DXF
- [ ] `floorplan-layer-filter.tsx` — toggle vrstev
- [ ] `floorplan-skeleton.tsx` — loading
- [ ] i18n kópie (cs/en)
- [ ] Lint + test na localhost

### Fáze 2 — Propojení s BudgetItem (3 dny)

- [ ] Junction table `FloorplanElementBudgetItem`
- [ ] API: `POST/DELETE /elements/[elementId]/links`
- [ ] UI: Side panel — detail elementu + propojené BudgetItem
- [ ] UI: Dropdown výběr BudgetItem (z existujících v projektu)
- [ ] UI: Stavový režim toggle (button)
- [ ] UI: Smazání elementu — double-opt-in dialog
- [ ] UI: Smazání propojení — double-opt-in dialog

### Fáze 3 — Side view (nárys) (2 dny)

- [ ] UI: Section 2 pod půdorysem
- [ ] `FloorplanCanvas viewType="elevation"`
- [ ] API: `GET /floorplan?viewType=elevation`
- [ ] UI: Propojení top ↔ side — klik zvýrazní v obou (Q32)
- [ ] DXF import pro elevation (samostatný soubor, Q31)

### Fáze 4 — Editace geometrie (5 dní)

- [ ] Edit mode lock (Q34 — user uloží → odemkne)
- [ ] UI: Edit mode toggle
- [ ] UI: Drag elementu (posun)
- [ ] UI: Resize handles
- [ ] API: `PATCH /elements/[elementId]`
- [ ] API: `POST /elements` (nový)
- [ ] Audit log (Q37 — bez drag, ale úpravy ano)

### Fáze 5 — Kompozitní prvky + vrstvy (4 dny)

- [ ] UI: Add layer dialog (izolace, omítka, fólie)
- [ ] UI: Layer list v side panelu
- [ ] UI: Remove layer (double-opt-in)
- [ ] UI: Add opening (okno/dveře do zdi)
- [ ] API: `POST /elements` s `parentId`

### Fáze 6 — Rozvodné sítě (4 dny)

- [ ] Layer `electrical` (kabely, zásuvky, vypínače, osvětlení)
- [ ] Layer `data` (LAN, smart home senzory)
- [ ] Layer `plumbing` (studená/teplá voda, odpady)
- [ ] Layer `gas` (plynové rozvody)
- [ ] UI: Layer filter (zap/vyp vrstvy)
- [ ] UI: Appliance connection (N:M s rolí "connection")

### Fáze 7 — Produkční vylepšení (volitelné)

- [ ] Export DXF / SVG / PDF
- [ ] Verzování půdorysu (snapshoty)
- [ ] Mobilní read-only
- [ ] Multi-user souběžná editace
- [ ] Terén / zahrada / exteriér
- [ ] Kuchyňské spotřebiče
- [ ] Chytrá domácnost (senzory, žaluzie)

---

## 10. Testovací strategie

### 10.1 Regression test (existující funkcionalita)

Před merge každé fáze:
- [ ] Všechny existující taby fungují
- [ ] Audit log se zapisuje pro existující entity
- [ ] Snapshot funguje pro rozpočet
- [ ] Import/Export JSON funguje
- [ ] Auth + role check fungují
- [ ] Cizí projekty nejsou viditelné

### 10.2 Datový test (nulový dopad)

```sql
-- Před migrací
SELECT COUNT(*) FROM budget_items;  -- zapis číslo
SELECT COUNT(*) FROM payments;
SELECT COUNT(*) FROM projects;

-- Po migraci (additive only)
SELECT COUNT(*) FROM budget_items;  -- musí být stejné
SELECT COUNT(*) FROM payments;
SELECT COUNT(*) FROM projects;

-- Nové tabulky existují (prázdné)
SELECT * FROM floorplan_floors LIMIT 1;  -- 0 rows
SELECT * FROM floorplan_elements LIMIT 1;  -- 0 rows
```

### 10.3 Půdorys modul test

- [ ] DXF import — malý soubor (< 100 entit)
- [ ] DXF import — velký soubor (> 1000 entit)
- [ ] DXF import — neplatný soubor (error handling)
- [ ] DXF re-import — double-opt-in dialog
- [ ] Edit mode lock — acquire / release
- [ ] N:M propojení — více BudgetItem na element
- [ ] N:M propojení — více elementů na BudgetItem
- [ ] Smazání elementu — double-opt-in
- [ ] Smazání BudgetItem — reference SetNull
- [ ] Side view — nezávislý DXF
- [ ] Side view — propojení s top view
- [ ] Vrstvy — filter
- [ ] Performance — 2000 prvků (FPS > 30)

---

## 11. Rollback plán

### 11.1 Rollback kódu

```bash
git revert <commit-hash>  # revert změn
# nebo
git checkout main         # zpět na main bez modulu
```

### 11.2 Rollback dat (nové tabulky jsou prázdné, bezpečné smazat)

```sql
DROP TABLE IF EXISTS floorplan_element_budget_items;
DROP TABLE IF EXISTS floorplan_elements;
DROP TABLE IF EXISTS floorplan_sources;
DROP TABLE IF EXISTS floorplan_edit_locks;
DROP TABLE IF EXISTS floorplan_floors;
-- BudgetItem zůstává beze změny
```

### 11.3 Rollback feature flag

```ts
// V src/lib/navigation.tsx — zakomentovat nový tab
// { id: "floorplan", labelKey: "floorplan", icon: Ruler, section: "organization", minRole: "owner" },
```

---

## 12. Nové dependencies

```
dxf-parser    (MIT, 192KB)  — parsuje DXF soubory
@vercel/blob  (MIT)          — upload DXF souborů do Blob storage
```

Žádné další knihovny. SVG rendering čistý React. Žádný Three.js (3D zamítnut).

---

## 13. Rizika a mitigace

| Riziko | Pravděpodobnost | Dopad | Mitigace |
|---|---|---|---|
| Rozbití existujících dat | Nízká | Katastrofální | Additive migrace, feature flag, regression test |
| DXF parser neumí některé entity | Střední | Střední | dxf-parser podporuje běžné entity, fallback na "annotation" |
| Vercel Blob storage limit | Nízká | Nízký | Free 1GB, upgrade na Pro při potřebě |
| Performance 2000+ prvků | Střední | Střední | SVG virtualizace, lazy-load pater |
| Edit mode lock zasekne | Střední | Střední | Timeout 30 min, manuální release |
| N:M junction table komplexita | Střední | Střední | Indexy, query optimalizace, paginace |
| DXF re-import ztratí úpravy | Vysoká | Vysoký | Double-opt-in dialog + verzování (Q35) |

---

## 14. Příští kroky

1. ✅ Všechny Q1–Q40 odpovězeny
2. ✅ Plán schválen (status: Schváleno pro implementaci)
3. ⏳ **Čeká na vaše konečné schválení spuštění Fáze 0**
4. ⏳ Vytvoření feature branch `feat/floorplan-module`
5. ⏳ Implementace Fáze 0 (příprava)
6. ⏳ Implementace Fáze 1 (POC)
7. ⏳ Test POC
8. ⏳ Pokračování Fází 2+

---

## Historie změn

| Datum | Změna | Autor |
|---|---|---|
| 2025-10-30 | Vytvoření dokumentu, Q1–Q30 odpovědi, Q31–Q40 otázky | AI asistent |
| 2025-10-30 | Přidán side view (nárys) požadavek | Lukáš Hanzlík |
| 2025-10-31 | Q31–Q40 odpovědi, schválení Q8 (C) + Q9 (c), finální plán | AI asistent + Lukáš Hanzlík |
