# Zulauf, Aktualisierung und Aufbewahrung der Vinted-Artikelanalyse

Stand: 7. November 2026. Fortsetzung der Recherche auf
`juna/product-price-analysis-research`, Grundlage `origin/master` nach erneutem
Abruf unverändert `25eb50a4`. Drei unterstützende Analysen untersuchten Quellen,
den vorhandenen Sammler und die Kapazitätsrechnung. Keine Produktänderung, kein
zusätzlicher Anbieterzugang und keine Änderung produktiver Daten.

## Ergebnis

Die spätere [Vertiefung zu Marken und Saisonpausen](2026-11-07-vinted-analysis-seasonal-collection.md)
ergänzt diesen Entwurf um dauerhafte Produktgruppen und getrennte
Beobachtungsperioden. Für längere Saisonpausen empfiehlt sie 36 statt 24 Monate
Statistik und rechnet den Mehrbedarf gesondert aus. Die folgenden 24-Monats-
Zahlen dokumentieren weiterhin die ursprüngliche Messgrundlage.

Beim aktuell beobachteten Zulauf von rund **56.000 Feedaufnahmen täglich** wäre
eine Million Artikel schon nach **18 Tagen** erreicht. Den gesamten Bestand
täglich oder wöchentlich einzeln nachzuprüfen, passt nicht in den vorhandenen
Abrufrahmen. Speichern, erneut prüfen und eine Preisänderung aufzeichnen müssen
deshalb getrennte Vorgänge sein.

Empfohlener Ausgangspunkt: **14 Tage detaillierte Änderungen, bis Tag 90 kompakte
Artikelbelege, Wiedererkennung der Kennungen bis Tag 180 und Monatsstatistiken
für höchstens 24 Monate.** Bei konstantem heutigem Zulauf ergeben die gemessenen
Musterstrukturen je nach Deduplizierungsaufbau rund **2,8–3,3 GB** reine Tabellen
und Indizes. Für den einfacheren Aufbau mit einer gemeinsamen Kennungstabelle
sind zunächst **4–5 GB Betriebsrahmen** sinnvoll; Schreibprotokolle, Backups und
temporäre Wartungsdateien kommen hinzu. Das ist keine bereits freigegebene oder
eingerichtete Speicherzuteilung.

Soll das frühere Planungsbudget von 3 GB unverändert bleiben, ist **7 Tage
detailliert, 60 Tage kompakt und 120 Tage Kennungen** bei gleicher Monatsstatistik
die passendere Ausgangsvariante: rund **2,17 GB** frische Tabellen und Indizes.
Alternativ lässt sich der täglich aufgenommene Bestand auf relevante
Vergleichsgruppen begrenzen. Eine Million war zuvor eine Messgröße, keine
belastbare Aussage über ein ganzes Quartal Eurer aktuellen Sammlung.

## 1. Tatsächlich gemessener Zulauf

Produktionsabfragen ausschließlich lesend, mit `begin read only`, begrenzter
Abfragezeit und abschließendem `rollback`. Es wurden aggregierte Zahlen und
öffentliche Kategoriebezeichnungen gelesen, keine Verkäuferprofile exportiert.

Momentaufnahme vom 7. November um 12:23:55 UTC:

| Kennzahl                             |               Ergebnis |
| ------------------------------------ | ---------------------: |
| Gespeicherte Feedartikel             |                167.745 |
| Aufnahmen in den letzten 24 Stunden  |                 55.948 |
| Aufnahmen in den letzten 48 Stunden  |                110.941 |
| Daraus vorheriges 24-Stunden-Fenster |                 54.993 |
| Ältester vorhandener Erstfund        | 4. November, 12:23 UTC |
| Als Initialbestand markierte Zeilen  |                      0 |

Weitere zeitnahe Abfragen bestätigen fünf aktive Filter und ausschließlich
Vinted-Artikel. Die Filter betreffen unter anderem Herrenbekleidung sowie
Jacken/Mäntel; nur ein enger Filter betrifft Carhartt-Fleecejacken. Die
Gesamtrate ist **keine Carhartt- oder Fleecejackenrate**.

