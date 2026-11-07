# Mehr Marken, Saisonpausen und erneute Aktivierung der Artikelanalyse

Stand: 7. November 2026. Vertiefung der bisherigen Recherche mit drei
unterstützenden Analysen zu Anbieterquellen, Community-/Open-Source-Erfahrungen
und vorhandenem Flipbase-Code. Eigener Forschungszweig, nach erneutem Fetch
unverändert auf `origin/master` (`25eb50a4`). Keine Produktänderung und keine
zusätzlichen externen APIs oder kostenpflichtigen Produkte integriert.

## Ergebnis und Präzisierung des bisherigen Vorschlags

**Spätere Eingrenzung:** Für das konkrete Nutzerziel einer aktuellen
30-Tage-Artikelbewertung sind die hier untersuchten mehrjährigen
Saisonarchive optional. Der [aktuelle Kernumfang und die Rolle der KI](2026-11-07-vinted-analysis-current-market-scope.md)
sind gesondert beschrieben. Dieser Bericht dokumentiert die zusätzliche
Saisonfunktion, keine zwingende Voraussetzung für einen brauchbaren Preisvergleich.

Zehn oder zwanzig Marken sind grundsätzlich als Sammlung organisierbar. Die
Markenzahl allein sagt jedoch weder Speicherbedarf noch erreichbare Aktualität
voraus. Entscheidend sind eindeutige Suchabfragen, Seitentiefe, gewünschter
Prüftakt, tatsächliche Neuzugänge und Überschneidungen.

Eine saisonale Gruppe braucht drei unabhängige Dinge: **dauerhafte fachliche
Identität, zeitweise aktive Sammlung und eine begrenzte historische Auswertung**.
Die Pause beendet den Sammelbedarf, löscht aber keine Saisonstatistik. Nach einem
Jahr wird dieselbe Gruppe mit einem neuen Beobachtungszeitraum fortgesetzt.
Aktuelle Preise werden neu erhoben; das unbeobachtete Jahr bleibt eine Lücke.

Für diesen ausdrücklich genannten Saisonfall den bisherigen Entwurf erweitern:
14 Tage Detailverlauf, 90 Tage kompakte Einzelbelege und 180 Tage Kennungen
bleiben Ausgangsgrößen. **Monatsstatistiken für 36 statt 24 Monate** bieten mehr
Spielraum für Vorjahressaisons nach längerer Pause. Bei den bisherigen
Musterannahmen kostet das rund **177 MB zusätzlich**, nicht ein weiteres Jahr
aller Inserate. Die ursprüngliche 24-Monats-Rechnung bleibt im
[Aufbewahrungsbericht](2026-11-07-vinted-analysis-retention-strategy.md)
nachvollziehbar.

## 1. Tatsächlicher Markenmix

Am 7. November, 12:40 UTC, ausschließlich lesend ermittelt. Fünf aktive Filter
enthalten **sieben unterschiedliche Vinted-Markenbezeichnungen**:

| Marke             | Aufnahmen in den letzten 24 Stunden | Suchbereich                      |
| ----------------- | ----------------------------------: | -------------------------------- |
| Nike              |                              27.251 | Herrenbekleidung                 |
| adidas            |                              15.489 | Herrenbekleidung                 |
| Polo Ralph Lauren |                               6.954 | Herrenbekleidung                 |
| Ralph Lauren      |                               6.010 | Herrenbekleidung                 |
| Blauer            |                                 975 | Jacken und Mäntel                |
| Blauer USA        |                                  53 | Jacken und Mäntel                |
| Carhartt          |                                  31 | Fleecejacken mit Preisobergrenze |

Das sind neue Feedaufnahmen innerhalb der kurzen bestehenden Aufbewahrung,
keine belegten langfristig einmaligen Veröffentlichungen. Der enge
Carhartt-Filter ist mit der breiten Nike-Suche nicht vergleichbar. Eine
Hochrechnung „20 statt fünf Filter = viermal so viele Artikel“ wäre falsch.
Auch sieben Vinted-Bezeichnungen sind nicht zwingend sieben unabhängige
Markenfamilien. Schreibweisen, Untermarken und tatsächlich verschiedene
Produktlinien nicht ungeprüft zusammenführen.

## 2. Wie der vorhandene Sammler skaliert

Der vorhandene Code erlaubt zehn Marken je Filter. Marken und ODER-Suchbegriffe
erzeugen rotierende Teilabfragen. Je Takt wird eine Teilabfrage ausgeführt.
Identische Quellparameter gleichzeitig fälliger Filter können einen Abruf
teilen. Ähnliche, aber unterschiedliche Quellabfragen werden nicht automatisch
vereinigt.

