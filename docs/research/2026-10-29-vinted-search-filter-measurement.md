# Messbericht: zentrale Vinted-Suchfilter

29.10.2026, Juna. Ausgangspunkt `8f9a81ac02556daf0f7db13b4169c76f703c0d15`,
eigener Zweig `juna/vinted-filter-measurement`. Zeitangaben mit UTC-Offset;
deutsche Uhrzeiten gelten für Europe/Berlin. Kein Push, PR oder Merge.

**Ergebnis:** Kürzere eigene Abstände allein steigern den vollständigen
Browser-Seitenaufbau nur auf etwa 8,6 erfolgreiche Katalogaufrufe pro Minute.
Der schlankere Abruf im bereits geöffneten Browser erreicht in den kurzen
fehlerfreien Stufen etwa 26–28 pro Minute. Die höhere Stufe mit zwei parallelen
Abrufen und 250 ms Startabstand erhält eine echte HTTP-429-Ablehnung und wird
beendet. Ursprünglicher Betrieb vollständig wiederhergestellt, alle vier
Filter wieder erfolgreich. Eine dauerhafte Sekundenversorgung für zwanzig
unterschiedliche Suchen ist nicht nachgewiesen.

## Auftrag, Freigaben und Durchführung

Zehn bis zwanzig verständlich verwaltbare Filter sollen neue passende Angebote
innerhalb weniger Sekunden zeigen. Dieser Auftrag vermisst den vorhandenen
Aufbau. Er implementiert keine neue Verwaltungsoberfläche.

Zunächst war ausschließlich passive Produktionserfassung plus lokale Lastprüfung
freigegeben. Der Nutzer stellte anschließend klar: Zehn Sekunden sind kein
festzuhaltendes Limit. Danach erlaubte er ausdrücklich auch Änderungen eigener
Abstände, Budgets und geeigneter Gleichzeitigkeit für kontrollierte reale
Vergleiche. Diese spätere Freigabe ersetzt die ursprüngliche Beschränkung des
Messplans. Bestehende Anbieterpausen und Challenges bleiben verbindlich.

Die vorhandene primäre Arbeitskopie und der Planungsworktree wurden nicht
verändert. Vor Arbeitsbeginn: sauberer Ausgangszustand, `git fetch origin --prune`,
neuer eigener Zweig von `origin/master`. Der lokale `master` liegt in einer
anderen belegten Arbeitskopie und wurde deshalb nicht umgeschaltet. Die beiden
Planungsdokumente wurden ausschließlich lesend in diesen Zweig kopiert.

## Belegter Ausgangsbetrieb

Der eingerichtete SSH-Zugang aus der vorhandenen Flipbase-Betreiberhilfe
funktioniert. Keine Zugangsdaten oder Cookies wurden ausgegeben. Keine anderen
Projekte wurden abgefragt. SQL-Abfragen liefen in `begin read only` mit begrenzter
Ausführungszeit; ausschließlich vorhandene Flipbase-Tabellen wurden gelesen.

Das tatsächlich laufende Abbild ist über seinen unveränderlichen Digest
identifiziert:
`sha256:6caa2026c5dbe7d514f9d9d6f5ecc3e21e4e0e5ad1a1514255a5c9c0aa48330d`.
Ein Commit-/Versionslabel fehlt. Die fünf kompilierten Dateien für Einstieg,
Konfiguration, Fortschritt, Scheduler und Teilabfragen stimmen per SHA-256 mit
dem lokalen Bau des Ausgangsstands überein. Das ist ein gezielter Quellvergleich,
kein Beleg für die Git-Herkunft jedes Bestandteils des Images oder der Web-App.

Die wirksamen Werte wurden durch `loadConfig(process.env)` **im laufenden
Container** ermittelt und nur auf die Zeit-/Budgetfelder begrenzt ausgegeben:

| Einstellung                              | Wirksamer Ausgangswert |
| ---------------------------------------- | ---------------------: |
| Mindestabstand zwischen Anfrageanfängen  |            10 Sekunden |
| Einzelanfrage-Zeitlimit                  |            20 Sekunden |
| Eigenes Minutenbudget                    |                     30 |
| Pause nach einer vollständigen Runde     |             5 Sekunden |
| Gewünschter Takt der vier aktiven Filter |    jeweils 20 Sekunden |

Diese Werte sind eigene Einstellungen, keine Vinted-Grenzen oder Anforderungen
an die spätere Lösung. Die Datenbank erlaubt derzeit Filterintervalle ab zehn
Sekunden; auch diese eigene Produktgrenze wäre für ein kürzeres Ziel anzupassen.

| Aktiver Filter | Kategoriekennung | Markenkennungen  | Teilabfragen |
| -------------- | ---------------: | ---------------- | -----------: |
| Adidas         |             2050 | 14               |            1 |
| Nike Neu       |             2050 | 53               |            1 |
| Blauer         |             1206 | 110522, 14545271 |            2 |
| Ralph Lauren   |             2050 | 88, 4273         |            2 |

Alle vier sind Format 1, ohne Suchtext, Titelbegriffe oder Preisgrenzen. Der
spätere Statusabruf um etwa 21:26 Uhr zeigt erfolgreiche Abrufe für alle vier,
Fehlerzähler null und `ready`. Historische `last_error_kind`-Einträge bleiben
teilweise bestehen und sind deshalb allein kein Beleg eines aktuellen Ausfalls.
Der Herkunftsstatus ist ebenfalls `ready`, ohne Anbieterpause.

### Regulärer Zulauf über dreißig Minuten

