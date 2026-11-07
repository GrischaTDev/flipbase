# Aktuelle 30-Tage-Artikelanalyse und die Rolle der KI

Forschungsstand vor der anschließenden Umsetzung am 7. November 2026.
Die Umsetzung ist im aktuellen Eintrag des [KI-Änderungsprotokolls](../AI-CHANGELOG.md) dokumentiert.
Präzisierung nach dem Nutzerbeispiel: Einen
Adidas-Trainingsanzug anhand der letzten 30 Tage für Einkauf und Wiederverkauf
bewerten. Keine Implementierung oder Datenlöschung beauftragt beziehungsweise
ausgeführt. Eigener Forschungszweig nach erneutem GitHub-Abgleich unverändert
auf `25eb50a4`; fremde Arbeitskopie erhalten.

## Präzisierung: breite Preisgrundlage statt einzelner KI-Beispiele

Die anschließende Nutzerkorrektur verlangt je nach vorhandenem Angebot etwa
100–2.000 passende Inserate innerhalb von 20–30 Tagen als Vergleichsbasis.
Die zuvor umgesetzte kleine Auswahl reicht dafür nicht aus und wird nicht in
unveränderter Form veröffentlicht. Eine breite Kategorieauswertung und die
passende Modellteilmenge müssen mit ihren jeweiligen Fallzahlen sichtbar bleiben.
Die KI darf nicht zunächst drei Quellen auswählen, aus denen dann sämtliche
Marktkennzahlen entstehen.

