# Teststrategie und CI-Beschleunigung – Design

**Stand:** 2026-08-30  
**Ausgangsstand:** Produktions-Commit `0768233`, GitHub-Actions-Lauf `33299028439`

## Ziel

Flipbase soll nach einem Merge deutlich schneller live gehen, ohne dafür wichtige Absicherungen zu verlieren. Die Tests werden nach Geschäftsrisiko und Testart geordnet, technisch schneller ausgeführt und im GitHub-Workflow parallelisiert. Tests werden nur gelöscht, wenn sie nachweislich keine Produktlogik prüfen, veraltet sind oder durch eine bessere Prüfung vollständig ersetzt wurden.

## Kurzentscheidung

1. **Keine pauschale Löschung der 1.039 Tests.** Die Assertions selbst sind nicht der Hauptgrund für die Wartezeit.
2. **Die Testumgebung wird getrennt.** Reine Logik läuft in Node; nur Tests mit Browser-APIs erhalten `jsdom`; Angular-Komponententests werden auf den offiziellen Angular-22-Test-Builder geprüft und anschließend migriert, sofern der Vergleichslauf alle Tests besteht und mindestens gleich schnell ist.
3. **Mehrere Tests derselben schweren Komponente oder desselben Dienstes werden zusammengeführt.** Die Szenarien bleiben erhalten, aber Angular und die Modulgraphen werden seltener neu geladen.
4. **GitHub-Jobs laufen parallel.** Formatierung, Lint, Typprüfung, Build, Testgruppen und auf `master` der unveränderliche Image-Build warten nicht mehr unnötig aufeinander. Deployment bleibt von allen Pflichtprüfungen abhängig.
5. **Datenbanktests und wenige echte Benutzerabläufe ergänzen die Suite.** Sie ersetzen Scheinsicherheit durch Frontend-Mocks, werden aber risikogerecht und parallel ausgeführt.
6. **Zielwerte:** Pull-Request-Rückmeldung höchstens 3 Minuten, Merge-bis-Live höchstens 5 Minuten im p95, ohne Reduktion der fachlichen Abdeckung.

## Gemessener Ist-Zustand

### Produktions-CI

| Abschnitt                  |     Dauer |
| -------------------------- | --------: |
| Verify gesamt              | 10:32 min |
| Tests                      |  8:26 min |
| Build                      |  0:56 min |
| Image bauen und übertragen |  2:29 min |
| Deployment und Healthcheck |  0:22 min |
| Merge bis live             | 13:47 min |

Vitest meldete für den Produktionslauf:

```text
Test Files  131 passed (131)
Tests       1039 passed (1039)
Duration    504.53s
transform     4.53s
setup         3.36s
import      376.65s
tests        10.32s
environment  95.66s
```

Die Vitest-Phasen sind Summen ueber parallel ausgefuehrte Dateien und Worker. Sie duerfen deshalb nicht als additive Anteile der 8:26 Minuten Wandzeit gelesen werden. Die belastbare Aussage ist enger: Die gemeldete reine Testausfuehrung ist mit 10,32 Sekunden deutlich kleiner als die kumulierten Import- und Umgebungsphasen. Der groesste Optimierungshebel liegt damit bei Modulgraphen, Worker-Isolation und Testumgebungen, nicht beim pauschalen Loeschen von Assertions.

### Technische Gegenpruefung auf dem Produktions-Commit

Der Produktions-Commit `0768233` wurde am 30.08.2026 in einem separaten, frisch installierten Worktree erneut ausgefuehrt:

- `npm ci`: 9 Sekunden.
- `npm test`: 131/131 Dateien und 1.039/1.039 Tests gruen; 40,33 Sekunden lokale Wandzeit auf Windows. Die Abweichung von frueheren lokalen Messungen bestaetigt, dass nur wiederholte kalte CI-Laeufe fuer die Runnerentscheidung verwendet werden duerfen.
- Der installierte Angular-22-Builder akzeptiert `buildTarget`, `tsConfig`, `include` und `setupFiles` wie geplant.
- Ein unveraenderter Komponententest scheitert im Angular-Builder mit einer doppelten `TestBed`-Initialisierung. Nach Entfernen der manuellen Initialisierung und Aufnahme von `src/test-setup.ts` in `tsconfig.spec.json` bestand derselbe repräsentative Test 32/32 Faelle. Diese Kompatibilitaetsbereinigung muss daher vor dem Angular-Laufzeitvergleich erfolgen.
- `supabase test db` ist derzeit rot. Der Runner entdeckt auch SQL-Dateien in `supabase/tests/fixtures/`, fuehrt das Fixture faelschlich als eigene Suite aus und meldet weitere Dateien ohne TAP-Plan. Die Datenbanktests duerfen erst nach dieser Bereinigung als Pflicht-Gate aktiviert werden.

