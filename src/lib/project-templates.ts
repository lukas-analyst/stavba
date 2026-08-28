// Project templates with pre-filled budget items for different construction types.
// Each template provides a starting set of budget categories/items that users can customize.

export type ProjectTemplate = {
  type: string;
  label: string;
  description: string;
  // For reconstruction: ask the user about the scope first
  askScope?: boolean;
  scopeOptions?: { id: string; label: string; description: string }[];
  items: TemplateItem[];
};

export type TemplateItem = {
  category: string;
  subcategory: string;
  element?: string;
  phase: string;
  required: boolean;
  note?: string;
  planCost?: number;
  flexibilityPercent?: number;
  planDays?: number;
};

// Common phases
const PRIPRAVA = "Příprava";
const DEMOLICE = "Demolice";
const HRUBA_STAVBA = "Hrubá stavba";
const ZABYDLOVANI = "Zabydlování";
const DO_BUDOUCNA = "Do budoucna";

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    type: "reconstruction",
    label: "Rekonstrukce",
    description: "Rekonstrukce existujícího domu, bytu nebo chalupy.",
    askScope: true,
    scopeOptions: [
      {
        id: "partial",
        label: "Částečná rekonstrukce",
        description: "Jen vybrané místnosti nebo systémy (např. koupelna, kuchyň, elektro)",
      },
      {
        id: "complete",
        label: "Kompletní rekonstrukce",
        description: "Celý objekt včetně hrubé stavby, instalací a dokončovacích prací",
      },
      {
        id: "structural",
        label: "Strukturní rekonstrukce",
        description: "Zásahy do nosných konstrukcí, přestavby, nástavby",
      },
    ],
    items: [
      // Příprava
      { category: "Projekt a příprava", subcategory: "Architekt - Studie", phase: PRIPRAVA, required: true, planCost: 50000, flexibilityPercent: 20, planDays: 30, note: "Architektonická studie rekonstrukce" },
      { category: "Projekt a příprava", subcategory: "Architekt - Projekt", phase: PRIPRAVA, required: true, planCost: 100000, flexibilityPercent: 20, planDays: 45, note: "Projektová dokumentace pro stavební povolení" },
      { category: "Projekt a příprava", subcategory: "Statický posudek", phase: PRIPRAVA, planCost: 25000, flexibilityPercent: 50, planDays: 14, note: "Pokud se zasahuje do nosných konstrukcí" },
      { category: "Projekt a příprava", subcategory: "Povolení na stavební úřad", phase: PRIPRAVA, planCost: 20000, flexibilityPercent: 10, planDays: 60, note: "Ohlášení stavebního úřadu nebo stavební povolení" },
      { category: "Projekt a příprava", subcategory: "Průzkum sítí", phase: PRIPRAVA, planCost: 15000, flexibilityPercent: 30, planDays: 7, note: "Průzkum stávajících inženýrských sítí" },

      // Demolice
      { category: "Demolice", subcategory: "Demoliční práce", phase: DEMOLICE, required: true, planCost: 80000, flexibilityPercent: 50, planDays: 14, note: "Odstranění stávajících konstrukcí, podlah, omítek" },
      { category: "Demolice", subcategory: "Kontejnery a odvoz", phase: DEMOLICE, required: true, planCost: 30000, flexibilityPercent: 30, planDays: 7, note: "Odvoz suti a stavebního odpadu" },

      // Hrubá stavba
      { category: "Hrubá stavba", subcategory: "Zesílení konstrukcí", phase: HRUBA_STAVBA, planCost: 80000, flexibilityPercent: 30, planDays: 21, note: "Zesílení nosných stěn a stropů (pokud potřeba)" },
      { category: "Hrubá stavba", subcategory: "Vnitřní omítky - materiál", phase: HRUBA_STAVBA, planCost: 60000, flexibilityPercent: 20, planDays: 7, note: "Maltové směsi, dodatkový materiál" },
      { category: "Hrubá stavba", subcategory: "Vnitřní omítky - práce", phase: HRUBA_STAVBA, planCost: 90000, flexibilityPercent: 15, planDays: 14 },
      { category: "Hrubá stavba", subcategory: "Podlahy - betonová místost", phase: HRUBA_STAVBA, planCost: 40000, flexibilityPercent: 20, planDays: 5, note: "Hrubé podlahy, vyrovnání" },

      // Rozvody a sítě
      { category: "Rozvody a sítě", subcategory: "Rozvody vody", phase: HRUBA_STAVBA, planCost: 50000, flexibilityPercent: 30, planDays: 7 },
      { category: "Rozvody a sítě", subcategory: "Odpadní potrubí", phase: HRUBA_STAVBA, planCost: 40000, flexibilityPercent: 25, planDays: 5 },
      { category: "Rozvody a sítě", subcategory: "Elektroinstalace", phase: HRUBA_STAVBA, planCost: 120000, flexibilityPercent: 25, planDays: 14, note: "Rozvody, zásuvky, vypínače, jističové skříně" },
      { category: "Rozvody a sítě", subcategory: "Datové rozvody", phase: HRUBA_STAVBA, planCost: 20000, flexibilityPercent: 30, planDays: 3, note: "Internet, TV, síťové rozvody" },
      { category: "Rozvody a sítě", subcategory: "Vytápění - zdroj", phase: HRUBA_STAVBA, planCost: 150000, flexibilityPercent: 40, planDays: 5, note: "Kotel/tepelne čerpadlo/podlahové topení" },

      // Zabydlování
      { category: "Zabydlování", subcategory: "Sádrokarton - materiál", phase: ZABYDLOVANI, planCost: 40000, flexibilityPercent: 20, planDays: 3 },
      { category: "Zabydlování", subcategory: "Sádrokarton - práce", phase: ZABYDLOVANI, planCost: 60000, flexibilityPercent: 15, planDays: 10 },
      { category: "Zabydlování", subcategory: "Dveře a zárubně", phase: ZABYDLOVANI, planCost: 60000, flexibilityPercent: 20, planDays: 5 },
      { category: "Zabydlování", subcategory: "Podlahové krytiny", phase: ZABYDLOVANI, planCost: 80000, flexibilityPercent: 25, planDays: 7, note: "Laminát, dlažba, koberec" },
      { category: "Zabydlování", subcategory: "Malování", phase: ZABYDLOVANI, planCost: 35000, flexibilityPercent: 15, planDays: 7 },
      { category: "Zabydlování", subcategory: "Kuchyň", phase: ZABYDLOVANI, planCost: 100000, flexibilityPercent: 30, planDays: 14 },
      { category: "Zabydlování", subcategory: "Koupelna", phase: ZABYDLOVANI, planCost: 80000, flexibilityPercent: 30, planDays: 14, note: "Vana/sprcha, WC, umyvadlo, dlažba" },
      { category: "Zabydlování", subcategory: "Sanita", phase: ZABYDLOVANI, planCost: 30000, flexibilityPercent: 20, planDays: 3 },

      // Do budoucna
      { category: "Do budoucna", subcategory: "Zahrada a terasa", phase: DO_BUDOUCNA, planCost: 50000, flexibilityPercent: 100, planDays: 10 },
      { category: "Do budoucna", subcategory: "Mobiliář", phase: DO_BUDOUCNA, planCost: 80000, flexibilityPercent: 100, planDays: 14 },
      { category: "Do budoucna", subcategory: "Inteligentní dům", phase: DO_BUDOUCNA, planCost: 40000, flexibilityPercent: 100, planDays: 7, note: "Smart home, automatizace" },
    ],
  },
  {
    type: "new_build",
    label: "Nová stavba",
    description: "Výstavba nového domu od základů.",
    items: [
      // Příprava
      { category: "Projekt a příprava", subcategory: "Geodet", phase: PRIPRAVA, required: true, planCost: 20000, flexibilityPercent: 10, planDays: 7, note: "Zaměření pozemku" },
      { category: "Projekt a příprava", subcategory: "Geologický průzkum", phase: PRIPRAVA, required: true, planCost: 30000, flexibilityPercent: 20, planDays: 14, note: "Průzkum podloží pro foundation" },
      { category: "Projekt a příprava", subcategory: "Architekt - Projekt", phase: PRIPRAVA, required: true, planCost: 200000, flexibilityPercent: 15, planDays: 90, note: "Kompletní projektová dokumentace" },
      { category: "Projekt a příprava", subcategory: "Statický posudek", phase: PRIPRAVA, required: true, planCost: 40000, flexibilityPercent: 15, planDays: 21 },
      { category: "Projekt a příprava", subcategory: "Stavební povolení", phase: PRIPRAVA, required: true, planCost: 30000, flexibilityPercent: 10, planDays: 90, note: "Úřady, poplatky" },
      { category: "Projekt a příprava", subcategory: "Inženýrské sítě - připojení", phase: PRIPRAVA, required: true, planCost: 80000, flexibilityPercent: 30, planDays: 60, note: "Připojení vody, elektřiny, plynu, odpadů" },

      // Hrubá stavba
      { category: "Hrubá stavba", subcategory: "Zemní práce a základ", phase: HRUBA_STAVBA, required: true, planCost: 200000, flexibilityPercent: 30, planDays: 21, note: "Výkop, základová deska" },
      { category: "Hrubá stavba", subcategory: "Zdění - materiál", phase: HRUBA_STAVBA, required: true, planCost: 150000, flexibilityPercent: 20, planDays: 7, note: "Cihly, tvárnice, malta" },
      { category: "Hrubá stavba", subcategory: "Zdění - práce", phase: HRUBA_STAVBA, required: true, planCost: 250000, flexibilityPercent: 15, planDays: 45, note: "Obvodové i vnitřní zdi" },
      { category: "Hrubá stavba", subcategory: "Střecha - konstrukce", phase: HRUBA_STAVBA, required: true, planCost: 180000, flexibilityPercent: 20, planDays: 14, note: "Krov, klempíř" },
      { category: "Hrubá stavba", subcategory: "Střecha - krytina", phase: HRUBA_STAVBA, required: true, planCost: 120000, flexibilityPercent: 15, planDays: 7, note: "Tašky, folie, doplňky" },
      { category: "Hrubá stavba", subcategory: "Okna a dveře", phase: HRUBA_STAVBA, required: true, planCost: 150000, flexibilityPercent: 20, planDays: 7 },
      { category: "Hrubá stavba", subcategory: "Vnitřní omítky", phase: HRUBA_STAVBA, planCost: 120000, flexibilityPercent: 15, planDays: 21 },
      { category: "Hrubá stavba", subcategory: "Fasáda", phase: HRUBA_STAVBA, planCost: 200000, flexibilityPercent: 20, planDays: 21, note: "Zateplení, omítka, barva" },

      // Rozvody a sítě
      { category: "Rozvody a sítě", subcategory: "Rozvody vody", phase: HRUBA_STAVBA, planCost: 80000, flexibilityPercent: 25, planDays: 10 },
      { category: "Rozvody a sítě", subcategory: "Odpadní potrubí", phase: HRUBA_STAVBA, planCost: 60000, flexibilityPercent: 20, planDays: 7 },
      { category: "Rozvody a sítě", subcategory: "Elektroinstalace", phase: HRUBA_STAVBA, planCost: 180000, flexibilityPercent: 20, planDays: 21 },
      { category: "Rozvody a sítě", subcategory: "Vytápění - zdroj", phase: HRUBA_STAVBA, planCost: 250000, flexibilityPercent: 30, planDays: 10, note: "Tepelné čerpadlo nebo kotel" },
      { category: "Rozvody a sítě", subcategory: "Podlahové topení", phase: HRUBA_STAVBA, planCost: 120000, flexibilityPercent: 20, planDays: 10 },

      // Zabydlování
      { category: "Zabydlování", subcategory: "Sádrokartony", phase: ZABYDLOVANI, planCost: 100000, flexibilityPercent: 20, planDays: 14 },
      { category: "Zabydlování", subcategory: "Podlahové krytiny", phase: ZABYDLOVANI, planCost: 120000, flexibilityPercent: 25, planDays: 10 },
      { category: "Zabydlování", subcategory: "Dveře a kování", phase: ZABYDLOVANI, planCost: 80000, flexibilityPercent: 20, planDays: 7 },
      { category: "Zabydlování", subcategory: "Malování", phase: ZABYDLOVANI, planCost: 50000, flexibilityPercent: 15, planDays: 10 },
      { category: "Zabydlování", subcategory: "Kuchyně", phase: ZABYDLOVANI, planCost: 150000, flexibilityPercent: 30, planDays: 21 },
      { category: "Zabydlování", subcategory: "Koupelny", phase: ZABYDLOVANI, planCost: 100000, flexibilityPercent: 30, planDays: 14 },
      { category: "Zabydlování", subcategory: "Schodiště", phase: ZABYDLOVANI, planCost: 80000, flexibilityPercent: 25, planDays: 14 },

      // Do budoucna
      { category: "Do budoucna", subcategory: "Zahrada a plot", phase: DO_BUDOUCNA, planCost: 100000, flexibilityPercent: 100, planDays: 21 },
      { category: "Do budoucna", subcategory: "Příjezdová cesta", phase: DO_BUDOUCNA, planCost: 80000, flexibilityPercent: 50, planDays: 7 },
      { category: "Do budoucna", subcategory: "Mobiliář", phase: DO_BUDOUCNA, planCost: 120000, flexibilityPercent: 100, planDays: 21 },
    ],
  },
  {
    type: "interior",
    label: "Interiér",
    description: "Vybavení a úpravy interiéru (malování, podlahy, vybavení).",
    items: [
      { category: "Příprava", subcategory: "Návrh interiéru", phase: PRIPRAVA, required: true, planCost: 40000, flexibilityPercent: 20, planDays: 21, note: "Interiérový designér" },
      { category: "Příprava", subcategory: "Výběr materiálů", phase: PRIPRAVA, planCost: 5000, flexibilityPercent: 50, planDays: 14, note: "Vzorníky, výběr" },
      { category: "Příprava", subcategory: "Nátěry - materiál", phase: PRIPRAVA, planCost: 15000, flexibilityPercent: 20, planDays: 3 },
      { category: "Demolice", subcategory: "Odstranění starých podlah a nábytku", phase: DEMOLICE, planCost: 20000, flexibilityPercent: 30, planDays: 5 },
      { category: "Demolice", subcategory: "Odvoz", phase: DEMOLICE, planCost: 8000, flexibilityPercent: 30, planDays: 2 },
      { category: "Zabydlování", subcategory: "Malování stěn", phase: ZABYDLOVANI, required: true, planCost: 30000, flexibilityPercent: 15, planDays: 7 },
      { category: "Zabydlování", subcategory: "Podlahy - laminát", phase: ZABYDLOVANI, planCost: 50000, flexibilityPercent: 20, planDays: 5 },
      { category: "Zabydlování", subcategory: "Podlahy - dlažba", phase: ZABYDLOVANI, planCost: 40000, flexibilityPercent: 20, planDays: 5, note: "Koupelna, kuchyň" },
      { category: "Zabydlování", subcategory: "Sádrokarton prvky", phase: ZABYDLOVANI, planCost: 30000, flexibilityPercent: 25, planDays: 5, note: "Příčky, podhledy" },
      { category: "Zabydlování", subcategory: "Dveře", phase: ZABYDLOVANI, planCost: 40000, flexibilityPercent: 20, planDays: 3 },
      { category: "Zabydlování", subcategory: "Kuchyňská linka", phase: ZABYDLOVANI, planCost: 120000, flexibilityPercent: 30, planDays: 14 },
      { category: "Zabydlování", subcategory: "Vestavěné skříně", phase: ZABYDLOVANI, planCost: 60000, flexibilityPercent: 25, planDays: 14 },
      { category: "Zabydlování", subcategory: "Osvětlení", phase: ZABYDLOVANI, planCost: 25000, flexibilityPercent: 25, planDays: 3 },
      { category: "Zabydlování", subcategory: "Koupelna - zařízení", phase: ZABYDLOVANI, planCost: 60000, flexibilityPercent: 30, planDays: 7 },
      { category: "Zabydlování", subcategory: "Nábytek", phase: ZABYDLOVANI, planCost: 80000, flexibilityPercent: 100, planDays: 14 },
      { category: "Do budoucna", subcategory: "Dekorace a doplňky", phase: DO_BUDOUCNA, planCost: 20000, flexibilityPercent: 100, planDays: 7 },
    ],
  },
  {
    type: "extension",
    label: "Přístavba",
    description: "Přístavba k existujícímu objektu (nástavba, přístavba garáže, zimní zahrada).",
    items: [
      { category: "Projekt a příprava", subcategory: "Architekt - Projekt", phase: PRIPRAVA, required: true, planCost: 80000, flexibilityPercent: 20, planDays: 45 },
      { category: "Projekt a příprava", subcategory: "Statický posudek", phase: PRIPRAVA, required: true, planCost: 30000, flexibilityPercent: 20, planDays: 14, note: "Posouzení stávající konstrukce" },
      { category: "Projekt a příprava", subcategory: "Stavební povolení", phase: PRIPRAVA, required: true, planCost: 20000, flexibilityPercent: 10, planDays: 60 },
      { category: "Hrubá stavba", subcategory: "Zemní práce", phase: HRUBA_STAVBA, required: true, planCost: 60000, flexibilityPercent: 30, planDays: 7 },
      { category: "Hrubá stavba", subcategory: "Základ", phase: HRUBA_STAVBA, required: true, planCost: 100000, flexibilityPercent: 25, planDays: 10 },
      { category: "Hrubá stavba", subcategory: "Zdění", phase: HRUBA_STAVBA, required: true, planCost: 120000, flexibilityPercent: 20, planDays: 21 },
      { category: "Hrubá stavba", subcategory: "Střecha", phase: HRUBA_STAVBA, required: true, planCost: 100000, flexibilityPercent: 20, planDays: 10 },
      { category: "Hrubá stavba", subcategory: "Okna a dveře", phase: HRUBA_STAVBA, planCost: 50000, flexibilityPercent: 20, planDays: 5 },
      { category: "Hrubá stavba", subcategory: "Propojení s existujícím objektem", phase: HRUBA_STAVBA, planCost: 40000, flexibilityPercent: 30, planDays: 7, note: "Průraz, izolace, dilatace" },
      { category: "Rozvody a sítě", subcategory: "Elektroinstalace", phase: HRUBA_STAVBA, planCost: 50000, flexibilityPercent: 20, planDays: 7 },
      { category: "Rozvody a sítě", subcategory: "Vytápění", phase: HRUBA_STAVBA, planCost: 60000, flexibilityPercent: 25, planDays: 5, note: "Prodloužení stávajícího vytápění" },
      { category: "Zabydlování", subcategory: "Omítky", phase: ZABYDLOVANI, planCost: 40000, flexibilityPercent: 15, planDays: 7 },
      { category: "Zabydlování", subcategory: "Podlahy", phase: ZABYDLOVANI, planCost: 40000, flexibilityPercent: 20, planDays: 5 },
      { category: "Zabydlování", subcategory: "Malování", phase: ZABYDLOVANI, planCost: 20000, flexibilityPercent: 15, planDays: 5 },
      { category: "Zabydlování", subcategory: "Fasáda", phase: ZABYDLOVANI, planCost: 60000, flexibilityPercent: 20, planDays: 7, note: "Zateplení a sjednocení s existujícím objektem" },
    ],
  },
];

export function getTemplate(type: string, scope?: string): ProjectTemplate | null {
  const template = PROJECT_TEMPLATES.find((t) => t.type === type);
  if (!template) return null;

  // For partial reconstruction scope, filter items
  if (type === "reconstruction" && scope) {
    if (scope === "partial") {
      // For partial, keep only the most common items
      return {
        ...template,
        items: template.items.filter(
          (it) =>
            it.category === "Projekt a příprava" ||
            it.category === "Demolice" ||
            it.subcategory === "Elektroinstalace" ||
            it.subcategory === "Rozvody vody" ||
            it.category === "Zabydlování",
        ),
      };
    }
  }

  return template;
}
