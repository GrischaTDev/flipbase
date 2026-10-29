# Schlanke CI für Flipbase

Stand: 29. Oktober 2026. Diese Seite beschreibt den geltenden Ablauf. Historische
Messberichte und frühere Zahlen sind keine aktuelle Testvorgabe.

## Vor dem PR

Für alle KI-Assistenten gilt der
[verbindliche Vorabcheck in AGENTS.md](../../AGENTS.md#verbindlicher-vorabcheck-für-alle-ki-assistenten).
Die KI formatiert die eigenen geänderten Dateien zuerst gezielt mit Prettier
`--write`, führt beide folgenden Preflight-Befehle selbst aus und weist außerdem
`npm run format:check` und `npm run lint` nach. Bereits erfolgreich im Preflight
ausgeführte identische Befehle müssen auf unverändertem Stand nicht wiederholt
werden. Bei reinen Dokumentationsänderungen oder wenn einer dieser Befehle noch
nicht erfolgreich ausgeführt wurde, die fehlenden Prüfungen gesondert ausführen.
Nach Korrekturen zählt der endgültige Stand.

```bash
npm ci
npm run preflight:plan
npm run preflight
```

Der Plan verwendet standardmäßig den gemeinsamen Vorfahren mit `origin/master`.
Vorher den Zielzweig mit `git fetch origin --prune` aktualisieren. Ein anderer
Zielzweig lässt sich mit `-- --base <ref>` angeben. Commits, Index,
Arbeitskopie, Löschungen und neue nicht ignorierte Dateien fließen in die Auswahl
ein. Git-Konflikte oder eine nicht auflösbare Basis beenden den Vorabcheck.

`preflight:plan` führt keine Tests aus. Der eigentliche Vorabcheck prüft zuerst
die Ausführungsgrenze für ausgewählte Marketplace-Images, danach seine benötigten
Werkzeuge. Fehlende Voraussetzungen sind Fehler.
Ein ausgelassener Pflichtbereich wird nicht als erfolgreich gewertet.
`scripts/preflight.mjs` liefert auch die GitHub-Jobauswahl;
`scripts/ci-checks.mjs`, `run-affected-tests.mjs` und
`run-marketplace-checks.mjs` enthalten die gemeinsamen Ausführungsbefehle.

### Lokale Voraussetzungen

- Node 22 und die gesperrten Root-Abhängigkeiten aus `npm ci`.
- Actionlint 1.7.12 für technische Änderungen. Ein abweichender Installationspfad
  kann über `ACTIONLINT_BIN` angegeben werden. Die CI prüft den Download gegen
  die im Workflow festgelegte SHA-256-Prüfsumme.
- Eine erreichbare Docker-Engine für die vorhandenen Deploymenttests im
  Qualitätsjob sowie für ausgewählte Datenbank-, Push- und Sniper-Imageprüfungen.
- Deno 2.9.7, wenn Marketplace- oder Push-Funktionen ausgewählt sind.
- PowerShell (`pwsh`) für die bestehende Inventory-Fixture im Qualitätsjob.
- Für Anwendungsbrowser- und Datenbanktests eine bereits laufende lokale
  Supabase (`npm run supabase:start`) mit nachgewiesenem Migrationsstand. Ein
  Start allein wendet neue Dateien auf eine bereits laufende Datenbank nicht
  zwingend an. Vor den Tests liest der Vorabcheck ausschließlich die Historie
  im festen lokalen Container `supabase_db_flipbase-supabase`: Alle lokalen
  Migrationsversionen müssen vorhanden sein, fremde Versionen sind unzulässig.
  Für gegenüber dem Merge-Base neue Migrationen muss außerdem der gespeicherte
  angewandte SQL-Inhalt mit der aktuellen Datei übereinstimmen. Fehlender,
  unbekannter oder abweichender Inhalt bricht als **unvollständig** ab.
  Die lokale Datenbank dann bewusst mit den geprüften Branchmigrationen
  aktualisieren; ein bloßes Reparieren der Historienversionen ist kein
  Ausführungsnachweis. Der Vorabcheck setzt eine vorhandene Entwicklungsdatenbank
  nicht zurück und hält sie nicht an.
- Die zu den Lockfiles passenden Browser für ausgewählte Browserprüfungen.
  Für die Anwendung: `npx playwright install --with-deps chromium webkit`.
  Native Workerfälle benötigen zusätzlich die eigene gesperrte Worker-Version:
  `npm ci --prefix services/marketplace-worker --ignore-scripts` und anschließend
  im Verzeichnis `services/marketplace-worker` den Befehl
  `npx playwright install --with-deps chromium` ausführen.

Marketplace-Image- und Hostprüfungen laufen ausschließlich auf dem wegwerfbaren,
von GitHub gehosteten Linux-Runner des Marketplace-Imageworkflows. Sie richten
unter anderem Firewall und systemd auf dem Host ein und verwenden exklusive
Container-Fixtures. Ein normaler Entwicklerhost oder selbst gehosteter Runner
ist dafür nicht geeignet. Sobald dieser Pflichtbereich ausgewählt ist, bricht
`npm run preflight` deshalb **vor den Ausführungsbefehlen als unvollständig** ab.
Auch der direkte Image-Runner und das Shellskript prüfen diese Grenze vor
Imagebau, Docker, sudo und Cleanup. Die Planansicht bleibt lokal nutzbar und
zeigt die erforderlichen Images weiterhin an; die CI muss deren vollständigen
Nachweis liefern. Extension- und native Worker-Browserbefehle bleiben lokal
nutzbar. Es gibt keine lokale Opt-in-Variable zum Freischalten der Hostprüfungen.

Die Grenze prüft die von GitHub gesetzten Werte `GITHUB_ACTIONS=true`,
`RUNNER_ENVIRONMENT=github-hosted`, `RUNNER_OS=Linux`, ein absolutes `RUNNER_TEMP`
und das tatsächliche Linux-Betriebssystem. `CI=true` genügt ausdrücklich nicht.
Das folgt den offiziellen [Runner-Variablen](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)
und der [GitHub-Runnerbeschreibung](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners);
beide Imagejobs bleiben auf `ubuntu-24.04` festgelegt. Diese Prüfung schützt vor
versehentlichen Aufrufen im falschen Kontext; sie ist keine Attestierung gegen
absichtlich gefälschte Prozessumgebungen.

Die CI läuft auf `ubuntu-24.04`. Der lokale Vorabcheck setzt `CI=true`, damit
Browserparallelität und Vorschauen den PR-Einstellungen entsprechen. Ein Lauf
auf einem anderen Betriebssystem ersetzt bei plattformabhängigen Fehlern keinen
Linux-Nachweis. Browserprüfungen verwenden die vorhandene lokale Supabase-Grenze;
Marketplace-Prüfungen arbeiten mit lokalen Testmasken. Der Qualitätsjob entfernt
geerbte `PG*`-Verbindungsvariablen, damit die Release-Datenbankfixture ausschließlich
in ihrer isolierten PostgreSQL-Gruppe aktiv wird.

Der lokale Inhaltsvergleich folgt der gespeicherten `statements text[]`-Form
von Supabase CLI 2.114.0: Er erhält Kommentare, Reihenfolge und innere Leerzeichen;
nur äußere Leerzeichen und echte Statement-Endsemikolons entfallen.
Dollarstrings, Anführungszeichen und verschachtelte Kommentare werden berücksichtigt.
Nicht sicher unterstützte Lexik (etwa Escape-Strings oder `BEGIN ATOMIC`) führt
konservativ zu **unvollständig**. Das ist ein begrenzter Migrationsnachweis, kein
allgemeiner Abgleich nachträglicher manueller DDL-Änderungen. Die vorhandenen
Release-Werkzeuge speichern selbst keinen SQL-Inhalt und ersetzen diesen lokalen
CLI-Nachweis daher nicht.
Der Vertrag wurde anhand der offiziellen Quellen
[SQL-Aufteilung](https://github.com/supabase/cli/blob/v2.114.0/apps/cli/src/legacy/shared/legacy-sql-split.ts),
[Migrationsanwendung](https://github.com/supabase/cli/blob/v2.114.0/apps/cli/src/legacy/shared/legacy-migration-apply.ts)
und [Historie](https://github.com/supabase/cli/blob/v2.114.0/apps/cli/src/legacy/shared/legacy-migration-history.ts)
geprüft.

## Was automatisch läuft

| Bereich              | Auswahl                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Dokumentation        | Ausschließlich Markdown-Formatierung bei reinen Dokumentationsänderungen                                            |
| Qualität             | Format, Lint, Typprüfung, Workflowverträge, Suite-Audit und Actionlint bei technischen Änderungen                   |
| Anwendung            | Betroffene Node-, DOM- und Angular-Dateien; bei globalen oder unsicher zuordenbaren Änderungen alle Anwendungstests |
| Anwendungsbau        | Bei anwendungsrelevanten technischen Änderungen im PR, einschließlich Angular-Vorlagen                              |
| Browser              | Betroffene Fachfälle; bei breiten Änderungen zusätzlich fester Kern und gemeinsame Layoutprüfung                    |
| Produktions-PWA      | Eigener Job bei betroffenen Service-Worker-, Offline-, Update-, Installations- oder Push-Abhängigkeiten             |
| Datenbank            | pgTAP, Rechte, Migrationen und Nebenläufigkeit bei passenden Schema-/Werkzeugänderungen                             |
| Dienste              | Betroffene Marketplace-, Push- und Sniper-Prüfungen                                                                 |
| Erweiterung          | Ein eigener Job mit beiden vorhandenen Kleinanzeigen-Browserprüfungen                                               |
| Native Workerbrowser | Aus lokalen Imports abgeleitete bestehende Testdateien                                                              |
| Marketplace-Images   | Ein wiederverwendbarer Workflow; Sessionbau und Import-Smoke werden gemeinsam genutzt                               |

Die [Auswahldokumentation](affected-test-selection.md) erläutert konservative
Rückfälle, Dateiüberschneidungen und vollständige geänderte Browserdateien.

Die Marketplace-Veröffentlichung liegt separat in
`marketplace-image-publish.yml` und läuft ausschließlich auf `master`. Nach
erfolgreichen Pflichtprüfungen und dem gegebenenfalls nötigen Webdeployment ruft
CI sie bei passenden Imageänderungen automatisch auf; der manuelle Einstieg
bleibt verfügbar. Sie prüft
Extension, native Workerbrowser und Images vor Registryanmeldung und Push im selben
Job. Der von PRs aufgerufene Imageprüfworkflow enthält keine Jobs mit Schreibrechten;
seine gesamte Deklaration bleibt mit den Leserechten des Aufrufers vereinbar.
Nur der auf `push`/`master` begrenzte Release-Aufrufer erhält die eigenen
Registry-Schreibrechte. Das Serverdeployment verwendet den gesonderten,
auf `master` eingeschränkten Zugang aus
[`MARKETPLACE-ACCESS.md`](../../deploy/MARKETPLACE-ACCESS.md).

## Umfang bewusst begrenzen

Der feste Browserkern enthält 20 zentrale Fälle, unter anderem Anmeldung,
Zugriffsgrenzen, Einkauf, Einzelverkauf, Steuern, Dokumente, Import und sichere
Veröffentlichung. Die breite gemeinsame Layoutauswahl ergänzt derzeit 186 Fälle.
Eine reine globale Änderung ohne zusätzliche Fachzuordnung wählt damit 206 Fälle.
Fachänderungen können weitere Fälle erfordern; 206 ist keine Obergrenze.

Unabhängige Verwaltungs- und Einstellungsseiten werden einzeln geprüft. Die
bisherigen zehn Sammeltests enthielten bereits dieselben 150 Seiten- und
Breitenkombinationen, teilten aber jeweils ein einziges Zeitbudget. Jetzt benennt
jeder Fehler seine konkrete Seite und Breite; Zeitlimits, Hell/Dunkel, AXE und
zustandsabhängige Abläufe bleiben erhalten. Die frühere Angabe von 66 Fällen
zählte diese Sammeltests und ist deshalb nicht direkt mit der neuen Fallzahl
vergleichbar. Eine Testanzahl allein belegt keine Laufzeitersparnis.
Umfassende Layoutauswahlen mit mehreren Dateien verteilen sich auf zwei Jobs;
das Zeitlimit von 30 Minuten je Job bleibt unverändert.

Für kleine Featureänderungen wird dieser Kern nicht pauschal hinzugefügt.
Bekannte mehrfach parametrisierte Layoutfamilien verwenden im gezielten Lauf
repräsentative Telefon-/Desktopgrößen und beide Farbschemata. Besondere Fehler-,
Fokus-, Bedienungs- und Berechtigungsfälle bleiben erhalten. Direkt geänderte
Browserdateien laufen mit sämtlichen Varianten. Die vollständigen Tests bleiben
im Repository für gezielte Diagnose und manuelle Regression vorhanden.

Schnelle fachliche Unit-Tests werden nicht nach einer Zielanzahl gelöscht.
Entfernt sind der doppelte Prettier-Test der Verkaufserfassung und der
JavaScript-Nachbau einer SQL-UUID-Prüfung. Die Lieferantenfälle werden in der
bestehenden echten Datenbankprüfung abgesichert, einschließlich unvollständiger
und überlanger Kennungen. Formatierung bleibt Aufgabe des Qualitätsjobs.

## Diagnose und Freigabe

Browserfehler behalten Screenshots und Fehler-Traces. Es gibt keine zusätzlichen
allgemeinen Retries. Ein Fehler bleibt ein Fehler; erneute Läufe brauchen einen
konkreten Grund. Die Auswahltests kontrollieren mit Playwrights echter Auflistung,
dass erforderliche Gruppen nicht leer sind und Fälle eindeutig zugeordnet bleiben.
Eine Auflistung bestätigt die Auswahl, nicht das Browserverhalten.

GitHub Free im später privaten Repository wird nicht als technische Merge-Sperre
behandelt. Branch Protection und Rulesets sind keine Voraussetzung dieses Ablaufs.
Der Sammelcheck zeigt den Gesamtstatus; die bestehenden Jobabhängigkeiten und
Ergebnisprüfungen blockieren die automatische Veröffentlichung bei Fehlern.
Vor einem manuellen Merge müssen alle ausgewählten Prüfungen erfolgreich sein.

Nach dem Merge dürfen erfolgreiche PR-Prüfungen nur für denselben Git-Dateibaum
und denselben gebundenen Prüfumfang wiederverwendet werden. Der Nachweis umfasst
jetzt zusätzlich Extension-, native Workerbrowser- und Imageauswahl.
Fehlt ein passender Nachweis, führt CI die Prüfungen erneut aus.

## Manuelle zusätzliche Prüfung

`npm run verify` bleibt für breite Integrationen verfügbar, ersetzt aber nicht
alle Docker-, Browser- und Dienstprüfungen des Vorabchecks. Die vollständige
Browserregression läuft über `npm run test:e2e:nightly -- --project=chromium`
oder „Optional quality checks“. Der historisch benannte Workflow
`quality-nightly.yml` wird ausschließlich manuell gestartet.

Es gibt keine neuen täglichen oder wöchentlichen Volltests. Die tatsächliche
Laufzeitersparnis wird anhand regulärer PRs beurteilt. Fallzahlen und einzelne
lokale Messungen sind kein Nachweis einer bestimmten CI-Laufzeit.
