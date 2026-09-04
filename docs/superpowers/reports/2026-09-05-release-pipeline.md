# Release-Pipeline: Umsetzung und Prüfstand

## Ausgangspunkt

Zweig: `chore/streamline-release-pipeline`, Basis `b8f0be7` (PR #17).
Der parallel bearbeitete Zweig `feature/deal-monitor-hit-rule` bleibt unberührt.

Gemessener GitHub-Lauf: [33925055214](https://github.com/GrischaTDev/flipbase/actions/runs/33925055214).

| Prüfung            | Bisherige Dauer |
| ------------------ | --------------- |
| Angular            | 4:54            |
| Datenbank          | 3:46            |
| Produktionsimage   | 2:46            |
| Browser            | 2:23            |
| Qualität und Build | 1:50            |
| Node-Gruppen       | 0:38 / 0:44     |
| DOM                | 0:32            |

Die Jobs liefen parallel. Bis zum bekannten Migrationsabbruch dauerte der Lauf ungefähr 5:15 Minuten. Für den neuen Ablauf liegt noch keine GitHub-Laufzeitmessung vor.

## CI-Vereinfachung

- Ein gemeinsames Ergebnis `Required checks` statt drei zusätzlicher Freigaben.
- Reine Dokumentation überspringt Anwendungstests und Veröffentlichung; unbekannte technische Pfade werden weiter geprüft.
- Eine Node-Gruppe, zwei Angular-Gruppen, DOM weiterhin separat.
- Landingpage-Vertrag jetzt ausdrücklich in CI.
- Zeitmessung je Testgruppe in der GitHub-Zusammenfassung.

Gezielte Prüfung: Workflow 29 erfolgreich, ein Windows/POSIX-Skip; Landingpage 13 erfolgreich; Angular-Gruppen zusammen 359 erfolgreich und fünf bestehende Skips; Node 983 und DOM 130 erfolgreich. Formatierung, gezieltes ESLint und actionlint erfolgreich. Unabhängige Task-Prüfung ohne blockierende Befunde.

## Betriebsgrenzen

- Keine Produktionsmigration, Serverinstallation, Veröffentlichung oder Änderung an GitHub-Regeln in dieser Umsetzung.
- Die bestehende Serverinstallation führt Migrationen und Protokolleinträge getrennt aus. Der bisherige Backup-Exitcode bestätigt weder Verschlüsselung noch erfolgreiche Auslagerung zwingend.
- Ein neuer sicherer Serverpfad muss einmalig installiert und aktiviert werden. Die alten 22 ausstehenden Migrationen benötigen eine ausdrückliche Freigabe; sie sind nicht durch die Erstellung der Automatisierung genehmigt.
- Die GitHub-Abfrage des Branchschutzes lieferte HTTP 403 mit Hinweis auf die Tarifbeschränkung. Aktive Regeln konnten nicht verifiziert werden. Falls erforderliche Statusnamen konfiguriert sind, müssen sie auf `Required checks` angepasst werden.

## Abschlussprüfung

`npm run verify` am 05.09.2026: Exitcode 0, ohne Pipe gemessen. Enthalten: Formatierung, ESLint, TypeScript, Workflow-Verträge (29 erfolgreich, vier Windows/POSIX-Skips), Suite-Audit, 1.472 erfolgreiche Anwendungstests (fünf bestehende Skips), 13 Landingpage-Tests und Angular-Produktionsbuild.

Log: `C:/Users/Grisc/AppData/Local/Temp/flipbase-pipeline-verify.log`.

Nach Start dieser Gesamtprüfung wurden noch die Digest-Unterstützung des installierten Compose geprüft und konkrete Deploymentpfade der Datenbank-Testauswahl ergänzt. Diese Änderungen wurden gezielt nachgeprüft: Änderungserkennung 12 Tests, vier Linux-Top-Leveltests einschließlich Transaktions-/Backupfehlern, actionlint und Shellsyntax erfolgreich. Echte Transaktionstests liefen auf PostgreSQL 16 und Supabase-PostgreSQL 17.6.1.158; keine gemeinsame Datenbank wurde verändert. Beide Aufgabenreviews waren ohne blockierende Befunde.

Docker-Build aus `docker/Dockerfile` am Commit `4b03447` erfolgreich. Am daraus gestarteten lokalen Nginx-Container waren Startseite, Healthcheck, vollständige Build-SHA und sämtliche JS-/CSS-Dateien erfolgreich abrufbar. Migrationen lagen außerhalb des Webroots. Dies verwendete die lokale Umgebungskonfiguration, keine Produktionszugangsdaten; es war weder ein GHCR-Push noch ein Produktionsdeployment. Build-Log: `C:/Users/Grisc/AppData/Local/Temp/flipbase-pipeline-image.log`.

Der neue Migrationspfad bleibt standardmäßig deaktiviert und die Freigabeliste leer. Aktivierung und Betriebsbedingungen stehen in [RELEASE-PIPELINE.md](../../../deploy/RELEASE-PIPELINE.md). Keine Freigabe des Altrückstands oder Behauptung eines getesteten Produktions-Restores.

## Abschließendes Ergebnis

Die Gesamt-Codeprüfung fand einen Auswahlfehler bei technischen Dateien, die nach `docs/` umbenannt werden. Er ist in `7793ad9` mit `--no-renames` und einem echten Git-Regressionstest behoben. Die gezielte Nachprüfung bestätigte den Fix ohne weitere wichtige Befunde. Der kosmetische Name `detect-supabase-changes.mjs` bleibt unverändert, um keine unnötige Umbenennung mitzuführen.

Danach vollständiger Abschlusslauf auf `aeba8ed`: `npm run verify` Exit 0, Workflow-Verträge 31 erfolgreich und vier Windows/POSIX-Skips, Anwendung 1.472 erfolgreich und fünf bestehende Skips, Landingpage 13 erfolgreich, Produktionsbuild erfolgreich. Log: `C:/Users/Grisc/AppData/Local/Temp/flipbase-pipeline-final-verify.log`.

Code bereit zur Integration, nicht veröffentlicht. Die eigenen temporären Docker-Testcontainer wurden entfernt; das lokale Testimage wurde behalten. Die Serverdateien und die Produktionsdatenbank sind unverändert. GitHub-Laufzeit und Registry-Push müssen im ersten tatsächlichen CI-Lauf geprüft werden.
