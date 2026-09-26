# Vinted-Oberfläche: geprüfter Stand vom 26. September 2026

Geprüfter Quellcode: `de2bfb82eda69448ab8ae9a711588f39f8f0aca6`.
Branch: `juna/vinted-marketplace-foundation`.
GitHub-Lauf: `36257352391`, Job `108446552896`, erfolgreich abgeschlossen.

## Umsetzung

`/marketplaces/vinted/overview` öffnet den nativen Bereich mit Kontowechsler,
Übersicht, Inseraten, Nachrichten, Verkäufen, Profil und eigener Aktivitätsseite.
`/settings/marketplaces` verwendet die vorhandenen RPCs zum Anlegen, Umbenennen
und Pausieren/Fortsetzen von Kontoverbindungen.

Serverantworten werden auf Kontozuordnung und Datenform geprüft. Verspätete
Antworten nach Benutzer-, Workspace-, Konto- oder Gesprächswechsel überschreiben
nicht die aktuelle Ansicht. Fehlende Kennzahlen bleiben von gemessenen Nullen
unterscheidbar. Künstliche Konten sind ausschließlich in Tests enthalten.

## Prüfungen

- 59 gemeinsame Vertragstests bestanden.
- 32 Tests für Antwortprüfung, Navigation und Übersetzungen bestanden.
- 57 Angular-Tests für Komponenten, Kontozustand, API, Guard und Navigation bestanden.
- TypeScript-Prüfung und Angular-Produktionsbau bestanden.
- Prettier, ESLint der geänderten Dateien und Shared-UI-Prüfung bestanden.
- Beide Chromium-Abläufe bei 1440 × 1000 und 390 × 1000 bestanden.

Browserablauf: Konto wechseln, Profil und Inserate öffnen, Nachricht lesen,
Kontoeinstellungen öffnen, Verbindung anlegen, umbenennen, pausieren und fortsetzen.
Geprüft wurden auch JavaScript-Fehler, Workspace-Zuordnung der Schreibanfragen,
Seitenüberlauf und ein AXE-Check der Kontoeinstellungen.

Die erste Sichtprüfung zeigte eine abgeschnittene Kontenüberschrift auf Mobilgeräten.
Ein zusätzlicher Angular-Test schlug zuerst fehl und bestand nach der Korrektur.
Die Aktionen liegen nun unter dem Beschreibungstext; der Browsertest prüft
zusätzlich die vollständige Breite der Überschrift. Screenshots der korrigierten
Ansicht liegen im Artefakt `marketplace-browser-de2bfb82eda69448ab8ae9a711588f39f8f0aca6`.

Die Browsertests verwenden den echten Produktionsbau mit künstlicher Sitzung und
abgefangenen RPC-Antworten. Sie prüfen Bedienung und API-Verdrahtung, keinen
Vinted-Livezugriff. Die SQL-Seite wurde im vorherigen Datenbanklauf geprüft;
ein kombinierter Browserlauf gegen eine echte Datenbank wird nicht behauptet.
Die vollständige PR-Prüfkette bleibt vor einem Merge erforderlich.

## Ausführung und Bereitstellung

Die lokale Browsernavigation war durch eine Umgebungsrichtlinie blockiert und
der lokale Vollbau überschritt die Speichergrenze. Deshalb erfolgten vollständiger
Bau und Browserprüfung auf dem isolierten GitHub-Runner, ohne diese Grenzen zu ändern.
Der anfängliche Transfer-Job konnte nach erfolgreichen Prüfungen keinen Git-Baum
schreiben (HTTP 403). Die geprüften Blobs wurden über die autorisierte Verbindung
übernommen. Temporäre Transferdateien und Transfer-Workflow sind entfernt.

Keine neue Datenbankmigration in diesem UI-Schritt, kein Merge, kein Deployment
und kein Zugriff auf echte Vinted-Konten. Die laufende Flipbase-Installation
zeigt die neue Oberfläche erst nach einer gesonderten Veröffentlichung.

Die Ansichten lesen gespeicherte Marktplatzdaten. Browseranmeldung, Liveimport,
Nachrichtenversand und Push-Zustellung benötigen weiterhin die Sitzungstechnik.
Eine vorbereitete Verbindung stellt keine erfolgreiche Vinted-Anmeldung dar.

Reproduzieren: Anwendung auf `http://127.0.0.1:4200` starten und
`npx playwright test --config e2e/support/marketplace-preview.config.ts` ausführen.
