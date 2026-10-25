# Vintz-Auswertungen und Berichte im Vergleich mit Flipbase

Stand: 18.10.2026, Juna. Einzeln freigegebener Block nach Cockpit/Widgets.
Auswertungen untersuchen, mit Flipbase vergleichen, danach stoppen. Keine
Umsetzung, Aktivierung oder Änderung von Geschäfts-/Datenschutzeinstellungen.

## Ergebnis

Vintz untersucht auf `/analytics` hauptsächlich **Verkaufstempo**: wann gekauft
wird, wann hochgeladene Artikel schnell verkauft werden und welche Modelle,
Marken-/Artikelartgruppen schneller laufen. Eigene Messungen werden von einem
anonym zusammengefassten Marktbestand getrennt. Flipbase konzentriert sich
dagegen auf zentrale Umsatz-, Gewinn-, Gebühren-, Bestands- und Einkaufsdaten.
Beide Seiten sind daher keine deckungsgleichen Finanzberichte.

Für Flipbase sind Median-Verkaufsdauer, klar benannte Datenquellen und
Mindestmengen sinnvolle Anregungen. Zuerst sollten jedoch vorhandene
Berichtsgrenzen behoben werden: uneinheitliche Zeitfilter, irreführende
Gewinn-/Top-/Kohortenbeschriftungen und uneinheitliche Haltedauerwerte.
Ein Marktvergleich erfordert einen eigenen belastbaren Datenbestand; Vintz'
angezeigte Stichprobe ist kein Nachweis des gesamten Vinted-Marktes.

## Prüfrahmen und Nachweise