Der vorhandene Feed löscht nach drei Tagen seit `first_seen_at`. Er dedupliziert
innerhalb des vorhandenen Bestands über Marktplatz und externe Artikelkennung.
Nach Löschung und Wiederfund kann eine Kennung erneut aufgenommen werden.
Deshalb sind die Zahlen eine kurzfristige **Eingangsrate der bestehenden
Sammlung**, keine bewiesene langfristige Rate erstmals veröffentlichter Artikel.
Eine stabile Wochen-/Monatsrate und die tatsächliche Änderungshäufigkeit sind
derzeit nicht rekonstruierbar. Die veränderliche Initialbestandsmarkierung
ersetzt ebenfalls kein dauerhaftes Ereignisprotokoll.

Die Anzahl der Filtertreffer darf nicht addiert werden: Ein Artikel kann mehrere
Filter erfüllen. Auch die ständig überschriebene Zeile `sniper_runtime_status`
ist keine historische Auslastungsmessung.

### Datenqualität vor Menge

Um 12:24 UTC fehlte bei 55.948 von 55.979 Aufnahmen der letzten 24 Stunden eine
konkrete Artikelkategorie. Der Code übernimmt eine Suchkategorie bewusst nur,
wenn sie eine Blattkategorie ist. „Herren > Kleidung“ oder „Jacken & Mäntel“
sind keine gesicherte genaue Produktart. Marke und Größe waren in einer
weiteren Momentaufnahme vorhanden, Zustand fast durchgehend.

Damit sind 56.000 Eingangszeilen nicht automatisch 56.000 geeignete
Modellvergleiche. Quellenkategorie, bestätigte Artikelkategorie und abgeleitetes
Modell müssen getrennt bleiben. Detailseiten und Bilder für die tatsächlich
analysierten Artikel vollständig nutzen; nicht jeden allgemeinen Feedfund
zusätzlich mit Einzelabruf und KI qualifizieren.

## 2. Wachstum ohne Verdichtung

Annahme: 56.000 Aufnahmen täglich, fünf gespeicherte Preis-/Statusbeobachtungen
je Artikel. Grundlage ist die vorherige isolierte Messung mit einer Million
Referenzen und fünf Millionen Beobachtungen: 1.288.290.304 Bytes einschließlich
Indizes. Alle GB-Angaben sind dezimal.

| Aufbewahrung |    Artikel | Tabellen und Indizes |
| ------------ | ---------: | -------------------: |
| 7 Tage       |    392.000 |              0,51 GB |
| 14 Tage      |    784.000 |              1,01 GB |
| 30 Tage      |  1.680.000 |              2,16 GB |
| 90 Tage      |  5.040.000 |              6,49 GB |
| 180 Tage     | 10.080.000 |             12,99 GB |
| 365 Tage     | 20.440.000 |             26,33 GB |

Dies sind Hochrechnungen, keine Messungen dieser gesamten Bestände. Fünf
Beobachtungen sind eine Modellannahme, keine gemessene Häufigkeit. Bei zehn
statt fünf Beobachtungen benötigen schon 30 Tage etwa 3,34 GB. Unveränderte
Prüfungen sollen deshalb keine weitere Historienzeile erzeugen.

Die vorherige Serveraufnahme ergab 18,8 GB freien Dateisystemplatz und 1,34 GB
Produktionsdatenbank. Dieser freie Platz steht auch bestehenden Funktionen,
Backups, Releases und PostgreSQL-Schreibprotokollen zur Verfügung.

## 3. Ein zweites gemessenes Speichermodell

Erneut eigene lokale PostgreSQL-17-Instanz, zwei CPUs, 1 GiB RAM, kein Netzwerk,
keine eingebundenen Datenverzeichnisse und ausschließlich künstliche Daten.

| Musterbestand                                                         | Gemessene Größe einschließlich Indizes |
| --------------------------------------------------------------------- | -------------------------------------: |
| 1.000.000 kompakte Artikelbelege                                      |         218.652.672 Bytes, rund 219 MB |
| 1.000.000 Kennungen mit Erstfund und Ablaufdatum                      |           99.000.320 Bytes, rund 99 MB |
| 10.000 normalisierte Vergleichsgruppen                                |                        1.048.576 Bytes |
| 240.000 Monatsstatistiken: 10.000 Gruppen × 24 Monate × eine Preisart |         118.120.448 Bytes, rund 118 MB |

