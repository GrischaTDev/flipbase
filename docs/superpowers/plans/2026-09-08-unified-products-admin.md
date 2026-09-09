# Einheitliche Produkte und Admin-Oberfläche – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Bei ausdrücklich beauftragtem Agentenbetrieb stattdessen superpowers:subagent-driven-development mit klarer Dateizuständigkeit und Review nach jedem Paket verwenden.

**Goal:** Produkte unabhängig von ihrer Menge einheitlich erfassen, den Speicherfehler beheben und Einkauf/Dashboard auf das vereinbarte gemeinsame Design bringen.

**Architecture:** Vorhandenen Produkt-/Losbestand zum einheitlichen neuen Schreibweg erweitern und historische Einzelreferenzen kontrolliert überführen. Fachliche Einkaufsmaske aus Shared-Elementen aufbauen. Diagrammrenderer hinter dem bestehenden Shared-Eingang durch ApexCharts ersetzen.

**Tech Stack:** Angular 22, Reactive Forms/Signals, Tailwind, Supabase/PostgreSQL, Vitest, Playwright, pgTAP; geplant ApexCharts 7.1.0 und ng-apexcharts 3.1.0 nach Lizenzprüfung.

**Spec:** `docs/superpowers/specs/2026-09-08-unified-products-admin-design.md`

## Globale Grenzen