- [Vintz-Auswertung](https://vintz.ai/analytics): angemeldeter Prozugang,
  persönlicher Workspace, globale Kontoanzeige Maike Vintage. Separater Lesetab.
- Live: Messhilfe, alle drei Zeitfenster, Modelle/Marken/Artikelarten,
  Sortierung, Kategorie und Such-Leerzustand. Filter sind laut geladenem Code
  lokaler Ansichtsstate; keine gespeicherte Einstellung geändert.
- Tatsächliche GET-Antworten der durch die Zeitraumsauswahl ausgelösten
  Berichtsanfragen gelesen. Nur bereinigte aggregierte Kennzahlen gespeichert,
  keine Sitzungstoken, kompletten Netzwerkarchive oder fremden Einzelverkäufe.
- Bereits geladene Erstanbieter-Skripte gelesen. Serverberechnung,
  Messdatenerfassung, KI-Gruppierung und Anonymisierung nicht von innen geprüft.
- [Flipbase-Auswertung](https://app.flipbase.de/analytics): alle sieben
  sichtbaren Bereiche live im Workspace Wiehen Store gelesen. Zeitfilter
  30 → 7 → 30 Tage geprüft. Quellenstand
  `e3ef736370640125c1abddcaf82de6079205d9fa` zusätzlich unabhängig untersucht.
  Kein Workspacewechsel und kein Vergleich von Beträgen unterschiedlicher Konten.
- Die getrennten Finanzberichte/CSV-Exporte waren bereits Gegenstand des
  [Finanzvergleichs](vintz-finance-exports-comparison.md). Hier nicht erneut
  gebucht, importiert oder exportiert; frühere Ausführungsgrenzen gelten weiter.

## Vintz: sichtbarer Funktionsumfang

| Bereich          | Funktion und beobachteter Stand                                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zeitfenster      | Letzte 30 Tage, 90 Tage und 12 Monate; Standard 90. Kein freies Von/Bis oder Vorperiodenvergleich in dieser Seite.                                                                                  |
| Datenstand       | „Vinted-Markt · Gerade geladen“, später relative Ladezeit. Dies ist die Abrufzeit des Berichts, keine belegte letzte Synchronisierung aller Quellen.                                                |
| Empfehlung       | Markt oder eigene Verkäufe als Quelle, Upload-Zeitfenster, bester Upload-Tag, Relist-Abstand; je nach eigenen Daten zusätzlich tägliche Uploadmenge. Persönlich ab 20 eigenen gemessenen Verkäufen. |
| Kaufzeiten       | Stundenanteile und Wochentagsanteile; bei vorhandenen eigenen Daten Umschaltung Markt/eigene Verkäufe vorgesehen.                                                                                   |
| Uploadzeiten     | Median-Verkaufsdauer je zweistündigem Uploadfenster, Empfehlung aus vierstündigen Fenstern. „Kürzer ist besser“.                                                                                    |
| Käuferländer     | Verkäufe, Anteil und Median-Verkaufsdauer je Land; bis sechs Länder sichtbar. Kein Umsatz-Ländervergleich wie im Cockpit.                                                                           |
| Verkaufsdauer    | Verteilung in sieben Zeitklassen, Median, Durchschnitt und mittlere Hälfte der Verkäufe. Eigene Balken und Marktvergleich bei verfügbaren eigenen Messungen.                                        |
| Produktvergleich | Modelle, Marken, Artikelarten; Kategorie, Textsuche, schnellste/meiste Verkäufe. Tabelle: Median, Durchschnitt, Anteil in 24 Std., Verkäufe, Medianpreis, eigene Medianzeit.                        |
| Eigene Verkäufe  | Schnellste eigene Gruppen und einzelne schnellste/langsamste Verkäufe im Code. Live leer: „Noch keine gemessenen Verkäufe“.                                                                         |
| Messhilfe        | Von Upload bis Verkauf, Neustart nach Relisting, KI-Zuordnung, Ausschluss bestimmter Bestellzustände, anonyme Beteiligung und deren Abschaltung erklärt.                                            |
| Export           | Kein CSV-/PDF-/PNG- oder Teilen-Exportknopf auf dieser Auswertungsseite gefunden. „Anonym teilen“ ist ein Datenschalter, kein Dateiexport.                                                          |

Die Kategorie-/Such-/Sortierauswahl betrifft die Produkttabelle, nicht die
darüberliegenden Marktempfehlungen oder Länder-/Zeitdiagramme. „Marken“ bedeutet
im gelesenen Gruppenschlüssel **Marke plus Artikelart**, beispielsweise Adidas
Trainingshose gegenüber Adidas Trainingsjacke, keine einzige Gesamtreihe je Marke.
„Modelle“ ergänzt die Modelllinie; „Artikelarten“ lässt Marke und Modell weg.

Im 30-Tage-Fenster funktionierten Gruppierung, Sortierung, Jackenfilter und
Textsuche. Eine nicht passende Suche zeigte eine verständliche leere Tabelle.
Bis zu 25 Gruppen werden zunächst gerendert; weiteres Nachladen ist eine lokale
Erweiterung um 25, kein neuer serverseitiger Suchlauf. Große Listen nicht getestet.

## Tatsächliche Datenbasis

Die Ansicht liest `GET /api/seller/sell-speed?days=30|90|365`. Alle drei
beobachteten Antworten hatten Status 200 und enthielten getrennt `market` und
`own`, Zeitfenster und Erzeugungszeit. Die folgenden Werte stammen aus diesen
Antworten, nicht aus zurückgerechneten Diagrammbalken:

| Fenster  | Gemessene Marktverkäufe | Verkäufer |       Median |        Durchschnitt |     In 24 Std. |
| -------- | ----------------------: | --------: | -----------: | ------------------: | -------------: |
| 30 Tage  |                     379 |        35 | rund 18 Std. |  rund 1 Tag 22 Std. | 239, rund 63 % |
| 90 Tage  |                     698 |        35 | rund 19 Std. |  rund 3 Tage 5 Std. | 418, rund 60 % |
| 365 Tage |                     768 |        35 | rund 19 Std. | rund 3 Tage 13 Std. | 461, rund 60 % |

Antworten vom 18.10.2026, etwa 11:44–11:45 Uhr Europe/Berlin. In allen drei
Antworten: eigener Gesamtwert `null`, null eigene Gruppen und `own.accounts: 0`.
Die globale Anzeige eines verbundenen Kontos ist damit **kein Nachweis**, dass
dieses bereits verwertbare Verkaufstempo-Messungen liefert.

Der früher beobachtete Bestellbestand enthielt zwei Septemberverkäufe; das ist
ein anderer Datenpfad. Warum diese in der Verkaufstempo-Messung fehlen, ist
nicht nachgewiesen. Mögliche fehlende Messhistorie darf nicht ohne Beleg als
Ursache festgeschrieben werden. Kein zusätzlicher Sync ausgelöst.

Die Ansicht übermittelt bei ihrem Berichtsabruf keinen sichtbaren einzelnen
Cloudkonto-Parameter. Der Text spricht von den eigenen Cloudkonten insgesamt.
Die tatsächliche Konto-/Workspace-Abgrenzung geschieht serverseitig und konnte
mit nur einem Konto und null eigenen Messungen nicht bestätigt werden. Den
globalen Kontonamen daher nicht als bewiesenen Filter aller Diagramme ausgeben.

### Wichtige Grenzen der Marktinterpretation

- Die Messhilfe beschreibt Cloudkonto-Verkäufe, keine flächendeckende
  Markterfassung. Die beobachteten 35 Verkäufer bilden eine begrenzte Auswahl.
- Verkaufsdauer wird **unter den gemessenen verkauften Artikeln** betrachtet.
  Ohne noch unverkaufte Artikel und deren Alter lässt sich daraus keine
  Wahrscheinlichkeit ableiten, dass ein beliebiger Upload in 24 Stunden
  verkauft wird. Auch „60 % in 24 Std.“ ist keine Sell-through-Quote des Bestands.
- Relisting startet laut Messhilfe die Dauer neu. Alter seit dem allerersten
  Angebot und Alter seit dem letzten Upload sind unterschiedliche Größen.
- Uploadzeiten und schnelle Verkäufe zeigen Zusammenhänge; der Einfluss von
  Preis, Zustand, Saison, Artikelmix und Verkäuferprofil ist nicht kontrolliert
  nachgewiesen. Keine Erfolgszusage aus dem besten Zeitfenster ableiten.
- Geldwerte in der Produkttabelle werden im Frontend ausdrücklich in EUR und
  auf volle Euro gerundet. Eine allgemeine Währungsnormalisierung der
  zugrundeliegenden Preise ist damit nicht belegt. Eine Zeile zeigte „0 €“;
  daraus keinen realistischen Marktpreis oder die Ursache des Werts ableiten.

## Technisch nachvollziehbare Empfehlungsregeln

Die geladenen Hilfsfunktionen verwenden `Europe/Berlin` für die
Wochentags-/Stundenzuordnung und berücksichtigen dadurch die dortige
Sommer-/Winterzeit. Die sichtbare Kurzbeschriftung „MEZ“ ist dafür ungenau.
Ein 168er-Stundenprofil steht für sieben Tage mit je 24 Stunden.

| Empfehlung         | Geladene Frontendregel                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Eigene/Marktquelle | Eigene Daten ab 20 Verkäufen mit Uploadmessung; sonst Markt, falls vorhanden. Ohne Markt kann auf eigene vorhandene Messungen zurückgegriffen werden.                          |
| Uploadzeit/-tag    | Vierstundenfenster beziehungsweise Wochentag mit kleinstem Median und Mindestzahl. Mindestzahl 6 bei eigenen Daten, 20 beim Markt.                                             |
| Uploaddiagramm     | Zweistundenfenster mit mindestens 3 eigenen beziehungsweise 10 Marktverkäufen; unzureichende Fenster bleiben unbekannt.                                                        |
| Kaufzeit           | Stärkstes zusammenhängendes Dreistundenfenster über alle Wochentage sowie separat stärkster Wochentag. Kein Beweis einer speziell gemeinsam stärksten Tag-Uhrzeit-Kombination. |
| Relist-Abstand     | 90. Perzentil der gemessenen Verkaufsdauer, auf Tage aufgerundet, mindestens 2 und höchstens 30 Tage.                                                                          |
| Uploadmenge        | Falls eigene tägliche Verkaufsrate vorhanden: aufgerundete Verkäufe/Tag, mindestens ein Artikel; Fortschritt über Uploadrate.                                                  |
| Eigene Gruppen     | Anzeige beschreibt mindestens zwei Verkäufe je Marke/Modell; tatsächliche serverseitige Auswahl nicht ausgeführt geprüft.                                                      |

Im 90-Tage-Fenster: Upload 8–12 Uhr, Samstag, Relist alle vier Tage. Bei 30
Tagen blieb 8–12 Uhr, der Upload-Tag wechselte auf Sonntag. Die vier Tage sind
eine aus der Dauer abgeleitete Heuristik, kein belegter optimaler Relistplan.
Der Link zum Auto-Relist wurde nicht geöffnet und keine Regel aktiviert.

### Datenschutz, Ladezustände und Bedienung

„Anonym teilen“ war bereits eingeschaltet. Die Hilfe sagt, eigene Verkäufe
zählen standardmäßig anonym mit. Der Code liest den Status über
`GET /api/seller/sell-speed/sharing`; Betätigen würde einen PATCH mit dem
neuen Teilnahmestatus senden. Der Schalter blieb unverändert.

Laut Oberfläche erscheinen Produkte erst bei mindestens fünf Verkäufern und
höchstens 50 % Anteil eines einzelnen Verkäufers. Die Marktantwort enthält
aggregierte Gruppen, keine sichtbaren fremden Einzelverkäufe. Diese Hinweise
sind keine unabhängige Prüfung der tatsächlichen serverseitigen Durchsetzung
oder eine formale Datenschutzbewertung. Für eine eigene Funktion wäre die
bewusste Teilnahmeentscheidung vor dem Beitrag klarer als eine stille Vorgabe.

Zeitraum und Tabellenfilter sind lokaler Komponentenstate. Der Zeitraum wurde
abschließend wieder auf 90 Tage gesetzt; kein gespeichertes Layout gefunden.
Ein eigener Ladezustand und eine Tarifsperre sind vorgesehen. Nachladen
liest den Bericht erneut, ohne im untersuchten Seitenhandler einen
Vinted-Sync-POST auszulösen. Die Anzeige „Gerade geladen“ misst die Antwortzeit,
nicht das Alter jeder enthaltenen Messung.

Grenze im gelesenen Fehlerpfad: Bei einem fehlgeschlagenen Folgeabruf bleibt
ein vorhandener Bericht stehen; die Fehlermeldung wird nur im Zweig ohne
vorhandene Daten gerendert. Das wurde nicht künstlich ausgelöst. Damit bleibt
offen, wie klar ein solcher Fehler live auffällt. Während des Ladens kann die
neue Auswahl außerdem kurz neben dem alten Bericht stehen; der Container wird
als beschäftigt markiert. Eigene Daten, mobile Umschalter, Tastatur und AXE
nicht umfassend geprüft.

## Flipbase: vorhandene Berichte und belegte Grenzen

Flipbase verwendet zentrale Verkäufe, Einkäufe und einzelne Lagerartikel des
geladenen Workspace. Es gibt keinen Marktpool und keine tatsächliche
Upload-Uhrzeitmessung. „Haltedauer“ meint hier Einkauf bis Verkauf und ist nicht
mit Vintz' Dauer seit Veröffentlichung gleichzusetzen.

| Bericht           | Tatsächlicher Umfang                                                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gesamtübersicht   | Umsatz, direkter Verkaufsgewinn, einfach gemittelter ROI und mittlere Haltedauer; fünf Verkaufszeilen und Plattformanteile.                                                         |
| Plattformen       | Verkäufe, Erlös, erfasste Gebühren, Gebührenquote, Gewinn/Marge und mittlere Haltedauer je Plattform.                                                                               |
| Geschwindigkeit   | Durchschnitt, schnellster/langsamster Verkauf, vier Dauergruppen und rechnerisch 365 / mittlere Haltedauer. Keine echte Lagerumschlagsrechnung aus durchschnittlichem Lagerkapital. |
| Einkaufs-Kohorten | Monatskarten für Investition, Erlös und Refinanzierungsquote; siehe Zuordnungslücke unten.                                                                                          |
| Wochentage        | Anzahl und Umsatz je Wochentag. Keine tatsächliche Uhrzeitaufteilung, weil Verkaufsdatum ohne Uhrzeit geführt wird.                                                                 |
| Kategorien        | Kategorie, übergebene Artikel, verkaufte Vorgänge, Umsatz, Gewinn und ROI. Keine sichtbare Sell-through-Quote trotz Name.                                                           |
| Holding           | Workspacezeilen auf Basis der aktuell geladenen Servicearrays; keine zusätzliche vollständige Abfrage aller Workspaces.                                                             |

Zeitwahl 7/30/365 Tage oder Gesamt, Standard 30. Der Hauptfilter verwendet
verstrichene 24-Stunden-Intervalle und nimmt Vorgänge mit `returned_at` oder
`voided_at` heraus. Die Behandlung dokumentierter Teil-Erstattungen unterscheidet
sich damit vom neueren Dashboard. Kein freies Datum, Vorperiodenvergleich,
gespeicherter Filter oder Analytics-Dateiexport im gelesenen Pfad.

**Konkrete Befunde, vor Erweiterungen zu klären:**

1. **Zeitraum wirkt uneinheitlich.** KPIs, Plattformen, Dauergruppen und
   Kategorieverkäufe verwenden den Hauptfilter. Kohorten, Wochentage und
   Holding erhalten ungefilterte Servicearrays. Live: nach Wechsel von 30 auf
   7 Tage oben null Verkäufe, darunter weiterhin dieselben 27 Wochentagsverkäufe.
2. **Keine echte Einkaufskohorte.** Investitionen werden nach Einkaufsmonat,
   Erlöse nach Verkaufsmonat gruppiert; keine Rückzuordnung zur ursprünglichen
   Charge. Live Oktober: 0 € investiert, 213,89 € erlöst, „6 von 0 Artikel
   verkauft“ und „Break-Even erreicht“. Das belegt keine Refinanzierung einer
   konkreten Charge. Ohne Monatsinvestition setzt die Formel 100 %.
3. **Unterschiedliche Haltedauer.** Kopfwert behandelt fehlend/0 als 0;
   Geschwindigkeitsbericht ersetzt fehlend/0 durch einen Tag. Live gleichzeitig
   0 Tage oben und 1 Tag unten, daraus „365x“ Jahresumschlag. Diese Darstellung
   ist kein belastbarer Nachweis tatsächlicher Umschlagsgeschwindigkeit.
4. **Falscher Top-Titel.** „Top-Gewinnbringer“ nimmt die ersten fünf geladenen
   Verkäufe statt nach Gewinn zu sortieren. Live erster Gewinn 1,64 €, danach
   39,64 €. Der sichtbare Rang ist damit kein Gewinnranking.
5. **Zu weitgehende Gewinnbegriffe.** „Reingewinn (Netto)“/„alle Kosten“ ziehen
   hier Betriebsausgaben und Steuern nicht zusätzlich ab. Unbekannte Kosten
   werden dagegen sinnvoll nicht zu 0: betroffene Gewinn-/ROI-Gruppensummen
   bleiben unbekannt. Diese Regel unterscheidet sich vom bekannten Teilgewinn
   des neueren Dashboards und sollte nachvollziehbar erklärt werden.
6. **Holding unvollständig.** Aktuelle Servicearrays werden über alle
   Workspacekennungen verteilt; fehlende andere Workspacebestände können als 0
   erscheinen. Restmengen aus Losen sind in diesem Bestandspfad nicht enthalten.
   Live Holdingbestand 0 trotz zuvor vorhandenen physischen Bestands im Dashboard.
   Steuerprofil ist im Template fest beschriftet. Keine Aussage, dass ein
   anderer Workspace wirklich leer oder sein Steuerprofil geprüft wäre.
7. **Kategoriegrenzen.** Bestandszahl zählt übergebene Einzeldatensätze ohne
   passenden Statusfilter; Verkaufszählung ist vorgangsbezogen. Live alle
   30-Tage-Verkäufe unter „Allgemein“, kein belastbarer Warenmixvergleich.
8. **Lade-/Fehlerklarheit.** Keine dem neuen Dashboard entsprechende gemeinsame
   Bereitschafts-/Fehlerprüfung und kein eigener Neuladenknopf gefunden.
   Leere Anfangs-/Fehlerstände können als 0 erscheinen. Keine künstlichen Fehler
   ausgelöst; keine pauschale Aussage über jeden globalen Servicefehler.

Quellen:
[Bereiche, Filter und Anbindung](../../src/app/features/analytics/analytics.component.ts#L84),
[UI und Top-Verkäufe](../../src/app/features/analytics/analytics.component.html#L112),
[Kategorien](../../src/app/core/services/analytics.service.ts#L444),
[Dauer](../../src/app/core/services/analytics.service.ts#L625),
[Monatsberechnung](../../src/app/core/services/analytics.service.ts#L716),
[Wochentage](../../src/app/core/services/analytics.service.ts#L802),
[Holding](../../src/app/core/services/workspace.service.ts#L508),
[Kostenlücken](../../src/app/core/utils/financial-summary.ts),
[Verkaufsdaten](../../src/app/core/services/sales.service.ts#L159).

## Vergleich und Entscheidungsvorlage

| Anwendungsfall           | Vintz                                                           | Flipbase                                                       | Einordnung                                             |
| ------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| Finanzielle Rentabilität | Auf dieser Seite kein Gewinn-/Gebührenbericht                   | Plattformgebühren, direkter Gewinn und ROI vorhanden           | Bestehendes fachlich festigen, keine neue Dopplung     |
| Verkaufsdauer            | Median, Durchschnitt, Quartile, 24-Stunden-Anteil, Dauergruppen | Durchschnitt und Gruppen ab Einkauf; Werte teils uneinheitlich | Beide Zeitbegriffe getrennt erfassen, Median ergänzen  |
| Uploadentscheidung       | Zeitfenster/-tag und Mengenhinweis, teils persönliche Quelle    | Wochentage von Verkaufsdaten, keine Uploaduhrzeit              | Potenzieller Zusatznutzen erst mit passenden Messdaten |
| Modelle/Marken           | KI-normalisierte Gruppen und eigene/Markt-Medianzeit            | Kategorien mit Datenlücken, kein sichtbarer Markenbericht      | Eigene saubere Produktgruppen zuerst                   |
| Marktvergleich           | Anonymer Pool mit Mindestgruppen, begrenzte Stichprobe          | Kein gleichwertiger Pool                                       | Größeres eigenes Datenvorhaben, nicht nur ein Diagramm |
| Transparenz              | Messhilfe, Quellenkennzeichnung, Mindestmengen                  | Teilweise irreführende Namen und verschiedene Filterwirkungen  | Höchste Priorität für verständliche, richtige Zahlen   |
| Export                   | Analytics ohne Dateiexport                                      | Analytics ebenfalls ohne Dateiexport                           | Finanz-/Steuerexporte getrennt bewerten                |

Empfohlene Reihenfolge für eine spätere Umsetzung:

1. **Zuerst Verlässlichkeit:** Zeitfilter, Statusbehandlung, unbekannte
   Haltedauer/Kosten, Gewinnbegriffe, Gewinnranking und Kohortenzuordnung
   konsistent machen. Holding nicht als vollständige Konsolidierung ausgeben,
   solange nicht alle Quellen vollständig geladen sind.
2. **Dann eigene Verkaufsleistung:** Median und Streuung, nachvollziehbarer
   Artikelmix, Anzahl der Messungen und getrennte Dauer seit Einkauf/Upload.
   Leere oder schwach belegte Gruppen ausdrücklich kennzeichnen.
3. **Später Empfehlungen:** Upload-/Relist-Hinweise mit Quelle und Mindestmenge,
   ohne automatisches Aktivieren und ohne Kausalität zu versprechen.
4. **Gesondert entscheiden:** Anonymer Marktpool erst mit klarer Teilnahme,
   Datenqualität, ausreichender Breite und geprüften Schutzregeln. Kein
   unmittelbarer Kopierauftrag aus diesem Vergleich.

## Abschluss und offene Fragen

Vintz-Quellenidentität, SHA-256 des UTF-8-Texts:

- `https://vintz.ai/_next/static/chunks/1auw4lb8_0wot.js`, 47.493 Zeichen:
  `116364bcb86ee2eb7276330c0c6248d5be4e7307263a9f7c289b51123c72c5d4`.
- `https://vintz.ai/_next/static/chunks/1ru6er5aq94_4.js`, 19.267 Zeichen:
  `40d89d0fcd9e0a63c8a107dd36541c255e956d9a9c9fbb2a2b96913bda0d4444`.

[Bereinigte Antwort-/Quellenbelege](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-analytics-evidence-2026-10-18.json),
[Vintz-Übersicht](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-analytics-overview-2026-10-18.png),
[Messhilfe](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-analytics-method-2026-10-18.png),
[Jahresansicht](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-analytics-year-2026-10-18.png),
[Flipbase-Übersicht](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/flipbase-analytics-overview-2026-10-18.png),
[Haltedauer](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/flipbase-analytics-duration-2026-10-18.png),
[Kohortenanzeige](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/flipbase-analytics-cohorts-2026-10-18.png),
[Zeitfiltergrenze](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/flipbase-analytics-filter-scope-2026-10-18.png).

Offen: eigene nichtleere Tempo-Messungen, historische Erfassung, genaue
Serverfilter/-kontentrennung, Zuverlässigkeit der KI-Gruppierung, Verarbeitung
fremder Währungen und gebündelter Bestellungen sowie Schutzregeln des Pools.
API-Aggregate beweisen keine Richtigkeit jedes Ursprungsdatensatzes. Keine
generelle Mobil-/Leistungs-/Barrierefreiheitsprüfung und keine steuerrechtliche
Bewertung. Jahresdatumsanzeige ließ das Startjahr weg; Quelle und Zeitraum
müssen bei jahresübergreifenden Berichten klarer lesbar sein.

Keine Geschäftsaktion, Synchronisierung, Auto-Relist, Teilnahmeänderung,
Nachricht, Buchung oder Umsetzung. Ansichtsfilter auf 90 Tage bei Vintz sowie
30 Tage/Gesamtübersicht bei Flipbase zurückgesetzt; separate Lesetabs geschlossen.
Vorhandene Nutzertabs und pausierte Flipbase-Verbindung nicht verändert.
Nur Dokumentation; Markdown, lokale Links und Unterschiedskontrolle erfolgreich
geprüft. Keine Anwendungstests für diesen Dokumentationsschritt erforderlich.
Danach ausdrücklich Stopp zur Besprechung.