Der kompakte Artikelbeleg enthält die Vinted-Kennung, Gruppenkennung,
Beobachtungszeitgrenzen, letzten aktiven und ersten verkauft markierten
Zeitpunkt, ersten/letzten/niedrigsten/höchsten Preis, Änderungsanzahl, Status,
Belegart und Quellmarkt. Er besitzt drei Indizes. Produktmerkmale stehen in
der referenzierten Gruppe. Vollständige Links/Titel, Bilder und Beschreibungen
fehlen in dieser Stufe. Die Kennung ermöglicht eine Quellreferenz, garantiert
aber keine später noch erreichbare Inseratseite.

Die Statistikmuster enthalten Anzahl, Summe, Minimum, Maximum und 40
Preisintervalle mit Zählern. Die Intervalle dienen der Größenmessung; ihre
fachlich passende Feinheit muss je Preisbereich festgelegt werden. Die
gemessenen 10.000 Gruppen sind eine Annahme über Kombinationen aus Merkmalen,
nicht 10.000 Modelle mit beliebig vielen zusätzlichen Größen-/Zustandsgruppen.
Bei 100.000 Gruppen würden allein dieselben Monatsstatistiken für drei
Preisarten hochgerechnet rund 3,54 GB benötigen. Für private tatsächliche
Verkaufspreise erzeugt die Trennung nach Arbeitsbereich zusätzliche Gruppen;
deren Zahl ist in diesem pauschalen Muster nicht gemessen.

Keine WAL-/Backup-/Wartungskosten, keine echten parallelen Abfragen, keine RLS-
oder Lastprüfung. Zusätzliche Provenienzfelder, Indizes, Prüfwarteschlangen und
viele weitere Gruppen können die Größe erhöhen.

## 4. Konkrete Aufbewahrungsstufen

| Alter seit Erstbeobachtung | Gespeichert                                                                              | Laufende Behandlung                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Tag 0–14                   | Schlanke Referenz, relevante Merkmale, Link und tatsächlich beobachtete Änderungen       | Passende Katalogsichtungen übernehmen; ausgewählte Artikel gezielt nachprüfen                                          |
| Tag 15–90                  | Ein kompakter Artikelbeleg statt des gesamten Verlaufs                                   | Bei neuer Beobachtung letzten Preis/Status und Zusammenfassung fortschreiben; vollständige alte Verlaufskurve entfällt |
| Tag 91–180                 | Nur Kennung und Zeitgrenzen zur Wiedererkennung; Preisbeleg zuvor in Statistik überführt | Kein routinemäßiger Einzelabruf allein wegen Archivierung                                                              |
| Bis 24 Monate              | Begrenzte Monatsstatistiken je Vergleichsgruppe und Preisart                             | Saisonvergleiche; keine Aussage über aktuelle Verfügbarkeit alter Artikel                                              |
| Danach                     | Keine reguläre Statistik mehr                                                            | Nach kontrolliertem Ablauf entfernen                                                                                   |

Die Frist wird durch eine Nachprüfung nicht verlängert. Ein alter Artikel ist
nicht automatisch verkauft: Auch aktive oder ungeklärte Artikel können nach
Tag 90 aus der Einzelspeicherung herausfallen. Ihr letzter bekannter Zustand
und die Beobachtungslücke bleiben Bestandteil der Statistik.

Für seltene Modelle können wenige ältere konkrete Belege nützlich sein. Ein
solcher zusätzlicher Belegbestand braucht eine eigene Mengen-/Speichergrenze
und zählt nicht als aktuelle Marktstichprobe. Er ist in der Rechnung nicht
enthalten. Die Bilder des gerade analysierten Inserats können weiterhin zur
Modellbestimmung verwendet werden, ohne sie als Vergleichsarchiv zu speichern.

### Rechnung bei 56.000 Aufnahmen täglich

| Bestandteil                                          | Größe, hochgerechnet |
| ---------------------------------------------------- | -------------------: |
| 14 Tage Referenzen und fünf Beobachtungen            |             1,010 GB |
| Weitere 76 Tage kompakte Artikelbelege               |             0,931 GB |
| Kennungen ausschließlich für weitere 90 Tage         |             0,499 GB |
| 24 Monate, 10.000 Gruppen, drei getrennte Preisarten |             0,354 GB |
| Gruppenstammdaten                                    |             0,001 GB |
| Summe bei exklusivem Wechsel zwischen den Stufen     |         **2,795 GB** |