### Lokale Diagnose am direkten Vorgänger des Merge-Commits

Der lokale Stand enthält 130 Dateien und 1.019 Tests; der Live-Merge ergänzt eine weitere Datei mit 20 Tests. Die Laufzeitstruktur ist vergleichbar.

| Variante                          | Ergebnis                 |  Wandzeit |
| --------------------------------- | ------------------------ | --------: |
| Aktuell: `jsdom`, Forks, isoliert | 1.019/1.019 grün         |   30,47 s |
| Threads, isoliert                 | 1.019/1.019 grün         |   31,66 s |
| Forks, nicht isoliert             | 1.019/1.019 grün         |   19,34 s |
| Threads, nicht isoliert           | 1.019/1.019 grün         |   24,08 s |
| `vmThreads`, isoliert             | 1.019/1.019 grün         |   26,25 s |
| 97 Node-Dateien, nicht isoliert   | 722 relevante Tests grün | ca. 9,5 s |
| 33 Browser-Dateien, `jsdom`       | 297 Tests grün           |   15,08 s |

Die Node-Gruppe bestand zusätzlich drei zufällig sortierte Läufe mit den Seeds `17`, `29` und `43`. Das ist ein guter erster Hinweis, ersetzt aber nicht die mehrfache CI-Abnahme vor dem dauerhaften Abschalten der Datei-Isolation.

### Struktur der Suite

- 131 Testdateien und 1.039 Tests auf dem Live-Stand.
- 65 Testdateien liegen unter `core/`.
- 28 Testdateien betreffen allein den Bildoptimierer.
- Nur 20 Dateien nutzen Angular `TestBed` oder `ComponentFixture`.
- 33 Dateien bildeten im gemessenen Split die Browsergruppe; davon nutzen 20 `TestBed`. Diese Zahl ist die Planungsbasis und wird in Task 2 durch eindeutige Dateikategorien und einen automatischen Audit verbindlich gemacht.
- 84 Dateien importieren `@angular/compiler`; 65 davon verwenden gar kein `TestBed`.
- 60 Dateien verwenden Mocks oder Spies.
- 22 Dateien lesen Quell- oder Template-Dateien direkt; neun davon sind reine Quelltextverträge ohne `TestBed`.
- Es gibt SQL-/pgTAP-Prüfungen unter `supabase/tests/`, sie laufen aber nicht im GitHub-Workflow.
- Es gibt aktuell keinen echten Browser-End-to-End-Test.

### Abdeckung

Der lokale V8-Coverage-Lauf ergab:

| Kennzahl   | Abdeckung |
| ---------- | --------: |
| Statements |   56,48 % |
| Branches   |   49,70 % |
| Functions  |   55,44 % |
| Lines      |   58,05 % |

Die Zahlen zeigen: Eine vierstellige Testanzahl bedeutet nicht automatisch eine hohe Risikodeckung. Insbesondere Zweige und echte Systemgrenzen sind nur teilweise abgesichert.

## Fachliche Teststrategie

### Testpyramide für Flipbase

#### 1. Viele schnelle Unit-Tests

Diese Ebene prüft reine, deterministische Logik ohne Browser und ohne Datenbank:

- Geld- und Centberechnungen
- Gewinn, ROI und Kostenverteilung
- Steuerberechnungen und DATEV-Zeilen
- Bestands- und Verkaufszustände
- Validierung und Datenabbildung
- Bildgeometrie, Zuschnitt und Dateinamen
- Fehler- und Rückgabewerte von Services

Unit-Tests müssen die echte Produktionsfunktion aufrufen. Eine im Test neu hingeschriebene Formel, die nur gegen ihr eigenes Ergebnis geprüft wird, ist kein wirksamer Test.

#### 2. Einige gezielte Integrations- und Komponententests

Diese Ebene prüft kleine Gruppen zusammen:

- Angular-Klasse plus Template für interaktive Komponenten
- Reactive Forms plus tatsächliche Bindungen
- Service plus Supabase-Client-Vertrag mit kontrolliertem Testdouble
- Datenbankfunktionen, Trigger, Constraints und RLS gegen lokales Postgres
- Router-Navigation und Rücksprungkontext

Für mehrfach verwendete, interaktive Shared Components sind Angular Component Harnesses sinnvoll. Für einmalige Seiten reichen fokussierte Komponententests.

