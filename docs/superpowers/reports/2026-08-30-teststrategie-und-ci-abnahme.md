# Teststrategie und CI — Zeit-, Sicherheits- und Rollout-Abnahme

**Stand:** 30.08.2026

**Geprüfter Commit:** `7293435b9a2d93f14e36d53aab66d62cddfc2fa9`

**Branch:** `codex/teststrategie-ci-beschleunigung`

**Operative Entscheidung:** **NO-GO für Produktion**

## Executive Summary

Der lokale Umbau der Teststrategie ist fachlich und strukturell weitgehend
abgenommen. Drei kontrollierte Produktfehler wurden dynamisch auf der
vorgesehenen Ebene rot: falscher Steuerfaktor im Node-Test, Doppelverkauf eines
Demo-Einzelstücks im Verkaufsservice-Test und falsche Einkaufs-Rücknavigation
im konkreten Chromium-Playwright-Test. Nach normalen Revert-Commits waren die
drei unveränderten Zieltests wieder grün. Der lokale CI-Workflowvertrag ist mit
16/16 Fällen grün und belegt fail-closed Test-, Image- und Deploy-Bedingungen.

Ein Produktions-Go ist trotzdem nicht zulässig. Der Feature-Branch existiert
auf GitHub noch nicht, daher gibt es 0/5 geforderte neue PR-Läufe, keinen echten
externen roten Shard und keinen Produktionslauf der neuen Pipeline. Der lokale
Docker-Server ist nicht erreichbar; die dynamische RLS-Mutation bleibt deshalb
`BLOCKED`. p95, tatsächliche Runner-Minuten der neuen Pipeline und
Merge-zu-`healthz=ok` können nicht seriös berechnet werden. Es gab keinen Push,
Pull Request, Merge, `workflow_dispatch` oder Deployment.

## Scope und Commits der Tasks 1–9

Ausgangspunkt der Strategie war `2d0e0d7`; der alte serielle
Produktions-Workflow ist historisch unter `0768233` erreichbar. Die lokale
Abnahme bezieht sich auf folgenden, zusammenhängenden Feature-Stand:

| Task | Inhalt                                                 | Commits                                               |
| ---- | ------------------------------------------------------ | ----------------------------------------------------- |
| 1    | Reproduzierbarer Runnervergleich                       | `c29df1b`                                             |
| 2    | Trennung Node, DOM und Angular                         | `78472d6`                                             |
| 3    | Gemessener Runner und robuster Parallel-Orchestrator   | `eca0fdd`, `b101ee3`, `eba2e1b`, `092ea77`, `1ed0cf9` |
| 4    | Konsolidierung und gehärteter Suite-Audit              | `0043dc8`, `e2d0682`                                  |
| 5    | Produktionsnahe Steuerverträge                         | `70d86d1`                                             |
| 6    | Parallele CI-Gates und gehärteter Workflowvertrag      | `c2edafd`, `efd6101`                                  |
| 7    | Supabase-/pgTAP-Gate und Support-Härtung               | `d2d410f`, `ea86e9f`                                  |
| 8    | Kritische Browserwege und Stabilitätskorrekturen       | `8dddae0`, `7d76e87`, `592e817`                       |
| 9    | Coverage, Stress, Nightly und fail-closed YAML-Vertrag | `76b47bf`, `de5cdcf`, `ff2eb1a`, `63709b7`, `7293435` |

## Testpyramide und Gate-Mapping

| Ebene         | Risiko / Inhalt                                        | Lokaler Einstieg                      | CI-Gate                                                                   |
| ------------- | ------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------- |
| Node          | Geld, Steuer, Bestand, reine Services und Modelle      | `npm run test:node`                   | Unit-Matrix, zwei Node-Shards, danach `test-gate`                         |
| DOM           | Browser-APIs ohne vollständigen Nutzerweg              | `npm run test:dom`                    | Unit-Matrix, danach `test-gate`                                           |
| Angular       | Komponenten und Templates                              | `npm run test:angular`                | Unit-Matrix, danach `test-gate`                                           |
| Quality       | Format, Lint, Typen und Produktionsbuild               | einzelne npm-Skripte                  | `quality`                                                                 |
| Datenbank     | Migrationen, Integrität und RLS                        | `npm run test:db` gegen lokalen Stack | bedingtes `database` plus `database-gate`                                 |
| Browser-Smoke | fünf kritische Demo-Nutzerwege                         | `npm run test:e2e`                    | paralleles `browser-smoke`                                                |
| Image         | unveränderliches Kandidatenimage                       | nicht lokal gepusht                   | nur Push, ausschließlich `sha-<commit>`                                   |
| Deployment    | Migration, Container, öffentlicher Healthcheck und SHA | nicht lokal ausgeführt                | braucht `quality`, `test-gate`, `database-gate`, `browser-smoke`, `image` |
| Nightly       | Coverage, 20 Seeds, vollständige DB und drei Browser   | einzeln lokal prüfbar                 | unabhängig, nicht Teil des normalen Deploy-Gates                          |