Am 7. November um 14:11 UTC wurden Carhartt-Fleece-Angebote mit `brand_ids[]=362`,
`catalog_ids[]=1858`, `newest_first` und `per_page=96` öffentlich lesend geprüft.
Seiten 1/2/5/10 lieferten je 96 Artikel und zusammen 382 eindeutige Kennungen;
Seiten 20/21 waren leer. Die konkrete Antwort meldete 960 Einträge/zehn Seiten.
Die vier Stichprobenseiten belegen keine vollständige Erfassung aller 960 Angebote.
Die [Dokumentation eines offenen Vinted-Clients](https://github.com/googlarz/vinted-mcp-cli#search-flags)
nennt ebenfalls 96 je Seite und maximal 960 erreichbare Ergebnisse pro Abfrage.
Dies ist keine zugesicherte offizielle Schnittstelle; der Client wird nicht integriert.

Die Katalogdaten enthalten Einzelpreise, Titel, Marke, Größe und Zustand, jedoch
keine verifizierbare Veröffentlichungszeit je Artikel. `pagination.time` ändert
sich mit dem Abruf und ist ungeeignet. Auch `newest_first` erlaubt ohne sichere
Reihenfolge keinen Abbruch beim ersten älteren Artikel. Zwei Detailproben ohne
vollständigen beobachteten Slug endeten am Redirectschutz und werden nicht als
Datumsbelege gewertet. Rohdaten: `bulk-catalog-proof.json` und
`bulk-boundary-proof.json` im privaten Aufgabenordner.

Bei unserem Mindestabstand von 2,5 Sekunden sind hunderte Katalogpreise in
vergleichsweise wenigen Abrufen erreichbar. Einzelne Altersprüfungen für
1.000/2.000 Artikel benötigen dagegen mindestens ungefähr 42/83 Minuten, bevor
weiterer Feedbedarf berücksichtigt wird. Eine schnelle vorläufige Angebotsübersicht
und eine vollständig geprüfte 30-Tage-Auswahl sind deshalb unterschiedliche
Bearbeitungsstände. Die Frage zur gewünschten Anzeige dieser Stände ist noch offen.

Der passende technische Ablauf ist ein fortsetzbarer Auftrag im bestehenden
Sniper-Prozess mit dessen Abrufbudget, Pausen und Browserexklusivität. KI bestimmt
den Zielartikel und die Vergleichsregeln einmal; normaler Code sammelt, entfernt
Duplikate und berechnet Median, Quartile, Preisverteilung sowie Fallzahlen.
Ein kurzlebiger Ergebnisspeicher genügt, ohne Bilder oder vollständige Inserate.
20–30 Tage Analysezeitraum erfordern nicht automatisch 30 Tage Aufbewahrung der
Quelldaten. Eine neue Auftrags-/Lease-Struktur und die UI-Anbindung sind noch
nicht umgesetzt. Die bestehende Drei-Minuten-Kostenreservierung ist keine
geeignete Warteschlange für diesen Ablauf.

## Tatsächlich beobachteter Zeitraum der 960 Carhartt-Treffer

Auf die Nutzerfrage zur Altersprüfung wurde dieselbe Carhartt-Fleece-Suche am 7. November um etwa 15:00 UTC nochmals öffentlich gelesen. Je ausgewählter Seite
wurden Anfang und Ende mit ihren vollständigen Inserat-URLs geöffnet; auf Seite 1
zusätzlich ein beworbener und ein Treffer mit auffällig niedriger Artikelkennung.

| Suchseite | Alter am Anfang | Alter am Ende |
| --------- | --------------- | ------------- |
| 1         | 29 Minuten      | 1 Tag         |
| 5         | 1 Woche         | 2 Wochen      |
| 7         | 3 Wochen        | 4 Wochen      |
| 8         | 4 Wochen        | 5 Wochen      |
| 10        | 6 Wochen        | 8 Wochen      |

Die Werte sind die tatsächlichen gerundeten „Hochgeladen“-Angaben in den
Detailseiten, keine Umrechnung aus Artikelkennungen oder Fotozeitstempeln.
Der beworbene Treffer auf Seite 1 war zwei Stunden alt; der Eintrag mit niedriger
Kennung war laut Quelle erst 22 Stunden alt. Kennungen allein taugen damit nicht
zur belastbaren Datierung. Zwischen den Abrufen erschien dasselbe Inserat am Ende
von Seite 7 und am Anfang von Seite 8; Doppelerkennung bleibt erforderlich.

Beispielquellen:

- [Seite 7: 3 Wochen](https://www.vinted.de/items/10364815945-veste-carhartt-prentis-liner-sherpa-ecru-et-noir-taille-m)
- [Übergang Seite 7/8: 4 Wochen](https://www.vinted.de/items/10269413699-carhartt-wip-printed-jacquard-fleece-jacket)
- [Seite 10: 6 Wochen](https://www.vinted.de/items/10115087491-giubbino-uomo-carhartt)
- [Ende Seite 10: 8 Wochen](https://www.vinted.de/items/9924709195-carhartt-wip-prentis-liner-noir-polaire-sherpa)

Damit ist die Annahme widerlegt, alle 960 Treffer dieser Abfrage lägen innerhalb
von 30 Tagen. Drei bis vier Monate alte Treffer wurden in dieser Stichprobe
hingegen nicht gefunden. Die beobachteten Positionen wirken grob zeitlich geordnet;
aus zwölf Detailabrufen folgt keine garantierte Reihenfolge aller übrigen Treffer.

Für eine schnelle breite Angebotsorientierung ist die vorgeschlagene punktuelle
Altersprüfung angemessen. Der Übergang von ungefähr vier Wochen liegt hier um
Seite 7/8; das ist keine bestätigte Auswahl der ersten 672 Artikel innerhalb von
30 Tagen. Eine schnelle Analyse kann den beobachteten Zeitraum und den geprüften
Stichprobenumfang ausweisen. Nur eine ausdrücklich exakte 30-Tage-Zuordnung benötigt
weitergehende Quellennachweise; die gerundete Angabe „4 Wochen“ bleibt dabei selbst
mehrdeutig. Eine pauschale lange Einzelprüfung jedes Artikels ist für eine grobe
aktuelle Marktübersicht nicht Voraussetzung.

17 öffentliche HTTP-Abrufe (fünf Suchseiten, zwölf Detailaufrufe), beide Prüfskripte
Exitcode 0, keine KI-Aufrufe und keine Produktänderung. Private Nachweise:
`bulk-recency-proof.json`, `bulk-recency-boundary-proof.json`. Die ergänzende
Web-Leseoberfläche konnte zwei URLs nicht öffnen; die Tabellenangaben beruhen auf
den erfolgreichen direkten, begrenzten HTML-Abrufen mit dem vorhandenen Parser.

## Empfehlung für diesen konkreten Umfang

**Weitere Eingrenzung des Nutzers:** Der Einstieg ist der AI-Search-Klick auf
eine konkrete Carhartt-Fleecejacke im bereits eingegrenzten Feed. Dafür ist eine
gezielte Live-Recherche mit kleinem Ergebnis-Cache ausreichend als Architektur;
eine vorab aufgebaute große Vergleichsdatenbank ist keine Voraussetzung. Die
30 Tage beschreiben nach Möglichkeit datierte Vergleichsbelege, nicht eine
versprochene vollständige historische Marktstatistik. Details und überprüfte
Datumsangabe stehen im Abschnitt zur Live-Recherche weiter unten.

Für eine aktuelle Artikelbewertung ist eine mehrjährige Preisgeschichte keine
Voraussetzung. Die vorigen 24-/36-Monatskonzepte betreffen zusätzliche saisonale
Zeitvergleiche. Für den jetzt beschriebenen Kernnutzen **zunächst ein rollierendes
30-Tage-Auswertungsfenster** vorsehen. Mehrjährige Statistikarchive und ihre
Verdichtung gehören nicht zum notwendigen ersten Umfang.

30 Tage sind ein sinnvoller Standard, aber keine Garantie für genügend passende
Vergleiche eines seltenen Modells. Bei zu wenigen Belegen die Datenlage nennen.
Eine Ausweitung auf ältere Belege müsste ausdrücklich als anderer Zeitraum
sichtbar sein; nicht unbemerkt alte und aktuelle Preise mischen.

## Welche Daten die 30 Tage meinen

- Aktuelle beziehungsweise im Zeitraum erfolgreich beobachtete Angebotspreise.
  Ein vor 60 Tagen erstmals erfasstes Inserat kann heute relevant sein.
- Beobachtete Preisänderungen innerhalb des Zeitfensters, mit Zeitpunkt.
- Qualifizierte Verkaufsmarkierungen mit Zeitpunkt der Erkennung und letzter
  aktiver Beobachtung. Dieser Zeitpunkt ist nicht automatisch der Verkaufstag.
- Tatsächlich belegte eigene Verkaufspreise getrennt und arbeitsbereichsbezogen,
  soweit vorhanden und fachlich vergleichbar.

Erstfund, letzter erfolgreicher Abruf, letzte Preisänderung und beobachteter
Statuswechsel sind verschiedene Zeitangaben. Eine alte unveränderte Preishöhe
kann bei heutiger erfolgreicher Prüfung ein aktuelles Angebot sein; sie belegt
keine Zahlungsbereitschaft und keinen Verkauf. Preisänderungsereignisse allein
reichen deshalb nicht: Der aktuelle bekannte Artikelzustand bleibt separat.

Ein reiner Filter `first_seen_at >= heute - 30 Tage` würde passende ältere
Inserate fälschlich ausschließen. Ebenso würde pauschales Löschen aller älteren
Artikel laufende Beobachtungen unterbrechen. Die Speicherregel soll abgelaufene
Beobachtungen und nicht mehr benötigte Referenzen entfernen, während bewusst
weiter beobachtete Artikel einen begrenzten aktuellen Zustand behalten.
Feste Mengen-/Speichergrenzen und die begrenzte Prüfwarteschlange bleiben nötig.

Eine heute gestartete Sammlung besitzt keine nachträglich beobachtete
30-Tage-Historie. Aktuelle Angebote lassen sich sofort suchen; belastbare
beobachtete Preis-/Statusverläufe wachsen mit der tatsächlichen Erfassung.

Öffentliche Preise und erreichte Zahlbeträge weiter trennen. Auch Comps
beschreibt seinen Preis bei Verkaufsmarkierung ausdrücklich als zuletzt
beobachteten Angebotspreis, nicht als ausgehandelten Endbetrag.
[Quellendefinition](https://swanum.com/comps/docs).

## Was ohne KI funktioniert

Die Datenbank und normaler Anwendungscode übernehmen:

- Doppelerkennung, Zeitraum, Aktualität und eindeutige Merkmalsfilter;
- Zählen passender Artikel statt mehrfacher Preisänderungen desselben Artikels;
- Median, Quartile, Preisspanne und gekennzeichnete Datenlücken;
- getrennte Auswertung laufender Angebote und qualifizierter Abschlussbelege;
- Berechnung einer Einkaufsgrenze aus konservativer Verkaufsschätzung,
  bekannten Kosten und hinterlegtem Zielgewinn/Risikopuffer;
- Speicherung, Nachprüfplanung und begrenzte Aufbewahrung.

Die Verkaufsschätzung bleibt abhängig von Datenqualität und Annahmen, auch wenn
die Rechnung deterministisch ist. Aus Angebotspreisen folgt kein garantierter
Verkaufserlös. Fehlende Kosten oder ein unbekannter Zielgewinn dürfen nicht
unbemerkt als null eingesetzt werden; vorhandene Einstellungen nutzen und
fehlende Grundlagen kenntlich halten. Daraus folgt kein Auftrag für neue
Pflichtfelder oder einen manuellen Versandkostenrechner.

## Wo KI einen konkreten Nutzen hat

Die aufwendige Frage ist häufig nicht die Preisrechnung, sondern die
Vergleichbarkeit der Produkte. Bei einem unklar beschriebenen Trainingsanzug
kann die KI Bilder, Etikett, Beschreibung und Artikelmerkmale gemeinsam
auswerten: Modell-/Produktlinie, komplettes Set oder Einzelteil, Zielgruppe,
Material und erkennbare Zustandsmerkmale. Nicht erkennbare Details bleiben
unbekannt; eine Modellvermutung wird nicht zu einer bestätigten Artikelnummer.

Auf dieser Grundlage kann sie passende Suchbegriffe und Kandidaten vorschlagen,
mehrsprachige oder ungenaue Beschreibungen einordnen und schwierige
Vergleichstreffer prüfen. Harte Filter und bereits bekannte Zuordnungen
übernimmt weiterhin normaler Code. Wiederverwendbare bestätigte Zuordnungen
müssen nicht bei jedem Fund erneut mit KI ermittelt werden.

Eine kurze Erklärung kann die konkrete Preisorientierung mit den gewählten
Vergleichsbelegen verbinden. Das ist optional; für die bloße Wiedergabe von
Median, Fallzahl und Datenalter genügt auch eine feste Ergebnisdarstellung.

**Wenn Modell, Variante und relevante Merkmale bereits sauber bekannt sind,
braucht die Standard-Preisauswertung keine KI.** Der sinnvolle Ablauf ist:

1. Konkretes Inserat vollständig lesen; bei Bedarf KI zur Identifikation.
2. Fachlich passende, ausreichend aktuelle Vergleichsbelege auswählen.
3. Kennzahlen und Einkaufs-/Verkaufsszenarien im Anwendungscode berechnen.
4. Ergebnisse mit Quellen, Preisart und Zeitraum ausgeben; KI-Erklärung nur
   bei zusätzlichem Nutzen.

Keine KI auf jedem eingehenden Feedartikel ausführen. Sie hilft gezielt bei
einer angefragten Artikelanalyse beziehungsweise schwierigen Zuordnung. Die
interne Vergleichsdatenbank liefert die belegbaren Zahlen.

## Gezielte Live-Recherche ohne großes Vergleichsarchiv

Der vom Nutzer gemeinte Ablauf ist direkt umsetzbar als Architektur:

1. Beim AI-Search-Klick die konkrete Jacke einschließlich aller verfügbaren
   Bilder, Beschreibung, Preis, Kategorie und Merkmale lesen.
2. Modell und Variante bestimmen; Unsicherheit festhalten. Die Marke und
   Kategorie grenzen die Suche ein, ersetzen aber keinen Modellabgleich.
3. Passende Vergleichsinserate live über gezielte Suche finden, erreichbare
   Detailseiten prüfen und Datierung aus der jeweiligen Quelle übernehmen.
4. Für eine 30-Tage-Auswertung nur Belege verwenden, deren Zeitangabe das
   zulässt. Fehlende oder mehrdeutige Altersangaben separat behandeln.
5. Vergleichspreise, Preisorientierung und Quellen ausgeben. Kleine begrenzte
   Ergebnis-/Quellbelegspeicherung mit Abrufzeit genügt; kein fortlaufender
   Gesamtkatalog oder mehrjähriges Archiv nötig.

Der Preisfilter für günstige Einkäufe darf nicht auf die Vergleichssuche
übertragen werden. Sonst fehlen teurere passende Angebote und das ermittelte
Preisniveau wird nach unten verzerrt. Modell, relevante Variante, Zustand und
Größe bleiben die fachlichen Vergleichskriterien. Ein kleiner Cache senkt
wiederholten Abrufaufwand, ersetzt aber keine Aktualitätsprüfung.

### Konkreter Nachweis und Lücke im aktuellen Code

Am 7. November, 13:17:01 UTC, wurde die öffentliche
[Carhartt-Prentis-Detailseite](https://www.vinted.de/items/10501832008-carhartt-wip-prentis-liner-jacket-teddy-sherpa-fleece-polar)
direkt per HTML abgerufen: HTTP 200, 1.707.050 Bytes. Ihr eigener strukturierter
Datensatz enthält `upload_date`, Titel `Hochgeladen`, Wert `2 Wochen`.
Das beweist verfügbare relative Datierung für diesen konkreten Artikel,
keine allgemein vollständigen Zeitangaben für sämtliche Vinted-Inserate.

Die Altersangabe muss mit Abrufzeit und Quelle verbunden bleiben. Sie liefert
kein sekundengenaues Veröffentlichungsdatum. Rundungen an der 30-Tage-Grenze,
beispielsweise „1 Monat“, nicht als exakte Zusage behandeln. Das Datum eines
Suchmaschinenfundes ist kein Ersatz für das Datum des Inserats.

`listing-details.ts` verwirft `upload_date` derzeit ausdrücklich, damit relative
Altersangaben nicht den Produkt-Cache ständig verändern. Das bleibt für stabile
Produktmerkmale nachvollziehbar, aber die zeitliche Bewertung braucht separate
Quellmetadaten. Die Vergleichsstruktur in `analysis.ts` hat derzeit keine
Datumsfelder; `research.ts` fordert aktuelle Gebrauchtpreise, aber noch keine
explizit geprüfte 30-Tage-Zuordnung. Ein bloßer zusätzlicher Satz im Prompt
wäre daher noch kein belastbarer Nachweis des Zeitfensters.

Benötigt würden eine getrennte Erfassung der Quellenzeit, eine überprüfbare
Zeitfensterregel und eine saubere Behandlung undatierter Vergleiche. Das
bestehende KI-/Webrechercheverfahren kann der Ausgangspunkt bleiben. Es wird
kein zusätzlicher Preis-API-Anbieter benötigt.

### Was die Live-Recherche aussagen darf

Sie kann eine aktuelle Preisorientierung aus heute auffindbaren passenden
Inseraten liefern, deren Veröffentlichung gegebenenfalls in den letzten
30 Tagen liegt. Das ist keine vollständige Statistik sämtlicher Verkäufe oder
Preisänderungen während dieses Monats. Uploaddatum ist kein Verkaufsdatum;
eine Verkaufsmarkierung allein belegt keinen ausgehandelten Endpreis. Auch die
KI kann nicht zugängliche oder nicht vorhandene historische Belege nicht
ersetzen. Bei zu wenigen passenden datierten Belegen muss das Ergebnis diese
Grenze nennen, statt ältere oder andere Modelle unbemerkt einzumischen.

Privater Nachweis: `carhartt-on-demand-date-proof.json` unter
`C:/Users/Grisc/.codex/tmp/flipbase-internal-vinted-analysis/`, Prozess Exitcode 0.
Nur ein gezielter öffentlicher Detailabruf; keine Bilder heruntergeladen,
keine Datenbankbefüllung, keine KI-Analyse ausgelöst und kein Produktcode geändert.

## Nachweis und Grenzen

### Ergänzung: einmaliger Ausgangsbestand statt leerer Datenbank

Auf die folgende Nutzerfrage nach einem einmaligen Abruf der letzten 30 Tage:
**Ein einmalig gestarteter Import heute sichtbarer Vergleichsangebote ist
sinnvoll und technisch anschlussfähig.** Er durchläuft mehrere Suchseiten im
gemeinsamen Abrufbudget, entfernt doppelte Kennungen und speichert den Zustand
mit dem tatsächlichen heutigen Beobachtungszeitpunkt. Ein einziger Startvorgang
ist nicht auf eine einzelne HTTP-Antwort beschränkt.

Am 7. November um 13:01 UTC wurden zwei öffentliche HTML-Katalogseiten für
`adidas Trainingsanzug`, sortiert mit `newest_first`, lesend geprüft:

- Seite 1: HTTP 200, 95 Artikelkandidaten.
- Seite 2: HTTP 200, 96 Artikelkandidaten, davon 94 zusätzliche Kennungen.
- Insgesamt 189 unterschiedliche Kennungen; keine fachliche Prüfung aller
  Kandidaten, kein Beleg für 189 exakt vergleichbare vollständige Anzüge.
- Keine Veröffentlichungs-/Erstellungsdatumsfelder auf der ausgelesenen
  obersten Artikelebene. Das beweist keine generelle Abwesenheit solcher
  Angaben auf Detailseiten, erlaubt aber keine sichere Datierung des Imports.
- Antwortgrößen rund 3,7 MB, innerhalb der bestehenden 8-MiB-Kataloggrenze.

Ein vollständiger rückwirkender Export sämtlicher Inserate der letzten 30 Tage
ist dadurch nicht nachgewiesen. Versteckte Angebote sind laut
[Vinted-Hilfe](https://www.vinted.de/help/60) im Katalog nicht sichtbar; auch
verkaufte Angebote können gelöscht werden. Ein heutiger Abruf rekonstruiert
keine früheren Preisänderungen oder ausgehandelten Verkaufspreise. Er erfasst
eine heutige Angebotsstichprobe und kann dadurch lange unverkaufte Angebote
stärker enthalten als schnell verkaufte.

Der aktuelle Sammler unterstützt keinen Datumsfilter im URL-Builder und
begrenzt seine Abfragen selbst auf drei Seiten. Das ist keine bestätigte
Vinted-Plattformgrenze. Ein tieferer Startimport benötigt eine eigene begrenzte
Seitenplanung und eine Prüfung tatsächlich erreichbarer Tiefe. Veröffentlichungs-
datum nur übernehmen, wenn es zuverlässig aus der Quelle bestimmbar ist;
Fotozeitpunkt oder Artikelnummer nicht ungeprüft als Einstelldatum verwenden.
Fehlende Datierung ausdrücklich unbekannt lassen. Nicht behaupten, nach dem
ersten älteren Treffer seien alle späteren Resultate außerhalb des Zeitfensters,
solange Reihenfolge und Datum nicht hinreichend verifiziert sind.

Der Import gehört als Ausgangsbestand in die Vergleichsdaten und darf keine
Flut vermeintlicher neuer Feedtreffer auslösen. Der bisherige Feed-Schreibpfad
verwirft teils ältere Kennungen und ignoriert Preisupdates bei Wiederfunden;
er ersetzt diesen eigenen Importpfad nicht.

Empfehlung: sofort nutzbaren aktuellen Angebotsvergleich durch einen begrenzten
Startimport aufbauen und danach echte 30-Tage-Beobachtung fortführen. Der
Startimport muss nach Datenart als heutiger Bestand bezeichnet werden, nicht
als rekonstruierte Verkaufshistorie des vergangenen Monats.

Privater Nachweis: `catalog-initial-import-proof.json` unter
`C:/Users/Grisc/.codex/tmp/flipbase-internal-vinted-analysis/`, Prozess Exitcode 0.
Nur zwei öffentliche Suchseiten mit Abstand gelesen, kein JavaScript der Seite
ausgeführt, keine Inserate in die Datenbank geschrieben. Der Zugriff auf eine
zusätzliche npm-Dokumentationsseite war mit HTTP 403 gesperrt und wurde nicht
als tragender Nachweis verwendet.

### Ursprüngliche Prüfung der Eingrenzung

Vorhandene Recherche und fachliche Zeitfenster getrennt geprüft; kurze
unabhängige Gegenprüfung der 30-Tage-Definition. Comps-Quellendefinition erneut
gelesen. Nur Dokumentation, gezielte Formatprüfung und `git diff --check`;
keine Anwendungstests oder Builds. Bei der ursprünglichen Eingrenzung kein
Artikelabruf; die nachfolgende Ergänzung dokumentiert die zwei öffentlichen
Katalogabrufe separat. Kein Modellaufruf, neues Schema oder produktiver
Lösch-/Sammelauftrag ausgelöst.