#### 3. Wenige End-to-End-Smoke-Tests

Die Browser-Suite bleibt bewusst klein und prüft nur geschäftskritische Benutzerwege:

1. Demo-Anmeldung und Laden des Dashboards.
2. Einkauf öffnen, Artikel öffnen und zum ursprünglichen Einkauf zurückkehren.
3. Gemeinsame Inventartabelle mit Einzel- und Mengenbestand bedienen.
4. Verfügbaren Artikel verkaufen und den konsistenten Verkaufszustand sehen.
5. Dashboard-Plattformfilter bedienen und Chart-Tooltip per Maus/Tastatur erreichen.

Diese Tests laufen lokal gegen einen kontrollierten Build und kontrollierte Testdaten. Sie schreiben nicht in Produktion.

#### 4. Nachgelagerte Prüfungen

Folgende Prüfungen müssen nicht jeden Produktionswechsel blockieren:

- vollständiger Coverage-Bericht
- mehrere echte Browser
- umfangreiche Accessibility-Suite
- Mutationstests für kritische Rechenmodule
- Legacy-Migrations- und Parallelitätstests, sofern keine betroffenen Dateien geändert wurden

Sie laufen geplant oder bei passenden Pfadänderungen. Sicherheits- und Datenbankprüfungen für geänderte Datenbankdateien bleiben dagegen blockierend.

## Welche Tests bleiben, werden ersetzt oder gelöscht?

### Behalten

Ein Test bleibt, wenn mindestens eines davon zutrifft:

- Er schützt einen geschäftskritischen Pfad: Einkauf, Bestand, Verkauf, Retoure, Rechnung, Steuer oder Export.
- Er prüft Datenintegrität, RLS, Rollen- oder Workspace-Trennung.
- Er reproduziert einen früheren Produktionsfehler und prüft dessen Verhalten statt nur Quelltext.
- Er prüft einen Fehlerfall, der sonst Datenverlust, falsche Beträge oder falsche Bestände erzeugen kann.
- Er prüft eine öffentliche Shared-Component-Schnittstelle oder einen barrierefreien Benutzerablauf.

Beispiele, die ausdrücklich erhalten bleiben sollen:

- `src/app/formular-bindungen.spec.ts`, bis Angular-Templateprüfung denselben Fehler nachweislich besser abdeckt.
- Persistenztests, die erst nach bestätigter Datenbankantwort lokalen Erfolg erlauben.
- Centgenaue Kostenverteilung, Verkaufskonsistenz und DATEV-Export.
- SQL-Tests für atomare Verkäufe, Migrationen und Unveränderlichkeit von Geschäftsbelegen.

### Ersetzen

Ein Test wird zuerst durch einen besseren Test ersetzt und erst danach entfernt, wenn er:

- HTML oder TypeScript als Text durchsucht, obwohl das Benutzerverhalten mit `TestBed`, Harness oder Playwright prüfbar ist;
- private Angular-APIs wie `ɵresolveComponentResources` braucht;
- eine Komponentenklasse über `Object.create(...prototype)` prüft, obwohl der wichtige Vertrag im gerenderten Template liegt;
- DOM-Struktur oder CSS-Klassen prüft, obwohl Rollen, Beschriftungen oder sichtbares Verhalten der eigentliche Vertrag sind.

### Löschen

Ein Test darf gelöscht werden, wenn dokumentiert ist, dass er:

- keine Produktionsfunktion oder kein Produktverhalten aufruft;
- nur JavaScript-Grundrechenarten, Testdaten oder selbst definierte Konstanten bestätigt;
- dasselbe Risiko vollständig und identisch wie ein stärkerer Test doppelt;
- eine entfernte Funktion absichert;
- dauerhaft instabil ist und vor der Entfernung ein kleinerer, stabiler Ersatz existiert.

Konkreter erster Kandidat: Die ersten vier Fälle in `tax-engine.service.spec.ts` berechnen Werte ausschließlich im Test und würden auch bei einer defekten Produktionsimplementierung grün bleiben. Sie werden nicht ersatzlos gelöscht, sondern gegen Aufrufe von `TaxEngineService` beziehungsweise den zuständigen Exportdienst ersetzt.

### Nicht als Löschkriterium verwenden

- Ein Test ist alt.
- Ein Test ist gerade unbequem.
- Die Gesamtzahl wirkt hoch.
- Eine Zeile ist bereits durch Coverage markiert.
- Ein Test ist langsam, obwohl sein Geschäftsrisiko hoch ist.

## Zielarchitektur der Testausführung

