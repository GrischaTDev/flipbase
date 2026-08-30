# Task 9 — Coverage-Böden und geplante Vollprüfungen

## Ergebnis

Die globalen Coverage-Böden sind fail-closed auf Statements 56 %, Branches
49 %, Functions 55 % und Lines 57 % festgeschrieben. Profit Engine, Tax Engine
und Inventar-Verkaufbarkeit haben eigene Böden von 95 % Statements und 90 %
Branches. Ein reproduzierbarer 20er-Node-Stressrunner und ein unabhängiger
Nightly-Workflow für Coverage, Reihenfolgestress, lokalen Supabase-Stack und
drei Browser sind umgesetzt. Der normale PR-Browserlauf bleibt Chromium-only.

Es gab keinen Push, Pull Request, externen Workflow-Lauf oder Deployment. Die
lokale Datenbankausführung blieb wegen des nicht erreichbaren Docker-Daemons
aus; es wurden keine Docker-Daten verändert oder gelöscht.

## Offizielle Grundlage

- Vitest 4: globale und dateibezogene Coverage-Schwellen sowie
  maschinenlesbare Reporter: <https://vitest.dev/config/coverage.html>
- Vitest: reproduzierbare Shuffle-Seeds:
  <https://vitest.dev/config/sequence.html>
- Playwright: Projekte und passende Browser-Binaries:
  <https://playwright.dev/docs/test-projects> und
  <https://playwright.dev/docs/browsers>
- GitHub Actions: Schedule-Zeitzone, Matrix und unabhängige Jobs:
  <https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax>
- `actions/upload-artifact` bleibt vollständig auf
  `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` gepinnt.
- Prettiers öffentlicher YAML-Parser delegiert an `yaml-unist-parser`:
  <https://github.com/prettier/prettier/blob/main/src/language-yaml/parser-yaml.js>.
  Dessen öffentliche AST-Typen unterscheiden `plain`, `quoteSingle` und
  `quoteDouble` und liefern für Literale einen Stringwert:
  <https://github.com/prettier/yaml-unist-parser/blob/main/src/types.ts>.

## Coverage RED/GREEN

Ausgangsmessung am Commit `592e817` mit Vitest 4.1.11:

| Bereich | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| Global | 56,28 % (6.410/11.389) | 49,42 % (3.680/7.446) | 55,50 % (1.209/2.178) | 57,79 % (5.885/10.183) |
| Profit Engine | 89,88 % | 76,47 % | 100 % | 94,36 % |
| Tax Engine | 78,51 % | 68,04 % | 69,69 % | 85,71 % |
| Inventory Sellability | nicht gemessen | nicht gemessen | nicht gemessen | nicht gemessen |

RED: Temporäre globale Schwellen von exakt 57,28/50,42/56,50/58,79
ließen weiterhin alle 1.041 Tests grün laufen, aber `test:coverage` mit Exitcode
1 und vier eindeutigen Schwellenfehlern enden.

GREEN: Die finalen Böden sind exakt 56/49/55/57. Der erste finale Lauf lag
bei 56,58/49,93/55,98/57,98 und der zweite bei
56,59/49,95/56,02/57,99 nach Einbezug der generierten Supabase-Konstanten. Der finale Dateistand:

| Datei | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| `profit-engine.service.ts` | 100 % (89/89) | 96,07 % (49/51) | 100 % | 100 % |
| `tax-engine.service.ts` | 99,17 % (120/121) | 93,81 % (91/97) | 100 % | 100 % |
| `inventory-sellability.ts` | 100 % (4/4) | 100 % (9/9) | 100 % | 100 % |

`test:coverage` erzeugt Text, HTML und `coverage-summary.json`. Der breite
`core/models/**`-Ausschluss wurde auf namentlich aufgeführte reine
Typmodelle verengt. Fachlich ausführbare Modelldateien, insbesondere
`inventory-sellability.ts`, `flipbase.models.ts`,
`inventory-reconciliation.ts` und die generierten Supabase-Konstanten, sind
damit Teil der Messung.

Die Kostenverteilung ist Bestandteil von `ProfitEngineService.allocateCosts`;
es wurde keine Scheindatei erfunden. Bestehende und neue Produktionsaufrufe
decken Null-/Negativwerte, Restcent, wertgewichtete und gleichmäßige Verteilung
ab.

