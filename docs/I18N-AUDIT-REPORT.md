# i18n Audit Report — Fáze 4

> **Datum:** 10. listopadu 2026
> **Status:** ✅ Vše čisté — žádné změny kódu potřeba

---

## Souhrn

i18n systém byl auditován napříč všemi 7 lokalitami (cs, en, pl, vi, hu, es, it). Všechny kontroly prošly bez nutnosti změn — systém byl již v produkční kvalitě díky předchozím cleanup fázím.

## Výsledky auditu

### F4.1: Vývojářské poznámky — ✅ Čisté

Hledáno: `Phase X`, `Fáze X`, `TODO`, `FIXME`, `HACK`, `WIP`, `XXX`, `TBD`, `(legacy)`, `(placeholder)`

**Výsledek:** 0 nalezených vývojářských poznámek v i18n textech. Nalezené "Todo" matches byly false positives:
- `ariaTodo` / `titleTodo` — legitimní UI text "Označit jako hotové" (úkol = todo)
- Španělské "Todos" = "vše" (false positive)

### F4.2: Placeholder/Lorem texty — ✅ Čisté

Hledáno: `lorem`, `ipsum`, `test text`, `placeholder text`, `coming soon`, `not implemented`

**Výsledek:** 1 nalezený — `comingSoon: "Coming soon"` je legitimní UI badge text (feature ve vývoji), nikoliv placeholder.

### F4.3: Klíče aligned — ✅ Všechny 7 lokalit

| Lokalita | Status | Missing | Extra |
|----------|--------|---------|-------|
| en | OK | 0 | 0 |
| pl | OK | 0 | 0 |
| vi | OK | 0 | 0 |
| hu | OK | 0 | 0 |
| es | OK | 0 | 0 |
| it | OK | 0 | 0 |

### F4.4: Kvalita překladů — ✅ Čisté

Metoda: Detekce nepřeložených EN textů v ne-EN lokalitách (3+ anglická slova = suspicious).

**Výsledek:** 5 "suspicious" textů nalezeno — všechny jsou false positives:
- ES: "El email no se puede cambiar" — "email" je mezinárodní slovo ve španělštině
- IT: "Email o password non validi" — "Email" a "password" jsou mezinárodní slova v italštině
- IT: "Progetto creato, ma non è stato possibile copiare" — korektní italský překlad
- IT: "Email e password sono obbligatori" — korektní
- IT: "Aggiornamento dell'elemento di budget non riuscito" — korektní

**Meta.keywords:** Všechny 7 lokalit má 6 lokalizovaných klíčových slov (SEO).

### F4.5: Chybové zprávy — ✅ Uživatelsky přívětivé

**212 chybových zpráv** napříč 23 sekcemi (`api.errors.*`).

Vzor kvality (ukázka z `auth` sekce):
- `"accountExists": "Účet s tímto e-mailem již existuje. Přihlaste se nebo si resetujte heslo."` — **vysvětluje + nabízí akci**
- `"registerWarningEmailFailed": "Registrace proběhla, ale odeslání verifikačního e-mailu selhalo. Můžete si ho nechat zaslat znovu."` — **vysvětluje + nabízí akci**
- `"registerFailed": "Registrace selhala. Zkuste to prosím znovu."` — **actionable**

**Technické chyby:** 0 úniků do UI (žádné `P2002`, `PrismaClient`, `TypeError`, `ECONNREFUSED` v i18n textech).

**Prázdné stavy:** 29 prázdných stavů, všechny s jasnými lokalizovanými zprávami (např. "Zatím nemáte žádné projekty.", "Žádné záznamy pro vybrané filtry.").

## Metriky

| Metrika | Hodnota |
|---------|---------|
| Lokalit | 7 (cs, en, pl, vi, hu, es, it) |
| Klíčů na lokalitu | ~3140 řádků JSON |
| Chybových zpráv | 212 (23 sekcí) |
| Prázdných stavů | 29 |
| Nepřeložených textů | 0 |
| Vývojářských poznámek | 0 |
| Technických úniků | 0 |

## Závěr

i18n systém je v **produkční kvalitě**. Žádné změny kódu nebyly potřeba — systém byl již důkladně cleanupován v předchozích fázích (Fáze 1 opravila 52 neplatných klíčů s tečkou, dřívější práce doplnila 3 chybějící klíče v 5 lokalitách).
