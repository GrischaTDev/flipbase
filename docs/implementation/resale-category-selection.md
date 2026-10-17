# Kategorieauswahl für Wiederverkauf

Stand: 17.10.2026. Assistent: Juna. Lokale Umsetzung nach ausdrücklicher Nutzerfreigabe; noch nicht veröffentlicht.

## Datenquellen und Namen

Flipbase verwendet eine eigene allgemeine Kategorienliste für Artikel und Katalogprodukte. Sie entstand aus der einmal übernommenen Shopify-Taxonomie 2026-08 und wird in der aktuellen Anwendung und Dokumentation als **Flipbase-Kategorien** bezeichnet. Es gibt keine Shopify-Anbindung zur Laufzeit. Tabelle `public.product_categories`, Originalkennungen, Version und historische Herkunfts-/Lizenznachweise bleiben unverändert. Der Name des historischen Importwerkzeugs beschreibt weiterhin seine tatsächliche Quelle; dessen Geschichte wird nicht umgeschrieben.

Vinted und Kleinanzeigen haben getrennte Anbieterquellen und Kennungen. Die gemeinsame Bedienung erfolgt weiterhin über den vorhandenen Kategorie-Wähler. Eine interne Kategorie ist keine bestätigte Zielkategorie auf einem Marktplatz.

## Freigegebener Umfang

Jobs/Dienstleistungen, Fahrzeuge/Immobilien, Garten-/Bau-/Gewerbebedarf sowie Tiere/Tierbedarf und Lebensmittel werden aus neuer Auswahl und Suche entfernt. Technik/Software, Haushalt/Einrichtung, Beauty/Gesundheit, allgemeine Baby-/Kinderausstattung, Sport/Camping und Medien/Spielzeug/Hobby bleiben erhalten. Kleidung und passende Bekleidungsausnahmen bleiben erhalten. Die vollständige [inhaltliche Abgrenzung](../research/2026-10-17-fashion-category-scope.md) bleibt maßgeblich.

Die Auswahlquellen verwenden kleine Regeln anhand echter Kennungen und Eltern. Die spezifischste Regel entscheidet; Bekleidung unter ausgeschlossenen Oberbereichen bleibt erreichbar. Ausgeschlossene Eltern sind bei Bedarf reine Navigationspfade. Der gemeinsame Wähler sperrt deren Auswahl auch beim direkten Aufruf seiner Auswahlaktion. Suche bietet solche Eltern nicht als neue Auswahl an.

Besondere Überschneidungen: Fahrräder und Ersatzteile unter Sport werden ausgeschlossen, Fahrradkleidung und Sporthelme bleiben erhalten. Vinted-Smart-Home-Technik unter Heimwerken bleibt ausdrücklich erhalten. Babynahrung und echte Ernährungsprodukte werden entfernt, Flaschen, Babywagen, Autositze, Lebensmittelbehälter und Spielzeuglebensmittel bleiben erhalten. Noch nicht zusätzlich entschiedene Bereiche wie Eintrittskarten und Tabak werden nicht nebenbei ausgeschlossen.

## Originaldaten und vorhandene Zuordnungen

| Quelle                      | Vollständiger Originalbestand | Neue Auswahl | Sichtbar einschließlich notwendiger Eltern |
| --------------------------- | ----------------------------: | -----------: | -----------------------------------------: |
| Interne Flipbase-Kategorien |                        14.539 |       10.319 |                                     10.331 |
| Vinted                      |                         2.920 |        2.392 |                                      2.399 |
| Kleinanzeigen               |                         3.239 |          342 |                                        344 |

Anzahlen aus dem vollständigen lokalen Abgleich der tatsächlichen Auswahlquellen mit den untersuchten Beständen. Bei Vinted ist dies der gespeicherte Baum mit letztem erfolgreichen Stand 09.10.2026; keine neue Anbietererfassung wird behauptet. Knoten zählen einschließlich auswählbarer Oberkategorien. Reine Navigationseltern sind nicht auswählbar.

- Alle Originaldatensätze, Kennungen und Namen bleiben erhalten; die Auswahlfilter werden beim Lesen angewendet.
- Einzelabrufe vorhandener Werte bleiben vollständig. Ausgeblendete Zuordnungen werden weder als gelöscht noch als veraltet markiert und nicht automatisch geleert oder ersetzt.
- Ein Artikel oder Inserat mit bisheriger Zuordnung kann seine Kategorie unverändert behalten. Entfernen und bewusste Neuauswahl erfolgen weiterhin über den vorhandenen Wähler.
- Interne Suche und Ebenenabfragen setzen den Filter vor dem Suchlimit auf die bestehende Datenbankabfrage. Ein großes entferntes Sortiment verdrängt dadurch keine erlaubten Treffer.
- Keine Migration und keine Änderung an Veröffentlichungs-, Gebühren- oder Kontingentregeln. Die Auswahl macht noch nicht unterstützte Veröffentlichungswege nicht automatisch verfügbar.

Regeln: `core/models/flipbase-category-scope.ts`, `features/platform-admin/models/vinted-category-selection.ts`, `features/marketplaces/models/kleinanzeigen-category-selection.ts`. Bekannte ausgeschlossene Äste vererben die Entscheidung auf Unterkategorien; bei neuen unabhängigen Anbieterbereichen muss die Einordnung anhand der Kennungen nachgeprüft werden.

## eBay als nächste Anbieterquelle

