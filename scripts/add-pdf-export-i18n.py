#!/usr/bin/env python3
# =====================================================================
# add-pdf-export-i18n.py
# ---------------------------------------------------------------------
# Adds `dialogs.pdfExport.*` keys to all 7 next-intl message files:
#   src/messages/{cs,en,es,hu,it,pl,vi}.json
#
# The key is added INSIDE the existing `dialogs` object. If `pdfExport`
# already exists, it is overwritten with the canonical translations.
#
# Usage:
#   python3 scripts/add-pdf-export-i18n.py
# =====================================================================

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MESSAGES_DIR = ROOT / "src" / "messages"

# ---------------------------------------------------------------------
# Translations per locale.
# Context: construction project management app ("Stavba") — PDF export
# for mortgage applications.
# ---------------------------------------------------------------------
TRANSLATIONS: dict[str, dict] = {
    "cs": {
        "title": "Exportovat PDF report",
        "description": "Vyberte sekce, jazyk a měnu pro PDF report. Report je vhodný pro žádosti o hypotéku.",
        "sections": {
            "title": "Sekce reportu",
            "header": "Hlavička projektu",
            "headerDesc": "Název projektu, adresa a popis",
            "summary": "Shrnutí",
            "summaryDesc": "Celkový rozpočet, utraceno, zbývá a procento dokončení",
            "budgetItems": "Položky rozpočtu",
            "budgetItemsDesc": "Podrobný seznam všech položek rozpočtu seskupených podle fáze",
            "status": "Stav",
            "costs": "Náklady",
            "dates": "Datumy",
            "property": "Detaily nemovitosti",
            "propertyDesc": "Plocha, počet podlaží, energetický štítek a ztráta tepla",
            "alerts": "Upozornění",
            "alertsDesc": "Zpožděné položky, nadcházející termíny a překročené rozpočty",
            "projection": "Projekce nákladů",
            "projectionDesc": "Odhad konečných nákladů na základě aktuálního utrácení",
            "time": "Evidence času",
            "timeDesc": "Odpracované hodiny u každé položky",
            "workers": "Pracovníci",
            "workersDesc": "Seznam pracovníků a firem s jejich hodinami",
            "contacts": "Kontakty",
            "contactsDesc": "Adresář kontaktů projektu",
            "audit": "Protokol změn",
            "auditDesc": "Poslední změny provedené v projektu",
            "trend": "Trend utrácení",
            "trendDesc": "Graf utrácení v čase",
            "comingSoon": "Brzy dostupné",
        },
        "locale": {
            "title": "Jazyk a měna",
            "language": "Jazyk reportu",
            "currency": "Měna",
            "conversionHint": "Částky jsou přepočítány podle aktuálního kurzu České národní banky.",
        },
        "templates": {
            "title": "Šablony",
            "saveAs": "Uložit aktuální výběr jako šablonu",
            "namePlaceholder": "Název šablony…",
            "save": "Uložit",
            "myTemplates": "Moje šablony",
            "load": "Načíst",
            "delete": "Smazat",
            "sectionsCount": "{count} sekcí",
            "empty": "Zatím nejsou uloženy žádné šablony.",
        },
        "button": {
            "cancel": "Zrušit",
            "export": "Exportovat PDF",
            "exporting": "Generuje se…",
        },
        "toasts": {
            "generating": "PDF se generuje…",
            "success": "PDF bylo úspěšně exportováno",
            "error": "Nepodařilo se vygenerovat PDF",
            "templateSaved": "Šablona uložena",
            "templateDeleted": "Šablona smazána",
        },
    },
    "en": {
        "title": "Export PDF report",
        "description": "Choose sections, language and currency for your PDF report. The report is suitable for mortgage applications.",
        "sections": {
            "title": "Report sections",
            "header": "Project header",
            "headerDesc": "Project name, address and description",
            "summary": "Summary",
            "summaryDesc": "Total budget, spent, remaining and completion percentage",
            "budgetItems": "Budget items",
            "budgetItemsDesc": "Detailed list of all budget items grouped by phase",
            "status": "Status",
            "costs": "Costs",
            "dates": "Dates",
            "property": "Property details",
            "propertyDesc": "Floor area, number of floors, energy rating and heat loss",
            "alerts": "Alerts",
            "alertsDesc": "Overdue items, upcoming deadlines and over-budget items",
            "projection": "Cost projection",
            "projectionDesc": "Forecast of final cost based on current spending",
            "time": "Time tracking",
            "timeDesc": "Hours worked per item",
            "workers": "Workers",
            "workersDesc": "List of workers and companies with their hours",
            "contacts": "Contacts",
            "contactsDesc": "Project contact directory",
            "audit": "Audit log",
            "auditDesc": "Recent changes made to the project",
            "trend": "Spending trend",
            "trendDesc": "Spending over time chart",
            "comingSoon": "Coming soon",
        },
        "locale": {
            "title": "Language and currency",
            "language": "Report language",
            "currency": "Currency",
            "conversionHint": "Amounts are converted using the current Czech National Bank exchange rate.",
        },
        "templates": {
            "title": "Templates",
            "saveAs": "Save current selection as template",
            "namePlaceholder": "Template name…",
            "save": "Save",
            "myTemplates": "My templates",
            "load": "Load",
            "delete": "Delete",
            "sectionsCount": "{count} sections",
            "empty": "No saved templates yet.",
        },
        "button": {
            "cancel": "Cancel",
            "export": "Export PDF",
            "exporting": "Generating…",
        },
        "toasts": {
            "generating": "Generating PDF…",
            "success": "PDF exported successfully",
            "error": "Failed to generate PDF",
            "templateSaved": "Template saved",
            "templateDeleted": "Template deleted",
        },
    },
    "es": {
        "title": "Exportar informe PDF",
        "description": "Selecciona las secciones, el idioma y la moneda del informe PDF. El informe es adecuado para solicitudes de hipoteca.",
        "sections": {
            "title": "Secciones del informe",
            "header": "Encabezado del proyecto",
            "headerDesc": "Nombre del proyecto, dirección y descripción",
            "summary": "Resumen",
            "summaryDesc": "Presupuesto total, gastado, restante y porcentaje de finalización",
            "budgetItems": "Partidas del presupuesto",
            "budgetItemsDesc": "Lista detallada de todas las partidas agrupadas por fase",
            "status": "Estado",
            "costs": "Costes",
            "dates": "Fechas",
            "property": "Detalles de la propiedad",
            "propertyDesc": "Superficie, número de plantas, certificado energético y pérdida de calor",
            "alerts": "Alertas",
            "alertsDesc": "Partidas retrasadas, próximos vencimientos y partidas sobre presupuesto",
            "projection": "Proyección de costes",
            "projectionDesc": "Estimación del coste final basada en el gasto actual",
            "time": "Control de tiempo",
            "timeDesc": "Horas trabajadas por partida",
            "workers": "Trabajadores",
            "workersDesc": "Lista de trabajadores y empresas con sus horas",
            "contacts": "Contactos",
            "contactsDesc": "Directorio de contactos del proyecto",
            "audit": "Registro de cambios",
            "auditDesc": "Cambios recientes en el proyecto",
            "trend": "Tendencia de gasto",
            "trendDesc": "Gráfico de gasto a lo largo del tiempo",
            "comingSoon": "Próximamente",
        },
        "locale": {
            "title": "Idioma y moneda",
            "language": "Idioma del informe",
            "currency": "Moneda",
            "conversionHint": "Los importes se convierten utilizando el tipo de cambio actual del Banco Nacional Checo.",
        },
        "templates": {
            "title": "Plantillas",
            "saveAs": "Guardar selección actual como plantilla",
            "namePlaceholder": "Nombre de la plantilla…",
            "save": "Guardar",
            "myTemplates": "Mis plantillas",
            "load": "Cargar",
            "delete": "Eliminar",
            "sectionsCount": "{count} secciones",
            "empty": "Aún no hay plantillas guardadas.",
        },
        "button": {
            "cancel": "Cancelar",
            "export": "Exportar PDF",
            "exporting": "Generando…",
        },
        "toasts": {
            "generating": "Generando PDF…",
            "success": "PDF exportado correctamente",
            "error": "No se pudo generar el PDF",
            "templateSaved": "Plantilla guardada",
            "templateDeleted": "Plantilla eliminada",
        },
    },
    "hu": {
        "title": "PDF jelentés exportálása",
        "description": "Válassza ki a szekciókat, nyelvet és pénznemet a PDF jelentéshez. A jelentés alkalmas jelzáloghitelek igényléséhez.",
        "sections": {
            "title": "Jelentés szekciói",
            "header": "Projekt fejléc",
            "headerDesc": "Projekt neve, címe és leírása",
            "summary": "Összegzés",
            "summaryDesc": "Teljes költségvetés, költött, maradék és befejezési százalék",
            "budgetItems": "Költségvetési tételek",
            "budgetItemsDesc": "Az összes költségvetési tétel részletes listája fázis szerint csoportosítva",
            "status": "Állapot",
            "costs": "Költségek",
            "dates": "Dátumok",
            "property": "Ingatlan adatok",
            "propertyDesc": "Alapterület, emeletek száma, energiatanúsítvány és hőveszteség",
            "alerts": "Értesítések",
            "alertsDesc": "Késésben lévő tételek, közelgő határidők és túlköltekezett tételek",
            "projection": "Költségvetés előrejelzés",
            "projectionDesc": "Végleges költség becslése a jelenlegi költés alapján",
            "time": "Időkövetés",
            "timeDesc": "Munkaórák tételenként",
            "workers": "Dolgozók",
            "workersDesc": "Dolgozók és cégek listája munkaórákkal",
            "contacts": "Kapcsolatok",
            "contactsDesc": "Projekt kapcsolati névjegyzék",
            "audit": "Változásnapló",
            "auditDesc": "A projekt legutóbbi módosításai",
            "trend": "Költési trend",
            "trendDesc": "Költés időbeli alakulása grafikonon",
            "comingSoon": "Hamarosan",
        },
        "locale": {
            "title": "Nyelv és pénznem",
            "language": "Jelentés nyelve",
            "currency": "Pénznem",
            "conversionHint": "Az összegek a Cseh Nemzeti Bank aktuális árfolyama szerint kerülnek átszámításra.",
        },
        "templates": {
            "title": "Sablonok",
            "saveAs": "Jelenlegi kiválasztás mentése sablonként",
            "namePlaceholder": "Sablon neve…",
            "save": "Mentés",
            "myTemplates": "Saját sablonok",
            "load": "Betöltés",
            "delete": "Törlés",
            "sectionsCount": "{count} szekció",
            "empty": "Még nincsenek mentett sablonok.",
        },
        "button": {
            "cancel": "Mégse",
            "export": "PDF exportálása",
            "exporting": "Generálás…",
        },
        "toasts": {
            "generating": "PDF generálása…",
            "success": "PDF sikeresen exportálva",
            "error": "Nem sikerült létrehozni a PDF-et",
            "templateSaved": "Sablon mentve",
            "templateDeleted": "Sablon törölve",
        },
    },
    "it": {
        "title": "Esporta rapporto PDF",
        "description": "Seleziona le sezioni, la lingua e la valuta del rapporto PDF. Il rapporto è adatto per richieste di mutuo.",
        "sections": {
            "title": "Sezioni del rapporto",
            "header": "Intestazione del progetto",
            "headerDesc": "Nome del progetto, indirizzo e descrizione",
            "summary": "Riepilogo",
            "summaryDesc": "Budget totale, speso, rimanente e percentuale di completamento",
            "budgetItems": "Voci di budget",
            "budgetItemsDesc": "Elenco dettagliato di tutte le voci di budget raggruppate per fase",
            "status": "Stato",
            "costs": "Costi",
            "dates": "Date",
            "property": "Dettagli immobile",
            "propertyDesc": "Superficie, numero di piani, certificazione energetica e dispersione termica",
            "alerts": "Avvisi",
            "alertsDesc": "Voci in ritardo, scadenze imminenti e voci fuori budget",
            "projection": "Proiezione dei costi",
            "projectionDesc": "Stima del costo finale basata sulla spesa attuale",
            "time": "Tracciamento tempo",
            "timeDesc": "Ore lavorate per voce",
            "workers": "Lavoratori",
            "workersDesc": "Elenco di lavoratori e aziende con le relative ore",
            "contacts": "Contatti",
            "contactsDesc": "Elenco contatti del progetto",
            "audit": "Registro modifiche",
            "auditDesc": "Modifiche recenti al progetto",
            "trend": "Trend di spesa",
            "trendDesc": "Grafico della spesa nel tempo",
            "comingSoon": "Prossimamente",
        },
        "locale": {
            "title": "Lingua e valuta",
            "language": "Lingua del rapporto",
            "currency": "Valuta",
            "conversionHint": "Gli importi sono convertiti utilizzando il tasso di cambio attuale della Banca Nazionale Ceca.",
        },
        "templates": {
            "title": "Modelli",
            "saveAs": "Salva selezione corrente come modello",
            "namePlaceholder": "Nome modello…",
            "save": "Salva",
            "myTemplates": "I miei modelli",
            "load": "Carica",
            "delete": "Elimina",
            "sectionsCount": "{count} sezioni",
            "empty": "Nessun modello salvato.",
        },
        "button": {
            "cancel": "Annulla",
            "export": "Esporta PDF",
            "exporting": "Generazione…",
        },
        "toasts": {
            "generating": "Generazione PDF…",
            "success": "PDF esportato correttamente",
            "error": "Impossibile generare il PDF",
            "templateSaved": "Modello salvato",
            "templateDeleted": "Modello eliminato",
        },
    },
    "pl": {
        "title": "Eksportuj raport PDF",
        "description": "Wybierz sekcje, język i walutę raportu PDF. Raport nadaje się do wniosków o kredyt hipoteczny.",
        "sections": {
            "title": "Sekcje raportu",
            "header": "Nagłówek projektu",
            "headerDesc": "Nazwa projektu, adres i opis",
            "summary": "Podsumowanie",
            "summaryDesc": "Całkowity budżet, wydano, pozostało i procent ukończenia",
            "budgetItems": "Pozycje budżetu",
            "budgetItemsDesc": "Szczegółowa lista wszystkich pozycji budżetu pogrupowanych według fazy",
            "status": "Status",
            "costs": "Koszty",
            "dates": "Daty",
            "property": "Szczegóły nieruchomości",
            "propertyDesc": "Powierzchnia, liczba pięter, certyfikat energetyczny i straty ciepła",
            "alerts": "Alerty",
            "alertsDesc": "Pozycje opóźnione, nadchodzące terminy i pozycje przekraczające budżet",
            "projection": "Projekcja kosztów",
            "projectionDesc": "Szacunek kosztu końcowego na podstawie obecnych wydatków",
            "time": "Ewidencja czasu",
            "timeDesc": "Przepracowane godziny dla każdej pozycji",
            "workers": "Pracownicy",
            "workersDesc": "Lista pracowników i firm wraz z ich godzinami",
            "contacts": "Kontakty",
            "contactsDesc": "Książka adresowa projektu",
            "audit": "Dziennik zmian",
            "auditDesc": "Ostatnie zmiany w projekcie",
            "trend": "Trend wydatków",
            "trendDesc": "Wykres wydatków w czasie",
            "comingSoon": "Wkrótce",
        },
        "locale": {
            "title": "Język i waluta",
            "language": "Język raportu",
            "currency": "Waluta",
            "conversionHint": "Kwoty są przeliczane według aktualnego kursu Czeskiego Banku Narodowego.",
        },
        "templates": {
            "title": "Szablony",
            "saveAs": "Zapisz bieżący wybór jako szablon",
            "namePlaceholder": "Nazwa szablonu…",
            "save": "Zapisz",
            "myTemplates": "Moje szablony",
            "load": "Wczytaj",
            "delete": "Usuń",
            "sectionsCount": "{count} sekcji",
            "empty": "Brak zapisanych szablonów.",
        },
        "button": {
            "cancel": "Anuluj",
            "export": "Eksportuj PDF",
            "exporting": "Generowanie…",
        },
        "toasts": {
            "generating": "Generowanie PDF…",
            "success": "PDF wyeksportowany pomyślnie",
            "error": "Nie udało się wygenerować pliku PDF",
            "templateSaved": "Szablon zapisany",
            "templateDeleted": "Szablon usunięty",
        },
    },
    "vi": {
        "title": "Xuất báo cáo PDF",
        "description": "Chọn các phần, ngôn ngữ và loại tiền tệ cho báo cáo PDF. Báo cáo phù hợp để nộp hồ sơ vay thế chấp.",
        "sections": {
            "title": "Các phần báo cáo",
            "header": "Tiêu đề dự án",
            "headerDesc": "Tên, địa chỉ và mô tả dự án",
            "summary": "Tóm tắt",
            "summaryDesc": "Tổng ngân sách, đã chi, còn lại và phần trăm hoàn thành",
            "budgetItems": "Hạng mục ngân sách",
            "budgetItemsDesc": "Danh sách chi tiết tất cả hạng mục ngân sách được nhóm theo giai đoạn",
            "status": "Trạng thái",
            "costs": "Chi phí",
            "dates": "Ngày tháng",
            "property": "Chi tiết bất động sản",
            "propertyDesc": "Diện tích, số tầng, chứng nhận năng lượng và mức thất thoát nhiệt",
            "alerts": "Cảnh báo",
            "alertsDesc": "Hạng mục trễ hạn, hạn sắp tới và hạng mục vượt ngân sách",
            "projection": "Dự toán chi phí",
            "projectionDesc": "Dự báo chi phí cuối cùng dựa trên mức chi tiêu hiện tại",
            "time": "Theo dõi thời gian",
            "timeDesc": "Số giờ làm việc cho từng hạng mục",
            "workers": "Nhân công",
            "workersDesc": "Danh sách nhân công và công ty cùng số giờ của họ",
            "contacts": "Danh bạ",
            "contactsDesc": "Danh bạ liên hệ của dự án",
            "audit": "Nhật ký thay đổi",
            "auditDesc": "Các thay đổi gần đây trong dự án",
            "trend": "Xu hướng chi tiêu",
            "trendDesc": "Biểu đồ chi tiêu theo thời gian",
            "comingSoon": "Sắp ra mắt",
        },
        "locale": {
            "title": "Ngôn ngữ và tiền tệ",
            "language": "Ngôn ngữ báo cáo",
            "currency": "Tiền tệ",
            "conversionHint": "Các khoản được quy đổi theo tỷ giá hiện tại của Ngân hàng Quốc gia Séc.",
        },
        "templates": {
            "title": "Mẫu",
            "saveAs": "Lưu lựa chọn hiện tại thành mẫu",
            "namePlaceholder": "Tên mẫu…",
            "save": "Lưu",
            "myTemplates": "Mẫu của tôi",
            "load": "Tải",
            "delete": "Xóa",
            "sectionsCount": "{count} phần",
            "empty": "Chưa có mẫu nào được lưu.",
        },
        "button": {
            "cancel": "Hủy",
            "export": "Xuất PDF",
            "exporting": "Đang tạo…",
        },
        "toasts": {
            "generating": "Đang tạo PDF…",
            "success": "Đã xuất PDF thành công",
            "error": "Không thể tạo PDF",
            "templateSaved": "Đã lưu mẫu",
            "templateDeleted": "Đã xóa mẫu",
        },
    },
}


def update_file(locale: str, data: dict) -> None:
    """Insert/overwrite `dialogs.pdfExport` in a message file."""
    path = MESSAGES_DIR / f"{locale}.json"
    if not path.exists():
        raise FileNotFoundError(f"Missing message file: {path}")

    if "dialogs" not in data or not isinstance(data["dialogs"], dict):
        raise KeyError(f"`dialogs` object not found in {path}")

    data["dialogs"]["pdfExport"] = TRANSLATIONS[locale]

    # Write back with UTF-8 + 2-space indent (matches next-intl convention)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"  ✓ Updated {path.relative_to(ROOT)}")


def main() -> None:
    print("Adding dialogs.pdfExport.* to all 7 language files…")
    for locale in TRANSLATIONS:
        path = MESSAGES_DIR / f"{locale}.json"
        with path.open(encoding="utf-8") as fh:
            data = json.load(fh)
        update_file(locale, data)
    print("Done.")


if __name__ == "__main__":
    main()
