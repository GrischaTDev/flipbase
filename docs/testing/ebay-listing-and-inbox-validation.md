# eBay-Inserate und Postfach: lokaler Prüfstand

Stand: 1. November 2026. Umsetzung und Prüfung gehören zu demselben Aufgabenstand.
Eine produktive Anbieterabnahme oder Auslieferung ist damit nicht behauptet.

## Geprüfte Abläufe

- Inseratdetails und Änderungen über feste Listing-API-Operationen. Fremde,
  teilweise gelesene oder inzwischen geänderte Inserate bleiben gesperrt.
  Varianten- und Auktionspreise werden nicht als einfacher Festpreis überschrieben.
- Erstellung eines deutschen Festpreisinserats mit Kategorie, Pflichtmerkmalen,
  Zustand, Kontorichtlinien und Bildern. Anbieterprüfung, Gebührenvergleich,
  Bestätigungsdialog und Veröffentlichung sind getrennt. Ein unklarer Ausgang
  erlaubt ausschließlich eine lesende Suche nach der festen SKU.
- Mitglieder-/Systempost, gelesene/ungelesene Gespräche, Nachrichtenverlauf und
  Pagination. Systempost erlaubt keine Antwort. Enter sendet keine Nachricht.
  Unklarer Versand bleibt nach Neuladen gesperrt. Nach bewusster Bestätigung wird
  der Verlauf erneut gelesen; die Freigabe sendet selbst nichts.
- Konto-/Workspacewechsel verwerfen fremde Daten und verspätete Antworten.
  Geänderte Rechte stoppen Schreibaktionen auch nach dem vorherigen Anbieterabruf.
  Alte Server ohne ausdrückliche Fähigkeitsangaben starten die neuen Abrufe nicht.

## Tatsächlich ausgeführte Prüfungen

Node 22.23.4 und gesperrte Abhängigkeiten aus `npm ci`; Deno 2.9.7.
Die Tabelle nennt Ergebnisse einzelner Prüfungen, keinen bestandenen Gesamt-Preflight.

| Prüfung                                                                                          | Ergebnis                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gezieltes Prettier `--write`, `npm run format:check`, `npm run lint`, `npm run typecheck`        | Erfolgreich                                                                                                                                                           |
| Alle eBay-Deno-Dateien unter `_shared` und in den eBay-Funktionsordnern, `deno test --allow-env` | 135 Fälle erfolgreich                                                                                                                                                 |
| `npm exec --no -- vitest run --maxWorkers=3`                                                     | 561 Dateien und 6.082 Fälle erfolgreich; eine alte Sidebar-Menüerwartung fehlgeschlagen                                                                               |
| Betroffene sieben Vitest-Dateien nach Korrektur der Menüerwartung                                | 75 Fälle erfolgreich; Sidebar, Dashboard, Antwortverträge, Postfach, Erstellung und bestehende Bearbeitung                                                            |
| `e2e/ebay-workspace.spec.ts`, Chromium, ein Worker                                               | Elf Fälle erfolgreich; nach der letzten Postfachkorrektur die sechs Postfachfälle erneut erfolgreich, anschließend die erweiterte Versandklärung nochmals erfolgreich |
| GraphQL-Operationen samt tatsächlich erzeugten Variablen gegen veröffentlichtes SDL              | Details, Änderung, VALIDATE, EXECUTE und SKU-Suche gültig                                                                                                             |
| `npm run build` einschließlich Angular-Vorlagen und PWA-Dateiliste                               | Erfolgreich; Budget-, CommonJS- und Hinweise auf ungenutzte Imports bleiben sichtbar                                                                                  |
| `npm run test:workflow` unter Windows                                                            | 646 erfolgreich, 44 ausgelassen, drei plattformbedingte Fehler                                                                                                        |
| Die drei fehlgeschlagenen Shell-Vertragstests unter Linux/Node 22                                | Erfolgreich im isolierten Container ohne Netzwerk und mit schreibgeschützter Projektquelle; nur Ersatzbefehle, keine echten Marketplace-Images oder Hostprüfungen     |
| `npm run test:orchestrator`                                                                      | Acht erfolgreich, drei unter Windows ausgelassen                                                                                                                      |
| `npm run test:audit`, Actionlint, Migrationsumfang und SQL-Paket                                 | Erfolgreich; 260 Migrationen vollständig paketiert                                                                                                                    |
| `npm run preflight:plan`, anschließend `npm run preflight`                                       | Umfassende Auswahl; tatsächlicher Vorabcheck mit Exitcode 1 unvollständig wegen der GitHub-exklusiven Image-/Hostprüfungen                                            |

