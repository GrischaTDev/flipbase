# Teststrategie und CI — Zeit-, Sicherheits- und Rollout-Abnahme

**Stand:** 30.08.2026

**Geprüfter Code-Commit:** `0713cf3`

**Branch:** `codex/teststrategie-ci-beschleunigung`

**Operative Entscheidung:** **NO-GO für Produktion**

## Executive Summary

Der lokale Umbau der Teststrategie ist fachlich und strukturell
abgenommen. Drei kontrollierte Produktfehler wurden dynamisch auf der
vorgesehenen Ebene rot: falscher Steuerfaktor im Node-Test, Doppelverkauf eines
Demo-Einzelstücks im Verkaufsservice-Test und falsche Einkaufs-Rücknavigation
im konkreten Chromium-Playwright-Test. Nach normalen Revert-Commits waren die
drei unveränderten Zieltests wieder grün. Die abschließende Gesamtprüfung fand
und schloss drei weitere Lücken: Workflow-Verträge und Suite-Audit sind nun
Pflicht-Gates, der Chart-Tooltip ist auch per Tastatur erreichbar und das
Deployment vergleicht die öffentlich ausgelieferte Build-SHA exakt mit dem
GitHub-Commit. Der vollständige lokale Workflowvertrag ist mit 80/80 Fällen
grün und belegt fail-closed Test-, Image- und Deploy-Bedingungen.

Ein Produktions-Go ist trotzdem nicht zulässig. Der Feature-Branch existiert
auf GitHub noch nicht, daher gibt es 0/5 geforderte neue PR-Läufe, keinen echten
externen roten Shard und keinen Produktionslauf der neuen Pipeline. Docker,
der vollständige lokale pgTAP-Lauf, die kontrollierte RLS-Mutation und das
Produktionsimage sind inzwischen lokal erfolgreich nachgewiesen. p95,
tatsächliche Runner-Minuten der neuen Pipeline und
Merge-zu-öffentlichem SHA-Nachweis können nicht seriös berechnet werden. Es gab keinen Push,
Pull Request, Merge, `workflow_dispatch` oder Deployment.

## Scope und Commits der Umsetzung

Ausgangspunkt der Strategie war `2d0e0d7`; der alte serielle
Produktions-Workflow ist historisch unter `0768233` erreichbar. Die lokale
Abnahme bezieht sich auf folgenden, zusammenhängenden Feature-Stand:

| Task   | Inhalt                                                 | Commits                                               |
| ------ | ------------------------------------------------------ | ----------------------------------------------------- |
| 1      | Reproduzierbarer Runnervergleich                       | `c29df1b`                                             |
| 2      | Trennung Node, DOM und Angular                         | `78472d6`                                             |
| 3      | Gemessener Runner und robuster Parallel-Orchestrator   | `eca0fdd`, `b101ee3`, `eba2e1b`, `092ea77`, `1ed0cf9` |
| 4      | Konsolidierung und gehärteter Suite-Audit              | `0043dc8`, `e2d0682`                                  |
| 5      | Produktionsnahe Steuerverträge                         | `70d86d1`                                             |
| 6      | Parallele CI-Gates und gehärteter Workflowvertrag      | `c2edafd`, `efd6101`                                  |
| 7      | Supabase-/pgTAP-Gate und Support-Härtung               | `d2d410f`, `ea86e9f`                                  |
| 8      | Kritische Browserwege und Stabilitätskorrekturen       | `8dddae0`, `7d76e87`, `592e817`                       |
| 9      | Coverage, Stress, Nightly und fail-closed YAML-Vertrag | `76b47bf`, `de5cdcf`, `ff2eb1a`, `63709b7`, `7293435` |
| 10     | Lokale Rollout-Abnahme und Mutationsnachweise          | `4deb246`, `cc20188`, `c3544d8`                       |
| Review | Pflicht-Verträge, Tastaturzugang und öffentliche SHA   | `4828158`, `ecbf2d1`, `7ab39b7`, `0713cf3`            |

## Testpyramide und Gate-Mapping

