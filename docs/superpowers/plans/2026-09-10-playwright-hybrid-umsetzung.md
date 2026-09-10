# Umsetzungsplan: schlankes Playwright-PR-Gate

**Ziel:** Die Browserprüfung im Pull Request auf wenige geschäftskritische Verträge begrenzen, ohne echte Browserrisiken vollständig durch jsdom zu ersetzen.

**Entscheidung:** Playwright bleibt. Der ursprüngliche Vorschlag zur vollständigen Entfernung wird nicht umgesetzt, weil echte Layout-, Fokus-, Diagramm- und Integrationsfehler sonst unentdeckt bleiben. Das Ziel von 60–90 Sekunden für die gesamte CI ist nicht belastbar; zunächst wird die Browserlaufzeit gemessen und der derzeitige kritische Pfad der Angular-Tests nicht verschwiegen.

## Verbindliche Leitplanken

- Der PR-Lauf verwendet Chromium und genau 6–8 einzeln markierte Kernfälle.
- Im PR gibt es keine Wiederholung und nach dem ersten Fehler keine weiteren Browserfälle.
- Installiert wird nur die benötigte Chromium-Headless-Shell.
- WebKit läuft täglich und Firefox wöchentlich nur mit demselben kleinen Kern.
- Die vollständige lokale Browser-Suite bleibt vorerst als freiwillige Diagnose erhalten.
- `browser-smoke` bleibt eine fail-closed Pflichtprüfung, wenn Anwendungsdateien geändert wurden.
- Keine Demo-fähige Produktionskonfiguration und kein zusätzliches Deployment-Artefakt.
- Keine Änderungen an Geschäftslogik, Datenbank oder veröffentlichten Migrationen.

## Task 1: Kernverträge markieren und PR-Konfiguration ergänzen

- [x] 6–8 vorhandene Browserfälle nach fachlichem Risiko auswählen und mit `@pr-smoke` markieren.
- [x] Eine eigene PR-Konfiguration beziehungsweise ein eigenes Skript ergänzen.
- [x] `retries: 0` und `maxFailures: 1` für den PR-Lauf absichern.
- [x] Einen Vertragstest ergänzen, der Anzahl und Konfiguration des PR-Kerns fail-closed prüft.
- [x] Den markierten Kern lokal in Chromium ausführen und Dauer protokollieren.

## Task 2: PR- und Nightly-Workflows verschlanken

- [x] `browser-smoke` auf den markierten Kern und `playwright install --with-deps --only-shell chromium` umstellen.
- [x] Daily WebKit und Weekly Firefox auf denselben Kern begrenzen.
- [x] Required-Checks-Vertrag unverändert fail-closed halten.
- [x] Workflow-Vertragstests und Actionlint ausführen.

## Task 3: Dokumentation und Gesamtprüfung

- [x] Den ursprünglichen Evaluierungsplan um die getroffene Hybridentscheidung ergänzen.
- [x] `docs/AI-CHANGELOG.md` mit Entscheidung, Messwerten und Prüfungen aktualisieren.
- [x] Format, Lint, Typen, Workflow-Verträge, Suite-Audit, markierten Browserkern und Produktionsbau prüfen.
- [x] Unabhängiges Abschlussreview durchführen.

## Abschluss

Die Tasks wurden in den Commits `440d7e5`, `18e729e`, `82697e5`, `321d2c6`,
`5f24898`, `031e967` und `ca81b5c` umgesetzt. Der PR-Kern und die Workflow-
Verträge sind lokal geprüft; ein CI-PR wurde noch nicht erstellt.