### Vitest

- Reine Tests verwenden `environment: 'node'`.
- Nur Dateien mit echten Browser-APIs verwenden `jsdom`.
- Gemeinsame Node-Worker dürfen erst nach mehreren zufällig sortierten Läufen `isolate: false` verwenden.
- DOM- und Angular-Tests bleiben isoliert; `vmThreads` wird im CI-Vergleich gegen Forks gemessen.
- Tests derselben schweren Komponente werden in einer Spec-Datei mit getrennten `describe`-Blöcken gesammelt.
- Testdateien erhalten eine klare Kategorie, damit keine Datei gleichzeitig in zwei Projekten läuft.

### Angular

Der offizielle `@angular/build:unit-test`-Builder wird als bevorzugte Lösung für Angular-Komponententests eingeführt, wenn der Vergleichslauf folgende Bedingungen erfüllt:

1. Alle bisherigen Tests bestehen.
2. Externe Templates werden ohne private `ɵ`-APIs geladen.
3. Der Median aus drei kalten CI-Läufen ist nicht langsamer als die getrennte Vitest-Konfiguration.
4. Coverage und Fehlermeldungen bleiben verwendbar.

Falls eine dieser Bedingungen scheitert, bleiben die Komponententests vorerst in einem eigenen Vitest-`jsdom`-Projekt. Das ist der festgelegte Fallback, kein Grund, die übrige Optimierung anzuhalten.

Vor diesem Vergleich werden die heute pro Datei wiederholten Aufrufe von `TestBed.initTestEnvironment()` und `TestBed.resetTestEnvironment()` entfernt. Der rohe Vitest-Fallback erhaelt dafuer eine eigene zentrale Setup-Datei; der Angular-Builder initialisiert seine Testumgebung selbst. `src/test-setup.ts` wird ueber `tsconfig.spec.json` typgeprueft.

### Supabase

- `supabase test db` prüft Schema, Trigger, Funktionen, Constraints und RLS gegen die lokale Datenbank.
- Jede von `supabase test db` entdeckte SQL-Datei ist eine echte pgTAP-Suite mit Plan und Abschluss.
- Reine Fixtures und manuelle Migrationspruefungen liegen ausserhalb von `supabase/tests/`, weil der Supabase-Runner auch Unterordner rekursiv als Tests entdeckt.
- Tests verwenden Transaktionen mit `begin` und `rollback` und muessen bei wiederholter lokaler Ausfuehrung idempotent bleiben.
- RLS-Tests enthalten positive und negative Fälle für `anon`, `authenticated`, Workspace-Mitglied und fremden Workspace.
- Bei Änderungen unter `supabase/**` sind Datenbanktests Pflicht.
- Umfangreiche Migrations- und Parallelitätstests laufen zusätzlich geplant und bei betroffenen Migrationsdateien.

### Browser

- Playwright prüft ausschließlich sichtbares Benutzerverhalten.
- Selektoren verwenden bevorzugt Rollen, Beschriftungen und sichtbaren Text.
- Jeder Test besitzt isolierten Browserzustand.
- Ein erster Retry erzeugt Trace und Screenshot; erfolgreiche Läufe erzeugen keine schweren Traces.
- Chromium blockiert Pull Requests und `master`; Firefox und WebKit laufen geplant, solange daraus kein nachgewiesener kritischer Browserfehler hervorgeht.

## Zielarchitektur des GitHub-Workflows

### Pull Request und `master`

Folgende Jobs starten parallel nach Checkout und `npm ci`:

1. `quality`: Formatierung, ESLint, TypeScript und Produktionsbuild.
2. `unit-node`: reine Tests, bei Bedarf zwei Vitest-Shards.
3. `unit-dom`: DOM-Tests, bei Bedarf zwei Vitest-Shards.
4. `unit-angular`: Angular-Builder oder festgelegter Vitest-Fallback.
5. `database`: nur bei Änderungen unter `supabase/**` oder manuellem Volltest.
6. `browser-smoke`: fünf kritische Chromium-Abläufe.

Auf `master` startet zusätzlich der unveränderliche Container-Image-Build parallel zu den Prüfungen. Das Image erhält zunächst ausschließlich `sha-<commit>`. Es wird erst ausgerollt, wenn ein abschließender Gate-Job alle Pflichtjobs als erfolgreich oder zulässig übersprungen bestätigt. Ein fehlgeschlagenes Kandidatenimage wird niemals deployed und nicht als `latest` veröffentlicht.

Das Production-Deployment bleibt seriell und prüft weiterhin:

