# Schlanke CI für Flipbase

Stand: 2. November 2026. Entwicklung und Freigabe haben unterschiedliche
Prüfumfänge. Lokal zählt ein schneller Nachweis der Änderung; GitHub führt vor
dem Merge die ausgewählten Integrations- und Freigabeprüfungen aus. Historische
Messberichte und Testzahlen sind keine aktuelle Testvorgabe.

## Während der Entwicklung

Den konkreten Fehler oder neuen Ablauf so früh wie sinnvoll prüfen. Vorhandene
passende Modell-, Service- und Komponententests bevorzugen. Ein gezielter
Browsernachweis ist sinnvoll, wenn die tatsächliche Bedienung oder Darstellung
betroffen ist. Nicht nach jeder Korrektur sämtliche Prüfungen wiederholen.
Bestandene Nachweise unveränderter Teile bleiben gültig, solange kein neuer
Fehler oder geänderter gemeinsamer Baustein sie infrage stellt.

Breiten, Hell/Dunkel, Touch und AXE nach dem Risiko auswählen: Eine geänderte
Farbdarstellung braucht beide Farbschemata; eine reine Berechnung keine
zusätzliche Gerätematrix. Gemeinsame UI-Bausteine an repräsentativen betroffenen
Verbrauchern prüfen. Eine vollständige Matrix aller Seiten ist keine lokale
Entwicklungspflicht. WCAG AA und vorhandene Fehlererwartungen bleiben verbindlich.

Dies gilt auch bei direkt geänderten Browserdateien: Bekannte Parameterfamilien
nutzen ausdrücklich registrierte Repräsentanten, während unterschiedliche
Fehleraussagen sowie neue oder unbekannte Titel erhalten bleiben. Ein kleiner
Relist-Fix darf keinen vollständigen Konto-, Profil- oder Nachrichtenrundgang
auslösen. Explizite Typimporte erweitern den Browserumfang nicht.

## Vor dem PR