Die Browserfälle verwenden die echte Angular-Oberfläche mit simulierten
Authentifizierungs- und Anbieterantworten. Geprüft: 1.440 Pixel hell/dunkel mit
Maus, 834 Pixel dunkel mit Touch, 390 Pixel hell mit Touch und 320 Pixel dunkel
mit Touch, jeweils AXE einschließlich Kontrast und ohne horizontalen Überlauf.
Die lokale Vorschau lief getrennt auf Port 45325, ohne Bau während der Browserfälle.
Es wurden keine echten eBay-Nachrichten oder Inserate versendet.

## Offene Nachweise und Rollout

Im ersten Lauf von PR #528 bestehen Unit- und Datenbanktests, die neuen
eBay-Browserfälle, Produktions-PWA und Marketplace-Image-/Hostprüfungen.
Der [Dashboard-Browserjob](https://github.com/GrischaTDev/flipbase/actions/runs/41327295776/job/124910048217)
scheitert an der alten Erwartung von zwei „Geplant“-Einträgen. Mit der neuen
eBay-Erstellung bleibt genau ein geplanter Marktplatz. Die Erwartung wurde
angepasst und um das tatsächliche eBay-Linkziel ergänzt. Zuerst denselben Fehler
lokal nachgestellt, danach beide vorhandenen Testabläufe in Hell/Dunkel mit
allen sieben Breiten erfolgreich geprüft. Dafür wurde ausschließlich lokal
der unveränderte Testkörper mit simulierten Kontoantworten ausgeführt; die
originale Supabase-Testfixture im Repository bleibt erhalten. Der vollständige
CI-Nachweis für die Korrektur steht weiterhin aus.

Der zweite Lauf bestätigt alle 6.084 Anwendungstests in 562 Dateien sowie die
korrigierten Dashboard- und eBay-Browserfälle. Drei allgemeine Chromium-Gruppen
bestehen mit jeweils 110 Fällen; die vierte wird ohne gemeldeten Fachfehler am
30-Minuten-Joblimit abgebrochen und zählt als unvollständig. Der vollständige
Standardbereich wird deshalb bei genügend Dateien auf mindestens sechs Gruppen
verteilt. Der neue Grenzfalltest reproduziert zunächst die zu kleine Aufteilung;
anschließend bestehen 74 Auswahl-, Runner- und Freigabeprüfungen. Die tatsächliche
Playwright-Auflistung enthält weiterhin exakt dieselben 440 eindeutigen Fälle,
jetzt mit 74/74/73/73/73/73 Fällen pro Gruppe. Dies ist ein Verteilungsnachweis,
keine lokale Ausführung der gesamten Browserregression. Die vollständige
CI-Ausführung auf dem endgültigen Stand bleibt vor dem Merge erforderlich.

Zusätzlich drei Fälle für normale Sitzungserneuerung beziehungsweise neue
Workspace-Objekte mit denselben Kennungen zuerst rot nachgestellt: ungesicherte
Eingaben in Erstellung, Bearbeitung und Postfach gingen verloren. Die Initialisierung
ist jetzt an die tatsächliche Identität und das Inseratziel gebunden. Normale
Sitzungsaktualisierungen erhalten die Eingaben; echte Nutzer-/Workspacewechsel
und Abmeldung verwerfen sie weiterhin. Alle 32 betroffenen Frontendfälle bestehen.
Ein weiterer roter Handlerfall bestätigt die nötige Bindung des Prüfabdrucks an
eBay-Kontoverbindung und Autorisierungsfassung. Eine zwischenzeitlich erneuerte
eBay-Freigabe erzwingt jetzt eine neue Bestätigung vor EXECUTE. Alle 135 eBay-
Denofälle bestehen anschließend. Dafür weder den zentralen Auth-Dienst noch das
Datenbankschema geändert.

Die lokale gemeinsame Supabase-Historie enthält die bestehende Migration
`20261031064255_sniper_feed_freshness` noch nicht. Der rein lesende Abgleich
bricht deshalb ab; keine zusätzliche Version vorhanden. Die Entwicklungsdatenbank
wurde weder zurückgesetzt noch für diese unabhängige Aufgabe verändert.
Datenbanktests, die vollständige datenbankgestützte Browsermatrix und die
Produktions-PWA-Prüfung sind hiermit nicht als bestanden ausgewiesen.

Vor dem Merge muss die ausgewählte CI vollständig erfolgreich sein, einschließlich
der ausschließlich GitHub-gehosteten Marketplace-Image-/Hostprüfungen. Für die
produktive Nutzung außerdem den öffentlichen Funktionsdienst aktualisieren und
die neuen eBay-Rechte bewusst freigeben. Ablauf und unterstützter Umfang stehen
im [Rolloutdokument](../implementation/ebay-production-rollout.md).