Zeitfenster: **29.10.2026, 20:50:00 bis vor 21:20:00 Uhr**, entsprechend
`19:50:00Z <= Zeit < 20:20:00Z`. Der Container lief bereits seit `19:06:22Z`.
Vorhandene Docker-Logs decken das Fenster ab; kein zusätzlicher Katalogabruf war
für diesen Ist-Vergleich nötig. Standardausgabe **und Fehlerausgabe** wurden
ausgewertet, da Fehler in einem getrennten Logstrom stehen.

| Messgröße                                              |                                                      Ergebnis |
| ------------------------------------------------------ | ------------------------------------------------------------: |
| Ausgewertete Logzeilen                                 |                           210: 208 Standard-, 2 Fehlerausgabe |
| Abgeschlossene Runden                                  |                                                            92 |
| Erfolgreich abgeschlossene Filterabrufe laut Runden    |                                                           160 |
| Fehlgeschlagene Filterabrufe                           |                                                             2 |
| Wegen Minutenbudget ausgelassene Filter                |                                                             0 |
| Neue gespeicherte Artikel nach `first_seen_at`         |                                                         1.950 |
| Unterschiedliche Speicherzeitpunkte mit neuen Artikeln |                                                           142 |
| Zulauf pro Minute                                      |                                          43 bis 93, Mittel 65 |
| Abstand der Rundenabschlussmeldungen, 91 Abstände      | 11,149 / 21,811 / 25,442 Sekunden: Minimum / Median / Maximum |
| Eigene neue Merkzetteltreffer laut Runden              |                                                             0 |

Verteilung nach erstem entdeckendem Filter: Nike 958, Adidas 498, Ralph Lauren
468, Blauer 26. Das sind gespeicherte neue Artikel, keine Aussage über alle
in dieser Zeit veröffentlichten oder in Vinted verfügbaren Inserate.

Die Logs summieren `new=1959`, während das nach Speicherzeit begrenzte
Datenbankfenster 1950 enthält. Rundenabschluss und einzelne Speicherzeitpunkte
haben verschiedene Fenstergrenzen. Die Differenz wird nicht als Verlust oder
Duplikat interpretiert. Für den Zulauf gilt der klar abgegrenzte Datenbankwert.

Zwei Fehler: `network_error` um `19:55:22.511Z` und `parser_error` nach HTTP 200
um `20:00:38.273Z`. Keine protokollierte 403-/429-Ablehnung. Zwei von 162
abgeschlossenen Filterversuchen entsprechen 1,23 Prozent; das ist **keine
Fehlerquote aller einzelnen HTTP-Anfragen**, da Wiederholungen und Nebenabrufe
nicht vollständig historisch vorliegen.

### Antwortzeit und Speicher: eigene kleine Stichproben

Ein zusätzlicher passiver CDP-Beobachter hat vom `20:25:01.434Z` bis
`20:25:56.448Z` ausschließlich ohnehin laufende Kataloganfragen beobachtet.
Er hat keine Navigation und keinen Katalogabruf ausgelöst und sich danach
getrennt. Fünf Antworten, alle HTTP 200: **1.848, 1.538, 1.448, 1.521 und 1.658
Millisekunden**. Median 1.538, Minimum 1.448, Maximum 1.848 Millisekunden.
Gemessen vom Browser-Anfragestart bis `Network.loadingFinished`, ohne spätere
Parser-, Speicher- und Anzeigezeit. Diese 55 Sekunden sind vom 30-Minuten-Fenster
getrennt und keine Belastungsstufe.

Speicherstichproben desselben Ausgangscontainers: um `20:19:53Z` 1,602 GiB
von 2 GiB, später um `20:25:58Z` 1,87 GiB; 164 Prozesse/Threads laut Docker.
Eine weitere Vorbereitungskontrolle lag wieder bei 1,545 GiB. Schwankungen
sind belegt, ein dauerhafter Speicheranstieg oder Speicherleck damit nicht.
`RestartCount=0`, `OOMKilled=false`, `healthy` am Ausgangscontainer. Das beweist
keine Neustartfreiheit vor dessen Erstellung.

### Was daraus nicht messbar ist

Für die 1950 Artikel sind genaue Kategorie-, Foto- und Aktualisierungszeitpunkte
in dieser Stichprobe nicht vorhanden. Ein Fotozeitpunkt wäre ohnehin kein
Veröffentlichungsbeleg. Unbekannt bleiben Veröffentlichung, erste tatsächliche
Quellverfügbarkeit und Anzeigezeit auf einem konkreten Bildschirm.

Die Zeitkette lautet: Veröffentlichung → erste belegte Quellverfügbarkeit →
eigener Fund → Datenbankspeicherung → berechtigte Feedanzeige. Gemessen sind
hier gespeicherter Zulauf und eine kleine Browserantwortzeit-Stichprobe.
`first_seen_at` ersetzt weder Veröffentlichung noch den früheren Quellzeitpunkt.
Die vorhandenen etwa zwei Sekunden Feed-Nachladepause sind ein Codebefund,
kein gemessener Ende-zu-Ende-Nachweis.

## Lokale Prüfung mit echten Planungsbausteinen

Ausgeführt wurden `QueryScheduler`, `searchFilterRequest`, `isDue`,
`RequestBudget`, `countingFetch`, `pacedVintedFetch`, `VintedCollector` und
Katalogparser. Die Netzwerkfunktion liefert ausschließlich künstliche Antworten
für `https://catalog.invalid`; kein externer HTTP-Aufruf. Uhr und Wartefunktion
sind kontrolliert. Nur Datenbank, Browser und externe Quelle sind ersetzt.
Das ist eine Ausführung des vorhandenen Planers, keine reine Divisionsrechnung.

