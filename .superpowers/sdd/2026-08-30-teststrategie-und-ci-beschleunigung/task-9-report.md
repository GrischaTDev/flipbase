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
