# Eigene Vinted-Artikelanalyse ohne zusätzliche Anbieter

Stand: 7. November 2026. Fortsetzung der Anbieterrecherche auf demselben eigenen
Arbeitszweig, nach erneutem GitHub-Abgleich. Ausgangsstand `25eb50a4`.

## Auftrag und Entscheidung

Keine zusätzlichen externen APIs, Preisdatendienste oder kostenpflichtigen
Zusatzprodukte. Die bestehenden KI-Zugänge bleiben die Grundlage für
Bild-/Textauswertung; dies ist keine Zusage einer vollständig lokal betriebenen
KI ohne Modellanbieter. Neue KI-Dienste oder Schlüssel werden nicht eingeführt.

Die fremden Angebote dienen zum Verständnis des Verfahrens. Unsere Datengewinnung,
Artikelzuordnung, Vergleichsauswahl, Historie und Preisrechnung sollen innerhalb
der vorhandenen Flipbase-Dienste laufen. Für den Zugriff auf öffentliche
Vinted-Seiten wird der vorhandene Sammler weiterverwendet.

## Was bei anderen nachvollziehbar ist

Comps beschreibt die zeitliche Beobachtung von Inseraten, eine ausdrückliche
Verkauft-Markierung und die Berechnung von Statistiken. Der letzte beobachtete
Angebotspreis bleibt ausdrücklich vom nicht veröffentlichten ausgehandelten
Endbetrag getrennt. Das Verfahren ist als Grundlage einer eigenen Sammlung
nachvollziehbar; ihre Daten oder Schnittstelle werden nicht übernommen.
[Methodik](https://swanum.com/comps/docs).

ResellTrack beschreibt eine eigene Markt-Datensammlung mit darauf aufbauender
Artikel-/Bildsuche und KI-Auswertung. Die genaue interne Implementierung und
Herkunft ausgehandelter Endpreise sind öffentlich nicht hinreichend belegt.
[Veröffentlichter Aufbau](https://reselltrack.io/en/blog/vinted-ai-chatgpt-claude-mcp).

## Tatsächlicher Zugriffsnachweis

Am 7. November 2026 um 11:23 UTC wurde die öffentliche
[Vinted-Suche nach Carhartt Prentis Liner](https://www.vinted.de/catalog?search_text=Carhartt%20Prentis%20Liner&order=relevance&per_page=24)
lesend abgerufen:

- HTTP 200, 3.710.185 Bytes HTML, innerhalb der bestehenden 8-MiB-Kataloggrenze.
- 96 Artikel mit 96 unterschiedlichen Kennungen; alle mit Preis und Artikelmerkmalen.
- Die angeforderte Seitengröße 24 wurde nicht wie erhofft eingehalten. Tatsächlich
  gelieferte Einträge müssen begrenzt und ausgewertet werden.
- JSON aus eingebetteten Seitendaten gelesen, kein fremdes JavaScript ausgeführt.
- Keine Anmeldung, neue Schnittstelle eines Datenanbieters, KI-Anfrage oder
  Buchung nötig. Die konkrete Inseratseite antwortete ebenfalls mit HTTP 200.

Das belegt die momentane Abrufbarkeit dieser Suche und des Datenformats,
keine garantierte künftige Verfügbarkeit oder Eignung sämtlicher Treffer.
Die Ergebnisse enthalten unterschiedliche Größen, Zustände und Ausführungen;
ein Median aller 96 Preise wäre kein Marktwert der Nutzerjacke.
Der private Nachweis liegt unter
`C:/Users/Grisc/.codex/tmp/flipbase-internal-vinted-analysis/catalog-access-proof.json`.
Ein erster vorsichtig auf 3 MB begrenzter Katalogabruf wurde abgeschnitten;
der vollständige Nachweis verwendet die vorhandene Kataloggrenze von 8 MiB.
Die 3-MB-Grenze des Detailabrufs darf nicht auf den Katalog übertragen werden.

## Vorhandener Code und konkrete Lücken

| Bereich                   | Nachweis im Repository                                                           | Bedeutung                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vinted-Suche              | `services/sniper/src/vinted/collector.ts`, `buildVintedCatalogUrl`               | Direkte Katalogsuche mit Suchtext, Marke und Kategorie; momentan auf neue Inserate ausgerichtet.                                                                |
| Katalogdaten              | `services/sniper/src/vinted/catalog-page.ts`, `response-body.ts`                 | Parser für eingebettete JSON-Daten, begrenzter Seitenumfang, ohne Script-Ausführung.                                                                            |
| Vollständiges Zielinserat | `supabase/functions/vinted-ai-search/listing-details.ts`                         | Alle verfügbaren Originalbilder, Beschreibung und strukturierte Merkmale bereits vorhanden.                                                                     |
| Aktueller Feed            | `supabase/schemas/108_sniper_search_filters.sql`, `ListingStore`                 | Bereits bekannte Artikel werden bei erneutem Fund nicht aktualisiert; Preisänderungen entstehen daraus nicht.                                                   |
| Aufbewahrung              | `supabase/schemas/50_sniper.sql`, `sniper_purge_expired_listings`                | Tatsächliche Löschbedingung drei Tage nach Erstfund. Alte Kommentare nennen abweichende Fristen; maßgeblich ist die Funktion.                                   |
| Eigene Verkäufe           | `services/marketplace-worker/src/vinted-sales.ts`                                | Kann an eine konkrete Transaktion gebundene Beträge und Paketkennzeichen erfassen. Kein frei nutzbarer Marktbestand und nicht jeder Datensatz hat einen Betrag. |
| Abrufsteuerung            | `services/sniper/src/runtime/paced-vinted-fetch.ts`, `search-request-planner.ts` | Bestehende Abstände, Zeitlimits und gemeinsame Anfragen nutzbar. Analyseaufträge dürfen diese Grenzen nicht umgehen.                                            |

## Empfohlener interner Ablauf

Die folgenden Schritte sind eine eigene Umsetzungsempfehlung, noch keine
implementierte Erweiterung:

1. **Zielartikel bestimmen.** Alle vorhandenen Fotos und Merkmale an die
   bestehende KI geben. Modellfamilie, genaue Variante, lesbare Artikelnummern,
   sichtbare Merkmale und Unsicherheit strukturiert trennen. Der Einkaufspreis
   ist für diese erste Identifikation nicht erforderlich.
2. **Vinted gezielt durchsuchen.** Aus Modellkandidaten Suchbegriffe erzeugen;
   direkte Katalogsuche über den vorhandenen Sammler ausführen. Marke und
   passende Kategorie nutzen. Keine Einkaufspreisobergrenze aus einem
   Schnäppchenfilter übernehmen: Sie würde die Vergleichsgruppe nach unten
   verzerren. Eine eigene begrenzte Analysewarteschlange nutzt dieselbe
   Abrufsteuerung und erzeugt keine neuen Feed-Meldungen.
3. **Vergleichsgruppe prüfen.** Zuerst nach Text, Kennung, Kategorie, Größe und
   Zustand eingrenzen; dann die Fotos aussichtsreicher Kandidaten gezielt
   gegen die Zielbilder prüfen. Passende Variante, ähnliche Variante und
   unpassender Artikel getrennt speichern. Keine breite Einzel-KI-Recherche
   für jeden Katalogtreffer auslösen.
4. **Beobachtungen unabhängig vom Feed aufbewahren.** Eigener fachlicher Bestand
   für Artikelmerkmale, Modellzuordnung, beobachtete Artikelpreise, Zeitpunkt,
   Quelllink und Status. Änderungen als neue Beobachtung speichern. Die
   kurzlebige Feed-Tabelle bleibt für ihren bisherigen Zweck erhalten; ihre
   Löschung darf die Analysedaten nicht mitlöschen. Nur benötigte öffentliche
   Produktangaben übernehmen, keine Käuferchats oder Verkäuferprofile sammeln.
5. **Status gezielt nachprüfen.** Für beobachtete Artikel in begrenzten Abständen
   die Detailseite lesen. Aktuell, reserviert, ausdrücklich verkauft,
   nicht verfügbar und unbekannt unterscheiden. Eine verschwundene oder
   gesperrte Seite ist kein Verkaufsbeleg. Der genaue Verkaufszeitpunkt liegt
   häufig nur in einem Beobachtungsintervall.
6. **Preise selbst berechnen.** Doppelte Inserate und eigene Zielanzeige
   ausschließen. Für geeignete Vergleichsgruppen Fallzahl, Median,
   Quartile/Streuung und Datenalter ausrechnen. Neue und gebrauchte Artikel
   sowie vergleichbare und abweichende Varianten nicht zusammenwerfen.
   Datenabdeckung und Unsicherheit ausweisen; bei fehlenden Vergleichsdaten
   keine präzise Spanne erzwingen.
7. **KI erklärt die Befunde.** Nur ausgewählte Belege und die berechneten Werte
   zusammenführen. Vorhandene Websuche für Modell- und Neupreisbelege bei Bedarf
   weiterverwenden; der Gebrauchtmarkt soll auf der eigenen Vinted-Sammlung
   beruhen. Ergebnisse und Modellzuordnungen wiederverwenden, soweit sie aktuell
   genug sind. Das Einsparpotenzial ist noch nicht gemessen.

## Drei strikt getrennte Preisarten

| Preisart                                     | Verfügbare Grundlage                                                    | Zulässige Aussage                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Laufender Angebotspreis                      | Aktuelle öffentliche Anzeige                                            | Dafür wird der Artikel angeboten.                                       |
| Letzter Angebotspreis vor Verkaufsmarkierung | Eigene Beobachtung und später ausdrücklich als verkauft markierte Seite | Das Inserat wurde verkauft markiert; der zuletzt sichtbare Preis war X. |
| Tatsächlich vereinbarter Betrag              | Berechtigte eigene, eindeutig zugeordnete Transaktion                   | Für diese Transaktion ist der Betrag belegt.                            |

Eigene Verkäufe bleiben im berechtigten Arbeitsbereich. Paketerlöse ohne
belegbare Aufteilung dürfen nicht als Einzelartikelpreise in den Vergleich.
Eine allgemeine Veröffentlichung oder Zusammenführung privater Kundendaten ist
nicht Bestandteil dieses Vorschlags.

## Erster sinnvoller Umsetzungsumfang

Direkte Vinted-Vergleichssuche, geprüfte Vergleichsgruppe und eigene Preisrechnung
sind vor einer langen Verkaufshistorie nutzbar. Parallel muss die eigene
Beobachtungshistorie beginnen; vergangene, nie beobachtete Vinted-Verkäufe lassen
sich damit nicht rückwirkend vollständig rekonstruieren. Anfangs stehen daher
Angebotsniveau und passende Vergleichsbelege im Vordergrund.

Vor einem Produktumbau sind insbesondere Variantenverwechslungen, verzerrte
Suchfilter, Preisänderungen, nicht verfügbare Seiten, erneute Inserate und
unbekannte Verkaufspreise mit kleinen Fällen abzusichern. Schema und Migration
der Beobachtungsdaten gehören zu derselben Umsetzung. Diese Recherche ändert
keine Anwendung, Datenbank, Serverkonfiguration oder laufende Sammlung.

## Kapazitätsnachweis

Eine anschließende isolierte Messung mit einer Million künstlicher
Artikelreferenzen und fünf Millionen Beobachtungen benötigt einschließlich
sieben Indizes rund 1,29 GB. Auf dem Server sind zur Messzeit etwa 18,8 GB frei;
Produktionslast und spätere Antwortzeiten sind damit nicht nachgewiesen.
[Messung, Grenzen und Planungsrahmen](2026-11-07-vinted-analysis-storage-capacity.md).