Beispiel: Zehn Marken in einem Filter mit 20-Sekunden-Takt bedeuten frühestens
einen Umlauf je Marke in 200 Sekunden, nicht zehn Marken alle 20 Sekunden.
Zusätzliche Seiten, Fehler und andere Filter verlängern ihn.

Planungsformel, identische gemeinsame Abrufe nur einmal gezählt:

`Abrufe pro Minute = Summe(Teilabfragen × mittlere Seitenzahl / Zielintervall in Minuten)`

| Vereinfachtes Ziel: eine Kategorie, ein Suchzweig, eine Seite je Marke |     10 Marken |     20 Marken |
| ---------------------------------------------------------------------- | ------------: | ------------: |
| Jede Marke alle fünf Minuten                                           |  2 Abrufe/min |  4 Abrufe/min |
| Jede Marke alle 20 Sekunden                                            | 30 Abrufe/min | 60 Abrufe/min |

Die bestätigte Konfiguration des Sammlers ergibt höchstens 24 Abrufe/min durch
2.500 ms Mindestabstand, trotz nominellem Budget von 30/min. Das ist der
gemeinsame theoretische Rahmen, keine von Vinted zugesagte Quote. Die Tabelle
belegt keine freie Restkapazität neben den bestehenden Suchen. Zwanzig Marken
mit je drei Kategorien und drei Seiten alle zehn Minuten würden bereits
18 Abrufe/min benötigen, noch vor Einzelprüfungen und Wiederholungen.

Preisanalysen und der schnelle Feed für Einkaufsgelegenheiten brauchen daher
getrennte Aktualitätsziele. Vorhandene Abrufe wiederverwenden; zusätzliche
Analyseabfragen in dasselbe begrenzte Budget einordnen. Mehr parallele Worker
umgehen diese Grenze nicht sinnvoll.

Empfohlener Ablauf beim Hinzufügen neuer Gruppen:

1. Geplante Quellabfragen einschließlich Marken-/Begriffsrotation,
   Überschneidungen und Zielintervallen berechnen.
2. Mit kleinem begrenztem Sammelumfang beginnen und tatsächliche Neuzugänge,
   Seitentiefe, Wiederfunde und Abrufdauer messen.
3. Nach 7–14 Tagen den tatsächlichen Aufwand und die erreichte Abdeckung
   beurteilen; keine Kapazitätszusage allein aus der Markenzahl ableiten.
4. Bei Überlast Intervalle und Gruppenumfang anpassen. Kleine relevante Gruppen
   dürfen nicht dauerhaft von einer großen Marke verdrängt werden.

Ein festes Abrufbudget je Gruppe und eine faire Warteschlange sind hierfür ein
geeigneter Anfang. Keine tägliche unbegrenzte Vollerfassung aller Marken
versprechen. Eine begrenzte Auswahl als Stichprobe kennzeichnen; das erste
Ergebnisfenster ist nicht automatisch eine repräsentative Marktstichprobe.

## 3. Was Konkurrenz und offene Projekte zusätzlich zeigen