## Tatsächlich lokale Messwerte

Die Werte stammen aus den Task-1-bis-9-Berichten und deren gespeicherten Logs.
Sie sind keine GitHub-Runner-Zeiten.

| Prüfung                              | Tatsächlicher lokaler Wert                                                                | Einordnung                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Ausgangslauf                         | 131 Dateien, 1.039 Tests, 41,93 s                                                         | Baseline vor dem Umbau                                                     |
| Runnervergleich                      | Angular-Fallback: 20 Dateien/148 Tests, Median 13,321 s; Angular-Builder: Median 19,042 s | Fallback lokal vorläufig gewählt; kalte CI-Messung offen                   |
| Konsolidierter Gesamtlauf Task 4     | 117 Dateien, 1.039 Tests, Median 19,825 s                                                 | Testfallzahl erhalten                                                      |
| Finaler paralleler `npm test` Task 9 | 116 Dateien, 1.070 Vitest-Tests, 17,406 s                                                 | Node 89/747, DOM 9/92, Angular 18/231                                      |
| Coverage final                       | global 56,59/49,95/56,02/57,99 %                                                          | Statements/Branches/Functions/Lines                                        |
| Kritische Coverage                   | Profit 100/96,07 %, Tax 99,17/93,81 %, Sellability 100/100 %                              | Statements/Branches                                                        |
| 20er-Stresslauf                      | Seeds 20260830–20260849, je 89 Dateien/747 Node-Tests; 163,469 s gesamt                   | 20/20 grün                                                                 |
| Chromium-Smoke Task 9                | 5/5 in 10,818 s                                                                           | lokaler Standardlauf                                                       |
| Firefox/WebKit                       | nicht lokal ausgeführt                                                                    | Nightly-Konfiguration listet 5 Fälle je Browser; keine Ergebnisbehauptung  |
| Build                                | 13,852 s im Task-9-Hauptlauf; 6,746 s in der letzten reinen Workflow-Fixrunde             | beide lokal grün, unterschiedliche Arbeitsstände/Cachebedingungen          |
| Workflowvertrag final                | 72/72                                                                                     | Stand `7293435`; Task-10-Teilmenge `ci-workflow.test.mjs` zusätzlich 16/16 |
| Datenbank/Docker                     | `docker info`: Server nicht erreichbar                                                    | fehlende `dockerDesktopLinuxEngine`-Pipe; kein DB-Lauf                     |

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

### Fünf geforderte neue PR-Läufe

| Slot | Run-ID / URL | Event | Commit-SHA | Pflichtjobs und Ergebnisse | Start / Ende | Laufzeiten | Runner-Minuten |
| ---: | ------------ | ----- | ---------- | -------------------------- | ------------ | ---------- | -------------- |
|    1 | offen        | offen | offen      | offen                      | offen        | offen      | offen          |
|    2 | offen        | offen | offen      | offen                      | offen        | offen      | offen          |
|    3 | offen        | offen | offen      | offen                      | offen        | offen      | offen          |
|    4 | offen        | offen | offen      | offen                      | offen        | offen      | offen          |
|    5 | offen        | offen | offen      | offen                      | offen        | offen      | offen          |

p95 wird erst nach fünf echten vollständig grünen Läufen aus dem jeweils
langsamsten Pflicht-Gate berechnet. Bei 0/5 gibt es weder Ersatzwert noch
Extrapolation.

## Kontrollierte Fehlernachweise

Alle Mutationen liefen in
`K:\GitHub\Repos\flipbase\.worktrees\teststrategie-ci-task10-mutations`,
detached und exakt auf `7293435b9a2d93f14e36d53aab66d62cddfc2fa9`.
Abhängigkeiten wurden dort mit `npm ci` installiert. Jeder Mutant erhielt einen
eigenen Commit und einen normalen Revert-Commit. Der finale Diff gegen die Basis
war leer; danach wurde nur dieser verifizierte Worktree entfernt.

