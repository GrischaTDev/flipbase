# eBay-Verkaufsprüfung: integrierte Abnahme

Stand: 23. Oktober 2026. Prüfung durch Juna im eigenen Zweig
`juna/ebay-sales-review`. Produktstand `86a0e7ac`, integrierter Hauptzweig
`8281c9d1`. Dieses Protokoll beschreibt lokale Nachweise. Ein produktiver
Rollout und eine echte Handy-Pushzustellung sind damit nicht bestätigt.

## Integration vor dem freigegebenen PR

Nach der Nutzerfreigabe für PR und Merge den inzwischen aktuellen Hauptzweig
`962e4e14` mit dessen Vinted-Entwurfsübernahme integriert, Integrationsstand
`ddd89533`. Beide Protokolle und die getrennten eBay-/Vinted-Antworten der
gemeinsamen Browserfixture bleiben erhalten. Eingehende Vinted-Funktionen und
deren Migration wurden unverändert übernommen.

Zusätzliche lokale Linux-Nachweise vor dem Push: 74 Auswahl-/Registrierungsfälle,
sieben betroffene Angular-Dateien mit 174 Fällen, vollständige Typ-, Lint- und
Formatprüfung sowie Produktionsbau erfolgreich. Die 25 Fälle aus gemeinsamer
Marktplatzübersicht, Typografie und kompletter eBay-Verkaufsprüfung bestehen bei
320/390/834/1440 Pixeln einschließlich Hell/Dunkel, Kontextwechseln und AXE.
Regulärer frischer Datenbankreset aller Migrationen und Seed: 130 SQL-Dateien,
4.906 Assertions, keine Fehler. Datenbanktypen tatsächlich neu erzeugt und
inhaltlich unverändert. Der erste Lauf auf wiederhergestellten Browsertestdaten
hatte zwei globale Zählannahmen verletzt; ausschließlich die eigene Testinstanz
daraufhin frisch aufgebaut. Keine Assertion verändert. Ein abschließendes CRLF
im lokalen Shellhelfer wurde korrigiert; der danach separat ausgeführte echte
Produktionsbau besteht. Keine grüne Aussage über diese fehlgeschlagenen Versuche.

Die aktuelle umfassende CI-Auswahl enthält 232 Node-, 48 DOM- und 266
Angular-Dateien; Audit: 546 Dateien, 4.951 Definitionen, 13.556 Assertions.
Auswahlhash nach Integration:
`ed30b213d34ba7449ef6e9f3cfef992beed53fc41cc127b3421baf5c2a4f00df`.
Die folgenden umfassenden Erstnachweise bleiben für unveränderten Code erhalten;
die gezielte Integration ersetzt keine erfolgreiche Pflichtprüfung des PR.

## Geprüfter fachlicher Ablauf

- Inserate und Bestellungen mit Bildern aus gespeicherten Daten anzeigen.
  Bewusstes Aktualisieren fordert den richtigen Hintergrundabgleich an;
  Hintergrundnachlesen verwendet keine Live-Statistik. Bereits geöffnete Seiten
  werden vollständig neu gelesen und erst gemeinsam übernommen. Wachstum,
  verschobene Seitengrenzen, Löschungen und Teilfehler verlieren keine erreichbaren
  Folgezeilen; der tatsächliche nächste Seitenzeiger bleibt verwendbar.
- Historische Bestellungen zuerst abgleichen: einen vorhandenen vollständigen
  Verkauf einschließlich bereits verkaufter Artikel zuordnen oder ausdrücklich
  einen neuen Entwurf vorbereiten. Keine zweite Buchung oder Bestandsbewegung.
- Neue vollständig zugeordnete Zahlungen erzeugen reservierte Entwürfe unter
  „Zu prüfen“ und persönliche Glockenmeldungen. Bestätigte Verkaufszahl, Umsatz
  und Gewinn bleiben bis zur endgültigen Bestätigung unverändert.
- Aktuelle belegte Gebühren einschließlich 0 übernehmen. Automatische Anfangswerte
  folgen neuen Quellenbeträgen; persönlich gespeicherte Kosten bleiben erhalten.
  Aktuelle Quelle und Abweichung sind sichtbar. Unbekannte Kosten bleiben leer;
  Käuferporto und tatsächliche Versandkosten bleiben getrennt. Erneutes Öffnen und
  eine verlorene Buchungsantwort erzeugen keine zweite Buchung.
- Spätere Erstattungen und Stornos auch gebuchter oder nachträglich zugeordneter
  Verkäufe konkret als Klärbedarf mit vorhandenem Verkaufsverweis zeigen.
  Verkaufsbeleg, Beträge und Bestandsmengen bleiben unverändert.