Jede normale Matrixzelle umfasst mindestens 1800 simulierte Sekunden. Eine
bereits begonnene Runde läuft zu Ende; tatsächliche Endzeiten stehen im JSON.
Ausnahmen: die Leerantwortprobe mit mindestens 300 Sekunden und die ausdrücklich
einzelnen Vergleichsrunden. Grundannahmen: 200 ms Antwortzeit, 20 Sekunden
Filterwunsch, 5 Sekunden Rundenpause, Budget 30. Keine Kategorieauffrischung,
zusätzlichen Sitzungsladevorgänge, Datenbanklatenz oder Merkzettel-Auswertungen.
Die 200 ms sind **kein gemessener Vinted-Wert**; eigene zusätzliche Zellen
verwenden 1600 ms, nahe der kleinen passiven Stichprobe.

### Ausgangsabstand von zehn Sekunden

„Vollständige Erstabdeckung“ bedeutet: jede Marke-/Begriff-Kombination jedes
Filters wurde mindestens einmal angefragt. „Wiederkehr“ ist der Abstand zweier
Anfrageanfänge derselben Teilabfrage, jeweils p95 der tatsächlich beobachteten
Abstände. Die erste Zeile ist also kein Versprechen, dass jeder neue Artikel in
40,2 Sekunden gefunden wird.

|                          Filter | Teilabfragen | Erste volle Abdeckung | Wiederkehr p95 | Gemessene Wiederkehrabstände |
| ------------------------------: | -----------: | --------------------: | -------------: | ---------------------------: |
|                               5 |            5 |                40,2 s |           50 s |                          177 |
|                              10 |           10 |                90,2 s |          100 s |                          176 |
|                              20 |           20 |               190,2 s |          200 s |                          162 |
|  5 × 2 Marken × 3 ODER-Begriffe |           30 |               310,2 s |          300 s |                          152 |
| 10 × 2 Marken × 3 ODER-Begriffe |           60 |               650,2 s |          600 s |                          126 |
| 20 × 2 Marken × 3 ODER-Begriffe |          120 |              1270,2 s |         1200 s |                           62 |

Bei zwanzig einfachen Filtern: 182 lokale Anfragen über 1815,2 simulierte
Sekunden, p95-Fälligkeitswartezeit 179,8 Sekunden. Der größte am Rundenbeginn
festgestellte Rückstau beträgt zwanzig fällige Filter. Es gibt keine unbegrenzt
wachsende eigene Auftragsliste; fällige Arbeit wartet im gespeicherten Zustand.
Bei sechs Teilabfragen je Filter beschreibt die Wartezeit des Filters nicht
die viel längere Wartezeit auf dieselbe einzelne Kombination.

### Kürzere eigene Abstände, zunächst mit bisherigem Budget

| Filter | Teilabfragen | Abstand | Erste volle Abdeckung | Wiederkehr p95 | Anfragen / simulierte Dauer |
| -----: | -----------: | ------: | --------------------: | -------------: | --------------------------- |
|      5 |            5 |     1 s |                 4,2 s |         24,2 s | 375 / 1800 s                |
|     10 |           10 |     1 s |                 9,2 s |         26,8 s | 753 / 1805,4 s              |
|     20 |           20 |     1 s |                19,2 s |         52,6 s | 870 / 1800,4 s              |
|      5 |            5 |     2 s |                 8,2 s |         24,6 s | 367 / 1801,6 s              |
|     10 |           10 |     2 s |                18,2 s |         29,6 s | 644 / 1800 s                |
|     20 |           20 |     2 s |                38,2 s |         46,4 s | 800 / 1811,2 s              |
|     20 |           20 |     5 s |                95,2 s |        100,4 s | 360 / 1804,2 s              |
| 20 × 6 |          120 |     1 s |               225,4 s |        250,4 s | 870 / 1800,4 s              |
| 20 × 6 |          120 |     2 s |                 283 s |          272 s | 800 / 1811,2 s              |

Zwanzig Filter bei einer Sekunde erzeugen 1778 budgetbedingte Verschiebungen.
Dass die 2-Sekunden-Zelle eine etwas bessere p95-Wiederkehr hat, entsteht aus
Takt, Fälligkeit und Budgetfenster und belegt keine allgemeine Überlegenheit.
Mit 1600 ms Antwortzeit ergeben sich bei zwanzig Filtern 47 s p95 für eine
Sekunde Abstand beziehungsweise 49,2 s für zwei Sekunden. Ein zusätzlicher
**rein hypothetischer** 1-Sekunden-Filterwunsch ergibt bei Budget 30 weiterhin
53,4 s p95 und 3090 Budgetverschiebungen. Er wurde nicht in die Datenbank
geschrieben und hebt deren aktuelle Eingabegrenze nicht auf.

Das unveränderte Budget ist nur eine Vergleichsbasis dieser Zellen. Die spätere
Nutzerfreigabe beauftragt ausdrücklich auch höhere eigene Budgets im realen
Vergleich; sie werden nicht als unveränderliche Anbietergrenze behandelt.

Zusätzliche Zellen erhöhen das eigene Budget auf 120, verkürzen Filterwunsch und
Rundenpause auf jeweils eine Sekunde und behalten die echte sequentielle
Planung bei. Bei 1600 ms Antwortzeit: Wiederkehr p95 für fünf / zehn / zwanzig
Filter 9 / 17 / 33 Sekunden; bei 120 Teilabfragen 198 Sekunden. Keine
Budgetverschiebungen. Diese Filterwünsche sind eine lokale Bewertungsvariante,
keine Datenbankänderung.

