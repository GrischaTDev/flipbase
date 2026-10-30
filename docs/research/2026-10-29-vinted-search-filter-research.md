# Zentrale Vinted-Suchfilter: Geschwindigkeit, Bedienung und zuverlässiger Betrieb

Stand: 29.10.2026. Analyse von Juna auf Basis des frisch abgerufenen
`origin/master`, Ausgangsstand `8f9a81ac`. Keine Produktänderung, keine Änderung
an der Produktion und kein Lastversuch gegen Vinted.

## Auftrag und technische Entscheidung

Zehn bis zwanzig zentrale Suchfilter sollen intuitiv angelegt, bearbeitet,
aktiviert, pausiert und gelöscht werden können. Die Verwaltung soll den bereits
überarbeiteten Flipbase-Oberflächen entsprechen. Neue passende Inserate sollen
innerhalb weniger Sekunden erscheinen; minutenlange vollständige Filterrunden
erfüllen den Nutzerwunsch nicht. Der Nutzer überträgt die technische Recherche
und Auswahl des Umsetzungswegs an Juna.

**Empfehlung:** Suchfilter und tatsächliche Abrufaufträge voneinander trennen.
Ein gemeinsamer Planer fasst nur nachweislich kompatible Suchen zusammen.
Gefundene Artikel werden einmal gespeichert und anschließend allen passenden
aktiven Filtern zugeordnet. Häufige Bereiche werden bei drohenden Lücken gezielt
aufgeteilt. Die bestehende Bot-Sitzung und ihre Zugriffspausen bleiben Grundlage;
eine neue Anbieterintegration wird anhand der untersuchten öffentlichen Angaben
nicht ausgewählt.

**Ergänzende Nutzerentscheidung:** Der vorhandene Abruf ist eine Ausgangsbasis,
keine unveränderbare Vorgabe. Belegt bessere Abrufmöglichkeiten dürfen nach dem
Vergleich übernommen werden. Die bestätigte Reihenfolge ist: zunächst die
tatsächliche Verzögerung messen, dann den Abruf gezielt verbessern. Filteranlage
und Admin-Ansicht werden unabhängig davon vorbereitet. Die technische Auswahl
wird nicht erneut an den Nutzer zurückgegeben.

Das ist eine Architekturentscheidung, kein Nachweis, dass der vorhandene
Vinted-Zugang das Sekundenziel erreicht. Die aktuelle Konfiguration allein kann
dieses Ziel für zwanzig unterschiedliche Abrufe nicht erfüllen. Dafür braucht es
einen belegbar ausreichend aktuellen und leistungsfähigen Datenzugang. Ein
kleinerer Zahlenwert in der Oberfläche oder zusätzliche Discord-Absender schaffen
diesen Nachweis nicht.

## Was im Projekt tatsächlich vorhanden ist

