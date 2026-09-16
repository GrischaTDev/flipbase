# CI-Cache und Importmessung – Umsetzungsplan

> Ausführung: superpowers:executing-plans. Grundlage ist das freigegebene CI-Audit vom 16.09.2026 auf `8859bbd`.

**Ziel:** Angular-Cache in CI ermöglichen und den Effekt mit begrenztem Aufwand messen, ohne Anwendungstests zu entfernen.

**Architektur:** Ein neuer Diagnosemodus im bestehenden manuellen Workflow mit genau einem Job vergleicht zwei kalte Cache-Varianten derselben Browserfälle oder misst Paketimporte in frischen Node-Prozessen. Keine Änderungen an Testauswahl, Testisolation, Pflichtprüfungen, Versionsständen oder Deployment.

**Tech Stack:** Angular 22, Playwright aus dem vorhandenen Lockfile, Node 22, GitHub Actions.

## Arbeitspaket

- [x] Auswertung zuerst testen: nur erfolgreiche Berichte mit identischer Testidentität vergleichen; Fehler, Skip, Retry, leere Auswahl und geänderte Testmenge zurückweisen.
- [x] `scripts/ci-performance.mjs` implementieren; Browservergleich verändert ausschließlich temporär die Cache-Konfiguration und stellt `angular.json` wieder her. Paketimporte diagnostisch getrennt messen.
- [x] `angular.json`: `cli.cache.environment` auf `all` setzen. Bestehende Projekte und Buildoptionen unverändert erhalten.
- [x] `.github/workflows/test-benchmark.yml`: `workflow_dispatch` und einmalig `pull_request: opened` für den freigegebenen Branch, ein Job, zehn Minuten Obergrenze, keine Produktionsgeheimnisse und keine Auslieferung.
- [x] Gezielte Node-Tests, Syntax, Workflowstruktur und Patchintegrität lokal prüfen. Vollständige Angular-/Browserprüfung nicht durch simulierte Testergebnisse ersetzen.
- [x] Prüfung, Messgrenzen und nächste Schritte unter `docs/testing/ci-performance.md` dokumentieren.

## Verifikation

`node --test scripts/ci-performance.test.mjs`

`node --check scripts/ci-performance.mjs`

`git diff --check`

Nach Freigabe für GitHub: reguläre PR-Prüfung unverändert ausführen und vor dem Merge genau einen Vergleich über die Eröffnung des freigegebenen PR-Branches starten (Connector ohne Dispatch-Aktion). Zwei erfolgreiche identische Testinventare sind Voraussetzung für einen Geschwindigkeitsvergleich. Eine einzelne Stichprobe ist keine belastbare Einsparquote für die gesamte CI.