- Planung auf `codex/purchase-entry-design-review`, Basis `3b545c2` (PR #45). Vor Ausführung Git-Stand und fremde Änderungen erneut prüfen.
- Nur eigener Betrieb, keine SaaS-Plattform. Apex-Gratislizenz zusätzlich an Umsatzvoraussetzung gebunden.
- Kein Docker auf diesem Arbeitslaptop, keine lokale Datenbankeinrichtung, keine Produktionsdaten als Testbestand.
- Primärfarbe `#fcc601`, Shared-Komponenten, normale Schreibweise; Steuer/DATEV nur im nötigen Datenvertragsabgleich, kein eigener Seitenumbau.
- Kein Datenreset, keine Löschung historischer Geschäftsereignisse und keine Änderung veröffentlichter Migrationen.
- Keine handgepflegten generierten Supabase-Typen. DB-/Typprüfungen in isolierter freigegebener Umgebung.
- Plan allein ist kein Auftrag zu Push/Merge/Deployment oder destruktiven Datenänderungen.
- `debug.log` und `test-results-header-diagnosis/` bleiben unangetastet und außerhalb von Commits.

## Reihenfolge und Teilpläne

| Reihenfolge | Paket                                                                            | Ergebnis und Abhängigkeit                                                            |
| ----------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1           | [A: Lieferanten-Speicherfehler](2026-09-08-purchase-supplier-fix.md)             | Kleiner unabhängig testbarer Fix, kein Warten auf UI-Umbau                           |
| 2           | [B: Produktmodell und Artikelerfassung](2026-09-08-product-entry-unification.md) | Einheitlicher neuer Schreibweg, Datenübergang und vollständig geprüfte Einkaufsmaske |
| 3           | [C: Dashboard und ApexCharts](2026-09-08-dashboard-apexcharts.md)                | Berichtsgestaltung und neuer Renderer; fachliche Kennzahlen aus B bleiben stabil     |

B1–B4 sind Backend-/Datenvertrag, B5–B7 die UI-Umstellung. Sie dürfen nur in einem kompatiblen Gesamtstand veröffentlicht werden. C kann unabhängig vorbereitet werden, wird aber noch einmal mit den Bestands-/Verkaufsfällen aus B geprüft. Es gibt keinen einzelnen unübersichtlichen PR für alle drei Pakete.

**Aktualisierte Nutzerfreigabe 08.09.2026:** Alle offenen Punkte vollständig umsetzen und anschließend einen regulären PR erstellen. Die Umsetzung bleibt in fachlich getrennten, nachvollziehbaren Commits prüfbar; der abschließende PR enthält den kompatiblen Gesamtstand. Diese neuere Freigabe ersetzt die frühere Festlegung auf getrennte Paket-PRs. Merge, Deployment und produktive Datenüberführung bleiben gesonderte Freigaben; vorbereitete Übergangsprüfungen müssen diese Grenzen ausdrücklich abbilden.

## Zuständigkeiten bei beauftragtem Agentenbetrieb

- Datenvertrag: Schemas/Migrationen, SQL-Tests und Kernservices. Keine UI-Dateien parallel verändern.
- Einkaufsoberfläche: `purchase-line-editor`, Produktauswahl, gemeinsam genutzte UI-Elemente und Browsertests; konsumiert erst den abgestimmten Datenvertrag.
- Dashboard: ausschließlich Dashboard-/RevenueChart-Dateien und die vereinbarte Paketänderung. Shared-Badge-/Tabellenänderungen nicht doppelt bearbeiten.
- Integrator: Planfortschritt, Changelog, Vertragsabgleich, unabhängiges Review und Freigaben. Alle Bearbeiter erhalten den Hinweis auf parallele Änderungen und dürfen fremde Arbeit nicht zurücksetzen.

## Gemeinsame Abnahme

Abnahmestand 09.09.2026: A, B und C sind im kompatiblen neuen Produktweg implementiert und unabhängig geprüft. Lauf 34289489760 besteht alle 1393 Datenbanktests einschließlich vorhandener Produktidentitäten sowie den echten privaten Storage-API-Rollback. Die final erzeugte Migration wurde unverändert übernommen und unabhängig mit dem Quellschema verglichen. 17 Produkt-Browserfälle einschließlich echter mobiler Hell-/Dunkelansicht, Spaltengeometrie und AXE bestehen; fünf UI-Reviewbefunde sind nach Regressionen und visueller Nachprüfung geschlossen. Die abschließenden Gesamt-PR-Prüfungen folgen. B1-Verbraucherkarte und die gesondert freizugebende produktive Datenüberführung stehen in der [Übergangscheckliste](2026-09-08-product-transition-checklist.md). [Entwurfs-PR #46](https://github.com/GrischaTDev/flipbase/pull/46) dient ausschließlich als nachvollziehbare Prüfgrundlage, ohne Merge oder Deployment.

- [x] Lieferant desselben Workspaces funktioniert bei Neuanlage; fremde/ungültige IDs werden weiter abgewiesen.
- [x] Ein Produkt mit Menge 1, 3 und 12 durchläuft denselben Weg; keine Einstiege/Auswahlschalter für Einzel-/Mengenartikel.
- [x] Produktname/Bild, Menge, Stückpreis, Gesamt und Entfernen passen in die Zeile; zusätzliche Angaben sind erreichbar, aber nicht dauerhaft sichtbar.
- [x] Suche, Import und Scanner liegen unter den Positionen; Import/Scanner als zugängliche Icons.
- [x] Ein gespeichertes Bild erscheint nach erneutem Öffnen; fehlendes/defektes Bild zeigt einen neutralen Platzhalter.
- [x] Neuer Produktzugang, FIFO-Verkauf, Retoure und Kostenabschluss sind in Demo und DB-Vertrag geprüft; bestehende Entwurfsabläufe bleiben erhalten. Demo bleibt ohne produktiven Audit-/Rechtsnachweis und ohne die bereits zuvor servergebundene Kostenkorrektur.
- [x] Bestehende Serverchronik und Kommentarabläufe bleiben erhalten; offene Kosten werden nicht zu erfundenen Nullkosten.
- [x] Alle Statusbadges nur Text; keine ungewollte Änderung an Chartlegenden oder Chronikmarkern durch die Badge-Umstellung.
- [x] Dashboard-Schrift, Journal und Chart sind hell/dunkel, per Tastatur und auf schmalem Bildschirm abgenommen.
- [x] Kompatibler Übergang bewahrt alte Referenzen ohne Schattenlose oder historische Scheinbuchungen. Produktiver Datenabgleich/Backfill ist ausdrücklich kein Bestandteil dieses PR-Auftrags und bleibt separat gesperrt.
- [x] Gezielte lokale Tests/Lint/Format, Angular-Build und vollständige PR-Pflichtprüfungen inklusive DB sind grün. Regulärer PR #47, Implementierungsstand `ceca851`, GitHub-Lauf [34292837037](https://github.com/GrischaTDev/flipbase/actions/runs/34292837037): Quality, alle Anwendungstestblöcke, Database, Browser smoke und Required checks erfolgreich. Alle 78 Browserfälle zusätzlich lokal ohne Paketcache bestanden. Keine Veröffentlichung oder produktive Datenänderung erfolgt.

## Veröffentlichungs- und Rückfallvertrag

1. Pro Paket kurzer Review mit Testnachweisen und verbleibenden Risiken.
2. Migration und Schema zusammen; bei B erst Rücksicherung und Zuordnungsbericht prüfen.
3. Auf ausdrücklichen Auftrag PR erstellen, alle Prüfungen abwarten, mit Merge-Commit veröffentlichen.
4. Normaler Releaseweg mit Backup, Migration, Anwendung und öffentlicher Versionsprüfung; lokale Arbeitscontainer unberührt lassen.
5. Anschließend Nutzerprüfung auf Live: Lieferant auswählen → Produkt mit Bild/Menge erfassen → speichern → neu öffnen → Chronik prüfen. Bestandsbuchungen nur bewusst, keine unmarkierten Testverkäufe in Produktion.

## Planprüfung am 08.09.2026

Anforderungen aus dem Gespräch sind den Paketen A, B und C zugeordnet. Desktop-Referenz erneut geöffnet und Suchauslöser gemessen. Paketversionen ausschließlich lesend aus npm abgefragt; keine Installation. Offene Gates sind ausdrücklich benannt: Lizenzumsatz, tatsächlicher Datenzuordnungsbericht und freigegebene isolierte DB-/Typgenerierung. Diese Gates sind keine Erlaubnis für eine Abkürzung über lokale Arbeits-Dockercontainer oder die Produktionsdatenbank.