Die erste reale Laststufe misst später **5867 ms für die vollständige
Browseroperation**. Eine weitere lokale Ausführung mit genau diesem festen
Median, Budget 120 und kurzen eigenen Takten ergibt für fünf / zehn / zwanzig
Filter 30,335 / 59,670 / 118,340 Sekunden Wiederkehr p95; für 120 Teilabfragen
710,040 Sekunden. Das sind gemessene Planerausführungen mit einer konstanten
Ersatzantwortdauer. Sie ersetzen keine echte Laufzeitverteilung unter zwanzig
gleichzeitig angelegten Produktionsfiltern.

### Abdeckung, Teilung und Fehler

Die Quelle produziert in engen künstlichen Teilbereichen einen Artikel je
Sekunde und in breiten zwanzig Artikel je Sekunde; jeder Abruf sieht die neuesten 96. Nur der bekannte synthetische Gesamtbestand erlaubt eine genaue Verlustzahl.
Gezählt werden ausschließlich zwischen zwei beobachteten Seiten entstandene,
bereits verdrängte Artikel; Erstbestand und unbeobachteter Schlussteil fehlen.
Bei zwanzig einfachen Filtern und zehn Sekunden Abstand: 8424 enge und 316224
breite verdrängte Artikel. Bei einer Sekunde Abstand und Budget 30: null enge,
312340 breite. Diese Mengen sind absichtlich künstliche Belastungen, keine
heutigen Marktzahlen und wegen unterschiedlicher tatsächlich beobachteter
Zeitabschnitte keine normierten prozentualen Vorher-/Nachherquoten.

Der p95-Fundabstand **nur erfasster** synthetischer Artikel kann zugleich klein
wirken, weil alte Artikel schon verdrängt sind. Er darf niemals ohne die
Verlustzahl als Aktualitätsnachweis verwendet werden. Eine volle Seite oder
fehlende Überlappung beweist für die echte Quelle allein noch keine Vollständigkeit
oder konkrete Verlustmenge.

Ein getrennter bekannter Bestand mit 192 Artikeln zeigt 96 jüngere fremde und
96 ältere passende enge Artikel: breiter Erstseitenabruf enthält null der 96
engen Treffer; der enge Abruf enthält alle 96. Ein ungeprüfter globaler Abruf
würde diese Treffer verdrängen, selbst wenn alle Antworten HTTP 200 liefern.

Ein lokaler Vergleich für zwanzig unterschiedliche Titelregeln mit vier
identischen tatsächlichen Abrufen vergleicht die bisherige Planung mit einem
nur in der Messung verwendeten Antwortcache: zwanzig statt vier echte lokale
Anfrageaufrufe, 190,2 statt 30,2 Sekunden für die Einzelrunde. Jede Titelregel
wird danach weiterhin durch den echten Collector geprüft. Das belegt sichere
Teilbarkeit identischer Rohabrufe, keine allgemeine Marktzusammenfassung.

19 Sekunden erfolgreiche Antwortzeit ergeben bei zwanzig Filtern 380 Sekunden
für die erste Runde. Die Fortschrittsüberwachung bleibt dabei lebendig:
Fortschritt wird bereits **nach einzelnen Browserabrufen** gemeldet. Die frühere
Planannahme, eine lange erfolgreiche Runde würde deshalb zwingend nach fünf
Minuten neu starten, ist im aktuellen Quell- und laufenden Abbild widerlegt.
Status und nachgelagerte Merkzettel-Auswertung erfolgen dagegen weiterhin erst
nach der Runde; im langsamen Modell liegen Statusmeldungen bis 390 Sekunden
auseinander. Diese Engstelle besteht unabhängig vom Watchdog.

Leere Antworten bleiben ohne erfundene Funde und werden weiterhin getaktet.
Die 429-Probe mit `Retry-After: 120` deckt einen vorhandenen Fehler auf:
Die nächste einzelne Probe startet bei 120 Sekunden **ab Rundenbeginn**.
Die Antwort kam erst nach 200 ms an; die tatsächliche Wartezeit nach Ablehnung
beträgt damit nur 119,8 Sekunden. Bei späteren Abfragen einer langen Runde
kann die Unterschreitung deutlich größer werden. Das ist kein Nachweis einer
voll eingehaltenen Anbieterpause. Für die zusätzliche reale Parallelmesshilfe
wird deshalb der tatsächliche Fehlerzeitpunkt verwendet. Die erste reale
Messserie hatte keine 403/429, sodass dieser Fehler dort nicht als tatsächliche
Missachtung einer Anbieterpause beobachtet wurde. Vor einer dauerhaften
Leistungsänderung muss der Zeitbezug im Produkt berichtigt werden.
Vorhandene weitere Fälle prüfen 403/Challenge, 5xx-Wiederholungen,
Netzwerk-/Parserfehler, echte Abort-Zeitgrenzen, hängende Browserbeendigung und
den begrenzten Wiederanlauf.

Bei laufend pausierten, bearbeiteten oder gelöschten Filtern kann der zu Beginn
der Runde geladene Snapshot noch einen unnötigen Abruf auslösen. Die Messung
erfasst eine solche Antwort bei 190,2 Sekunden. Der echte Scheduler behandelt
`accepted=false` ohne neue Funde. Die Serverantwort ist hier ausdrücklich nur
modelliert; Aktivstatus, Revision und Cursor werden in den vorhandenen
SQL-Funktionen geprüft. Die echten pgTAP-Fälle wurden in dieser Umgebung nicht
ausgeführt. Eine neue Aktivierung kommt erst in der nächsten geladenen Runde
zum Zuge. Diese Verzögerung soll durch erneute Planung nach begrenzten
Arbeitsschritten verkürzt werden.