| Quelle                                                                                                                                                                                          | Tatsächlich öffentlich nachvollziehbar                                                                                  | Ableitung für Flipbase                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [Keepa Tracking Object](https://keepa.com/api-docs/tracking-object.html) und [Tracking API](https://keepa.com/api-docs/tracking.html)                                                           | Prüfauftrag mit Aktivstatus, Intervall und Ablaufzeit; deaktiviertes Tracking kann erneut aktiviert werden              | Prüfauftrag vom Produkt und seiner Historie trennen. Keine Aussage ableiten, ob das Entfernen eines Auftrags globale Historie löscht          |
| [Prisync Pause URL](https://intercom.help/prisync/en/articles/9891192-edit-report-delete-or-pause-url)                                                                                          | Pause nimmt eine URL aus Berichten und automatischer Preisberechnung                                                    | Sammlung, Verwendung in aktueller Bewertung und historische Aufbewahrung sind unterschiedliche Zustände. Ein Abrufstopp ist dort nicht belegt |
| [Prisync Product History](https://intercom.help/prisync/en/articles/9891194-product-history)                                                                                                    | Ein Jahr Historie; für längere Zeiträume empfiehlt der Anbieter gespeicherte Exporte                                    | Eine knappe Jahresgrenze ist für Wiederaufnahme nach einem Jahr ungünstig                                                                     |
| [devoidx/price-tracker: Modelle](https://github.com/devoidx/price-tracker/blob/main/backend/models.py) und [Scheduler](https://github.com/devoidx/price-tracker/blob/main/backend/scheduler.py) | `Product`, `Source` und `PriceHistory` getrennt. Inaktive Quelle erhält keinen Job; das ist keine Löschung der Historie | Direkt einsehbares Muster für Pause unabhängig von Datenlöschung. Kein Nachweis für Vinted-Eignung oder große Last                            |
| [Comps](https://swanum.com/comps/docs)                                                                                                                                                          | Suchgruppen bauen Historie erst mit der Beobachtung auf; Abdeckung ist ausdrücklich Teil der Antwort                    | Wiederaufnahme muss Datenalter und Erfassungslücken berücksichtigen                                                                           |

### Resale IQ: eine offen beschriebene Skalierungsgrenze

Der zusätzliche Anbieter **Resale IQ unter `resaleiq.dev`** ist nicht identisch
mit dem zuvor untersuchten `reselliq.app`. Seine
[Methodik](https://resaleiq.dev/methodology) trennt Sammlung, Überprüfung und
Kennzahlenberechnung. Er berichtet von teilweise abgearbeiteten Markenlisten
bei begrenzten Laufzeiten: In der abgerufenen Deutschland-Auswertung wurden im
Mittel rund 54 Prozent der Marken je Lauf gelesen. Das ist eine öffentliche
Selbstauskunft, keine unabhängige Leistungsprüfung. Sie zeigt, warum ein
erfolgreicher Lauf allein keine vollständige Abdeckung beweist.

Sein [öffentliches Daten-Repository](https://github.com/resaleiq/resaleiq-open-data)
veröffentlicht unter anderem Marke, Artikelart, Markt, Zeitraum, Fallzahl,
Median, Quartile und Unsicherheitsintervalle. Marktübergreifende Auswertungen
werden dedupliziert; Länderzeilen dürfen nicht einfach addiert werden. Dieses
Format zeigt veröffentlichte Ergebnisse, nicht interne Datenbanktabellen.

Seine Beobachtung verschwundener Inserate wird ausdrücklich von nachgewiesenen
Verkäufen unterschieden. Eine solche Abgangskennzahl übernehmen wir nicht als
Verkaufsnachweis. Interne Löschfristen und vollständige technische Architektur
der kommerziellen Anbieter bleiben öffentlich unbelegt.

## 4. Was Reddit und fachliche Methodik beitragen

Ein [Reddit-Praxisbericht zu NASdisks](https://www.reddit.com/r/selfhosted/comments/1wbvbnk/with_nas_drive_prices_this_volatile_i_track_the/)
enthält eine konkrete Fehlerbestätigung des Entwicklers: falsche Modellzuordnung
und gebrauchte beziehungsweise aufbereitete Ware gelangten in eine vermeintliche
Neupreishistorie. Er bestätigt auch, den Zustand bisher nicht an jeder
Preisbeobachtung festzuhalten. Das ist eine praktische Erfahrung, kein
Leistungsbenchmark und keine unabhängige Prüfung des Dienstes.

Die Folgerung für uns: Ein später korrigierter Modellname oder Zustand darf
nicht stillschweigend alle alten Preisbelege umdeuten. Merkmalszuordnung und
Berechnungsmethode müssen zeitbezogen nachvollziehbar bleiben.

Die [Reddit-Diskussion zur zeitbasierten PostgreSQL-Aufbewahrung](https://www.reddit.com/r/PostgreSQL/comments/1gf7mu1/timebased_retention_strategies_in_postgres/)
führt zu einem [technischen Erfahrungsbericht von Sequin](https://blog.sequinstream.com/time-based-retention-strategies-in-postgres/).
Er vergleicht paketweises Löschen und zeitbasierte Partitionierung. Seine
synthetischen Größen-/Geschwindigkeitswerte stammen von anderer Hardware und
sind kein Kapazitätsnachweis für Flipbase. Die übertragbaren Grenzen von
Partitionierung und Vacuum sind bereits gegen die offizielle PostgreSQL-
Dokumentation im Aufbewahrungsbericht geprüft. Beispielcode nicht ungeprüft
übernehmen; für diese Aufgabe wurden keine Erweiterungen installiert.

Für Winter/Sommer ist die
[deutsche HICP-Methodik bei Eurostat](https://ec.europa.eu/eurostat/cache/metadata/en/prc_hicp_esmshi4_de.htm)
besonders passend: Sie beschreibt getrennte ganzjährige, Winter- und
Sommer-Teilstichproben, detaillierte Produktmerkmale und Probleme beim Vergleich
von Saisonende-Rabatten. Übertragbar sind Saisonbezug und Vergleichbarkeit.
Die dort für einen Preisindex verwendete rechnerische Fortschreibung fehlender
Preise wird nicht als beobachteter Vinted-Preis übernommen.

[Microsoft Research zum Crawl-Scheduling](https://www.microsoft.com/en-us/research/project/web-crawl-scheduling/)
behandelt begrenzte Abrufkapazität und unterschiedliche, nur teilweise
beobachtbare Änderungsraten. Das stützt unterschiedliche Prioritäten und
Intervalle, liefert aber kein fertiges Vinted-Limit oder eine Garantie für
vollständige Erfassung.

## 5. Präziser fachlicher Vertrag für Saisonpausen

| Zustand        | Sammlung                                   | Historische Daten                                     | Aktuelle Preisbewertung                                           |
| -------------- | ------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------- |
| Aktiv          | Geplante budgetierte Abrufe                | Werden weiter aufgebaut                               | Nur ausreichend passende, frische Belege verwenden                |
| Pausiert       | Kein zusätzlicher Abrufbedarf dieser Regel | Normale Verdichtung und Aufbewahrung laufen weiter    | Alte Werte bleiben historisch; keine aktuellen Preise vortäuschen |
| Wiederaufnahme | Begrenzter neuer Ausgangsbestand           | Dieselbe Gruppenidentität, neuer Beobachtungszeitraum | Schrittweise aus frischen Treffern aufbauen                       |
| Archiviert     | Keine regulären Abrufe                     | Bis zum festgelegten Ablauf aufbewahren               | Nur historische Auswertung                                        |

Eine geringe Grundbeobachtung außerhalb der Saison wäre ein anderer, ausdrücklich
aktiver Modus. Sie darf nicht heimlich als „Pause“ weiterlaufen.

Wenn eine andere aktive Regel dieselbe öffentliche Quellabfrage benötigt, kann
diese weiterhin zentral einmal ausgeführt werden. Das ist eine vorgeschlagene
Bedarfsverwaltung, keine bereits vorhandene automatische Funktion. Die pausierte
Gruppe gilt dadurch nicht als lückenlos beobachtet. Tatsächlich passende Daten
anderer aktiver Regeln können nur mit ihrem wirklichen Zeitraum und ihrer
Herkunft verwendet werden. Private Verkaufstransaktionen bleiben im jeweiligen
Arbeitsbereich.

### Beispiel: Winterjacken ein Jahr pausieren

1. Eine Gruppe „Marke / Winterjacken / Modellfamilie / Zustand / Markt“ besitzt
   bereits Daten aus der Saison 2026/27.
2. Beim Pausieren endet ihr Beobachtungszeitraum. Regel und Modellzuordnungen
   bleiben bestehen. Einzelbelege altern nach den normalen Fristen aus;
   kompakte Saison-/Monatswerte bleiben erhalten.
3. Das folgende unbeobachtete Jahr ist keine Periode mit null Angeboten,
   null Verkäufen oder unveränderten Preisen.
4. Beim Wiederstart bleibt die Gruppenkennung gleich. Eine neue Periode wird
   eröffnet, alte fällige Abrufaufträge werden nicht jahresweise nachgeholt.
5. Aktuelle Vergleichsangebote werden begrenzt neu gesammelt. Dieser
   Ausgangsbestand ist nicht automatisch gerade veröffentlicht und erzeugt
   keine Flut vermeintlich neuer Einkaufsgelegenheiten.
6. Die Bewertung unterscheidet aktuelle Belege von früherer Saisonstatistik.
   Fehlen frische passende Daten, bleibt nur der ausdrücklich historische Bezug.

Eine unbekannte Verkaufsdauer darf nicht die gesamte Pause umfassen. Zwischen
„zuletzt vor einem Jahr aktiv gesehen“ und „jetzt verschwunden“ lässt sich kein
konkreter Verkaufstag ableiten. Eine Wiederaufnahme stellt auch nicht die
abgelaufene globale ID-Deduplizierung wieder her: Nach 180 Tagen gelöschte
Kennungen können nur als erstmals in der neuen Periode beobachtet gelten.

## 6. Dauerhafte Struktur im bestehenden PostgreSQL

Den bisherigen Tabellenentwurf um eine klare Trennung von Fachidentität und
Sammlung ergänzen:

| Baustein                                      | Verantwortung                                                                                                              |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `vinted_comparison_groups`                    | Stabile Marke, Produktart/Modellfamilie und Vergleichsmerkmale; unabhängig vom Feedfilter                                  |
| `vinted_comparison_group_versions`            | Historische Merkmals-/Zuordnungsfassung, damit eine Umbenennung oder Modellkorrektur alte Belege nicht unbemerkt verändert |
| `vinted_collection_rules`                     | Suchparameter, aktiv/pausiert/archiviert, Zielintervall, Priorität und Abrufbudget                                         |
| `vinted_observation_periods`                  | Beginn, Ende und Grund eines Beobachtungsabschnitts; fachliche Regelversion                                                |
| `vinted_group_coverage_daily`                 | Tatsächliche Erfassung, Ausfälle, Teilabdeckung und geplante Pausen als kleine begrenzte Tageszusammenfassung              |
| Artikel-, Beobachtungs- und Statistiktabellen | Preisbelege und Verdichtung mit Gruppenfassung, Zeitbezug und nachvollziehbarer Herkunft                                   |

Eine öffentliche Artikelbeobachtung kann mehrere Gruppen betreffen. Sie wird
einmal gespeichert und über begrenzte Zuordnungen verknüpft, nicht pro Filter
kopiert. Zusammengefasste Statistiken behalten ihre Zähleinheit; überlappende
Gruppen ergeben durch Addition keine eindeutige Gesamtmenge.

Produktdefinitionen bleiben bestehen, solange sie verwendet oder von
aufbewahrter Historie referenziert werden. Auch ihre Anzahl ist begrenzt zu
überwachen; nicht für jeden frei erzeugten KI-Modellnamen eine neue dauerhafte
Gruppe anlegen. Bestätigte Artikelnummern, Merkmale und Modellzuordnungen
wiederverwenden. Neue Modellgenerationen nicht allein aufgrund desselben
Namens mit einer alten Saison gleichsetzen.

Ein weiterer Anbieter beschreibt genau die wichtige Unterscheidung zwischen
Zielobjekt, Sammellauf und Beobachtungsergebnis: [Web Scraper, Preisverlaufsdaten](https://webscraper.io/blog/build-price-history-dataset-scheduled-scrapes).
Bei Speicherung nur tatsächlicher Änderungen empfiehlt er zusätzliche
Erfassungsnachweise, damit „unverändert geprüft“ nicht mit „nicht beobachtet“
verwechselt wird. Für Flipbase reichen dafür begrenzte Betriebsnachweise und
letzte erfolgreiche Artikelprüfung; langfristige Gruppenabdeckung beweist
allerdings keine lückenlose Prüfung jedes einzelnen Artikels.

Für die KI-Artikelanalyse folgt daraus: Das konkrete Inserat wird mit seinen
Bildern und Merkmalen identifiziert und einer passenden Gruppenfassung
zugeordnet. Anschließend erhält die KI eine begrenzte Auswahl frischer
Vergleichsbelege sowie gesonderte historische Saisonwerte mit Datenstand,
Preisart und Abdeckung. Sie erhält nicht den gesamten Markenbestand. Fehlende
aktuelle Belege können eine begrenzte Recherche auslösen; das Öffnen einer
alten Gruppe aktiviert nicht automatisch sämtliche pausierten Sammelregeln.
Zwischengespeicherte Ergebnisse müssen ihre Gruppenfassung und den Datenstand
berücksichtigen, damit eine Wiederaufnahme keinen alten Preis als neu ausgibt.

## 7. Saisonvergleich und zusätzliches Speicherbudget

Monat und Jahr bleiben gespeichert; eine Saison kann über den Jahreswechsel
reichen. „Winter 2026/27“ mit „Winter 2027/28“ vergleichen, nicht ungeprüft einen
Sommermonat mit einem Wintermonat. Für Preise zusätzlich Modellgeneration,
Zustand, Größenmix, Währung, Preisart und Erfassungsabdeckung beachten.
Ein veränderter Durchschnitt kann auf andere Artikel im Sortiment zurückgehen,
statt auf eine Preisänderung desselben Artikels.

Der [Anbieter Data Purl](https://data-purl.com/methodology) dokumentiert unter
anderem Vergleiche gleicher Kalenderwochen, getrennte Betrachtung identischer
Produkte und Sortimentsverschiebungen sowie versionierte Veröffentlichungen.
Seinen regelmäßigen vollständigen historischen Neuaufbau könnten wir nach
bewusstem Löschen alter Einzelbelege nicht übernehmen. Deshalb unsere
Berechnungsfassungen und Grenzen späterer Korrekturen explizit erhalten.

Die bereits gemessene Musterstruktur mit 10.000 Gruppen, 40 Preisintervallen
und drei Preisarten ergibt hochgerechnet:

| Monatsstatistik | Tabellen-/Indexgröße |
| --------------- | -------------------: |
| 24 Monate       |          rund 354 MB |
| 36 Monate       |          rund 532 MB |
| Unterschied     |          rund 177 MB |

Dies ist eine lineare Hochrechnung aus dem vorherigen isolierten Messlauf,
keine neue Produktionsmessung. Der Gesamtansatz mit gemeinsamer Kennungstabelle
steigt damit bei 56.000 Aufnahmen täglich und fünf Detailbeobachtungen von rund
3,29 auf **3,47 GB** vor zusätzlichen Betriebsreserven. Die kürzere
7/60/120-Tage-Variante steigt von 2,17 auf **2,35 GB**. Neue Gruppenfassungen,
Herkunftszuordnungen und zusätzliche Abdeckungsdaten sind noch nicht gemessen.

Bei 100.000 Gruppen statt 10.000 wären allein dieselben 36-Monatsstatistiken
rund 5,32 GB groß. Längere Aufbewahrung daher mit einer begrenzten fachlichen
Gruppierung verbinden. Nicht jede Farbe, Größe, Kategorie, Saison und jedes
freie Wort beliebig miteinander kombinieren.

Pausierte Gruppen verursachen keine neuen planmäßigen Artikelaufnahmen.
Kurzlebige Rohdaten laufen aus; die begrenzten alten Monatswerte bleiben.
Zehn neue Marken und zehn pausierte Marken sind daher etwas anderes als zwanzig
gleichzeitig intensiv beobachtete große Sortimente.

## 8. Konkrete Lücke im bestehenden Wiederanlauf

Der heutige Filter erhält beim Pausieren/Aktivieren seinen Seed, Cursor und die
höchste beobachtete Artikelnummer. Seine Revision ändert sich. Der erste
Wiederanlauf besitzt deshalb keinen passenden vorherigen Überlappungsstand:
Er liest zunächst eine Seite und kann Abdeckung `unknown` melden; spätere
Durchläufe holen höchstens drei Seiten auf. `caught_up` bedeutet Überlappung
mit einem begrenzten Ausschnitt, keine Vollerfassung des Marktes.

Eine saisonale Neuanlage des Ausgangsbestands ist derzeit nicht ausdrücklich
implementiert. Das muss bei der Umsetzung zusammen mit der neuen
Beobachtungsperiode gelöst werden. Die Filterrevision allein ist dafür
ungeeignet, weil sie auch bei anderen Änderungen steigt.

Geprüfte Stellen: `services/sniper/src/domain/search-filter-request.ts`,
`services/sniper/src/runtime/search-request-planner.ts`,
`services/sniper/src/runtime/scheduler.ts`,
`services/sniper/src/store/query.store.ts` sowie
`supabase/schemas/105_sniper_administration.sql` und
`supabase/schemas/108_sniper_search_filters.sql`.

## Nachweise und offene Punkte

Produktionszahlen aus `production-brand-scaling.log` im privaten Ordner
`C:/Users/Grisc/.codex/tmp/flipbase-internal-vinted-analysis/`.
Nur aggregierte öffentliche Marken-/Kategorieangaben, lesende Transaktion mit
Zeitlimit und `rollback`, Exitcode 0. Kein neuer Vinted-Sammellauf ausgelöst.

Quellen und offene Implementierungen am 7. November gelesen. GitHub-Dateien
über den vorhandenen Connector geprüft. Anbieterangaben nicht unabhängig
gemessen. Reddit-Erfahrungen nicht als Hardware- oder Kapazitätsgarantie
verwendet. Keine Konkurrenzimplementierung kopiert.

Dokumente gezielt formatiert und `git diff --check` ausgeführt. Keine
Anwendungstests oder Builds für reine Recherche. Kein Datenbankschema,
Sammelverhalten oder Löschauftrag geändert. Reale Zusatzlast für neue Marken,
ausreichende Stichprobengröße je Modell und Kosten des vollständigen
Produktionsschemas bleiben vor Umsetzung zu messen.