| Bereich                 | Befund im aktuellen Quellstand                                                                                       | Konsequenz                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Filteranlage            | Kategorie, bis zu zehn Marken, bis zu zehn Titelbegriffe, alle/einer der Begriffe                                    | Die Grundfunktionen sind vorhanden; Bedienung und Suchbedeutung verbessern                               |
| Worterkennung           | Unicode-Normalisierung und Wortgrenzen                                                                               | Puffer erkennt nicht automatisch Pufferjacke                                                             |
| Suchaufteilung          | Marken und alternative Begriffe ergeben kombinierte Teilabfragen                                                     | Die Anzahl gespeicherter Filter beschreibt die Abruflast nur unvollständig                               |
| Abrufweg                | Gemeinsamer Browserzugang, gemeinsame zeitliche Begrenzung                                                           | Unterschiedliche Aktivierungszeiten erzeugen keine zusätzliche Abrufkapazität                            |
| Standardwerte           | Zehn Sekunden Mindestabstand, zwanzig Sekunden Anfragezeitlimit, Minutenbudget 30                                    | Betriebswerte von Flipbase, keine zugesagten Grenzen von Vinted; aktuelle Produktionswerte nicht geprüft |
| Ergebnismenge           | Erste Seite, angeforderte Seitengröße 96                                                                             | Bei hohem Zulauf können zwischen zwei Abrufen Treffer verschwinden                                       |
| Artikeldaten            | Titel, Markenname, Preis, Größe und Zustand; keine genaue Kategorie oder Materialkennung im verwendeten Parser       | Eine globale breite Suche lässt sich derzeit nicht zuverlässig in alle engen Fachfilter zurücksortieren  |
| Trefferansicht          | Nach Abschluss des vorherigen Abrufs erneut nach ungefähr zwei Sekunden; bei Fehlern zehn Sekunden                   | Die Oberfläche ist bereits relativ schnell; der erste Fund ist der größere Engpass                       |
| Verwaltung              | Statusaktualisierung ungefähr alle zehn Sekunden                                                                     | Aktiv bedeutet nicht automatisch, dass gerade erfolgreich gesucht wird                                   |
| Fortschrittsüberwachung | Fortschritt nach dem vollständigen Sammeldurchlauf; Frist mindestens fünf Minuten                                    | Lange funktionierende Runden müssen von einem echten Stillstand unterschieden werden                     |
| Speicherung             | Prüfung von Aktivzustand, Filterrevision und Abrufposition bei Übernahme; Deduplizierung über externe Artikelkennung | Diese Absicherungen müssen beim Bündeln erhalten bleiben                                                 |

Quellen im Projekt: `services/sniper/src/domain/search-filter-request.ts`,
`services/sniper/src/domain/title-keywords.ts`, `services/sniper/src/config.ts`,
`services/sniper/src/runtime/scheduler.ts`, `services/sniper/src/index.ts`,
`services/sniper/src/health.ts`, `services/sniper/src/vinted/catalog-page.ts`,
`services/sniper/src/vinted/collector.ts`,
`src/app/features/deal-monitor/deal-monitor.component.ts`,
`src/app/features/platform-admin/services/sniper-admin-state.ts` und
`supabase/schemas/108_sniper_search_filters.sql`.

## Öffentliche Quellen und ihre Aussagekraft