## Fachtests und Mutationsnachweise

Neue Tests rufen ausschließlich öffentliche Produktionsmethoden auf und
verwenden handgeprüfte Literale. Temporäre Mutanten wurden nach RED vollständig
zurückgesetzt; der Produktivdiff der drei Dateien ist leer.

- Profit: Die Grenze `dealScore >= 51` wurde temporär zu `> 51`. Der echte
  Score-51-Fall wechselte erwartungsgemäß von `acceptable` zu `weak` und wurde
  rot. Ergänzt sind alle fünf Verdikte, Null-/Negativkapital, Clamps sowie
  Median-/Ausreißerzweige.
- Tax: Der reguläre Divisor wurde von 1,19 auf 1,20 mutiert. Steuerbasis,
  Umsatzsteuer, Zahllast, Periodensumme und Gewinn wurden rot. Die neuen Fälle
  decken alle Steuerarten, Fallbacks, reaktive Verkaufsquellen, DATEV SKR03/04,
  EÜR-Formelschutz und ungültige Datumswerte ab.
- Rundungsrest: Die letzte Position wurde temporär proportional statt über den
  Restbetrag belegt. Ein gemischter Drei-Positionen-Verkauf verlor den letzten
  Cent und wurde rot.
- Sellability: Die `listed`-Freigabe, die Sperrmenge und
  `multiple_active_sales` wurden gezielt entfernt. Sechs Zustandsfälle wurden
  rot; nach Rücknahme liefen alle Verkaufbarkeits-/Sperr-/Konfliktzustände grün.

Gezieltes GREEN nach Rücknahme: 3 Dateien, 45/45 Tests.

## Reproduzierbarer 20er-Stressrunner

`scripts/run-node-stress.mjs` startet Vitest direkt über `process.execPath`
und eine Argumentliste mit `shell: false`. Es gibt keine Shell-Stringverkettung.
Der Runner verlangt exakt 20 Seeds, leitet sie deterministisch aus einer
expliziten Basis oder `GITHUB_RUN_ID`/`GITHUB_RUN_ATTEMPT` ab, protokolliert
jeden Seed und beendet sich beim ersten Fehler mit dessen Exitcode.

- Vertrag: 3/3 grün.
- Voller Lauf: Basis `20260830`, Seeds `20260830` bis `20260849`.
- Jeder Lauf: 89 Dateien und 747 Node-Tests grün.
- Gesamtdauer: 163,469 Sekunden.

## Nightly-Workflow

`.github/workflows/quality-nightly.yml` läuft per `workflow_dispatch` und
täglich um 02:17 Uhr in `Europe/Berlin`. Die vier Jobs besitzen keine
Abhängigkeiten untereinander:

| Job | Inhalt | Timeout | Artefakt |
| --- | --- | ---: | --- |
| `coverage` | Node 22, `npm ci`, vollständige Coverage | 10 min | Coverage immer, 7 Tage |
| `node-stress` | exakt `npm run test:stress:20` | 15 min | Log nur Fehler/Abbruch, 7 Tage |
| `database-full` | lokaler Stack, pgTAP, unmittelbares Upgrade, Legacy-Backfill, Parallelverkauf | 20 min | Logs nur Fehler/Abbruch, 7 Tage |
| `browser-matrix` | Chromium, Firefox, WebKit; je fünf Smokes | 15 min | je Browser nur Fehler/Abbruch, 7 Tage |

Alle Fremdactions verwenden vollständige 40-stellige SHAs. Standardpermission
ist ausschließlich `contents: read`; Browser-/Demo-Jobs erhalten keine
Secrets. Jede `tee`-Pipeline setzt explizit `shell: bash`, sodass GitHubs
`-o pipefail` den Exitcode von Stress-, pgTAP- und Harness-Befehlen erhält.
Der DB-Cleanup läuft mit `always()`. `--linked`, Produktions-URL und
`continue-on-error` werden abgewiesen.