| Fehler                    | Status      | Mutation / Revert     | Vorgesehene Ebene und dynamisches Ergebnis                                                                                                                                       |
| ------------------------- | ----------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Falscher Steuerfaktor     | **PASS**    | `7660280` / `bde302a` | `tax-engine.service.ts`: Divisor 1,19 → 1,20. Gezielter Node-Tax-Test Exit 1, 2/14 rot; nach Revert 14/14 grün.                                                                  |
| Doppelverkauf Einzelstück | **PASS**    | `6ec3980` / `36084ff` | zentrale Demo-Buchungssperre logisch umgangen. Gezielter `SalesService`-DOM-Test Exit 1, 1/16 rot; nach Revert 16/16 grün.                                                       |
| RLS fremder Workspace     | **BLOCKED** | kein Mutationscommit  | Begrenztes `docker info` fand keinen Docker-Server (`//./pipe/dockerDesktopLinuxEngine` fehlt). Kein Supabase-Start, keine Simulation und kein Produktionsersatz.                |
| Falsche Rücknavigation    | **PASS**    | `6215950` / `74e0d6b` | echter Item-Back-Link auf `/inventory`. Exakter Playwright-Test Exit 1: erwartet `/purchases/pur-demo-2`, erhalten `/inventory`; auch Retry rot. Nach Revert 1/1 grün in 22,9 s. |

Ein erster, nicht gewerteter Navigations-Vorversuch (`6f55adf`) wurde bereits
durch den Angular-Typvertrag vor Playwright blockiert und normal mit `72e3b70`
revertiert. Er ersetzt den gültigen Browsernachweis nicht.

## Deployment-Gate-Negativstatus

`node --test scripts/ci-workflow.test.mjs` lief lokal mit 16/16 Fällen grün.
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
- [x] Steuer-, Doppelverkaufs- und Navigationsmutation auf Ziel-Ebene rot und
      nach Revert grün.
- [x] Lokaler Workflowvertrag einschließlich Negativfixtures grün.
- [x] Rollback-Trigger und selektiver Rückfall dokumentiert.
- [ ] Dynamische Supabase-/RLS-Tests in einem erreichbaren lokalen oder
      ephemeren Stack vollständig grün.
- [ ] Keine Critical/Important Review-Findings offen.
- [ ] Fünf aufeinanderfolgende neue PR-Läufe vollständig grün.
- [ ] p95 des langsamsten Pflicht-Gates aus genau diesen fünf Läufen ≤ 3 min.
- [ ] Runner-Minuten je Produktionslauf höchstens 120 % des dokumentierten
      Budgets aus dem historischen Lauf `33299028439`.
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

1. Vor Merge PR-Run-ID, Jobnamen, Start-/Endzeiten, Ergebnisse, Testzahlen und
   von GitHub gelieferte Runner-Minuten erfassen.
2. Unmittelbar vor Merge UTC-Zeit und Merge-SHA festhalten.
3. Im Push-Lauf Gate-Ende, Image-Ende, Deploy-Start und den ersten bestätigten
   Zeitpunkt `healthz=ok` erfassen.
4. Container-Health, Startseite HTTP 200 und die ausgelieferte
   Commit-Anzeige gegen den Merge-SHA prüfen.
5. Merge-zu-Health-Dauer ohne Warteschlangenzeit-Uminterpretation aus den
   realen Zeitstempeln berechnen und zusammen mit der Run-URL dokumentieren.

## Rollback-Trigger

Rollback wird ausgelöst bei:

- fachlichem Gate-Bypass oder rotem kritischem Nutzerweg;
- Flake-Rate > 5 %;
- PR-p95 > 3 Minuten;
- Runner-Minuten > 120 % des dokumentierten Budgets;
- roter Migration, Datenbank- oder RLS-Prüfung;
- `healthz` nicht `ok`, Startseite nicht HTTP 200 oder ausgeliefertem falschen
  Commit-SHA;
- einer Critical/Important Regression im Release-Scope.

## Rollback-Ablauf

Der historische Rückfallpunkt der alten seriellen Pipeline ist `0768233`.
Es erfolgt **kein** Hard Reset. Vor einem Rückfall wird der CI-/Runner-Umbau im
Commitbereich nach `0768233` inhaltlich abgegrenzt. Ausschließlich diese
Konfigurations-/Runner-Commits werden durch normale Revert-Commits
zurückgenommen. Neue fachliche Regressionstests für Steuer, Verkauf,
Inventarintegrität, RLS und Browserwege bleiben bestehen oder werden vorab
separat erhalten/cherry-picked. Danach laufen erneut Quick-Gates,
Datenbank-Gate und Chromium-Smokes; erst nach grüner Prüfung darf ein erneuter
Rollout erwogen werden.

## Offene Risiken und Bedingungen für ein späteres GO

Offen sind 5/5 neue PR-Läufe, p95, Runner-Minutenbudget, der echte rote
GitHub-Shard, dynamische Supabase-/RLS-Abnahme, Reviewfreigabe, Firefox/WebKit
im echten Nightly und der vollständige Produktionslauf. Ein späteres GO ist
nur möglich, wenn alle sechs offiziellen Abnahmekriterien kumulativ belegt
sind. Bis dahin bleibt die operative Entscheidung unverändert:
**NO-GO für Produktion**.
