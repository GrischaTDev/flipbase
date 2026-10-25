# Bereinigung der lokalen Flipbase-Arbeitsstände

Stand: 25.10.2026. Juna. Ausdrücklicher Nutzerauftrag: offene lokale Arbeiten prüfen und nicht mehr benötigte Reste entfernen. Maßgeblicher veröffentlichter Hauptzweig: `ec0241602563555a9245914eed5fd0e8335488db`.

## Ergebnis

- Den lokalen Hauptzweig um 125 bereits veröffentlichte Commits auf GitHub-Stand vorgezogen. Keine alten Anwendungsänderungen in den Hauptzweig integriert.
- Elf zusätzliche Arbeitskopien, 22 lokale Altzweige und 20 alte GitHub-Zweige ohne offenen PR nach Sicherung entfernt.
- Vier alte Git-Zwischenablagen separat archiviert und aus der aktiven Liste entfernt. Die nur für die Übertragung der Dokumentation erzeugte zusätzliche Zwischenablage ebenfalls entfernt.
- 32 bisher nur lokale Berichte und sieben einzelne Berichte aus alten Zweigen erhalten. Den Bericht zur Browserdienst-Wiederherstellung um den dokumentierten Abschluss ergänzt. Beim Updatebericht die bereits neuere veröffentlichte Fassung beibehalten.
- Bisher nur lokal protokollierte Sitzungen im [Recherchearchiv](../AI-CHANGELOG-research-archive-2026-10-25.md) erhalten. Das aktuelle Hauptprotokoll bleibt bestehen.
- Alle Dokumentationsänderungen auf einem lokalen Zweig `juna/workspace-cleanup` gesammelt. Die eigentliche Anwendung bleibt auf dem veröffentlichten Hauptzweigstand. Kein neuer PR, keine Veröffentlichung und kein Produktionszugriff im Rahmen der Bereinigung.

## Was noch offen ist