Der [Vorabcheck in AGENTS.md](../../AGENTS.md#verbindlicher-vorabcheck-für-alle-ki-assistenten)
gilt auch für Entwurfs-PRs und weitere Pushes. Zuerst die eigenen geänderten
Prettier-Dateien gezielt formatieren und den Diff kontrollieren. Mit Node 22
und den gesperrten Projektabhängigkeiten anschließend ausführen:

```bash
npm run preflight:plan
npm run preflight
```

Die benötigten Abhängigkeiten einmal mit `npm ci` herstellen beziehungsweise
nach einer Lockfileänderung erneuern. Vorher `git fetch origin --prune`
ausführen. Der Plan verwendet standardmäßig den gemeinsamen Vorfahren mit
`origin/master`; ein anderes Ziel wird mit `-- --base <ref>` angegeben.
Commits, Index, Arbeitskopie, neue und gelöschte Dateien zählen mit.

`preflight:plan` zeigt den lokalen Entwicklungsumfang und den zusätzlichen
CI-Freigabeumfang. Es führt keine Tests aus. Der Standardaufruf `preflight`
führt nur den lokalen Entwicklungsumfang aus:

- Format, Lint, Typprüfung und Suite-Audit bei technischen Änderungen;
- betroffene Node-, DOM- und Angular-Tests sowie passende Script-Tests;
- den erforderlichen Anwendungsbau einschließlich Angular-Vorlagen.

Bei generischen gemeinsamen Controls prüft der lokale Lauf deren eigene
Unitverträge; die CI ergänzt alle abhängigen Komponenten. Datenbankfreie
UI-Fixtures sind ausdrücklich registriert und behalten ihre eigenen gemockten
Antworten. Echte Backendprüfungen behalten Anmeldung und Datenbank.

Für reine Dokumentations- und Regeländerungen entfallen Anwendungstests und
Anwendungsbau. Format und Lint müssen vor jedem PR erfolgreich nachgewiesen
sein; fehlt einer dieser Befehle im ausgeführten Plan, ihn gesondert mit
`npm run format:check` beziehungsweise `npm run lint` ausführen. Identische
erfolgreiche Befehle auf unverändertem Stand nicht doppelt starten.

Datenbank-, vollständige Workflow-, Anwendungsbrowser-, PWA- und
Marketplace-Imageprüfungen werden nach Auswahl in CI nachgewiesen. Native
Anbieter-/Erweiterungsbrowser können für eine gezielte lokale Diagnose mit
`npm run preflight -- --native` hinzugenommen werden. Diese Zusatzprüfung ist
keine pauschale Voraussetzung für jeden PR.

Ein erfolgreicher lokaler Entwicklungscheck bleibt erfolgreich, wenn geplante
CI-Bereiche dort nicht ausgeführt werden. Er bestätigt ausschließlich seinen
tatsächlichen Umfang. Fehlende Werkzeuge oder Fehler einer ausgewählten lokalen
Prüfung sind dagegen ein unvollständiger beziehungsweise fehlgeschlagener
Entwicklungsnachweis. Lokal ausgeführte Befehle, Ergebnisse und ausstehende
CI-Nachweise getrennt im PR nennen.

## Was GitHub vor dem Merge prüft

Die Auswahl folgt den geänderten Dateien und ihren tatsächlichen Abhängigkeiten.
Die [Auswahldokumentation](affected-test-selection.md) beschreibt die Grenzen.

| Bereich                                | Auswahl                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Dokumentation                          | Formatprüfung; kein Anwendungsbau und keine Anwendungstests                                                                   |
| Qualität                               | Format, Lint, Typen und Suite-Audit bei technischen Änderungen                                                                |
| Workflowverträge                       | Bei Änderungen an Scripts, Workflows, Deployment, Konfiguration oder Lockfiles                                                |
| Anwendung                              | Betroffene Node-, DOM- und Angular-Tests; konservativ breite schnelle Auswahl bei gemeinsamen oder unbekannten Abhängigkeiten |
| Anwendungsbau                          | Bei anwendungsrelevanten Änderungen einschließlich Angular-Vorlagen                                                           |
| Browser                                | Betroffene Fachabläufe beziehungsweise kleiner allgemeiner Kern bei breiten Änderungen; repräsentative Varianten              |
| Produktions-PWA                        | Eigener Pflichtjob bei betroffenen Service-Worker-, Offline-, Update-, Installations- oder Push-Abhängigkeiten                |
| Datenbank                              | Rechte, Migrationen, pgTAP und Nebenläufigkeit bei passenden Schema-/Werkzeugänderungen                                       |
| Dienste                                | Betroffene Marketplace-, Push-, Sniper- und Landingprüfungen                                                                  |
| Native Anbieterbrowser und Erweiterung | Bestehende synthetische Anbieter- und MV3-Prüfungen nach Bereich und Imports                                                  |
| Marketplace-Images                     | Betroffene echte Images einschließlich Isolation und Veröffentlichungsgrenzen                                                 |

Anmeldung, Kontentrennung, Rechte, Datenintegrität, Migrationen, Originalbilder
und Anbieter-Schreibwege behalten ihre einschlägigen Pflichtfälle. Breite
Browserregression ist daraus nicht für jeden PR abzuleiten. Neue Tests nur für
konkrete Fehler oder wichtige bislang ungesicherte Risiken ergänzen.

Alle ausgewählten Pflichtjobs müssen vor dem Merge erfolgreich sein. Der
Sammelcheck akzeptiert keine Fehler, Abbrüche oder unerwartet ausgelassenen
Pflichtjobs. Eine erzwungene Merge-Sperre durch Branch Protection wird für
GitHub Free im privaten Repository nicht vorausgesetzt; die Jobabhängigkeiten
verhindern die automatische Veröffentlichung nach fehlgeschlagenen Prüfungen.

## Ausdrücklicher vollständiger Nachbau und Voraussetzungen

Für Diagnose oder einen ausdrücklich gewünschten vollständigen lokalen
Nachbau gibt es:

```bash
npm run preflight:plan -- --ci
npm run preflight -- --ci
```

`--full` ist ein Alias für `--ci`. Diese Optionen führen den vollständigen
ausgewählten Plan aus, heben aber keine Hostgrenzen auf. Ein unvollständiger
Gesamtlauf darf nicht als bestandene vollständige CI ausgegeben werden.

Nur die tatsächlich gewählten Prüfungen benötigen ihre weiteren Werkzeuge:
Actionlint 1.7.12 für die Workflowprüfung, Docker und PowerShell für entsprechende
Integrationsfixtures, Deno 2.9.7 für betroffene Edge-Funktionen und die zu den
Lockfiles passenden Playwright-Browser. Native Workerbrowser verwenden ihre
eigenen gesperrten Worker-Abhängigkeiten. Die CI stellt diese Voraussetzungen
auf `ubuntu-24.04` bereit. Ein zusätzlicher Linux-Lauf auf dem Entwicklerrechner
ist nur bei konkreten Plattform- oder Ressourcenfragen erforderlich.

Ausgewählte Datenbank- und Anwendungsbrowserprüfungen brauchen eine aktuelle
isolierte lokale Supabase. Der vollständige Vorabcheck prüft ihre gespeicherte
Migrationshistorie und den angewandten Inhalt neuer Migrationen. Ein Start
allein aktualisiert eine vorhandene Datenbank nicht. Fehlende, fremde oder
abweichende Migrationen machen diese Integrationsprüfung unvollständig. Keine
fremde Entwicklungsdatenbank dafür zurücksetzen oder ihre Historie reparieren.
Der Inhaltsvergleich berücksichtigt die `statements text[]`-Form der gesperrten
Supabase-CLI; nicht sicher unterstützte SQL-Lexik wird nicht als geprüft gewertet.

Marketplace-Image- und Hostprüfungen laufen ausschließlich auf dem wegwerfbaren,
von GitHub gehosteten Linux-Runner des Imageworkflows. Sie verändern unter
anderem Firewall und systemd und verwenden exklusive Container-Fixtures.
Normaler Entwicklerhost und selbst gehosteter Runner sind dafür ausgeschlossen.
Der vollständige lokale Nachbau bricht bei ausgewähltem Imagebereich deshalb
vor dessen Befehlen als unvollständig ab. Der normale Entwicklungscheck zeigt
diesen Bereich als ausstehenden CI-Nachweis an und führt seine lokalen Prüfungen
weiter aus.

Die Hostgrenze verlangt `GITHUB_ACTIONS=true`,
`RUNNER_ENVIRONMENT=github-hosted`, `RUNNER_OS=Linux`, ein absolutes
`RUNNER_TEMP` und das tatsächliche Linux-Betriebssystem. `CI=true` genügt nicht;
es gibt keine lokale Freischaltung. Auch direkte Image- und Shellaufrufe prüfen
die Grenze vor Imagebau, Docker, sudo und Cleanup. Beide Imagejobs bleiben auf
`ubuntu-24.04`. Das schützt vor versehentlichen Aufrufen im falschen Kontext,
nicht vor absichtlich gefälschten Prozessumgebungen.

## Fehler, Veröffentlichung und bewusste Gesamtprüfung

Browserfehler behalten Screenshots und Fehler-Traces. Keine allgemeinen neuen
Retries einführen. Fehlgeschlagene Fälle zuerst anhand ihrer Aufzeichnungen
gezielt untersuchen. Unveränderte Wiederholungen brauchen einen konkreten
Infrastrukturverdacht und beschränken sich möglichst auf fehlgeschlagene Jobs.
Keine Testbedingung lockern, um einen grünen Lauf zu erhalten.

Die CI speichert außerdem einen kleinen JSON-Zeitbericht je Browsergruppe für
drei Tage und nennt die langsamsten Fälle in der Laufzusammenfassung. Erfolgreiche
Browserläufe bleiben dadurch nachmessbar; zusätzliche Testvarianten entstehen
daraus nicht. Der Auswahljob installiert ausschließlich den exakt aus dem
Projekt-Lockfile abgeleiteten TypeScript-Parser, ohne Anwendungshooks. Web- und
Sniper-Image verwenden getrennte Docker-Caches. Produktionsbau, Image-Smoke,
Digestbindung und Veröffentlichungsrechte bleiben unverändert.

Nach dem Merge dürfen erfolgreiche PR-Prüfungen nur für denselben Git-Dateibaum
und den passenden gebundenen Prüfumfang wiederverwendet werden. Fehlt dieser
Nachweis, führt CI den ausgewählten Umfang erneut aus. Produktionsbau,
Image-Smoke, Backup, sichere Migrationen und öffentliche Versionsprüfung bleiben
vor beziehungsweise nach Deployment aktiv.

`marketplace-worker-image.yml` hat ausschließlich Leserechte. Der separate
Publisher `marketplace-image-publish.yml` darf nur auf `master` veröffentlichen;
CI ruft ihn bei passenden Änderungen nach den erforderlichen Prüfungen und dem
gegebenenfalls nötigen Webdeployment auf. Der manuelle Einstieg bleibt erhalten.
Extension, native Workerbrowser und Images werden vor Registryanmeldung und
Push geprüft; Schreibrechte erreichen den PR-Aufrufer nicht.

Vor einem Beta-Meilenstein eine breite Regression bewusst starten. Dafür sind
`npm run verify` und der vollständige Browserlauf mit
`npm run test:e2e:nightly -- --project=chromium` beziehungsweise „Optional quality
checks“ verfügbar. `verify` allein ersetzt keine Browser-, Docker- oder
Dienstprüfung. Der historisch benannte Workflow `quality-nightly.yml` wird
ausschließlich manuell gestartet; es gibt keine täglichen oder wöchentlichen
Volltests. Die tatsächliche Ersparnis an regulären PR-Laufzeiten messen, nicht
aus Test- oder Jobzahlen versprechen.