Die [offizielle Vinted-Pro-Dokumentation](https://pro-docs.svc.vinted.com/)
beschränkt den Zugang auf freigeschaltete Pro-Unternehmen. Die beschriebene
Artikelliste liefert über die Integration angelegte Inserate; Webhooks betreffen
deren Verwaltung und Bestellungen. Ein allgemeiner Live-Katalog neuer fremder
Inserate ist dort nicht dokumentiert. Diese API löst die Suchaufgabe deshalb
nicht.

Die [öffentliche DREANZ-Produktseite](https://whop.com/dreanzvintage/dreanzvintage/)
bestätigt das Snipe-Bot-Angebot. Sie enthält keine überprüfbare Beschreibung des
Sammelverfahrens oder einer gemessenen Ende-zu-Ende-Verzögerung. Die im Discord
beobachteten mehreren Absender beweisen weder mehrere unabhängige Sammler noch
einen bestimmten Abrufweg. Häufige Nachrichten und das Alter eines einzelnen
Inserats beim Fund sind verschiedene Messgrößen. DREANZ und Vintz werden nicht
ohne Beleg demselben technischen Dienst zugeordnet.

Die frühere [DREANZ-Untersuchung](../audit/2026-10-01-vinted-sniper-provider-comparison.md)
und der [damalige Browservergleich](../audit/2026-10-01-vinted-sniper-browser-comparison.md)
wurden nochmals gelesen. Sie enthalten keine gemessene Konkurrenzlatenz. Die
[eigenen Messungen vom 30.08.2026](../superpowers/specs/2026-08-30-vinted-deal-monitor-design.md)
zeigen dagegen starken Austausch der ersten Ergebnisseite bei einer breiten
Kategorie: nach zwanzig Sekunden kein gemeinsamer Artikel unter 96 Treffern;
nach einer Sekunde bereits 16 unterschiedliche Artikel. Das sind historische
eigene Stichproben, keine heutigen Marktwerte oder vollständigen
Abdeckungsnachweise. Sie stützen die Entscheidung gegen einen ungeprüften
einzigen Sammelabruf für alle Kategorien.

Ein untersuchtes
[Drittanbieter-Angebot auf Apify](https://apify.com/b2b_leads/vinted-real-time-data-scraper/api/openapi)
beschreibt Suchabrufe, strukturierte Ergebnisse und eine zusätzliche
Benachrichtigung je verarbeitetem Datensatz. Das belegt ein Integrationsformat,
aber weder eine garantierte Datenaktualität noch die für Flipbase erforderliche
Abdeckung und Dauerverfügbarkeit. Kein Lauf gestartet, kein Konto angelegt und
kein kostenpflichtiger Anbieter ausgewählt.

Die [Vinted-Beschreibung der Suchergebnisse](https://www.vinted.com/help/392/409-how-to-personalize-vinted-feed)
bezieht unter anderem Suchtext und Artikelbeschreibung in die Relevanz ein.
Flipbase prüft aktuell ausschließlich den Titel. Diese beiden Suchbedeutungen
dürfen in der neuen Maske nicht gleichgesetzt werden.

Für die interne Weitergabe unterstützt Supabase
[Broadcast](https://supabase.com/docs/guides/realtime/broadcast) mit
[Zugriffskontrolle für private Kanäle](https://supabase.com/docs/guides/realtime/authorization).
Die [aktuelle Änderung am Realtime-Schema](https://supabase.com/changelog/realtime-schema-locked-down-against-modification)
verbietet eigene Objekte in diesem Namensraum; eigene Fachobjekte bleiben in
`public`, erlaubte Richtlinien für Kanalzugriffe gesondert. Es werden keine
Supabase-Änderungen ausgeführt.

## Der empfohlene Abrufaufbau

### Suchwunsch und Datenbeschaffung getrennt halten

Ein Suchfilter enthält die fachlichen Bedingungen und seinen Aktivzustand. Der
Abrufplan enthält die tatsächlich notwendigen Anfragen, ihre nächste Fälligkeit
und die zugehörigen Filterrevisionen. Ein neuer Filter muss nicht automatisch
einen zusätzlichen dauerhaften Browserabruf verursachen.

Sicher teilbar sind zunächst identische tatsächliche Anfragen. Weitere
Zusammenfassungen benötigen einen Beleg, dass die gemeinsame Ergebnismenge alle
beteiligten Filter abdeckt und die übrigen Bedingungen zuverlässig geprüft
werden können. Eine Mantelsuche und eine Pullover-Suche teilen nicht allein
deshalb einen Abruf, weil beide dieselbe Marke verwenden.

Für mehrere Varianten eines Titelbegriffs kann ein gemeinsamer Kategorie- und
Markenabruf sinnvoll sein. Er wird jedoch nur dann anstelle engerer Suchen
verwendet, wenn sein Zulauf die abrufbare Ergebnismenge nicht überholt. Einzelne
Wortvarianten nicht ungeprüft zu zusätzlichen unabhängigen Abrufschleifen machen.

### Lücken und langsame Suchen sichtbar behandeln

Neue Artikel je Abruf, bekannte Überlappungen zwischen aufeinanderfolgenden
Ergebnisseiten und Rückstau messen. Fehlende Überlappung ist ein Warnsignal, kein
Beweis vollständiger Verluste. Eine volle Seite allein beweist ebenfalls keine
Lücke. Bei Bedarf Seiten begrenzt nachladen oder einen breiten Abruf anhand
verlässlicher Kategorien/Marken aufteilen. Auch Nachladen verbraucht das gemeinsame
Budget. Bei fehlendem Aufholen die unvollständige Abdeckung sichtbar melden.

Die Planung muss Fälligkeiten nach jedem begrenzten Arbeitsschritt erneut
berücksichtigen. Eine lange Liste darf neu aktivierte oder dringend fällige
Suchen nicht unbemerkt verdrängen. Anbieterwartezeiten bleiben verbindlich.

### Funde, Filter und Anzeige voneinander entkoppeln

Neue Angebote einmal übernehmen; Zuordnungen zu mehreren Filtern separat
speichern. Bei Eingang einer Antwort die Aktivzustände und Revisionen aller
betroffenen Filter erneut prüfen. Pausierte, gelöschte oder inzwischen geänderte
Filter dürfen keine neue Zuordnung aus einem alten Abruf erhalten.

Bestehende Funde und Favoriten bleiben erhalten. Erstbestand und laufender Zulauf
bleiben unterscheidbar. Ein neu hinzugefügter Filter darf nicht den gesamten
vorhandenen Bestand als frisch veröffentlichte Angebote ausgeben.

Nach erfolgreicher Speicherung eine kleine private Broadcast-Meldung an
berechtigte Feed-Leser schicken. Die Oberfläche lädt neue Daten über ihren
bestehenden berechtigten Lesepfad nach; keine globalen Artikelpakete an alle
angemeldeten Nutzer senden. Ereignisse kurz bündeln, damit hundert neue Artikel
nicht hundert gleichzeitige vollständige Nachladevorgänge auslösen. Nach
Verbindungsunterbrechung und gelegentlich als Rückfallebene abgleichen. Die
bisherige Pause beim Betrachten älterer Funde und der Hinweis auf neue Treffer
bleiben erhalten.

### Browser und Verarbeitung begrenzen

Kein eigener dauerhaft geöffneter Browser je Suchfilter. Arbeitspakete,
Warteschlange, gespeicherte Rohantworten und Speicherverbrauch begrenzen.
Detaildaten nur für passende Treffer nachladen, sofern sie wirklich gebraucht
werden; bekannte Daten zwischenspeichern. Fehlende Materialangaben bleiben
unbekannt und werden nicht aus dem Titel als sichere Eigenschaft erfunden.

Fortschritt nach einzelnen abgeschlossenen Arbeitsschritten melden. Ein
unabhängiger Statusabruf muss während langer Suchen antworten. Die bisherigen
begrenzten Aufräum- und Wiederanlaufwege erhalten. Bereits belegte
Anbieterablehnungen und Renderer-Speicherprobleme nicht durch dieselbe allgemeine
Fehlermeldung verdecken.

## Die Verwaltungsoberfläche

Die Anlage führt durch Warenbereich, Marken/Eigenschaften, Titelregeln und
abschließende Prüfung. Der vollständige echte Kategoriepfad bleibt sichtbar;
mehrere ausgewählte Bereiche werden innerhalb eines Filters als Alternativen
erklärt. Unterschiedliche Bedingungsarten gelten gemeinsam. Die Verbindung von
Wörtern wird in normalem Deutsch beschrieben.

Wortvarianten werden als bearbeitbare Gruppe angeboten. Puffer, Pufferjacke und
Puffer Jacke können zusammengehören; Pufferweste wird nicht stillschweigend
eingeschlossen. Ausschlussbegriffe sind gesondert sichtbar. Bestehende Filter
behalten ihre bisherige exakte Suchbedeutung bis zu einer ausdrücklichen Änderung.

Preis und gewünschte Eigenschaften gehören in die fachlichen Bedingungen.
Materialfilter werden nur angeboten, soweit die aktuelle Quelle sie trägt;
Titelbegriffe bleiben ausdrücklich Titelbegriffe. Vorschauen nennen Herkunft und
Aktualität und versprechen keine vollständige Marktübersicht.

Die Tabelle zeigt Name, kompakte Bedingungen, Aktiv/Pausiert, tatsächlichen
Abrufstand und Funde. Gewünschtes Aktualisierungstempo und gemessene vollständige
Abdeckung sind verschiedene Angaben. Suche und Statusfilter sowie mehrere
ausgewählte Filter gemeinsam pausieren/aktivieren erleichtern die Verwaltung.
Die genaue Neuanordnung folgt dem ausdrücklichen Auftrag für diesen Bereich;
bestehende Flipbase-Bausteine und die gelbe Markenfarbe bleiben Grundlage.

## Leistungsnachweis vor einem Geschwindigkeitsversprechen

Mit zehn Sekunden Mindestabstand sind langfristig höchstens sechs Anfrageanfänge
pro Minute möglich. Zwanzig unterschiedliche Einzelanfragen benötigen für eine
wiederkehrende Runde rechnerisch mindestens etwa 200 Sekunden, ohne zusätzliche
Ladezeit, Kategorien oder Wiederholungen. Zeitversetztes Aktivieren verändert
diese Kapazität nicht. Ein einzelner Filter mit fünf Marken und vier alternativen
Begriffen kann bereits zwanzig Teilabfragen erzeugen.

Das Sekundenziel wird daher als Zeitkette gemessen: erste belegte Verfügbarkeit
in der Quelle, eigener Fund, gespeicherte Zuordnung und Anzeige. Einen
Fotozeitpunkt oder die erste eigene Speicherung nicht als Veröffentlichungszeit
ausgeben. Fehlt ein zuverlässiger Ausgangszeitpunkt, nur die nachweisbare
Teilzeit nennen. Eine Stichprobe beim Vergleichsdienst wäre ebenfalls kein
Nachweis seiner gesamten Abdeckung.

Für die Umsetzung ist ein begrenzter Messlauf vorgesehen: ein gemeinsamer
Suchbereich sowie fünf, zehn und zwanzig gemischte Filter; wenig und viel Zulauf;
laufendes Aktivieren/Bearbeiten/Pausieren; verzögerte Antworten; volle Seiten;
Browserausfall und Wiederanlauf. Lokale gespeicherte Antworten und künstliche
Fehler prüfen Planung und Robustheit. Ein gesonderter mehrstündiger Live-Nachweis
prüft erst anschließend Datenalter, Ablehnungsquote, Speicherentwicklung und
Abdeckung unter den tatsächlichen Betriebsbedingungen. Ein Simulationsergebnis
ersetzt diesen Nachweis nicht.

Die Reihenfolge ist: Datenzugang und Messbarkeit sichern, gemeinsame Planung und
Zuordnung umsetzen, neue Verwaltung anbinden, schnelle Anzeige ergänzen und die
Kombination unter Last nachweisen. Eine technische Skizze oder die Auswahl eines
Anbieters wird nicht an den Nutzer zurückdelegiert.

## Tatsächlich geprüft und noch offen

Geprüft wurden aktueller Quellstand, bestehende Fehlerberichte, Filter- und
Speicherlogik, Browsergrenzen, Anzeigeaktualisierung sowie die oben verlinkten
öffentlichen Primärquellen. Der allgemeine Vinted-Katalog war über das verwendete
Web-Recherchewerkzeug nicht zugänglich. Keine Aussage über seine aktuelle
Erreichbarkeit aus der Flipbase-Produktion daraus abgeleitet. Der öffentliche
Abruf von Vintz scheiterte ebenfalls; interne Anbieterarchitektur bleibt unbekannt.

Keine Abhängigkeiten installiert und keine Anwendungs-, Datenbank- oder
Browsertests ausgeführt: Die Änderungen dieser Untersuchung sind ausschließlich
Dokumentation. Keine aktuellen Produktionskennzahlen oder Live-Latenzen erhoben.
Der Umsetzungsweg ist ausgewählt; eine dauerhaft wenige Sekunden schnelle
Datenversorgung ist mit dieser Untersuchung noch nicht nachgewiesen.