## Reale Laststufen und Wiederherstellung

Die realen Vergleiche verwenden ausschließlich die vier vorhandenen Filter mit
sechs Teilabfragen. Keine Testfilter angelegt oder bestehende Filter verändert.
Der vorhandene Container wird für jede Stufe regulär ersetzt; derselbe
unveränderliche Image-Digest und dasselbe persistente Profil bleiben erhalten.
Es läuft jeweils nur ein Chrome-Prozessverbund für dieses Profil. Die
gemessenen Neustarts werden von den absichtlich vorgenommenen Containerwechseln
unterschieden.

Vorher wurden Containerkonfiguration, Compose-/Umgebungsdatei und Filterbedingungen
in einem privaten Betreiberverzeichnis mit eingeschränkten Rechten gesichert.
Keine Geheimnisse in diesem Repository. Unveränderte Originaldateien bleiben
unangetastet. Messcode wird nur über temporäre, lesbare Dateieinbindungen im
Container verwendet. Eine unabhängige Rückkehr nach spätestens 25 Minuten und
ein `finally`-Rückweg sichern jeden Versuch. Vor Rückkehr wird geprüft, dass
keine fremde Veröffentlichung bzw. fremde Messhilfe überschrieben würde.

Für die Last wird ausschließlich die interne Fälligkeitsprüfung auf eine
Sekunde und die Rundenpause auf eine Sekunde verkürzt. Gespeicherte Filterintervalle,
Aktivzustände, Revisionen und Bedingungen werden nicht geändert. Artikel,
Abrufcursor und Erfolgszeiten werden vom regulären, geschützten Speicherweg
normal weitergeführt und anschließend **nicht** zurückgesetzt.

Abbruch bei 403/429/Challenge, automatischem Neustart, OOM, zu vielen Prozessen
oder wiederholt mindestens 95 Prozent Speicherauslastung. Zusätzlich werden
deutlich erhöhte Fehlerquoten und im Parallelversuch jeder Fehler an Speicherung,
Runde oder Statusübermittlung überwacht. Die maximal zwei schon laufenden
Anfragen dürfen auslaufen; nach erkannter Anbieterpause startet keine wartende
Anfrage mehr. Anbieterpausen werden nicht aufgehoben.

### Vollständiger bestehender Seitenaufbau

| Abstand / eigenes Budget | Beobachtet | Katalogaufrufe / HTTP 200 | Erfolgreiche Aufrufe/min | Browserdauer p50 / p95 | Höchste Speicherstichprobe |
| ------------------------ | ---------- | ------------------------- | -----------------------: | ---------------------- | -------------------------: |
| 5 s / 60                 | 193,649 s  | 27 / 27                   |                     8,37 | 5867 / 7431 ms         |                    80,13 % |
| 2 s / 120                | 193,579 s  | 28 / 28                   |                     8,68 | 5832 / 6255 ms         |                    74,11 % |
| 1 s / 120                | 306,652 s  | 44 / 44                   |                     8,61 | 5783 / 6746 ms         |                    95,56 % |

Alle drei Stufen ohne fehlgeschlagenen Filterabruf, automatische Neustarts oder
OOM. Der kurze Speichermoment über 95 Prozent wiederholte sich nicht bis zur
Abbruchschwelle. Die längste Stufe umfasst rund fünf Minuten. Höhere eigene
Budgets und kürzere Abstände lösen den vollständigen Browser-Seitenaufbau als
Engpass nicht. Die erste Vorbereitung wurde vor jeglicher Betriebsänderung
wegen eines nicht eindeutigen Instrumentierungsankers abgebrochen; der Anker
wurde präzisiert und anschließend erst der gesicherte Versuch gestartet.

Die Zeiten umfassen die vollständige bestehende `browser.fetch`-Operation
einschließlich Verbindung, Dokumentverarbeitung und Aufräumen. Daher sind sie
mit den zuvor nur auf Netzwerkebene beobachteten 1,45–1,85 Sekunden nicht
identisch. Ein bestimmter innerer Teilschritt ist dadurch noch nicht als
alleinige Ursache bewiesen.

### Katalogantwort im bestehenden geöffneten Browser lesen

Eine enge zweite Messhilfe öffnet zunächst über den bisherigen Weg regulär einen
Katalog. Danach liest sie dieselben Katalog-GETs im vorhandenen Browserkontext
mit dessen normalen gleichursprünglichen Sitzungsregeln, ohne wiederholten
Dokumentaufbau. Kein neues Konto, Proxy, zweiter Browser oder automatisches
Lösen einer Challenge. Der vorhandene Collector, Parser und die geschützte
Datenbankübernahme bleiben in Verwendung. Unerwartete Weiterleitungen werden
nicht verfolgt; sie sind ein Fehler und benötigen später den vorhandenen
regulären Erneuerungsweg.

| Abstand / eigenes Budget | Beobachtet | Browser-Katalogaufrufe / HTTP-200-Rückgaben | Erfolgreiche Rückgaben/min | Dauer p50 / p95 | Höchste Speicherstichprobe |
| ------------------------ | ---------- | ------------------------------------------- | -------------------------: | --------------- | -------------------------: |
| 2 s / 120                | 193,469 s  | 81 / 80                                     |                      24,81 | 1304 / 1647 ms  |                    50,83 % |
| 1 s / 120                | 306,379 s  | 135 / 135                                   |                      26,44 | 1271 / 1547 ms  |                    41,25 % |

