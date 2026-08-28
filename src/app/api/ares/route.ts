import { NextResponse } from "next/server";

// GET /api/ares?q={ico nebo nazev}
// Vyhledává české firmy v ARES (Registr ekonomických subjektů).
//
// ARES API vyžaduje API klíč od 2024. Registrace je zdarma na:
// https://ares.gov.cz/ekonomicke-subjekty-v-rest/api-uzivatel
//
// Pokud ARES_API_KEY není nastaven, endpoint vrátí { results: [], needsApiKey: true }
// a uživatel může zadat firmu manuálně.

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";

    if (q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const apiKey = process.env.ARES_API_KEY;

    if (!apiKey) {
      // No API key — return empty results with flag
      return NextResponse.json({
        results: [],
        needsApiKey: true,
        message: "ARES API klíč není nastaven. Firmy lze zadat manuálně.",
      });
    }

    // Detekce zda je vstup IČO (číslo, 6-8 znaků)
    const isIco = /^\d{6,8}$/.test(q.replace(/\s/g, ""));

    let aresUrl: string;

    if (isIco) {
      const ico = q.replace(/\s/g, "").padStart(8, "0");
      aresUrl = `https://ares.gov.cz/ekonomicke-subjekty-v-rest/api/ekonomicke-subjekty/${ico}`;
    } else {
      aresUrl = `https://ares.gov.cz/ekonomicke-subjekty-v-rest/api/ekonomicke-subjekty?vyhledat=${encodeURIComponent(q)}&max=10`;
    }

    const resp = await fetch(aresUrl, {
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "User-Agent": "Stavba/1.0",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      console.error("ARES API error:", resp.status);
      return NextResponse.json({
        results: [],
        error: "ARES API nedostupné",
      }, { status: 502 });
    }

    const data = await resp.json();

    let results: AresCompany[] = [];

    if (isIco) {
      const subjekt = data as AresEkonomickySubjekt;
      if (subjekt?.ico) {
        results = [normalizeAres(subjekt)];
      }
    } else {
      const seznam = (data as AresSearchResponse)?.ekonomickeSubjekty ??
                     (data as any)?.ekonomickeSubjekty ?? [];
      results = seznam.map(normalizeAres);
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("ARES search error:", error);
    return NextResponse.json({ results: [], error: "Chyba při vyhledávání" }, { status: 500 });
  }
}

// ===== Typy =====
type AresEkonomickySubjekt = {
  ico: string;
  dic?: string;
  obchodniJmeno?: string;
  nazev?: string;
  sidlo?: {
    nazevUlice?: string;
    cisloDomovni?: string;
    cisloOrientacni?: string;
    obec?: string;
    psc?: string;
    nazevKraje?: string;
  };
  pravniForma?: string;
};

type AresSearchResponse = {
  ekonomickeSubjekty?: AresEkonomickySubjekt[];
};

type AresCompany = {
  ico: string;
  dic: string | null;
  name: string;
  address: string | null;
  city: string | null;
  zip: string | null;
  street: string | null;
  legalForm: string | null;
};

function normalizeAres(s: AresEkonomickySubjekt): AresCompany {
  const sidlo = s.sidlo;
  const streetParts = [
    sidlo?.nazevUlice,
    [sidlo?.cisloDomovni, sidlo?.cisloOrientacni].filter(Boolean).join("/"),
  ].filter(Boolean).join(" ");

  const address = [streetParts, sidlo?.psc, sidlo?.obec].filter(Boolean).join(", ");

  return {
    ico: s.ico,
    dic: s.dic ?? null,
    name: s.obchodniJmeno ?? s.nazev ?? "Neznámá firma",
    address: address || null,
    city: sidlo?.obec ?? null,
    zip: sidlo?.psc ?? null,
    street: streetParts || null,
    legalForm: s.pravniForma ?? null,
  };
}