- alle Migrationen angewendet,
- Container gesund,
- öffentliche Adresse liefert `healthz = ok`,
- ausgelieferter Commit entspricht dem erwarteten SHA.

### Warum die Prüfung auf `master` zunächst bleibt

Das Repository ist privat und der aktuelle GitHub-Tarif erlaubt laut API weder Branch Protection noch Rulesets. Ein direkter Push auf `master` kann daher technisch nicht durch erforderliche Pull-Request-Checks verhindert werden. Bis GitHub Pro/Team aktiv ist oder das Repository öffentlich wird, muss `master` seine schnellen Pflichtprüfungen selbst ausführen.

Pull-Request-Workflows testen bereits den simulierten Merge-Stand. Nach aktivierter Branch Protection kann später geprüft werden, ob ein verifizierter Merge-Stand und wiederverwendbare Artefakte die zweite Vollprüfung sicher ersetzen. Diese Optimierung ist nicht Teil der ersten Umsetzung.

## Messbare Qualitäts- und Zeitziele

### Zeitbudgets

- Lokaler vollständiger Unit-/Komponentenlauf: Median höchstens 20 Sekunden auf dem aktuellen Rechner.
- Langsamster blockierender PR-Job: p95 höchstens 3 Minuten.
- Merge bis erfolgreicher Produktions-Healthcheck: p95 höchstens 5 Minuten.
- Kein einzelner Unit-Test länger als 300 ms ohne dokumentierten Grund.
- GitHub-Runner-Minuten je Produktionslauf steigen gegenüber dem aktuellen Lauf nicht um mehr als 20 Prozent.

### Qualitätsziele

- Alle bestehenden fachlich wirksamen Tests bleiben bestehen oder erhalten vor ihrer Entfernung einen nachweislich stärkeren Ersatz.
- Globaler Coverage-Boden wird zunächst auf Statements 56 %, Branches 49 %, Functions 55 % und Lines 57 % festgesetzt.
- Kritische reine Rechenmodule erreichen schrittweise mindestens 95 % Statements und 90 % Branches.
- Datenintegrität und RLS werden anhand einer Szenariomatrix bewertet, nicht anhand von TypeScript-Coverage.
- Die fünf Browser-Smoke-Tests bestehen in 20 aufeinanderfolgenden CI-Läufen ohne Flake.
- Die Node-Gruppe besteht mindestens 20 zufällig sortierte Läufe, bevor Datei-Isolation dauerhaft deaktiviert wird.

## Abnahme

Die Umstellung ist abgeschlossen, wenn:

1. fünf vollständige Pull-Request-Läufe hintereinander grün sind;
2. drei `master`-Deployments hintereinander innerhalb des Fünf-Minuten-Ziels liegen;
3. absichtlich eingebaute Fehler in Steuerberechnung, Bestandsverkauf, RLS und Einkaufsnavigation jeweils von der vorgesehenen Testebene erkannt werden;
4. ein absichtlich fehlschlagender Shard das Deployment zuverlässig blockiert;
5. ein erfolgreicher Lauf weiterhin den exakten Commit über den öffentlichen Health-/Versionsnachweis bestätigt;
6. die Testdokumentation für jede neue Prüfung Testart, Risiko und Ausführungsort eindeutig vorgibt.

## Offizielle Grundlagen

- [Angular: Testing overview](https://angular.dev/guide/testing)
- [Angular: Component testing basics](https://angular.dev/guide/testing/components-basics)
- [Angular: Migration to the supported Vitest builder](https://angular.dev/guide/testing/migrating-to-vitest)
- [Angular: Component harnesses](https://angular.dev/guide/testing/creating-component-harnesses)
- [Angular: Code coverage](https://angular.dev/guide/testing/code-coverage)
- [Vitest: Improving performance](https://vitest.dev/guide/improving-performance)
- [Vitest: Test environments](https://vitest.dev/guide/environment.html)
- [Vitest: Test projects](https://vitest.dev/guide/projects)
- [Vitest: Sharding](https://vitest.dev/guide/features)
- [GitHub Actions: Matrix jobs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations)
- [GitHub Actions: Dependency caching](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)
- [GitHub Actions: Pull-request merge refs](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [GitHub: Protected branches and plan availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)
- [Supabase: Database testing overview](https://supabase.com/docs/guides/local-development/testing/overview)
- [Supabase: Testing and linting in CI](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
- [Supabase: RLS tests](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Playwright: Test visible behavior and keep tests isolated](https://playwright.dev/docs/best-practices)
- [Google Testing Blog: Testing pyramid and small feedback loops](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html)
