# Projektstand vom 30.09.2026

Grundlage: GitHub, origin/master f93ee687, offene PRs, CI, lokale Branches und alle 15 zuvor vorhandenen Arbeitskopien. Keine Branches gelöscht und keine fremden Arbeitskopien geändert.

## Integriert seit dem 27.09.

- Vinted-Kontenanbindung, Anmeldung mit manueller Browserbedienung, Synchronisationsfortschritt und Fehlerdiagnose sowie Bewertungen.
- Dashboard-Überarbeitung, zentrale Stammdaten, vereinheitlichte Verkaufsfilter und Verkaufserfassung, direkte Kostenbasis nach Verkauf.
- Landingpage mit Beta-Paketen und kompakter Bewerbung.
- eBay-Gebührenrechner und Tools-Navigation.
- Persönliche Kontoeinstellungen über PR #262. Deployment und Pflichtstatus am aktuellen Hauptstand erfolgreich; kein zusätzlicher eigener Live-Test.

## Aktuell offen

- PR #264: Unternehmensdaten. Datenbank- und Browserprüfung erfolgreich, Qualität und beide Angular-Testgruppen fehlgeschlagen. Unter anderem fehlerhafter TestBed-Aufbau in den Unternehmenstests und eine abweichende Navigationserwartung. Noch nicht mergefähig.
- PR #263: persönliches Konto. Mergekonflikt und fehlgeschlagene Prüfungen; überschneidet sich mit dem bereits integrierten PR #262. Vor Schließen prüfen, ob noch einzigartige Änderungen vorhanden sind. PR-Texte beschreiben teilweise einen veralteten Zwischenstand.
- Vinted-Zuverlässigkeitsplan vom 28.09.: dokumentiert noch offene Live-Abnahme, vollständige Verkaufsquelle, atomare Datenübernahme, Teilerfolge, Wiederaufnahme nach Worker-Neustart und gemessene Browserwiederverwendung. Spätere Login-/Diagnoseverbesserungen ersetzen diese Abnahme nicht. Jeden Punkt vor Umsetzung am aktuellen Code abgleichen.
- Zentralisierung der Unternehmensdaten für Rechnungen, Shop und Versand ist ein anschließender Schritt; #264 stellt zunächst das Fundament bereit.
- Keine offenen GitHub-Issues. Alte Pläne mit offenen Checkboxen sind kein verlässlich gepflegtes Backlog; beispielsweise existiert Listing Studio bereits im Hauptstand.

## Lokaler Zustand

Die ursprüngliche Hauptarbeitskopie ist sauber, liegt aber hinter origin/master. Drei alte Arbeitskopien haben ungesicherte Änderungen: remove-demo-code (umfangreiche Änderungen), status-analysis-2026-09-12 (Changelog) und status-audit-2026-09-19 (Berichte und Pläne). Vor einer Löschung sichern und gegen den Hauptstand prüfen.

## Empfohlene Reihenfolge

1. Die zwei offenen PRs mit den zuständigen laufenden Arbeiten abstimmen: #263 abgleichen, #264 Prüfungen beheben und abschließen.
2. Vinted mit einem echten Konto von Anmeldung bis vollständigem Datenimport und erneutem Abgleich abnehmen; dabei offene Zuverlässigkeitsfälle prüfen.
3. Ungesicherte alte Arbeitskopien sichern; anschließend bestätigte abgeschlossene Branches und saubere Arbeitskopien aufräumen.
4. Unternehmensdaten in Rechnungen, Shop und Versand übernehmen; danach verbleibende Produktpläne einzeln am Code prüfen und priorisieren.

## Entfernte Branches vollständig in origin/master enthalten

Die folgenden 49 Zweige sind anhand ihrer Commit-Abstammung integriert. Vor Löschung auch die zugehörige lokale Arbeitskopie und laufende Sitzung prüfen.