Ein exklusiver Wechsel muss bei paralleler Erfassung und Archivierung atomar
sein. Andernfalls können Doppelaufnahmen zwischen mehreren Tabellen entstehen.
Ein einfacherer Entwurf hält einen gemeinsamen eindeutigen Kennungsschlüssel
über alle 180 Tage und verknüpft Referenz beziehungsweise kompakten Beleg damit.
Konservativ mit dem gemessenen Kennungssatz gerechnet kostet das weitere
0,499 GB: **3,294 GB**. Die bestehenden Musterindizes wurden dabei nicht um
mögliche Einsparungen bereinigt.

Zehn statt fünf Detailbeobachtungen während der ersten 14 Tage erhöhen diesen
zweiten Ansatz auf **3,841 GB** vor zusätzlicher Betriebslast. Deshalb sind
4–5 GB ein Planungsrahmen, keine feste Kapazitätsgarantie. Bei 100.000 täglichen
Aufnahmen läge allein derselbe Aufbau mit fünf Beobachtungen bereits bei rund
5,6 GB. Fristen begrenzen den Bestand nur zusammen mit einem begrenzten Zulauf,
einer begrenzten Änderungsdichte und einer begrenzten Zahl von Statistikgruppen.

Für eine feste 3-GB-Grenze ergibt die kürzere Variante 7/60/120 Tage mit
gemeinsamer Kennungstabelle und gleicher Monatsstatistik rund **2,17 GB**, bei
zehn Detailbeobachtungen rund **2,45 GB**. Auch hier bleiben Reserve und
Überwachung nötig. Eine weitere Möglichkeit ist, nur die fachlich relevanten
Gruppen aus dem gesamten Feed aufzunehmen.

Nach Ende der Kennungsaufbewahrung ist lebenslange Doppelerkennung nicht mehr
möglich. Ein späterer Wiederfund darf nicht als sicher neu veröffentlichter
Artikel bezeichnet werden. Auch eine neue Inseratkennung nach erneutem
Einstellen erkennt die reine ID-Liste nicht als denselben physischen Artikel.

## 5. Aktualisierungen: eigener begrenzter Bestand

Die lesend geladene Konfiguration im laufenden Sammler bestätigt 30 Anfragen
pro Minute als Budget und 2.500 ms Mindestabstand. Der Abstand begrenzt den
Durchsatz damit bereits auf **höchstens 24 Anfragen pro Minute beziehungsweise
34.560 pro Tag**. Antwortzeiten, Fehler und Pausen reduzieren ihn weiter. Dies
ist unsere technische Drosselung, keine von Vinted zugesicherte Abrufquote.
Das Budget wird bereits für Suche, Kategorien, Navigation und Wiederholungen
verwendet. 14 Anfragen in einer beobachteten Minute belegen keine dauerhaft
freie Restkapazität.

| Aufgabe bei einem Einzelabruf je Artikel                        | Erforderliche Abrufe pro Tag |
| --------------------------------------------------------------- | ---------------------------: |
| Jeden neuen Feedfund einmal detailliert lesen                   |                       56.000 |
| Bestand von 30 Tagen einmal wöchentlich prüfen                  |                      240.000 |
| 1.000 ausgewählte Artikel täglich und weitere 9.000 wöchentlich |                   rund 2.286 |

Das letzte Beispiel entspricht im Mittel 1,6 Anfragen pro Minute. Es ist ein
Planungsvorschlag innerhalb des gemeinsamen Budgets, keine durchgeführte
Lastmessung. Die Zusatzwarteschlange zunächst beispielsweise auf höchstens
zwei Anfragen pro Minute begrenzen und nur verfügbaren Spielraum nutzen.
Fehlversuche und Wiederholungen mitzählen; bestehende Pausen unverändert achten.
Bei Rückstau den tatsächlich erreichbaren Prüfzeitpunkt ausweisen.

Die breite Sammlung wird überwiegend durch bereits abgerufene Suchseiten
aktualisiert. Eine Seite kann bis zu 96 Kandidaten liefern. Die Rohantwort
muss dafür vor der Feed-Deduplizierung und dem Ausschluss älterer Artikelnummern
ausgewertet werden. Der aktuelle Feed ignoriert Wiederfunde überwiegend und
aktualisiert dabei keinen Preisverlauf.