Im vorhandenen Projekt gibt es eBay-Konten, gespeicherte Inserate und Bestellimport, aber keine eBay-Datenquelle für den gemeinsamen Kategorie-Wähler. Ein vollständiges eBay-Veröffentlichungsformular ist damit noch nicht vorhanden.

Für eBay ist ein Browser-Scan nicht erforderlich: Die offizielle Taxonomy API liefert den vollständigen marktbezogenen Baum, seine Version und Kategorie-Merkmale.

1. Den deutschen Marktplatz `EBAY_DE` über `getDefaultCategoryTreeId` auflösen, statt eine vermutete Baumkennung fest einzubauen.
2. Den vollständigen Baum über `getCategoryTree` mit Originalkennungen, Eltern, Namen, Blattstatus, Markt und Version speichern. Die Versionskennung ermöglicht gezielte spätere Aktualisierungen.
3. Dieselben fachlichen Ausschlüsse auf den eBay-Baum abbilden und eine eigene Quelle an den vorhandenen Wähler anschließen. Interne, Vinted- oder Kleinanzeigen-Kennungen nicht als eBay-Kennungen übernehmen; Zuordnungsvorschläge gesondert prüfen.
4. Nach Endkategoriewahl die Pflicht-/Empfehlungsmerkmale über `getItemAspectsForCategory` lesen, bevor ein späteres eBay-Inserat veröffentlicht werden kann. Abruf und Zugangsdaten gehören auf den Server; keine Geheimnisse in den Browser.

Dieser Schritt ist eine begründete Einordnung, keine in dieser Änderung implementierte eBay-Veröffentlichung.

Offizielle Quellen, geprüft am 17.10.2026:

- [Taxonomy API – Überblick](https://developer.ebay.com/api-docs/commerce/taxonomy/static/overview.html)
- [Kategoriebaum je Marktplatz und Version](https://developer.ebay.com/api-docs/buy/static/buy-categories.html)
- [Unterstützte Marktplätze einschließlich EBAY_DE](https://developer.ebay.com/api-docs/commerce/taxonomy/static/supportedmarketplaces.html)
- [Pflichtmerkmale einer Kategorie](https://developer.ebay.com/api-docs/user-guides/static/trading-user-guide/feature-support.html)

## Prüfung und Grenzen

Gezielte Filter-/Bestandsschutztests, die Auswahlsperre, erhaltene Smart-Home-Technik und der reine Lebensmittel-Navigationspfad zuerst rot nachgewiesen, dann grün. Abschließend 88 betroffene Modell-/Servicefälle, 471 Komponentenfälle aus 33 Dateien und 36 DOM-Fälle erfolgreich. Alle 100 ausgewählten Marktplatz-Browserfälle in fünf Minuten bestanden, einschließlich der 24 Transferfälle, 320/390/834/1440 Pixel, Hell/Dunkel, Touch, Tastatur und AXE. Neuer Browsernachweis prüft ausgeschlossene Äste, die nicht auswählbaren Navigationseltern und erhaltene Motorradbekleidung ohne Erweiterung; Bildschirmaufnahme angesehen. Typprüfung, gezieltes ESLint, Formatierung, regulärer Produktionsbau, Suite-Audit und 28 Auswahl-/Registrierungsfälle erfolgreich. Der vollständige Originalabgleich bestätigt Namen, Kennungen und Pfade aller Vinted-/Kleinanzeigen-Knoten sowie die unveränderte Größe der internen Quelle. Alle ausdrücklich verwendeten Ausschluss- und Ausnahme-Kennungen existieren in den Originalbeständen.

Ein zusätzlicher direkter Produktions-API-Vergleich wurde von der automatischen Freigabeprüfung abgelehnt, weil dafür ein Service-Role-Schlüssel aus einer Server-.env verwendet worden wäre. Der Befehl wurde nicht ausgeführt; keine Zugangsdaten gelesen, exportiert oder verwendet. Es gab keinen erneuten Produktionszugriff für diese optionale Prüfung. Die lokalen Quell-/Servicetests und der vollständige Bestandsabgleich laufen unabhängig davon. Eine direkte Prüfung des neuen PostgREST-Ausdrucks gegen die Produktions-API ist damit kein erbrachter Nachweis. Stattdessen wurde derselbe Ausdruck mit echtem PostgREST 16.1 und PostgreSQL 16.14 in einer eigenen isolierten lokalen Testumgebung gegen alle 14.539 Originalkategorien geprüft. Sämtliche 10.319 Auswahl- und 10.331 Navigationskennungen stimmen exakt mit den Auswahlregeln überein; ein ausgeblendeter Originalwert bleibt einzeln lesbar. Der erste Testaufbau hatte wegen des internen Docker-Netzes keinen veröffentlichten Hostport; der lesende Client wurde deshalb in dasselbe private Testnetz verlegt. Keine Prüfbedingung gelockert. Die beiden eigenen Container und das eigene Netz sind entfernt, fremde Projekte blieben unverändert.

Die datenbankgestützten Artikel-/Katalog-/Einkaufs-Browserläufe und der breite CI-Pflichtumfang einschließlich Linux/Produktions-PWA stehen für den noch nicht erstellten PR aus. Die internen Auswahlquellen sind lokal durch Service-/Komponentenfälle und den echten isolierten REST-Abgleich geprüft; dies wird nicht als vollständiger Anwendungs-Browserlauf ausgegeben. Die lokalen Browserprüfungen verwenden nachgebildete Konten und Anbieterantworten. Keine echte Anzeige oder Anbieteränderung.