| Ebene         | Risiko / Inhalt                                         | Lokaler Einstieg                      | CI-Gate                                                                   |
| ------------- | ------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| Node          | Geld, Steuer, Bestand, reine Services und Modelle       | `npm run test:node`                   | Unit-Matrix, zwei Node-Shards, danach `test-gate`                         |
| DOM           | Browser-APIs ohne vollständigen Nutzerweg               | `npm run test:dom`                    | Unit-Matrix, danach `test-gate`                                           |
| Angular       | Komponenten und Templates                               | `npm run test:angular`                | Unit-Matrix, danach `test-gate`                                           |
| Quality       | Format, Lint, Typen, Workflow-Verträge, Audit und Build | `npm run verify`                      | `quality`                                                                 |
| Datenbank     | Migrationen, Integrität und RLS                         | `npm run test:db` gegen lokalen Stack | bedingtes `database` plus `database-gate`                                 |
| Browser-Smoke | sechs kritische Demo-Nutzerwege                         | `npm run test:e2e`                    | paralleles `browser-smoke`                                                |
| Image         | unveränderliches Kandidatenimage                        | nicht lokal gepusht                   | nur Push, ausschließlich `sha-<commit>`                                   |
| Deployment    | Migration, Container, öffentlicher Healthcheck und SHA  | nicht lokal ausgeführt                | braucht `quality`, `test-gate`, `database-gate`, `browser-smoke`, `image` |
| Nightly       | Coverage, 20 Seeds, vollständige DB und drei Browser    | einzeln lokal prüfbar                 | unabhängig, nicht Teil des normalen Deploy-Gates                          |

## Tatsächlich lokale Messwerte

Die Werte stammen aus den Task-1-bis-9-Berichten und deren gespeicherten Logs.
Sie sind keine GitHub-Runner-Zeiten.

| Prüfung                          | Tatsächlicher lokaler Wert                                                                | Einordnung                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Ausgangslauf Task 1              | 131 Dateien, 1.039 Tests, Vitest-Dauer 26,37 s                                            | Quelle: `task-1-report.md`; keine Wall-Clock-Messung                   |
| Runnervergleich                  | Angular-Fallback: 20 Dateien/148 Tests, Median 13,321 s; Angular-Builder: Median 19,042 s | Fallback lokal vorläufig gewählt; kalte CI-Messung offen               |
| Konsolidierter Gesamtlauf Task 4 | 117 Dateien, 1.039 Tests, Median 19,825 s                                                 | Testfallzahl erhalten                                                  |
| Finaler paralleler `npm test`    | 116 Dateien, 1.071 Vitest-Tests                                                           | Node 89/747, DOM 9/92, Angular 18/232                                  |
| Coverage final                   | global 56,68/50,00/56,09/58,08 %                                                          | Statements/Branches/Functions/Lines                                    |
| Kritische Coverage               | Profit 100/96,07 %, Tax 99,17/93,81 %, Sellability 100/100 %                              | Statements/Branches                                                    |
| 20er-Stresslauf                  | Seeds 20260830–20260849, je 89 Dateien/747 Node-Tests; 163,469 s gesamt                   | 20/20 grün                                                             |
| Chromium-Smoke final             | 6/6 in 18,5 s                                                                             | Maus- und Tastaturweg enthalten                                        |
| Firefox/WebKit                   | nicht lokal ausgeführt                                                                    | Nightly-Konfiguration listet die Smoke-Fälle; keine Ergebnisbehauptung |
| Build                            | 6,664 s im finalen `npm run verify`                                                       | lokaler Production-Build grün                                          |
| Workflowvertrag final            | 80/80                                                                                     | einschließlich Healthcheck, Deployment-Metadaten und öffentlicher SHA  |
| Datenbank/RLS                    | 6 Dateien, 214/214 pgTAP-Tests grün; kontrollierter Fremdzugriff 2 Tests rot              | Wiederherstellung im selben Negativlauf, danach 214/214 erneut grün    |
| Docker-Produktionsimage          | Image `flipbase:teststrategie-ci-899c2af` erfolgreich gebaut                              | Nginx, Startseite, `healthz=ok` und vollständige Commit-SHA geprüft    |

## Read-only GitHub-Bestandsaufnahme