In der 2-Sekunden-Stufe ein `Failed to fetch` ohne HTTP-Status; der bestehende
Fehlerpfad klassifiziert diesen allgemeinen Browserfehler als `server_error`.
Das ist kein Beleg einer HTTP-500-Antwort oder einer Anbieterablehnung.
Die 1-Sekunden-Stufe endet ohne Abruffehler. Keine 403/429, automatischen
Neustarts oder OOM in diesen beiden Stufen.

**Messgrenze:** Diese beiden ersten Browser-fetch-Stufen verwendeten den normalen
Browsercachemodus. HTTP 200 ist deshalb eine erfolgreiche Fetch-Rückgabe, noch
kein Beweis eines neuen entfernten Vinted-Requests je Aufruf. Laufend neu
gespeicherte Artikel belegen fortgesetzten Zulauf, beseitigen diese
Einzelanfragen-Messlücke aber nicht. Der zusätzliche Parallelvergleich verwendet
deshalb ausdrücklich `cache: 'no-store'` und verwirft einen durch Service Worker
gesteuerten Ausgangszustand.

### Begrenzte Gleichzeitigkeit

Eine unabhängige Prüfung hat vor dem ersten echten Parallelversuch konkrete
Messhilfenfehler gefunden: wartender Start nach Ablehnung, Abbruch während
CDP-Verbindung, unvollständig geteilter Warmup, falsche gemeinsame Fehlerzählung
und fehlender Schutz des unabhängigen Rückkehrtimmers. Die ersten drei
Verhaltensfehler einschließlich Warmup wurden mit zunächst fehlgeschlagenen
lokalen Fällen reproduziert. Anschließend bestehen sieben unabhängige
Verhaltensprüfungen, darunter höchstens zwei parallele Aufträge, blockierter
Warteslot, Zeitlimit/Fortsetzung, getrennte Speicherfehler, Abbruch während der
Verbindung und genau ein vollständig geprüfter Warmup. Der Rückkehrschutz wird
vor Registrierung des Timers geschrieben. Der unabhängige Nachcheck bestätigt
diese Grenzen; er ersetzt keine Produktionsreifeprüfung.

Der zusätzliche reale Versuch begrenzt auf **zwei** gleichzeitige
Browser-fetch-Aufrufe in demselben vorhandenen Browserkontext, mit serialisierten
Startplätzen und unverändert geschützter Speicherung. Der ursprüngliche
Navigationsweg wird nicht parallel ausgeführt. Für die letzte Stufe wurde
ausschließlich in der temporären Messkonfiguration die eigene Untergrenze von
1000 auf 250 ms abgesenkt; kein Produktwert oder Datenbankschema wurde geändert.

| Abstand / eigenes Budget           | Beobachtet                    | Aufrufe / HTTP 200 / HTTP 429 |      Erfolgreiche Rückgaben/min | Aufrufdauer p50 / p95 | Höchste Speicherstichprobe |
| ---------------------------------- | ----------------------------- | ----------------------------- | ------------------------------: | --------------------- | -------------------------: |
| 1 s / 120, höchstens 2 parallel    | 193,538 s                     | 89 / 89 / 0                   |                           27,59 | 1504 / 2025 ms        |                    45,17 % |
| 250 ms / 120, höchstens 2 parallel | **nach 80,629 s abgebrochen** | 39 / 38 / 1                   | **kein stabiler Durchsatzwert** | 1187 / 7142 ms        |                    42,61 % |

Die 250-ms-Stufe beginnt um `21:06:59.957Z`. Um `21:08:05.028Z` kommt HTTP 429,
also nach etwa 65,1 Sekunden mit insgesamt 39 abgeschlossenen Aufrufen. Die
momentane Größenordnung von etwa 36 Aufrufen pro Minute bis zu dieser Ablehnung
ist **keine tragfähige Leistungsempfehlung**. Der größere p95-Wert enthält den
gemeinsamen Warmup; eine Aufrufdauer ist nicht identisch mit einer einzelnen
Netzwerkantwortzeit.

Ein zweiter wartender Auftrag scheitert anschließend am lokalen Startschutz,
ohne einen weiteren Katalogaufruf auszulösen. Deshalb zwei gezählte
Filterfehler, aber nur **eine** HTTP-Ablehnung. Nach der 429 wird keine weitere
Katalogoperation dieser Stufe abgeschlossen. Die globale Sperre verhindert
neue Startplätze sofort; der äußere Beobachter beendet die Stufe beim nächsten
Kontrollpunkt und stellt den bisherigen Betrieb her.

Kein auswertbarer `Retry-After`-Wert. Die bestehende Rückfallpause von 60 Sekunden
wird bis `21:09:05.028Z` gespeichert, ausgehend vom tatsächlichen Fehlerzeitpunkt.
Die Wiederherstellung ist um `21:08:24.499Z` bestätigt und hebt diese Pause
ausdrücklich nicht auf. Danach reguläre Probe und Wiederaufnahme, ohne manuelle
Zusatzanfrage. Um `21:10:20Z` sind alle vier Filter bereits wieder erfolgreich,
alle Fehlerzähler null und der Herkunftsstatus `ready`.

Die 429 folgt auf mehrere vorherige Laststufen. Ob kurzfristige Bündelung,
ein längeres Mengenfenster oder eine andere dynamische Bedingung ausschlaggebend
war, ist unbekannt. **Kein festes Vinted-Limit von 30, 35 oder 40 Anfragen/min
aus dieser einzelnen Ablehnung ableiten.** Die höchste ohne Ablehnung gemessene
No-store-Stufe liegt bei 27,59 erfolgreichen Aufrufen/min über gut drei Minuten;
das ist kein mehrstündiger Stabilitätsnachweis.