Der strukturierte Workflow-Vertrag läuft insgesamt 39/39 grün. Davon prüfen
9 Nightly-Fälle die positive Struktur und Negativfixtures für bewegliche
Action-Tags, nur einen Stresslauf, fehlendes WebKit, `continue-on-error`,
linked/produktionsnahes Supabase, Erfolgs-Upload von Fehlerartefakten,
fehlenden DB-Cleanup und fehlende Pipefail-Shell.

### Fixrunde 1: exakte Nightly-Allowlist

Das Review-Finding war berechtigt: Der ursprüngliche Vertrag suchte die
erwarteten Schritte überwiegend über deren Namen. Ein zusätzlicher Schritt
konnte deshalb neben den geprüften Schritten stehen und unbemerkt ausgeführt
werden.

RED: Zehn neue Negativfixtures wurden zuerst gegen den unveränderten Vertrag
ausgeführt. Acht Angriffe wurden fälschlich akzeptiert: zusätzlicher
`supabase db push`, `supabase link`, eine beliebige
`https://projekt.supabase.co`-URL, eine Service-Role-Umgebungsvariable, je ein
zusätzlicher `upload-artifact`-Schritt mit `always()` in Stress, Datenbank und
Browser sowie ein beliebiger zusätzlicher Coverage-Schritt. Ergebnis: 11/19
grün und 8/19 erwartungsgemäß rot. Die bereits vorhandenen exakten
Browserbefehle lehnten die Installation aller Browser und einen E2E-Lauf ohne
`--project=${{ matrix.browser }}` schon vor der Korrektur ab.

GREEN: Jeder der vier Jobs besitzt nun eine positionsgebundene, vollständige
Schritt-Allowlist. Der Vertrag vergleicht Schrittanzahl und das gesamte
Schrittobjekt einschließlich `name`, `uses` oder `run` sowie aller erlaubten
`if`-, `shell`-, `env`- und `with`-Felder. Die exakten Schrittzahlen sind
5/5/10/6 für Coverage, Stress, Datenbank und Browser. Zusätzliche Felder,
Schritte, Uploads oder Befehle brechen damit fail-closed ab.

Zusätzlich wird jeder `uses`-Wert auf eine volle SHA geprüft. Coverage darf
genau den definierten Coverage-Upload mit `always()` besitzen; Stress,
Datenbank und Browser dürfen jeweils nur ihren definierten Fehlerupload mit
`failure() || cancelled()` und sieben Tagen Aufbewahrung besitzen. Die
Datenbankbefehle werden vollständig mit der lokalen Befehls-Allowlist
verglichen; `db push`, `--linked`, `supabase link`, beliebige
`*.supabase.co`-URLs und Produktions-/Service-Role-Umgebungsvariablen werden
zusätzlich ausdrücklich abgewiesen. Im Browserjob sind genau ein Install- und
ein Testschritt erlaubt, beide ausschließlich für `${{ matrix.browser }}`.

Der legitime Nightly-Vertrag ist mit allen 19/19 Fällen grün; der gesamte
Workflow-Vertrag läuft nach der Erweiterung 49/49 grün. Der produktive
Nightly-Workflow musste nicht verändert werden.

### Fixrunde 2: vollständige Workflow- und Job-Allowlist

Das zweite Review-Finding belegte eine weitere Lücke: Die Schritte waren zwar
vollständig erlaubt, zusätzliche Schlüssel am Workflow, an Jobs oder an der
Browserstrategie wurden aber noch nicht fail-closed geprüft.

RED: 14 neue Negativfixtures wurden vor der Korrektur ausgeführt. Zwölf
Manipulationen wurden fälschlich akzeptiert: `permissions: write-all` am
Browserjob, job- und top-level Secrets, globale `defaults` und `concurrency`,
Job-`services`, Job-`secrets`, ein Job-`container`, ein Job-`if`, ein
Strategy-Zusatz, Matrix-`include` und eine zusätzliche Matrix-Achse. Ergebnis:
21/33 grün und 12/33 erwartungsgemäß rot. Jobweites `continue-on-error` sowie
eine Remote-URL in einem bestehenden Coverage-Schritt wurden bereits von den
vorhandenen Prüfungen abgewiesen.