- Private Daten bei Rechteentzug, Nutzer-/Workspacewechsel und Kontotrennung
  verwerfen. Interne Reservierungen bleiben mit Grund und bewusster Bestätigung
  klärbar, auch wenn der persönliche eBay-Zugriff fehlschlägt.
- Die falsche Erstattungssperre der Bestellung mit Endnummer 7587 ist abgesichert:
  Eine ausdrücklich leere Bestell-Erstattungsliste erlaubt das fehlende
  Positionsfeld. Echte, widersprüchliche oder insgesamt fehlende Nachweise bleiben
  gesperrt. Die tatsächliche Bestellung wurde ausschließlich lesend geprüft.

## Automatisierte Nachweise

| Bereich               | Ergebnis                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datenbank             | Regulärer chronologischer Supabase-Reset aller Migrationen und Seed; 130 SQL-Dateien, 4.901 Assertions, 0 Fehler. Alle sieben Migrationen vom 23. Oktober regulär registriert. Sechs echte Konkurrenzszenarien für Doppelbuchung, Rechteentzug und reservierten Bestand erfolgreich.                                                                                                                                                                                                                                                                                                   |
| Schema und Typen      | 32 tatsächliche Funktionskörper direkt mit den deklarativen UTF-8-Quellen abgeglichen; vollständiger Katalog einschließlich ACL, RLS, effektiven Rechten, Triggern, Spalten, Constraints und Indizes identisch. Typen tatsächlich lokal erzeugt und gegen die migrierte FullQA-Instanz verglichen. Letzte Ergänzungen ändern kein SQL und keine DB-Typen.                                                                                                                                                                                                                              |
| Anwendung             | Breiter Linux-Lauf: 231 Node-Dateien/2.692 Fälle, 48 DOM-Dateien/354 Fälle, 263 Angular-Dateien/2.749 Fälle; anschließend damalige drei korrigierte Angular-Dateien vollständig mit 64 Fällen, darunter 23 neue Regressionen. Abschlussänderungen zusätzlich anhand tatsächlicher Abhängigkeiten: 9 Node-Dateien/60 Fälle, 1 DOM-Datei/9 Fälle, 19 Angular-Dateien/269 Fälle und zusätzlicher Renderer/7 Fälle. Letzter Stand nochmals mit drei betroffenen Angular-Dateien/80 Fällen sowie Typprüfung und Produktionsbau erfolgreich. Diese überlappenden Läufe werden nicht addiert. |
| Auswahl und Qualität  | 72 Auswahl-/Registrierungsfälle einschließlich tatsächlicher Playwright-Auflistung erfolgreich; zusätzliche 52 Migrations-/Registrierungsfälle erfolgreich. Audit am finalen Produktstand: 542 Dateien, 4.924 Definitionen, 13.486 Assertions. Vollständige Format-, Lint- und Typprüfung sowie gezielte Nachprüfung aller später geänderten Dateien erfolgreich.                                                                                                                                                                                                                      |
| Edge Functions        | Die fünf einschlägigen Check-/Testbefehle des CI-Workflows unter Linux/Deno 2.9.7 erfolgreich: 219 + 30 + 25 = 274 Fälle und die tatsächlichen Funktionseinstiege geprüft. Danach keine Edge-Änderung.                                                                                                                                                                                                                                                                                                                                                                                 |
| Hintergrunddienst     | 28 Workerfälle, Typprüfung und Bau unter Linux mit unverändertem Lockfile erfolgreich; danach keine Workerquelländerung.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Workflow und Release  | 551 tatsächliche Workflowfälle abgedeckt, einschließlich echter Docker-/Nginx-/Compose-Prüfungen, PowerShell-Harness und isolierter PostgreSQL-Transaktionsprüfung. Gemischter Linux-/Windows-Nachweis; kein rein unter Linux ausgeführter Gesamtlauf behauptet. Spätere Auswahländerungen separat geprüft.                                                                                                                                                                                                                                                                            |
| Produktions-PWA       | Zwei echte Produktionsbauten mit unveränderter Sicherheitsrichtlinie: 36 Fälle erfolgreich, ein beabsichtigter Desktop-Skip mit erfolgreicher Androidvariante; Chromium, Android und WebKit. Nach Abschlussänderungen zwei neue Produktionsbauten und alle sieben betroffenen Benachrichtigungs-/Pushnavigationsfälle in Chromium und WebKit erfolgreich.                                                                                                                                                                                                                              |
| Breite Browserauswahl | Alle 231 ausgewählten Ausführungen abgedeckt: drei Standardgruppen und vollständig geänderte eBay-Datei. Der vorhandene Typografiefehler ist am unveränderten Hauptzweig reproduziert, korrigiert und im vollständigen Sechs-Routen-Fall erfolgreich nachgeprüft. Die drei erweiterten eBay-Fälle am finalen Produktstand erneut vollständig erfolgreich: 24,8/8,3/10,5 Sekunden, insgesamt 1,2 Minuten einschließlich Vorschau.                                                                                                                                                       |
| Darstellung und AXE   | Frühere acht zusätzliche Desktop-/Touchabläufe erfolgreich. Alle vier abschließenden Abläufe am finalen Produktstand ebenfalls erfolgreich: 56,8/31,3 Sekunden Desktop und 44,2/32,3 Sekunden Touch, insgesamt 3,3 Minuten. Erstattungs- und Gebührenhinweise bei 1440/834/390/320 Pixeln in Hell/Dunkel ohne AXE-Befund; keine JavaScript-Seitenfehler.                                                                                                                                                                                                                               |
| Produktionsabbild     | Tatsächliche App- und Workerabbilder für `86a0e7ac` erfolgreich gebaut. SQL-/Functionpakete aus dem fertigen Appabbild extrahiert; beide automatisch erzeugten Integritätslisten verifiziert. Nginx, SPA, Sicherheitsheader, Commitbezug und Worker-/Gateway-/Funktions-Smokes einschließlich Anmeldung, Rechteentzug und Grenzen erfolgreich.                                                                                                                                                                                                                                         |
| Unabhängiger Review   | Aufgabenreviews mit gezielten Nachreviews und frischer Gesamtbranchreview abgeschlossen. Genau ein durchgehend offener Korrekturreview beurteilt abschließend F1–F6 als behoben; keine offenen Codebefunde. Die darin noch ausstehenden Root-Browser- und Darstellungsnachweise sind inzwischen vollständig erfolgreich abgeschlossen.                                                                                                                                                                                                                                                 |