Der geplante zusätzliche passive Cache-/Service-Worker-Abgleich konnte nicht
mehr beginnen: Die 429 hatte den Versuch bereits beendet, und während der
Rückkehr war CDP kurz nicht erreichbar (`ECONNREFUSED`). Dieser Beobachter hat
keine Kataloganfrage ausgelöst. Die No-store-/Service-Worker-Grenze ist im
ausgeführten Messcode enthalten; ein ergänzender passiver Cacheflag-Nachweis
liegt für diese letzte Stufe nicht vor.

Nach **allen drei** Versuchsserien sind sämtliche ursprünglichen Umgebungswerte,
Image und Profil-/Dateieinbindungen exakt wiederhergestellt und die
Filterbedingungen unverändert. Es gab insgesamt zehn beabsichtigte
Containerwechsel einschließlich der drei Rückkehrvorgänge; in den beobachteten
Stufen keine automatischen Neustarts und keinen OOM.

Abschließende Kontrolle um `21:12:39Z`: `healthy`, Herkunft `ready`, alle vier
Filter mit aktuellen Erfolgen und Fehlerzählern null, keine Messcodeeinbindungen,
alle drei Rückkehrtimer inaktiv. Wirksam wieder 10000 ms Mindestabstand, Budget
30, 5000 ms Rundenpause und 20000 ms Anfragezeitlimit. Keine dauerhafte
Leistungsumstellung, keine Filterlöschung und keine Rücksetzung der während
des normalen Speicherns fortgeschriebenen Cursor oder Artikel.

Über alle sieben Laststufen zusammen: 443 abgeschlossene Browser-Katalogaufrufe,
441 HTTP-200-Rückgaben, ein Browser-Transportfehler ohne HTTP-Status und eine
HTTP-429-Ablehnung. Die zusätzliche lokale Sperre eines wartenden Auftrags zählt
als Filterfehler, nicht als weiterer externer Aufruf. Diese Summe vermischt
mehrere Verfahren und ist daher keine einheitliche Anbieterfehlerquote.
Perzentile sind Rangwerte mit aufgerundetem Rang im sortierten Messfeld.

## Empfehlungen aus den bisherigen Nachweisen

1. Eigene Abstände, Minutenbudget, Fälligkeitsprüfung und Rundenpause gemeinsam
   bewerten. Keine dieser alten Einstellungen ist ein Produktziel. Einzelne
   langsamere Browserantworten und zusätzliche Sitzungsschritte verbrauchen
   ebenfalls Zeit. Eine kleinere Zahl allein belegt keine bessere Abdeckung.
   **Technische Auswahl:** Den schlankeren Abruf im vorhandenen Browser weiter
   integrieren, mit regulärem Sitzungs-Warmup/-Erneuerungsweg und klarer
   Fehlererkennung. Die 250-ms-Stufe wird verworfen. Ein vorsichtiger nächster
   Betriebsvergleich sollte zunächst auf **20–25 Katalogaufrufe/min**, eine
   gleichzeitige Anfrage und etwa zwei Sekunden Mindestabstand zielen. Das ist
   eine bewusst unter der gemessenen Kurzzeitkapazität liegende Empfehlung für
   einen längeren Vergleich, **kein bereits nachgewiesenes Dauerprofil**.
   Die Höchstzahl 120 war eine freigegebene eigene Messgrenze und ist kein
   empfohlener Dauerwert. Mehr Parallelität ist nach diesen Zahlen kein
   ausreichend belegter Ersatz für gemeinsame Abrufe.
2. Identische vollständige Abrufparameter gemeinsam beschaffen, Rohdaten einmal
   verarbeiten und jedem passenden aktiven Filter zuordnen. Unterschiedliche
   Titelregeln nach dem gemeinsamen Abruf getrennt prüfen. Bestehende Datenbank-
   Deduplizierung, Aktivstatus, Revision, Cursor und stilles Ersteinlesen erhalten.
3. Weitere breite Gruppen erst nach belegter Abdeckung zulassen. Genaue Kategorie
   und Material nicht aus unbekannten Daten erfinden. Hoher Zulauf benötigt
   gezieltere Bereiche oder begrenztes Aufholen; Nachladen kostet echtes Budget.
4. Planung, Status und Merkzettel-Bewertung nach begrenzten Arbeitspaketen statt
   erst nach einer großen Runde ausführen. Bereits vorhandenen Fortschritt je
   Anfrage beibehalten; echten Browserstillstand weiterhin begrenzt beenden.
   Fehlerpausen ab tatsächlicher Ablehnung berechnen; der festgestellte
   Rundenzeitfehler darf beim Produktumbau nicht übernommen werden. Native
   Browser-Transportfehler passend kennzeichnen. Die Messalternative ersetzt
   noch keinen vollständigen Wiederanlauf- und Sitzungserneuerungsnachweis.
5. Dauerhafte Sekundenaktualität erst nach belegter Quellverfügbarkeit,
   Abdeckung, Speicherung und Anzeige zusagen. Auch ein schneller echter
   Durchsatztest ersetzt diese vollständige Zeitkette nicht.