- `ci/lean-validation-20260916`
- `codex/bedienkonsistenz-dashboard`
- `codex/debug-vinted-access`
- `codex/fix-vinted-bot-runtime`
- `codex/polaris-design-audit`
- `codex/polaris-primary-brand-yellow`
- `codex/polaris-sidebar-yellow`
- `codex/polaris-sort-controls`
- `codex/polaris-table-system`
- `design/expenses-foundation`
- `docs/ci-closeout-20260916`
- `docs/playwright-evaluation-plan`
- `feat/dashboard-cashflow-margin`
- `feat/dashboard-modern-rework`
- `feat/deal-monitor-collection-and-ui`
- `feat/design-semantic-color-system`
- `feat/expense-entry-redesign-sol`
- `feat/expenses-foundation`
- `feat/purchase-entry-page`
- `feat/purchase-seller-details`
- `feat/sidebar-workflows-ideas`
- `feat/timeline-shopify-style`
- `feat/unified-data-table-system`
- `feat/vinted-feed-browsing`
- `fix/audit-role-loading-gpt56`
- `fix/sale-shipping-accounting`
- `fix/sidebar-active-and-image-upload-button`
- `fix/simplify-dashboard-kpis`
- `fix/simplify-sales-table-language`
- `fix/stale-chunk-recovery`
- `fix/tab-resume-freeze`
- `fix/theme-consistency-light-image-optimizer`
- `fix/workspace-context-navigation`
- `fix/workspace-delete-flow`
- `fix/workspace-entry-lock-hardening`
- `juna/account-company-settings`
- `juna/beta-purchase-product-followup`
- `juna/fix-sales-cost-basis-refresh-20260929`
- `juna/landing-beta-pricing`
- `juna/master-data`
- `juna/redesign-beta-application`
- `juna/refactor-sales-entry-20260929`
- `juna/remove-beta-inner-card`
- `juna/remove-landing-spreadsheet-block`
- `juna/sales-filter-labels`
- `juna/shared-sales-platforms`
- `juna/sticky-landing-navigation`
- `juna/unify-form-control-heights`
- `perf/ci-cache-measurement-20260916`

## Entfernte Branches mit weiterem Prüfbedarf

Keine direkte Commit-Abstammung nachgewiesen. Das bedeutet nicht automatisch, dass die Funktion fehlt; Squash-/Cherry-pick-Übernahmen und alternative Umsetzungen gesondert prüfen.

- `docs/expense-entry-redesign`
- `feat/expense-entry-redesign`
- `feat/expense-entry-redesign-gpt56`
- `feat/expense-management`
- `feat/item-picker-and-image-preview`
- `feat/operating-expenses`
- `feat/purchase-name-and-column-order`
- `fix/audit-role-loading`
- `fix/disambiguate-purchase-cost-queries`
- `fix/reconcile-historical-purchase-costs`
- `fix/reconcile-release-permissions`
- `juna/account-settings-pr1`
- `juna/company-settings-foundation`
- `juna/ebay-fee-calculator`
- `juna/shared-ui-cleanup-inventory-purchases`
- `juna/tools-ebay-fee-category-fix`

## Ergebnis der anschließenden Bereinigung

Die obige Bestandsaufnahme dokumentiert den Ausgangszustand. Danach wurden 54 entfernte Branches gelöscht: 49 mit direkter Commit-Abstammung sowie fünf mit passendem gemergtem PR-Head und nachgewiesenem Merge-Commit in origin/master. 14 lokale Branches wurden ebenfalls entfernt. Die Remote-Löschung verwendete jeweils den geprüften Head als Schutz gegen zwischenzeitliche Änderungen.

Neun alte Arbeitskopien sind entfernt. Bei einer zehnten scheiterte die vollständige Dateilöschung an langen Windows-Pfaden; ihre Git-Registrierung war bereits entfernt. Der gesamte Restordner wurde nach `.git/audit-backups/20260930/purchase-costing-foundation-remainder` verschoben. Die drei Arbeitskopien mit Änderungen bleiben erhalten und sind zusätzlich gesichert. Der reine Berichtszweig wird nach Übernahme seiner Dokumentation in den Unternehmenszweig lokal entfernt.

PR #263 ist nach Vergleich mit der abgeschlossenen Konto-Implementierung in #262 geschlossen. Der ältere Remote-Zweig bleibt erhalten. PR #264 ist lokal korrigiert; Push und Merge stehen noch aus. Die Hauptarbeitskopie entspricht origin/master.

Nach PR 2: PR 3 bindet Geschäftsdokumente an das Unternehmensprofil und bewahrt historische Snapshots. PR 4 stellt Shop/Bank/Impressum und Versand um. Die praktische Vinted-Abnahme bleibt eine eigenständige offene Aufgabe.

Lokale Prüfung: 19 Angular-, 17 DOM-, 35 Node- und 17 Vertragstests, Typprüfung, gezieltes Lint, Shared-UI und Produktionsbau erfolgreich. Vier Unternehmens-Browserfälle werden jetzt durch die PR-Konfiguration ausgewählt. Keine lokale DB-/Browserabnahme; Docker nicht aktiv. Finale PR-CI erforderlich.