`gh auth status` bestätigt die Anmeldung als `GrischaTDev`. Das Remote ist
`https://github.com/GrischaTDev/flipbase.git`, Default-Branch `master`. Die
Branch-Abfrage für `codex/teststrategie-ci-beschleunigung` endete mit HTTP 404;
`gh run list --branch codex/teststrategie-ci-beschleunigung` lieferte `[]`.
Damit existiert kein externer Lauf der neuen Workflowversion.

Der jüngste sichtbare Lauf des alten Workflows ist nur historischer Vergleich:

| Run                                                                             | Event / SHA                                                   | Jobs und Laufzeiten                                       | Ergebnis | Wertung                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- | -------- | ----------------------------------- |
| [33299028439](https://github.com/GrischaTDev/flipbase/actions/runs/33299028439) | Push auf `master`, `076823308f468fce4e6783062a2f27f645b3e821` | Verify 10:32, Publish image 2:46, Deploy 0:22; Lauf 13:50 | grün     | alte serielle Pipeline, zählt nicht |

Die abgefragte `gh`-Ausgabe liefert Job-Wandzeiten, aber keine belastbaren
abgerechneten Runner-Minuten. Deshalb wird hierfür kein Wert abgeleitet.

### Runner-Minuten-Budget

Vor einem GO müssen mindestens fünf vergleichbare historische PR-Läufe
vorliegen. Daraus werden ohne Rosinenpickerei die fünf jüngsten
aufeinanderfolgenden gültigen Läufe vor dem ersten neuen Lauf als feste
Baseline-Kohorte festgelegt. Vergleichbar bedeutet:
gleiches Repository, GitHub-PR-Ereignis, GitHub-hosted Ubuntu-Runnerklasse,
erfolgreicher vollständiger damaliger Pflichtumfang und dieselbe belastbare
Abrechnungsquelle. Als Gesamt-Runner-Minuten eines Laufs zählt ausschließlich
der von GitHub bereitgestellte positive Billable-Gesamtwert über alle Jobs;
Job-Wandzeit, Workflowdauer und Warteschlangenzeit sind kein Ersatz.

| Baseline-Slot | Run-ID / URL | Commit-SHA | Pflichtumfang | Billable Gesamt-Runner-Minuten |
| ------------: | ------------ | ---------- | ------------- | -----------------------------: |
|             1 | offen        | offen      | offen         |                          offen |
|             2 | offen        | offen      | offen         |                          offen |
|             3 | offen        | offen      | offen         |                          offen |
|             4 | offen        | offen      | offen         |                          offen |
|             5 | offen        | offen      | offen         |                          offen |

Für die fünf vorab festgelegten positiven Werte `R_b1` bis `R_b5` gilt:

- Baseline `B = Median(R_b1, R_b2, R_b3, R_b4, R_b5)`;
- Budgetgrenze `T = 1,2 × B`;
- jeder der fünf neuen, aufeinanderfolgenden PR-Läufe muss einen echten
  positiven Billable-Gesamtwert `R_n1` bis `R_n5` besitzen;
- konservative Vergleichsregel: **für jeden** neuen Lauf gilt `R_ni ≤ T`.

Ein Baseline- oder neuer Wert `0`, `null`, `unavailable`, eine aus Wandzeiten
abgeleitete Zahl oder weniger als fünf vergleichbare Baseline-Läufe ist selbst
ein `NO-GO`. Aktuell sind 0/5 Baseline-Slots belastbar; deshalb sind weder `B`
noch `T` berechnet. Der Laufzeit-p95 des langsamsten Pflicht-Gates bleibt davon
unabhängig und muss separat aus den fünf neuen PR-Läufen ≤ 3 Minuten sein.

### Fünf geforderte neue PR-Läufe

| Slot | Run-ID / URL | Event | Commit-SHA | Pflichtjobs und Ergebnisse | Start / Ende | Gate-Laufzeiten | Billable Gesamt-Runner-Minuten `R_ni` | Budget `R_ni ≤ T` |
| ---: | ------------ | ----- | ---------- | -------------------------- | ------------ | --------------- | ------------------------------------: | ----------------- |
|    1 | offen        | offen | offen      | offen                      | offen        | offen           |                                 offen | offen             |
|    2 | offen        | offen | offen      | offen                      | offen        | offen           |                                 offen | offen             |
|    3 | offen        | offen | offen      | offen                      | offen        | offen           |                                 offen | offen             |
|    4 | offen        | offen | offen      | offen                      | offen        | offen           |                                 offen | offen             |
|    5 | offen        | offen | offen      | offen                      | offen        | offen           |                                 offen | offen             |

p95 wird erst nach fünf echten vollständig grünen Läufen aus dem jeweils
langsamsten Pflicht-Gate berechnet. Bei 0/5 gibt es weder Ersatzwert noch
Extrapolation.

## Kontrollierte Fehlernachweise

Die drei Code-/UI-Mutationen liefen in
`K:\GitHub\Repos\flipbase\.worktrees\teststrategie-ci-task10-mutations`,
detached und exakt auf `7293435b9a2d93f14e36d53aab66d62cddfc2fa9`.
Abhängigkeiten wurden dort mit `npm ci` installiert. Jeder Mutant erhielt einen
eigenen Commit und einen normalen Revert-Commit. Der finale Diff gegen die Basis
war leer; danach wurde nur dieser verifizierte Worktree entfernt.

| Fehler                    | Status   | Mutation / Revert     | Vorgesehene Ebene und dynamisches Ergebnis                                                                                                                                                       |
| ------------------------- | -------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Falscher Steuerfaktor     | **PASS** | `7660280` / `bde302a` | `tax-engine.service.ts`: Divisor 1,19 → 1,20. Gezielter Node-Tax-Test Exit 1, 2/14 rot; nach Revert 14/14 grün.                                                                                  |
| Doppelverkauf Einzelstück | **PASS** | `6ec3980` / `36084ff` | zentrale Demo-Buchungssperre logisch umgangen. Gezielter `SalesService`-DOM-Test Exit 1, 1/16 rot; nach Revert 16/16 grün.                                                                       |
| RLS fremder Workspace     | **PASS** | temporäre SQL-Dateien | `Inventar lesen` lokal kurz auf `using (true)` gesetzt: Fremdzugriff auf Inventar und Verkaufszustände wurde mit 2/216 roten Tests erkannt. Restore-Datei grün; danach unverändert 214/214 grün. |
| Falsche Rücknavigation    | **PASS** | `6215950` / `74e0d6b` | echter Item-Back-Link auf `/inventory`. Exakter Playwright-Test Exit 1: erwartet `/purchases/pur-demo-2`, erhalten `/inventory`; auch Retry rot. Nach Revert 1/1 grün in 22,9 s.                 |

Ein erster, nicht gewerteter Navigations-Vorversuch (`6f55adf`) wurde bereits
durch den Angular-Typvertrag vor Playwright blockiert und normal mit `72e3b70`
revertiert. Er ersetzt den gültigen Browsernachweis nicht.

## Deployment-Gate-Negativstatus

`node --test scripts/ci-workflow.test.mjs` lief lokal mit 17/17 Fällen grün.
Die strukturierten Negativfixtures weisen insbesondere zurück:

- ein Test-Gate, das nur `!= failure` statt exakt `success` verlangt;
- eine Image-Bedingung, die Pull Requests zulässt;
- ein Deploy-Gate mit `|| true` oder ohne verpflichtenden Browser-Smoke;
- ein Datenbank-Gate, das einen fehlgeschlagenen Changes-Job oder ein falsches
  `skipped` akzeptiert.

Der positive Strukturvertrag verlangt für `test-gate` exakt
`test "$RESULT" = "success"`, für `image` ausschließlich Push und beim Build
genau ein SHA-Tag. `deploy` verlangt die erfolgreichen Ergebnisse aller fünf
Pflichtabhängigkeiten. Es gibt kein `latest`-Tag.

**Status:** lokaler Workflowvertrag **PASS**, echter externer roter Shard
**OFFEN**. Lokales YAML-/AST-Prüfen ist kein GitHub-Lauf und belegt weder die
tatsächliche Scheduler-Auswertung noch Registry-/Deploy-Nebenwirkungen.

Der spätere sichere Negativablauf ist: einen eigenen Test-PR mit einem
temporären fachlich harmlosen Fehlercommit erstellen, den betroffenen
Unit-Shard rot beobachten, `test-gate` als rot und `deploy` als `skipped`
bestätigen, prüfen, dass kein `latest` und im PR gar kein Kandidatenimage
entsteht, danach den Fehlercommit normal revertieren oder entfernen. Dieser
Ablauf wurde jetzt nicht ausgeführt.

## Deploy Checklist: Teststrategie und CI-Beschleunigung

### Pre-Deploy

- [x] Feature-Stand und Ausgangscommit eindeutig dokumentiert.
- [x] Lokale Testpyramide, Coverage, Stress und Chromium-Nachweise dokumentiert.
- [x] Steuer-, Doppelverkaufs-, RLS- und Navigationsmutation auf Ziel-Ebene rot und
      nach Revert grün.
- [x] Lokaler Workflowvertrag einschließlich Negativfixtures grün.
- [ ] Pfadbegrenzter Rollback wurde in einem isolierten Branch/Worktree
      tatsächlich ausgeführt, mit exakt einem Dateidiff validiert und durch
      Quick-, DB- und Browser-Gates bestätigt.
- [x] Dynamische Supabase-/RLS-Tests in einem erreichbaren lokalen oder
      ephemeren Stack vollständig grün.
- [x] Keine Critical/Important Review-Findings offen.
- [ ] Fünf aufeinanderfolgende neue PR-Läufe vollständig grün.
- [ ] p95 des langsamsten Pflicht-Gates aus genau diesen fünf Läufen ≤ 3 min.
- [ ] Fünf vergleichbare historische PR-Läufe liefern positive Billable-Werte;
      `B` und `T = 1,2 × B` sind dokumentiert.
- [ ] Alle fünf neuen PR-Läufe besitzen positive Billable-Gesamtwerte und
      erfüllen einzeln `R_ni ≤ T`.
- [ ] Externer Negativ-PR belegt roten Shard, `deploy=skipped` und kein
      `latest`.

### Deploy

- [ ] Autorisierung für Merge und Produktion liegt ausdrücklich vor.
- [ ] Feature-Branch/PR ist reviewt und in `master` gemergt.
- [ ] Der Merge-SHA ist vor dem Lauf festgehalten.
- [ ] Alle Pflicht-Gates des Push-Laufs sind grün.
- [ ] Das Kandidatenimage trägt ausschließlich den erwarteten SHA-Tag.
- [ ] Deployment zieht exakt diesen Tag; Migrationen sind angewandt.
- [ ] Container meldet gesund und `/healthz` liefert `ok`.
- [ ] Öffentliche Startseite liefert HTTP 200.
- [ ] Ausgelieferter Commit entspricht exakt dem Merge-SHA.
- [ ] Merge bis `healthz=ok` ist ≤ 5 min.

### Post-Deploy

- [ ] Kritische Nutzerwege Anmeldung, Einkauf→Artikel→Einkauf, Inventarverkauf
      und Dashboardinteraktion sind gegen Produktion nur read-only/sicher
      geprüft.
- [ ] Fehlerquote, Latenz und Containerzustand sind mindestens 15 Minuten
      unauffällig.
- [ ] Tatsächliche Jobzeiten, Runner-Minuten und Merge-zu-Live-Zeit sind in
      dieser Tabelle nachgetragen.
- [ ] Changelog/Release Notes und Stakeholder-Information sind aktualisiert.
- [ ] Temporäre Negativfixture/PR ist vollständig bereinigt.

## Produktionsmessplan

1. Vor Merge die fünf historischen Baseline-PR-Läufe festlegen, ihre positiven
   Billable-Gesamtwerte erfassen und daraus `B` und `T = 1,2 × B` berechnen.
2. Für jeden neuen PR-Lauf Run-ID, Jobnamen, Start-/Endzeiten, Ergebnisse,
   Testzahlen und den positiven Billable-Gesamtwert erfassen; jeden Wert
   einzeln gegen `T` prüfen.
3. Unmittelbar vor Merge UTC-Zeit und Merge-SHA festhalten.
4. Im Push-Lauf Gate-Ende, Image-Ende, Deploy-Start und den ersten bestätigten
   Zeitpunkt `healthz=ok` erfassen.
5. Container-Health, Startseite HTTP 200 und die ausgelieferte
   Commit-Anzeige gegen den Merge-SHA prüfen.
6. Merge-zu-Health-Dauer ohne Warteschlangenzeit-Uminterpretation aus den
   realen Zeitstempeln berechnen und zusammen mit der Run-URL dokumentieren.

## Rollback-Trigger

Rollback wird ausgelöst bei:

- fachlichem Gate-Bypass oder rotem kritischem Nutzerweg;
- Flake-Rate > 5 %;
- PR-p95 > 3 Minuten;
- fehlende/0/unverfügbare Billable-Werte, weniger als fünf vergleichbare
  Baseline-PR-Läufe oder mindestens ein neuer Lauf mit `R_ni > T`;
- roter Migration, Datenbank- oder RLS-Prüfung;
- `healthz` nicht `ok`, Startseite nicht HTTP 200 oder ausgeliefertem falschen
  Commit-SHA;
- einer Critical/Important Regression im Release-Scope.

## Rollback-Ablauf

`0768233` ist ausschließlich die Referenz für die frühere serielle Topologie,
nicht das Ziel eines Reverts. Es erfolgt weder ein Hard Reset noch ein Revert
irgendeines Task-Commits. Der spätere Rollback wird in einem isolierten
Branch/Worktree auf dem dann betroffenen Release-HEAD als neuer, normaler
Rollback-Commit vorbereitet:

1. Ausschließlich `.github/workflows/ci.yml` ändern und die Topologie nach dem
   Vorbild von `0768233` wieder seriell ordnen.
2. Trotz serieller Reihenfolge bleiben alle heutigen fachlichen Prüfungen und
   Gates aktiv: Quality, Node/DOM/Angular, `test-gate`, Changes-Erkennung,
   Datenbank plus `database-gate`, Chromium-`browser-smoke`, Image und Deploy.
3. Das Image bleibt unveränderlich und ausschließlich SHA-getaggt. `latest`
   darf nicht zurückkehren; Deploy bleibt von allen Pflicht-Gates abhängig.
4. Vor dem Commit muss `git diff --name-only` exakt eine Zeile liefern:
   `.github/workflows/ci.yml`. Jede weitere Datei bricht den Rollback ab.
5. Insbesondere fachliche Tests, Supportskripte, Produktfixes, `package.json`,
   `package-lock.json`, Vitest-/Playwright-Konfigurationen und
   `.github/workflows/quality-nightly.yml` bleiben unverändert.
6. Danach alle Quick-Gates (`npm run format:check`, `npm run lint`,
   `npm run typecheck`, `npm test`, `npm run build`), den lokalen
   Datenbank-Gate-Satz mit `npm run test:db` und die Chromium-Browser-Smokes
   mit `npm run test:e2e` ausführen. Erst nach dokumentierter grüner
   Validierung darf die offene Rollback-Checkbox gesetzt werden.

Ist ausschließlich das Nightly-Runnerbudget zu hoch, wird die produktive
CI-Topologie nicht zurückgerollt. Die geplante Nightly-Ausführung darf nur mit
einem eigenen, bewusst reviewten Commit pausiert werden, dessen
`git diff --name-only` exakt
`.github/workflows/quality-nightly.yml` ausgibt. Dieser Commit entfernt oder
pausiert nur den Zeitplan; der manuelle Einstieg und alle Tests/Supportskripte
bleiben erhalten. Auch dafür werden keine bestehenden Commits revertiert. Die
spätere Reaktivierung erfolgt in einem weiteren eigenen Commit.

## Offene Risiken und Bedingungen für ein späteres GO

Offen sind 5/5 belastbare Baseline-PR-Läufe für `B`/`T`, 5/5 neue PR-Läufe,
p95, der Einzelvergleich jedes neuen Billable-Gesamtwerts mit `T`, die
praktische Rollback-Validierung, der echte rote GitHub-Shard, die externe
Reviewfreigabe, Firefox/WebKit im echten Nightly und der
vollständige Produktionslauf. Ein späteres GO ist nur möglich, wenn alle sechs
offiziellen Abnahmekriterien kumulativ belegt sind. Bis dahin bleibt die
operative Entscheidung unverändert:
**NO-GO für Produktion**.
