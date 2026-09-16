# Begrenzte CI-Leistungsmessung

## Umfang der ersten Änderung

In `angular.json` ist `cli.cache.environment` auf `all` gesetzt. Dadurch darf
Angular seinen Diskcache auch unter `CI=true` verwenden. Das ermöglicht das
bestehende Prebundling des Entwicklungsservers. Es wird noch kein zusätzlicher
persistenter GitHub-Buildcache angelegt.

Die Anwendungstests, ihr Auswahlkennzeichen `@pr-smoke`, die Vitest-Isolation,
Pflichtprüfungen, Deployment und Paketversionen sind unverändert. Die direkte
Vitest-Ausführung wird durch den Angular-CLI-Cache nicht beschleunigt; dafür dient
zunächst der getrennte Importvergleich.

## Manuellen Vergleich starten

Unter GitHub Actions den bestehenden Workflow **Test runner benchmark** auf dem
Optimierungsbranch auswählen. Regulär wird er nicht durch Push oder Zeitplan
gestartet. Die Diagnosemodi benötigen genau einen Job mit zehn Minuten Obergrenze.

Einmalige Ausnahme für die im Chat freigegebene Erstprüfung: Die Eröffnung eines
PRs aus `perf/ci-cache-measurement-20260916` im selben Repository startet den
Cache-Vergleich. `synchronize` und `reopened` sind ausgeschlossen. Die Ausnahme
ersetzt ausschließlich den in der aktuellen Connector-Schnittstelle fehlenden
manuellen Workflow-Start. Alle anderen Branches bleiben auf manuelle Auswahl
beschränkt; nach dem Merge wird der freigegebene Branch entfernt.

### `browser-cache` (Standard)

Führt die vorhandenen, für den PR markierten Tests aus
`e2e/product-editor-storefront.spec.ts` zweimal aus. Auf dem Ausgangsstand sind
das zwei Fälle: Artikel/Galerie/Zuschnitt und Shop/Metadaten. Diese Auswahl ist
nur eine diagnostische Stichprobe, keine neue Definition des PR-Pflichtumfangs.

Beide Varianten verwenden denselben installierten Paketstand und denselben
Runner. Jede erhält einen eigenen leeren Angular-Cache und einen frisch
angelegten Berichtspfad. Die Baseline benutzt `environment=local` unter `CI=true`,
der Kandidat `environment=all`. `ng cache info` protokolliert die Konfiguration.

Die bestehende Playwright-Konfiguration bleibt unverändert. Ein Worker, keine
Wiederholungen, drei Minuten Playwright-Gesamtlimit und ein zusätzlicher
Prozess-Timeout begrenzen den Versuch. `angular.json` wird nach regulärem Ende
und abgefangenen Fehlern bytegenau wiederhergestellt. Bei hartem Jobabbruch ist
der isolierte Actions-Checkout zu verwerfen, nicht als Arbeitskopie zu verwenden.

Erst wenn beide Prozesse erfolgreich waren und ihre Berichte dieselben Testnamen,
Dateien und Browser ohne ausgelassene oder wiederholte Fälle enthalten, entsteht
ein Vergleich. Fehler oder schnell abgebrochene Läufe gelten nie als Einsparung.

`baseline-first` und `candidate-first` ermöglichen Vergleichsläufe in umgekehrter
Reihenfolge. Ein einzelnes Paar bleibt eine Stichprobe: Betriebssystem-Caches,
Runnerlast und Startreihenfolge können die Messung beeinflussen. Nicht direkt auf
den gesamten Browserjob, andere Tests oder GitHub-Abrechnungsminuten hochrechnen.

### `angular-imports`

Misst jeweils drei frische Node-Prozesse für den Angular-Grundaufbau sowie die
zusätzlichen Imports von `@lucide/angular` und `@supabase/supabase-js`. Ein Prozess
hat höchstens 30 Sekunden. Der Grundaufbau und der zusätzliche Paketimport werden
getrennt ausgewiesen; keine Komponenten werden gemockt oder Tests deaktiviert.

Das ist eine native Node-Importdiagnose, keine Vitest-/Angular-Builder-Messung.
Sie identifiziert Kandidaten für späteres Profiling, beweist aber nicht deren
Anteil an der vollständigen Vitest-Laufzeit. Diese Erkenntnis muss vor Änderungen
am Optimizer oder der Testisolation in der tatsächlichen Suite bestätigt werden.

### `angular-runners`

Behält den bestehenden Vollvergleich von Angular-Builder und Fallback mit jeweils
drei separaten Jobs bei. Nur bewusst auswählen: sechs Jobs mit jeweils 15 Minuten
Obergrenze sind wesentlich teurer als die beiden neuen Diagnosemodi. Der
Standard ist deshalb nicht mehr dieser Vollvergleich.

## Ergebnisse und Freigabe

Das Artefakt `ci-performance-<Run-ID>` enthält Umgebungsdaten, Lockfile-Prüfsumme,
Prozessprotokolle und bei erfolgreichem Vergleich `summary.json`. Aufbewahrung:
drei Tage. Die Zusammenfassung erscheint zusätzlich in der Jobübersicht.

Vor dem Merge bleiben die regulären PR-Pflichtprüfungen erforderlich. Die
Cache-Änderung außerdem mit mindestens einem tatsächlichen Cache-Vergleich
überprüfen. Bei auffälligen Ergebnissen gezielt wiederholen, nicht gleichzeitig
die Testauswahl, Isolation oder Paketversion ändern. Kein automatischer Merge
durch diesen Diagnoseworkflow; ein erfolgreicher Benchmark ersetzt keine CI.

## Lokaler Prüfstand dieses Pakets

Sieben Node-Tests des Messwerkzeugs wurden zuerst rot, danach grün ausgeführt.
Sie sichern Berichtsgleichheit, Fehlerbehandlung und die Wiederherstellung der
Konfiguration ab. Zusätzlich wurden JavaScript-Syntax, YAML-Struktur und die
Begrenzung der Konfigurationsänderung geprüft.

Kein Geschwindigkeitsgewinn ist bisher gemessen. npm-Registry und privater Klon
waren in dieser Arbeitsumgebung nicht über das Netzwerk erreichbar. Ein echter
Angular-Bau, Playwright-Lauf, Prettier, ESLint und actionlint wurden hier nicht
ausgeführt. Die lokalen Tests des Messwerkzeugs ersetzen diese Prüfungen nicht.

## Primärquellen

- Angular-Cache: https://angular.dev/cli/cache
- Prebundling: https://angular.dev/cli/serve
- Playwright-JSON-Berichte: https://playwright.dev/docs/test-reporters#json-reporter
- Vitest-4-Profiling: https://v4.vitest.dev/guide/profiling-test-performance

Quellenabgleich: 16. September 2026. Keine Aktualisierung der Projektabhängigkeiten.