Bei tatsächlich 27,6 getrennten Abrufen/min benötigen zwanzig unterschiedliche
Einzelabrufe allein rechnerisch ungefähr 43,5 Sekunden wiederkehrende Kapazität;
120 Teilabfragen ungefähr 4,35 Minuten. Das ist ausdrücklich eine
**Kapazitätsprojektion**, kein zusätzlich ausgeführter zwanzig-Filter-Livelauf.
Die oben dokumentierten lokalen Planerausführungen bleiben der echte lokale
Lastnachweis. Für ein Fünf-Sekunden-Ziel würden bei dieser Kapazität nur etwa
zwei unabhängige wiederkehrende Abrufe hineinpassen. Zehn bis zwanzig fachliche
Filter benötigen deshalb erheblich weniger gemeinsame echte Abrufe oder einen
belegbar leistungsfähigeren Zugang. Ein einzelner ungeprüfter globaler Abruf
bleibt wegen Verdrängung und fehlender Kategorie-/Materialdaten ungeeignet.

## Prüfungen und Nachweise

Die Messfälle verwenden die vorhandene Sniper-Vitest-Konfiguration
`test/**/*.spec.ts`; keine neue Testarchitektur und kein neues npm-Skript.
`preflight:plan` wählt die bestehenden Sniper-Prüfungen samt Image aus.
Die Prüfungen liefen mit Node **22.23.2** und unveränderten gesperrten
Abhängigkeiten. Keine Abhängigkeit hinzugefügt oder aktualisiert.

| Ausgeführt                                                                                | Tatsächliches Ergebnis                                                                                                                                     |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci --ignore-scripts --no-audit --no-fund` im Root und mit `--prefix services/sniper` | Exit 0; unveränderte Lockfiles                                                                                                                             |
| `npm run version:generate`, danach `npm run typecheck`                                    | Exit 0; anfangs fehlte nur die regulär generierte, ignorierte Versionsdatei                                                                                |
| `npm run --prefix services/sniper test`                                                   | Exit 0; **386 bestanden, 7 unter Windows übersprungen**, 40 Dateien bestanden, 1 Datei plattformbedingt ausgesetzt; neue Messdatei mit 35 Fällen enthalten |
| `npm run --prefix services/sniper typecheck` und `build`                                  | Jeweils Exit 0                                                                                                                                             |
| `npm run lint`                                                                            | Exit 0 auf dem endgültigen Testcode                                                                                                                        |
| `npm run test:audit`                                                                      | Exit 0; bestehende 557 Anwendungstestdateien registriert                                                                                                   |
| `node --test scripts/preflight.test.mjs scripts/ci-checks.test.mjs`                       | Exit 0, 9/9; bestehende Auswahl-/Ausführungsverträge                                                                                                       |
| Zusätzlicher Aufruf einschließlich `scripts/marketplace-check-selection.test.mjs`         | **Exit 1, 23/25**; zwei unveränderte Fälle brauchen Linux-/GitHub-Runnerbedingungen bzw. `/bin/bash`; nicht als bestanden gewertet                         |
| Sieben isolierte Prüfungen der Live-Parallelhilfe                                         | Exit 0, unabhängig wiederholt; relevante zunächst rote Fälle vor Live-Start korrigiert                                                                     |
| `npm run preflight:plan`                                                                  | Exit 0; gezielte Qualität und Sniper einschließlich Image, keine Angular-UI-Auswahl                                                                        |
| `npm run preflight`                                                                       | **Unvollständig, Exit 1:** lokal fehlen Actionlint und eine erreichbare Docker-Engine; keine enthaltene Prüfung pauschal als bestanden ausgegeben          |

Eigene Dateien wurden gezielt mit `npm exec --no -- prettier --write -- <Pfade>`
formatiert. Der vollständige `npm run format:check` und `git diff --check`
bestehen mit Exit 0. Keine Angular-Vorlage
oder Produktdatei geändert; deshalb kein zusätzlicher Angular-Oberflächenbau
oder fachfremder Browserlauf.

Offen bleiben Linux-Profillockfälle, Docker-/Image-Smokes, vollständige
Qualitätsverträge und echte lokale pgTAP-Prüfung. Die erreichbare
**Produktions**-Docker-Engine wurde dafür nicht als Testhost missbraucht.
Abgeschlossene Browseroperationen, eine kurze No-store-Stufe und tatsächliche
429 sind kein Nachweis eines mehrstündigen, lückenlosen oder sekundenschnellen
Gesamtablaufs. Ein längerer Vergleich gehört zum nächsten gezielten Eingriff.

Beim abschließenden `git fetch origin --prune` steht `origin/master` inzwischen
auf `46c96ec64827da999a5c3d8648542d47bfd69240`. Die hier vermessenen Sniper-Dateien
und das Suchfilterschema sind gegenüber dem Ausgangsstand unverändert.
Zwischenzeitliche fremde Arbeiten wurden nicht eingebunden oder umgeschrieben.
Der geprüfte eigene Stand bleibt ohne Commit, Push, PR oder Merge zur Einsicht
erhalten; die primäre und die Planungsarbeitskopie sind unverändert.

- [Bereinigte Daten der passiven Live-Messung](2026-10-29-vinted-search-filter-live-measurements.json)
- [Lokale Zellen und Einzelvergleiche](2026-10-29-vinted-search-filter-local-measurements.json)
- [Reale Laststufen und abschließende Rückkehrprüfung](2026-10-29-vinted-search-filter-live-load-measurements.json)
- [Quellnachweis der Messhilfe](2026-10-29-vinted-search-filter-measurement-tools.md)
- [Übernommene Recherche](2026-10-29-vinted-search-filter-research.md)
- [Übernommener Messplan](../superpowers/plans/2026-10-29-vinted-search-filter-measurement.md)