GREEN: Das Workflow-Top-Level erlaubt exakt `name`, `on`, `permissions` und
`jobs`. Jeder normale Job erlaubt ausschließlich `name`, `runs-on`,
`timeout-minutes` und `steps`; nur `browser-matrix` besitzt zusätzlich
`strategy`. Namen, Runner und Timeouts werden ebenfalls auf ihre definierten
Werte geprüft. Dadurch sind insbesondere jobweite Rechte, Umgebungsvariablen,
Secrets, Container, Services, Bedingungen, `continue-on-error`, `needs` und
beliebige weitere Felder ausgeschlossen.

Die Browserstrategie erlaubt exakt `fail-fast` und `matrix`; die Matrix exakt
die Achse `browser` mit `chromium`, `firefox` und `webkit`. `include`, weitere
Achsen oder sonstige Strategy-Felder brechen ab. Vor der Strukturprüfung wird
außerdem die Serialisierung aller vier Jobs auf HTTP(S)-Remote-URLs,
GitHub-Secrets-Kontexte sowie Supabase-, Datenbank-, Service-Role- und
Produktionsvariablen geprüft. Die legitimen Kontexte `github.run_id`,
`github.run_attempt` und `matrix.browser` bleiben erlaubt.

Der legitime Nightly-Vertrag läuft nach Fixrunde 2 mit 33/33 Fällen, der
gesamte Workflow-Vertrag mit 63/63 Fällen grün. Der produktive
Nightly-Workflow blieb erneut unverändert.

### Fixrunde 3: typgerechte YAML-Skalare

Das dritte Review-Finding traf den Konverter zwischen Prettiers YAML-AST und
dem geprüften Workflowobjekt: Er gab jeden Scalar-`value` als String zurück.
Dadurch waren beispielsweise ungequotiertes `false` und gequotetes `'false'`
für den Vertrag ununterscheidbar.

Die Untersuchung erfolgte mit Prettier 3.9.6 ausschließlich über den
öffentlichen Parser aus `prettier/plugins/yaml`. Die AST-Knoten liefern
`type`, `tag` und `value`; Plain-, einfach und doppelt gequotete Skalare sind
durch die öffentlichen Knotentypen eindeutig unterscheidbar. Private
`__debug`-APIs wurden nicht verwendet.

RED: Ein direkter Scalar-Vertrag verlangte für ungequotiertes `false`, `15`
und `null` die Werte `false`, `15` und `null`, während die entsprechenden
gequoteten Werte, eine unsichere Ganzzahl, `${{ matrix.browser }}` und der
Cron-Ausdruck Strings bleiben müssen. Zusätzlich wurden fünf echte
Workflow-Quelltextmutanten geprüft: `'false'` bei `fail-fast`, `'15'` bei
`timeout-minutes`, `'7'` bei `retention-days`, `'false'` bei
`persist-credentials` und ungequotiertes `22` bei `node-version`. Alle sechs
neuen Verträge wurden erwartungsgemäß rot; Ergebnis 33/39 grün und 6/39 rot.

GREEN: Nur ungetaggte `plain`-Knoten werden konservativ normalisiert. Die
YAML-Boolean- und Nullschreibweisen werden zu `boolean` beziehungsweise
`null`. Dezimalzahlen werden nur übernommen, wenn sie endlich und als sichere
Ganzzahl beziehungsweise mit höchstens 15 signifikanten Ziffern
vertretbar sind. Gequotete/getaggte Werte, unsichere Zahlen,
GitHub-Ausdrücke, Cron und Action-Inputs mit bewusstem Stringvertrag werden
nicht semantisch ausgewertet.

Die erwarteten Workflowobjekte verwenden nun echte Typen: `fail-fast` und
`persist-credentials` sind `false`, Timeouts und `retention-days` sind Zahlen;
`node-version: '22'`, Cron und GitHub-Ausdrücke bleiben Strings. Der legitime
Nightly-Vertrag läuft 39/39, der gesamte Workflow-Vertrag 69/69 grün. Der
produktive Workflow blieb unverändert.

## Browser und Datenbank

- Standard-Chromium: 5/5 grün in 10,818 Sekunden.
- Nightly-Konfiguration: `--list` zeigt exakt 15 Fälle, fünf je Chromium,
  Firefox und WebKit.