Ein aus der neuesten Ergebnisseite verschwundener Artikel kann weiterhin
aktiv sein. Gezielt nachprüfen: unmittelbar analysierte Inserate, passende
Vergleichsmodelle sowie eine nach Gruppen ausgewählte Stichprobe. Alte
Archivartikel werden nicht allein wegen ihrer Speicherung regelmäßig abgerufen.
KI nur für konkrete Identifikation/Zuordnung/Erklärung einsetzen; Deduplizierung,
Zeitplanung, Preisrechnung und Verdichtung erfolgen deterministisch im Backend.

## 6. Was andere Systeme nachweislich machen

Die folgenden Quellen beschreiben öffentliches Verhalten oder Datenformate.
Sie legen die internen Datenbankschemata, tatsächliche Speicherbelegung und
Löschfristen der Anbieter nicht offen. Daraus wird keine Integration empfohlen.

| System      | Öffentlich dokumentiert                                                                                                                                                 | Übertragbare Entscheidung                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Keepa       | Historieneintrag nur bei geändertem Preis/Wert; Erfassungsbeginn, letzte Prüfung und letzte Preisänderung getrennt                                                      | Ereignisse statt gleicher täglicher Kopien; [Produktobjekt](https://keepa.com/api-docs/product-object.html)         |
| Keepa       | Historie begrenzen/auslassen; Aktualisierung abhängig vom Datenalter                                                                                                    | Nur benötigte Daten übertragen und gezielt aktualisieren; [Produktabfrage](https://keepa.com/api-docs/product.html) |
| Comps       | Beobachtung wächst mit nachgefragten Suchgruppen; Abdeckung wird ausgewiesen; Verkauf nur bei expliziter Markierung, Preis ist letzter beobachteter Angebotspreis       | Gezielt sammeln und Unsicherheit erhalten; [Dokumentation](https://swanum.com/comps/docs)                           |
| ResellTrack | Barometer mit 30-Tage-Fenster und mindestens 48 Stunden Abstand zur Berechnung; Angebotspreise ohne Versand/Käuferschutz; veränderte Sammlung kann Wachstum vortäuschen | Beobachtungsabdeckung und Berechnungsstand mitführen; [Methode](https://reselltrack.io/en/vinted-barometer#method)  |

Keepas Historienformat beweist beispielsweise keine bestimmte interne
SQL-Tabelle. Die Aufbewahrungsfristen 14/90/180 Tage sind unser aus dem Zulauf
abgeleiteter Vorschlag, kein behaupteter Branchenstandard.

## 7. Datenstruktur und korrekte Verdichtung

Im vorhandenen Supabase/PostgreSQL bleiben. Ein möglicher fachlicher Zuschnitt:

- `vinted_article_keys`: eindeutige Kennung und begrenzte Wiedererkennung.
- `vinted_article_references`: aktuelle schlanke Referenzen und Merkmale.
- `vinted_article_observations`: tatsächliche Preis-/Statusänderungen.
- `vinted_article_summaries`: kompakte ältere Einzelbelege.
- `vinted_article_refresh_queue`: begrenzte Prioritäten, nächste Prüfung,
  letzter Erfolg, Fehler und Datenalter.
- `vinted_comparison_groups`: normalisierte Produktgruppen mit gesichertem
  Modellbezug beziehungsweise ausdrücklich unbekanntem Modell.
- `vinted_price_monthly_statistics`: Preisverteilungen und Abdeckung.
- `vinted_collection_daily_statistics`: Zulauf, Wiederfunde, Änderungen,
  Abrufe, Rückstau, Datenqualität und Speichergrößen.

Dies ist ein Entwurf, keine Migration. Der Drei-Tage-Feed bleibt unabhängig;
seine Löschkaskade darf die Vergleichsdaten nicht entfernen. Öffentliche
Marktbeobachtungen und echte private Verkaufstransaktionen benötigen getrennte
Zugriffsgrenzen. Eigene bezahlte Verkäufe bleiben im jeweiligen Arbeitsbereich;
Bundlepreise werden nicht ungeprüft als Einzelartikelpreise verwendet.

Bei den Statistiken sind folgende Regeln entscheidend:

1. **Preisarten trennen:** laufender Angebotspreis, letzter beobachteter
   Angebotspreis vor Verkaufsmarkierung und tatsächlich belegter Endpreis.
   Ein unbekannter Status oder Abruffehler wird kein Verkauf.
2. **Zähleinheit festlegen:** Ein Artikel mit zehn Preissenkungen zählt nicht
   als zehn Vergleichsartikel. Für neue Angebotskohorten einen definierten
   Preis je Artikel, für beobachtete Abschlüsse einen qualifizierten Abschluss.
   Aktive Bestandsverteilungen sind eine eigene Auswertung mit Aktualitätsgrenze.
3. **Zeitbezug festhalten:** Erstbeobachtung ist nicht Veröffentlichungsdatum.
   Verkaufserkennung liefert ein Intervall zwischen letzter aktiver und erster
   verkauft markierter Beobachtung. Selten geprüfte Artikel liefern keine
   präzise Verkaufsdauer. Datenalter und Prüfabdeckung gehören zur Kennzahl.
4. **Zusammenführbare Verteilungen:** Tagesmediane nicht mitteln. Feste
   Preisintervalle mit Häufigkeiten lassen sich addieren; daraus abgeleitete
   Quantile bleiben Näherungen. Die Grenze voraggregierter Quantile erläutert
   die [Prometheus-Dokumentation](https://prometheus.io/docs/practices/histograms/).
   Dafür muss kein zusätzliches System eingebaut werden.
5. **Keine falschen Gesamtsummen:** Ein im Januar und Februar aktiver Artikel
   darf in beiden monatlichen Bestandsbildern auftauchen. Die Summe ist dann
   keine Zahl verschiedener Artikel. Ohne Einzelkennungen lassen sich solche
   Monatsbilder später nicht exakt zu einer eindeutigen Quartalsstichprobe
   vereinigen. Auch verschiedene, überlappende Gruppen nicht blind addieren.
6. **Gruppen begrenzen:** Kategorie, Marke, Modellfamilie, Zustand, Markt und
   Währung sinnvoll normalisieren. Größe bei Bedarf erhalten. Beliebige
   Farb-/Material-/Größenkombinationen erzeugen viele fast leere Gruppen.
   Weggelassene Merkmale können später nicht wieder herausgefiltert werden.
   Modellzuordnung und Methode versionieren; eine bloße Titelähnlichkeit
   bestätigt kein exaktes Modell.
7. **Sammlung von Nachfrage unterscheiden:** Schnäppchenfilter mit Preisgrenze
   und ausschließlich neueste Inserate ergeben keine repräsentative
   Marktpreisverteilung. Herkunftsfilter, Abdeckung und Auswahlverfahren
   speichern; Suchanfragen für Vergleiche ohne Einkaufsobergrenze durchführen.

Die tägliche Verdichtung arbeitet mit abgeschlossenen, eindeutig bezeichneten
Zeitabschnitten und Methodenfassungen. Ergebnis zunächst in einem neuen Stand
erzeugen, Fallzahlen/Summen abgleichen, atomar veröffentlichen und erst dann
die übernommenen Rohdaten entfernen. Wiederholungen dürfen nichts doppelt
zählen. Für noch vorhandene Einzelbelege können Korrekturen neu berechnet
werden; nach deren Löschung sind rückwirkende Detailkorrekturen nur begrenzt
möglich. Alte Aggregate nicht aus einem bereits gelöschten Rohbestand neu
berechnen. Ein vollständiger Neuaufbau sämtlicher alten Kennzahlen ist nach
der Verdichtung ausdrücklich nicht mehr möglich.

## 8. PostgreSQL-Betrieb und feste Grenzen

Häufig geänderte Prüffelder gehören in die schmale Warteschlange. Im früheren
Muster lag `last_checked_at` im Prüfindex; dessen Änderung verhindert bei
diesem B-Tree die günstigeren HOT-Updates. Auch eine Prüfung ohne neuen Preis
erzeugt also Schreibarbeit. [PostgreSQL HOT](https://www.postgresql.org/docs/17/storage-hot.html).

Bei ausreichend großer Ereignishistorie ermöglichen Zeitpartitionen das
gezielte Entfernen alter Abschnitte. Für ein genaues 14-Tage-Fenster wären
beispielsweise tägliche Partitionen mit begrenzter Anzahl passend; monatliche
Partitionen können längere Restaufbewahrung erfordern. Keine Partition pro
Modell oder Nutzer. Die gemeinsame Kennungstabelle zunächst unpartitioniert
halten: Globale Eindeutigkeit auf einer partitionierten Tabelle erfordert
den Partitionierungsschlüssel im eindeutigen Schlüssel. Konkrete Partitionierung
erst mit Zugriffs- und Löschplan entscheiden.
[PostgreSQL-Partitionierung](https://www.postgresql.org/docs/17/ddl-partitioning.html).

Normales Löschen und Vacuum machen Platz vor allem innerhalb der Tabellen
wiederverwendbar; sie geben ihn nicht automatisch an das Dateisystem zurück.
`VACUUM FULL` braucht zusätzlichen Platz und stärkere Sperren. Deshalb
regelmäßige Wartung und begrenzte Löschpakete beziehungsweise geeignete
Partitionen vorsehen, nicht erst bei voller Platte reagieren.
[PostgreSQL-Wartung](https://www.postgresql.org/docs/17/routine-vacuuming.html).

Neben Zeitfristen deshalb feste Budgets vorsehen: tatsächliche Tabellen- und
Indexgröße, Ereigniszahl, zugelassener Tageszulauf, aktive Prüfwarteschlange,
Statistikgruppen und freier Dateisystemplatz. Vor Erreichen des Budgets neue
optionale Vergleichssammlung reduzieren/pausieren und Rückstau melden.
Keine bestehenden Nutzer-, Bestands- oder Verkaufsdaten dafür löschen. Ein
misslungener Verdichtungslauf darf nicht durch trotzdem ausgeführtes Löschen
kaschiert werden. Sicherungsaufbewahrung separat begrenzen; sonst bleibt der
Zuwachs trotz bereinigter Live-Datenbank in Backups bestehen.

Vor Festlegung der endgültigen Kapazität mindestens 7–14 Tage tägliche
Messwerte erheben: wirklich neue Kennungen, Initialaufnahmen, Wiederfunde,
Änderungen je Artikel, Abdeckung, Abrufverbrauch und Fehler, Prüfrückstand,
Tabellen-/Indexgrößen sowie WAL-/Backupspitzen. Die bestehende Leseabfrage
rekonstruiert diese Vergangenheit nicht. Das künftige Monitoring ist hier
konzipiert, aber nicht gestartet.

## Nachweise und verbleibende Grenzen

Private Protokolle unter
`C:/Users/Grisc/.codex/tmp/flipbase-internal-vinted-analysis/`:

- `production-ingestion-snapshot.log`, `production-refresh-budget.log`,
  `production-ingestion-coverage.log`, `production-category-coverage.log`:
  lesende Produktionsabfragen, jeweils Exitcode 0.
- `production-effective-pacing.log`: aus dem laufenden Dienst geladene
  wirksame Werte 30/min und 2.500 ms, Exitcode 0. Vorheriger `printenv`-Aufruf
  lieferte Exitcode 1, weil der optionale Intervallwert nicht gesetzt war;
  die Konfigurationsfunktion bestätigt den tatsächlich verwendeten Standard.
- `retention-fixture.sql`, `retention-fixture.log`,
  `retention-measurement.json`, `run-retention-fixture.py`: isolierte
  synthetische Größenmessung, endgültiger Lauf Exitcode 0 in rund 10 Sekunden.
- Der erste Versuch traf noch den temporären Initialisierungsserver und
  endete beim vorgesehenen Neustart mit Verbindungsabbruch. TCP-Bereitschaft
  statt bloßer Socket-Bereitschaft behob den Messaufbau. Fehlprotokolle unter
  `initial-retention-*` erhalten; beide eigenen Container nach Identitäts-
  und Mount-Prüfung entfernt.
- `retention-scenarios.json`: nachvollziehbare Hochrechnung aus den gemessenen
  Bytes und dem ausdrücklich angenommenen konstanten Zulauf.

Nur Dokumentation geändert, gezielte Formatprüfung und `git diff --check`.
Keine Anwendungstests oder Builds nötig. Keine Produktionslastprüfung,
implementierte Datenaufnahme, automatische Bereinigung oder zusätzlichen
Vinted-Einzelabrufe. Neue Tabellen, RLS, Migrationen, Wartung und Ende-zu-Ende-
Validierung gehören in einen späteren gemeinsamen Umsetzungsschritt.