Die tatsächliche Gesamtauswahl gegen den Hauptzweig bleibt umfassend:
231 Node-, 48 DOM-, 263 Angular-Dateien, 61 Browserdateien plus die vollständig
geänderte eBay-Datei und Produktions-PWA. Auswahlhash:
`f8c0650f2c3b0c2e8f586aa334309c2eba3a983315d838d647b2e90bcff235c9`.
Die ausgeführten DOM-Pfade wurden mit dem Auswahlplan verglichen. Nach dem
breiten Lauf wurden die wirklich geänderten Bausteine und ihre vorhandenen
Einsatzstellen geprüft; unveränderte fachfremde Abläufe wurden nicht wiederholt.

## Darstellung und Prüfbedingungen

Bestellungen, Entwürfe und Prüfung wurden bei 1440/834 Pixeln auf Desktop und
390/320 Pixeln mit echtem Touch-Testkontext in Hell und Dunkel geprüft. Die
zusätzlichen Prüfungen verwenden den tatsächlichen Theme-Schalter, kontrollieren
Überlauf, Tastaturfokus, Dialogabschluss und die AXE-Tags `wcag2a`, `wcag2aa`,
`wcag21aa`. Aufnahmen liegen außerhalb des Repositorys und werden tatsächlich
visuell geprüft. Auch die abschließenden Erstattungs- und Gebührenaufnahmen wurden
in Desktop- und Mobilansicht tatsächlich angesehen.

Vorhandenes Playwright ersetzt den nicht verfügbaren Browser-Plugin mit seinem
Skill. Linux: Node 22.23.4, Playwright 1.62.1, `CI=true`, ein Browserworker,
zwei CPUs und 4 GiB RAM. Angular wurde in drei tatsächlichen CI-Gruppen geprüft.
Quellen einschließlich versteckter Konfiguration stammen aus eigenen
unveränderlichen Kopien; Versionsdatei und unveränderte Abhängigkeiten sind
vorhanden. Vorschauen laufen ohne Watch/HMR; parallele Bauten nutzen andere
Kopien. Nur lokale Testports und Herkunft der isolierten Anbieter-/Mailfixture
wurden angepasst. Die parallel ausgeführten letzten Browserprüfungen verwenden
eigene zufällige Workspaces und expliziten lokalen Workspacezustand.

Die PWA nutzt ihre tatsächliche Produktions-Sicherheitsrichtlinie und die
vorgesehene abgefangene API-Domain. Keine Sicherheitsrichtlinie, Assertion,
Pflichtauswahl, AXE-Regel, Zeitgrenze oder Budget wurde abgeschwächt.

## Gefundene und korrigierte Prüfprobleme

Der vollständige DOM-Lauf fand eine bestehende Modulcache-Abhängigkeit: Ein
Dialogtest lud die echte Bildkomprimierung vor dem späteren Mock. Das unveränderte
Minimalpaar scheiterte reproduzierbar bei 12/13 Fällen. Explizite Mock-Isolation
behebt dies; Minimalpaar und alle 48 DOM-Dateien bestehen danach ohne Produkt-,
Pool- oder Timeoutänderung. Der Altverkaufs-Browserfall setzt ebenfalls keine
ungeordnete Datenbankrückgabe mehr mit seiner Eingabereihenfolge gleich, sondern
wählt die beiden Artikel gezielt nach ihren unterschiedlichen Titeln.