- Firefox/WebKit wurden lokal nicht zusätzlich heruntergeladen. Der statische
  Workflowvertrag und die Konfigurationsauflösung sind vollständig; der
  Nightly-Runner installiert ausschließlich den gewählten Browser.
- Begrenzter read-only Docker-Check: `docker info` Exitcode 1, weil
  `npipe:////./pipe/dockerDesktopLinuxEngine` nicht existiert. Daher wurden
  lokal weder Supabase noch pgTAP, Upgrade oder Parallelität gestartet. Es gab
  keinen Reset, keine Löschung und keinen Ersatzlauf gegen eine linked DB.

## Vollständige lokale Abnahme

| Prüfung | Ergebnis |
| --- | --- |
| Coverage-RED +1 Prozentpunkt | Exit 1, ausschließlich vier Schwellenfehler |
| `npm run test:coverage` zweimal | grün, globale und Dateiböden erfüllt |
| `npm run test:stress:contract` | 3/3 grün |
| `npm run test:stress:20 -- --base-seed=20260830` | 20/20 grün, 163,469 s |
| `npm run test:workflow` | 39/39 grün |
| `npm run test:e2e` | Chromium 5/5 grün, 10,818 s |
| `npm run format:check` | grün |
| `npm run lint` | grün |
| `npm run typecheck` | grün |
| `npm test` | 116 Dateien, 1.070 Vitest-Tests grün; 17,406 s |
| `npm run build` | grün; 13,852 s inklusive parallelem Coverage-Lauf |
| beide Workflow-Dateien per Prettier | grün |
| `git diff --check` | grün |

Fixrunde 1 wurde zusätzlich am finalen Stand mit `npm run test:workflow`
(49/49), `npm run format:check`, `npm run lint`, `npm run typecheck`, beiden
Workflow-Dateien per Prettier, `git diff --check`, `npm test` (116 Dateien,
1.070 Tests) und `npm run build` (6,951 s) abgenommen. Coverage, 20er-Stress,
Browsermatrix und lokale Datenbank wurden nicht erneut ausgeführt, weil die
Fixrunde ausschließlich den lokalen Workflow-Vertrag und seine Dokumentation
ändert; die ursprünglichen Task-9-Nachweise bleiben unverändert.

Fixrunde 2 wurde mit `npm run test:workflow` (63/63),
`npm run format:check`, `npm run lint`, `npm run typecheck`, beiden
Workflow-Dateien per Prettier, `git diff --check`, `npm test` (116 Dateien,
1.070 Tests) und `npm run build` (6,814 s) abgenommen. Coverage, 20er-Stress,
Browsermatrix und lokale Datenbank wurden nicht erneut ausgeführt, weil auch
diese Fixrunde ausschließlich den lokalen Workflow-Vertrag und seine
Dokumentation ändert; die ursprünglichen Task-9-Nachweise bleiben unverändert.

Fixrunde 3 wurde mit `npm run test:workflow` (69/69),
`npm run format:check`, `npm run lint`, `npm run typecheck`, beiden
Workflow-Dateien per Prettier, `git diff --check`, `npm test` (116 Dateien,
1.070 Tests) und `npm run build` (6,746 s) abgenommen. Coverage, 20er-Stress,
Browsermatrix und lokale Datenbank wurden nicht erneut ausgeführt, weil die
Fixrunde ausschließlich den lokalen Workflowvertrag und seine Dokumentation
ändert; die ursprünglichen Task-9-Nachweise bleiben unverändert.

Commit-Nachweis: genau ein Task-Commit mit der Nachricht
`test: enforce coverage floors and nightly full checks`; der unvermeidlich
außerhalb seines eigenen Inhalts liegende Hash wird in der Abschlussmeldung
angegeben.

## Offene Bedenken

- Die echte GitHub-Schedule-/Matrix-Ausführung bleibt ohne Push absichtlich
  offen.
- Die dynamische lokale Datenbankabnahme bleibt wegen Docker blockiert.
- Firefox und WebKit sind statisch vollständig konfiguriert, wurden lokal aber
  nicht binär installiert oder ausgeführt.
- Der zweite Coverage-Lauf schwankte bei einzelnen globalen Zählern um wenige
  instrumentierte Einheiten, blieb aber komfortabel über allen Böden; die
  kritischen Dateiwerten waren identisch.