1. [PR #387](https://github.com/GrischaTDev/flipbase/pull/387) und [PR #386](https://github.com/GrischaTDev/flipbase/pull/386): offene Dependabot-Aktualisierungen der GitHub-Aktionen. Diese Zweige bleiben bestehen. Keine Freigabe oder fachliche Prüfung dieser Updates durch die Bereinigung.
2. Ein unveröffentlichter DPD-Tracking-Entwurf vom alten Zweig `feature/dpd-integration` lag in der vierten Zwischenablage. Der aktuelle Hauptzweig enthält diese DPD-Service-/Webhookdateien nicht. Das ist ein tatsächlich nicht übernommener Altentwurf, keine nachgewiesen erledigte Funktion. Er ist vollständig im Sicherungsbundle unter `refs/juna-cleanup-20261025/stash-3` sowie als Patch erhalten. Ob die Funktion noch gewünscht ist, bleibt eine Produktentscheidung; kein automatischer Merge.
3. Die ursprünglich angesprochene zusätzliche Karte um Flipbase-Entwürfe wurde nur untersucht. Ihre Korrektur und eine mögliche zusätzliche Kopierfunktion für Vinted-Entwürfe sind nicht umgesetzt.
4. Die gesammelte Dokumentation benötigt noch den regulären PR-Abschluss. Die Rechercheberichte behalten ihren damaligen Aussage- und Prüfungsstand; daraus wird keine neue Funktionsfreigabe abgeleitet.

Dieser Bericht bewertet die Git-Arbeitsstände. Er ersetzt keine vollständige neue Abnahme aller früheren Produktpläne oder der Produktion.

## Abgleich der alten Codearbeiten

- Demo-Entfernung und Ausgabenverwaltung wurden später über PR #119, #125, #131 und #132 umgesetzt beziehungsweise überarbeitet. Die 117 ungesicherten Dateien im alten Arbeitsverzeichnis werden deshalb nicht als aktuelle Umsetzung übernommen. Unterschiede sind vollständig archiviert.
- Die zehn lokalen Änderungen im alten Vinted-Arbeitsverzeichnis betreffen neun Dateien zu Navigation/Header sowie einen nicht erfassten Browserfall. Navigation und Header wurden über PR #362 überarbeitet; der Browserfall ist inzwischen im Hauptzweig vorhanden. Die frühere Entwurfsveröffentlichung ist mit PR #363 integriert und später weiterentwickelt worden.
- Der alte Browser-Wiederherstellungszweig ist nicht identisch im Hauptzweig enthalten. Der Hauptzweig besitzt die spätere Lösung `3f0aa0bb` mit separatem `collector-watchdog.ts`. Alte Wiederherstellungslogik wurde nicht zusätzlich eingespielt.
- Alte Varianten der Artikelauswahl, Einkaufserfassung, Kontoeinstellungen und gemeinsamen Oberfläche wurden archiviert. Die PR-Historie enthält geschlossene Alternativen und spätere Integrationen, etwa #58/#59 gegenüber den heutigen Komponenten, #263 gegenüber #262 und den per Squash integrierten #270. Ein fehlender Git-Vorfahre beweist allein weder eine offene Funktion noch die Gleichheit aller Codeänderungen.
- Der alte Sniper-Sicherungszweig hat fünf bereits inhaltlich enthaltene Patches. Andere abweichende Altstände werden ausdrücklich als archivierte Alternativen ausgewiesen; ihre vollständige Gleichheit mit dem aktuellen Code wird nicht behauptet.

## Entfernte Arbeitskopien

Die Änderungszahl umfasst mit `--untracked-files=all` auch einzelne Dateien in bisher nicht erfassten Verzeichnissen. Deshalb sind beim alten Statusaudit zwölf Dateien statt der zuvor verkürzt angezeigten sieben Einträge aufgeführt.

| Arbeitsverzeichnis                                                        | Lokale Änderungen vorher | Sicherung                                                                                                 |
| ------------------------------------------------------------------------- | -----------------------: | --------------------------------------------------------------------------------------------------------- |
| `C:/Users/Grisc/.codex/worktrees/kleinanzeigen-dialog-surface/flipbase`   |                        0 | ZIP, Dateikopien und Git-Patches unter `tmp\workspace-cleanup-20261025\01-kleinanzeigen-dialog-surface`   |
| `C:/Users/Grisc/.codex/worktrees/marketplace-live-feedback-plan/flipbase` |                        0 | ZIP, Dateikopien und Git-Patches unter `tmp\workspace-cleanup-20261025\02-marketplace-live-feedback-plan` |
| `C:/Users/Grisc/.codex/worktrees/reliable-app-updates/flipbase`           |                        0 | ZIP, Dateikopien und Git-Patches unter `tmp\workspace-cleanup-20261025\03-reliable-app-updates`           |
| `C:/Users/Grisc/.codex/worktrees/vinted-listing-plan/flipbase`            |                       10 | ZIP, Dateikopien und Git-Patches unter `tmp\workspace-cleanup-20261025\04-vinted-listing-plan`            |
| `C:/Users/Grisc/.codex/worktrees/vinted-listing-review-flow/flipbase`     |                        0 | ZIP, Dateikopien und Git-Patches unter `tmp\workspace-cleanup-20261025\05-vinted-listing-review-flow`     |
| `C:/Users/Grisc/.codex/worktrees/vinted-listing-usability/flipbase`       |                        0 | ZIP, Dateikopien und Git-Patches unter `tmp\workspace-cleanup-20261025\06-vinted-listing-usability`       |
| `K:/GitHub/Repos/flipbase/.worktrees/listing-studio-listings`             |                        0 | ZIP, Dateikopien und Git-Patches unter `tmp\workspace-cleanup-20261025\07-listing-studio-listings`        |
| `K:/GitHub/Repos/flipbase/.worktrees/remove-demo-code`                    |                      117 | ZIP, Dateikopien und Git-Patches unter `tmp\workspace-cleanup-20261025\08-remove-demo-code`               |
| `K:/GitHub/Repos/flipbase/.worktrees/status-analysis-2026-09-12`          |                        1 | ZIP, Dateikopien und Git-Patches unter `tmp\workspace-cleanup-20261025\09-status-analysis-2026-09-12`     |
| `K:/GitHub/Repos/flipbase/.worktrees/status-audit-2026-09-19`             |                       12 | ZIP, Dateikopien und Git-Patches unter `tmp\workspace-cleanup-20261025\10-status-audit-2026-09-19`        |
| `K:/GitHub/Repos/flipbase/.worktrees/vinted-bot-resilience`               |                        0 | ZIP, Dateikopien und Git-Patches unter `tmp\workspace-cleanup-20261025\11-vinted-bot-resilience`          |

Die App kann nur die dem aktuellen Chat zugeordneten Arbeitskopien archivieren. Bei diesen älteren Kopien wurde deshalb nach einer eigenen ZIP-/Git-Sicherung über Git bereinigt. Vorher wurden laufende Prozesse, eingebettete Git-Projekte und Submodule geprüft; keine betroffene Nutzung oder eingebettetes Projekt festgestellt. Ein Windows-Abbruch wegen langer Dateipfade wurde über lange Pfade und die geprüften absoluten Ziele aufgelöst.

## Entfernte Zweige

Die Löschung der GitHub-Zweige wurde atomar mit dem zuvor geprüften Commit jedes einzelnen Zweigs abgesichert. Bei einer zwischenzeitlichen Änderung hätte Git die gesamte serverseitige Bereinigung abgelehnt. Zweige mit offenem PR bleiben ausgenommen.

| Zweig                                               | Gesicherter Commit | Einordnung                                                                |
| --------------------------------------------------- | ------------------ | ------------------------------------------------------------------------- |
| `backup/sniper-vor-rebase`                          | `8c5c0a2d`         | Alle fünf Patches inhaltlich bereits enthalten                            |
| `chore/remove-demo-code`                            | `f73c3e4c`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `codex/plan-purchase-table-closeout`                | `41158e97`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `codex/status-analysis-2026-09-12`                  | `b413c44a`         | Commitstand bereits im Hauptzweig enthalten                               |
| `codex/status-audit-2026-09-19`                     | `faf3dc37`         | Commitstand bereits im Hauptzweig enthalten                               |
| `feat/item-picker-and-image-preview`                | `35867170`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `feat/listing-studio-listings`                      | `ce2b83d1`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `feat/purchase-name-and-column-order`               | `20551936`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `feature/purchase-costing-foundation`               | `1d3931d4`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `juna/beta-purchase-product-followup`               | `204a387f`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `juna/brand-selection-and-logo`                     | `b57a2360`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `juna/data-audit-retention`                         | `132a54e5`         | Fehlenden Bericht übernommen; restlichen Altstand archiviert              |
| `juna/ebay-account-isolation`                       | `7f814233`         | Fehlenden Bericht übernommen; restlichen Altstand archiviert              |
| `juna/kleinanzeigen-transfer-rollout`               | `0dc11d07`         | Fehlenden Bericht übernommen; restlichen Altstand archiviert              |
| `juna/marketplace-hub-planning`                     | `a773a5a9`         | Commitstand bereits im Hauptzweig enthalten                               |
| `juna/marketplace-live-feedback-plan`               | `b8776c4e`         | Fehlenden Bericht übernommen; restlichen Altstand archiviert              |
| `juna/sidebar-redesign-mockup`                      | `59b2b250`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `juna/vinted-age-cloud-rollout`                     | `8d5a8592`         | Fehlenden Bericht übernommen; restlichen Altstand archiviert              |
| `juna/vinted-bot-resilience`                        | `7c7e07f2`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `juna/vinted-chat-cloud-rollout`                    | `1a56825d`         | Fehlenden Bericht übernommen; restlichen Altstand archiviert              |
| `juna/vinted-chat-history-repair`                   | `787a782b`         | Fehlenden Bericht übernommen; restlichen Altstand archiviert              |
| `juna/vinted-listing-plan`                          | `acb06f5a`         | Commitstand bereits im Hauptzweig enthalten                               |
| `origin/docs/expense-entry-redesign`                | `6afb5edb`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `origin/feat/expense-entry-redesign`                | `af14e065`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `origin/feat/expense-entry-redesign-gpt56`          | `e519de2a`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `origin/feat/expense-management`                    | `a628cea0`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `origin/feat/item-picker-and-image-preview`         | `35867170`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `origin/feat/operating-expenses`                    | `a1ada0a5`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `origin/feat/purchase-name-and-column-order`        | `20551936`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `origin/fix/audit-role-loading`                     | `ec291a1a`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `origin/juna/account-settings-pr1`                  | `d44b04e0`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `origin/juna/brand-labels`                          | `f7ab6d38`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `origin/juna/brand-labels-foundation`               | `5c968829`         | Commitstand bereits im Hauptzweig enthalten                               |
| `origin/juna/brand-labels-integration-20261007`     | `1c786863`         | Commitstand bereits im Hauptzweig enthalten                               |
| `origin/juna/sales-entry-controls-followup`         | `4c6b3b84`         | Commitstand bereits im Hauptzweig enthalten                               |
| `origin/juna/sales-entry-number-input-polish`       | `ec8375e6`         | Commitstand bereits im Hauptzweig enthalten                               |
| `origin/juna/sales-variant-picker-table`            | `4a102015`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `origin/juna/shared-ui-cleanup-inventory-purchases` | `c0cc71fb`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |
| `origin/juna/sidebar-navigation-order`              | `dbb0a246`         | Commitstand bereits im Hauptzweig enthalten                               |
| `origin/juna/vinted-feed-account-favorites`         | `fd6e2d32`         | Commitstand bereits im Hauptzweig enthalten                               |
| `origin/juna/vinted-feed-filter-layout`             | `99301dee`         | Commitstand bereits im Hauptzweig enthalten                               |
| `origin/juna/vinted-session-block`                  | `6a5039d9`         | Abweichender historischer Stand; vollständig archiviert, nicht integriert |

## Die vier alten Zwischenablagen

| Vorheriger Eintrag | Inhalt                                                | Einordnung                                                                |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| `374f9e06`         | Navigation/Header und altes Änderungsprotokoll        | Historischer Zwischenstand; archiviert                                    |
| `9cf15ed3`         | Nachprüfung der Demo-Entfernung                       | Bericht im aktuellen Hauptzweig vorhanden; archiviert                     |
| `3ac89e39`         | Teststrategie und CI-Plan                             | Plan und Spezifikation im aktuellen Hauptzweig vorhanden; archiviert      |
| `82e9c622`         | DPD-Service, Webhook, Versandoberfläche und Migration | Unveröffentlichter Altentwurf; gesondert als offen benannt und archiviert |

## Sicherung und Wiederherstellung

Die lokale Sicherung liegt unter `tmp/workspace-cleanup-20261025/`. Dieser Ordner bleibt bewusst von Git ausgeschlossen und wird nicht veröffentlicht. Er enthält auch lokale Konfiguration und Prüfartefakte und gehört nicht in einen öffentlichen Upload.

- `all-refs-and-stashes.bundle`: alle vorherigen Zweigstände und alle vier Zwischenablagen, einschließlich der zusätzlichen Dateien ihrer dritten Eltern.
- `manifest.json`, `refs-before.json`, `stashes-before.json`, `cleanup-plan.json` und `cleanup-result.json`: genaue Zuordnung von Pfaden, Commits, Dateien und erfolgten Aktionen.
- Je Arbeitskopie `workspace.zip` mit Quellen und eigenen lokalen Hilfsdateien sowie `staged.patch`, `unstaged.patch` und Kopien aller ungesicherten Dateien. Erneut erzeugbare Abhängigkeiten, Bauausgaben und übliche Testausgaben sind ausgenommen. ZIP-Prüfsummen und SHA-256 der ungesicherten Dateikopien wurden geprüft.
- Die ursprünglichen 36 lokalen Dateieinträge des Hauptordners sind separat erhalten. Die alte `debug.log` wurde aus der aktiven Arbeitskopie entfernt und bleibt in dieser Sicherung.

Wiederherstellung eines alten Zweigs bei Bedarf, vom Projektordner aus:

```powershell
git fetch tmp/workspace-cleanup-20261025/all-refs-and-stashes.bundle refs/heads/ALTER_ZWEIG:refs/heads/juna/recovered-work
```

Für den DPD-Entwurf einschließlich seiner zusätzlichen Dateien:

```powershell
git fetch tmp/workspace-cleanup-20261025/all-refs-and-stashes.bundle refs/juna-cleanup-20261025/stash-3
git stash store -m "recovered DPD draft" FETCH_HEAD
```

Das stellt den gespeicherten Entwurf wieder bereit; es übernimmt ihn noch nicht in aktuelle Dateien.

## Prüfung

Git-Bundle-Verifikation, vollständige CRC-Prüfung aller ZIPs, SHA-256-Abgleich aller ungesicherten Dateikopien, Dateipfad-/Prozess-/Projektgrenzen und abschließender Git-Status. Alle 43 betroffenen Dokumentationsdateien mit Prettier formatiert und erfolgreich geprüft; keine fehlenden lokalen Markdown-Verweise und keine Treffer bei der Prüfung auf typische private Schlüssel oder Zugangstoken. Die tatsächliche Testauswahl bestätigt ausschließlich Dokumentation ohne Anwendungs-, Browser-, Dienst- oder PWA-Tests. Keine Anwendungstests oder neuer Bau erforderlich, da keine Anwendungs-, Konfigurations- oder Datenbankdatei geändert wird. Die zuvor im Vergleichsbericht genannten historischen Testergebnisse wurden nicht als aktuelle Tests wiederholt.

Die lokalen Hauptprojekt-Abhängigkeiten nach der Bereinigung mit `npm ci --ignore-scripts --no-audit --no-fund` aus der unveränderten Sperrdatei wiederhergestellt und die normale Versionsdatei erzeugt. Kein Paket hinzugefügt oder aktualisiert; keine Paketdatei für den Commit verändert.