Der erste breite Browserlauf stoppte an der unveränderten Uploadfunktion, deren
Testherkunft noch Port 4200 statt 4211 erlaubte. Nur die lokale Testkonfiguration
wurde berichtigt; zuerst bestand der volle betroffene Labelablauf, danach die
gesamte erste Browsergruppe. Ein 18-Routen-Sammelfall überschritt unter zusätzlicher
Diagnoseaufzeichnung seine Zeitgrenze; mit normaler CI-Aufzeichnung besteht er
unverändert einzeln in 36,1 Sekunden und in seiner Gruppe in 25,8 Sekunden. Neun
nach einem anderen Fehler noch nicht ausgeführte Fälle wurden aus der wirklichen
Playwright-Auflistung gesammelt und erfolgreich nachgeholt.

Die Abschlussprüfung fand neben Refresh, Gebührenherkunft und späterem Klärbedarf
auch den Live-Statistikabruf des neuen Timers und unzureichende Seitenmischung.
Die endgültige Lösung liest alle bereits geöffneten Seiten vollständig im Cache,
erhält die Anzeige bei Teilfehlern und übernimmt danach den echten Seitenzeiger.
Ein Status direkt auf der neuen Erstattungsliste verletzte die native Listenrolle;
der Status liegt nun auf einem getrennten Rahmen. Der registrierte bestehende
Browserfall prüft genau diesen neuen Erstattungszustand zusätzlich mit AXE.
Zwischenstände mit diesen Fehlern werden ausdrücklich nicht als grüne Endstände
gewertet.

Bekannte vorhandene Ausgaben bleiben benannt: Vite-Zukunftswarnung, erwarteter
Stack eines negativen PWA-Tests, einzelne Angular-Testhost-Diagnosen,
GoTrue-Testinstanzen sowie Bauwarnungen zu Purchases, Vinted, pako und dem
unveränderten 900-kB-Warnbudget. Die weiteren eBay-Abläufe prüfen zusätzlich auf
JavaScript-Seitenfehler. Absichtlich ausgelöste abgelaufene Prüfungen, verlorene
Antworten und Kontotrennungen verursachen erwartete Netzwerkfehler; eine
synthetische fehlende Bildadresse prüft den Platzhalter. Keine vollständig
fehlerleere Browserkonsole oder echte Anbieterzahlung wird behauptet.

## Getroffene Entscheidungen

- Die ausdrückliche Gesamtfreigabe umfasst den technischen Umsetzungsplan. Die
  Umsetzung erfolgt in getrennten Aufgaben mit unabhängigen Reviews. Eine falsche
  Auslegung würde Nacharbeit erfordern; die identische Freigabe wurde nicht erneut
  verlangt.
- Wegen zweier Typfehler des unveränderten Testbestands mit globalem Deno 2.7.5
  wird lokal die isolierte, offiziell verifizierte stabile Version 2.9.8 verwendet.
  Die globale Installation bleibt erhalten. Ein Laufzeitunterschied könnte sonst
  unentdeckt bleiben; zusätzlich bestehen die einschlägigen Befehle unter Linux
  mit der tatsächlichen CI-Version 2.9.7.
- Fixtures, Emulation und Paketprüfungen gelten innerhalb ihrer dokumentierten
  Grenzen. Echte Zahlungen, Handy-Push, native Geräte und Produktion werden erst
  dort bestätigt. Zusätzliche Finances-Rechte und volle Gebührenaufschlüsselung
  bleiben gemäß freigegebenem Entwurf spätere Ergänzungen. Abweichende reale
  Anbieterantworten können weitere Korrekturen erfordern.
- Alte Kosten ohne belegte Herkunft bleiben erhalten; aktuelle Gebühr und
  Abweichung werden daneben gezeigt. Das schützt mögliche persönliche Eingaben;
  manche alten automatischen Werte benötigen dadurch weiterhin manuelle Prüfung.
- Der bestehende Diagramm-Schriftfehler wird durch Vererbung vom Umfeld behoben.
  Das hält den Adminvertrag ein. Ein anderes Umfeld könnte eine unerwünschte
  Schrift vorgeben; Diagrammfälle und der volle Typografiefall prüfen die
  tatsächlichen Einsatzstellen.

## Freigabegrenze

Umsetzung, ausgewählte lokale Prüfungen und unabhängige Reviews sind abgeschlossen.
Die aktuelle Viererprüfung der zusätzlichen Darstellung besteht vollständig.
Keine Produktionsdaten verändert und kein Push, PR oder Deployment ausgeführt. Der
spätere gemeinsame Rollout folgt der
[Betriebsanleitung](../implementation/ebay-sales-review-rollout.md).
