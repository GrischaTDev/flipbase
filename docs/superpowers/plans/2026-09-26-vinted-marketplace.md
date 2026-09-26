# Vinted-Marktplatzverwaltung: Implementierungsplan

> For agentic workers: Use superpowers:executing-plans for task-by-task execution.
> Haken bezeichnen tatsächlich erledigte Schritte, keine angekündigten Arbeiten.

**Goal:** Kontoverwaltung, Inserate, Nachrichten und Benachrichtigungen in Flipbase integrieren.

**Architecture:** Gemeinsame Datenverträge, native Angular-Oberfläche, autorisierte
Server-API und kontogebundener Worker. GoLogin bleibt ein austauschbarer Kandidat.

**Tech Stack:** Bestehendes Angular-/TypeScript-/Supabase-Projekt. Kein Paketupgrade
und kein neues Monorepo-Framework für diesen ersten Schritt.

**Spec:** [Produkt- und Architekturentscheidungen](../specs/2026-09-26-vinted-marketplace-design.md)

## Global Constraints

Ein Produkt, ein Bestand; Vinted zuerst. Bestehende Routen und Funktionen erhalten.
Keine produktiven Kontozugriffe, Geheimnisse oder Datenbankmigrationen in diesem Start.
Validierung ist keine Autorisierung. Livezugriff bleibt an die Freigaben der Spec gebunden.

## Review Focus

Kontowechsel A → B → A mit verspäteter Antwort; fehlende oder fremde Konto-ID;
mehr als 50 Meldungen; abgelaufene Worker-Sperre bei weiterlaufendem Browser;
Abbruch unmittelbar nach Senden oder Veröffentlichen.

## AP01: Gemeinsame Datenverträge – begonnen

- [x] Branch vom aktuellen `master` erstellen und Projektanweisungen lesen.
- [x] Reine gemeinsame DTOs in `supabase/functions/_shared/marketplace-contracts.ts` anlegen.
- [x] `validateMarketplaceCommand(input: unknown): CommandValidationResult` implementieren.
- [x] `hasVerifiedCapability(states: CapabilityMap, capability: Capability): boolean` ergänzen.
- [x] Typen im neuen Frontend-Feature ausschließlich als Typen wiederverwenden.
- [x] Künstliche Konten A/B mit unterschiedlichen Rechten und Kennzahlen bereitstellen.
- [x] 54 Vertragstests und 5 Fixture-Tests ausführen; isolierte strikte Typprüfung ausführen.
- [ ] Vorhandene Tabellen, RLS, Mitgliedschafts- und Rollenregeln vollständig abgleichen.
- [ ] Projekt-Formatierung, reguläre Edge-Testgruppe und vollständige CI im Vollcheckout prüfen.

Transportgrenzen dieser Arbeitsfassung: interne IDs aus ASCII-Buchstaben/Ziffern
sowie `._:-`, 1–128 Zeichen; Text bis 5000 UTF-16-Codeeinheiten; Seitengröße 1–100;
opaker Cursor bis 2048 Zeichen. Das sind eigene Validierungsgrenzen, keine
behaupteten Vinted-Limits. Nachrichtentext wird unverändert erhalten.

`listings.publish` referenziert ein gespeichertes Listing, `listings.update`
zusätzlich eine Veröffentlichung. Die spätere API muss Eigentümerschaft und
Version prüfen und einen unveränderlichen Inhaltsstand für den Auftrag speichern.
Der hier angelegte Validator führt selbst keine Aktion aus.

## Früher G1-Nachweis

- [ ] Vor breitem UI-Ausbau sichere Provider-Einbettung auf eigener Testseite prüfen.
- [ ] Zugriff auf fremde Profile, abgelaufene Tickets und Widerruf testen.
- [ ] Kein echter Kontopilot ohne G0/G1-Freigaben.

## Danach

- [ ] AP02: Geschützte Feature-Routen, Shell, Tabs und Kontowechsler mit Testdaten.
- [ ] AP03: Persistente Konten, Veröffentlichungsscope, Rechte und lokale Datenbanktests.
- [ ] AP04: Dauerhafte Aufträge, Worker, Besitzrechte und Session-Broker.
- [ ] AP05: Nachgewiesener Leseumfang, Pagination und vorhandene Bestandszuordnung.
- [ ] AP06: Bewusst gesendete Textantworten, Ergebnisabgleich und Wiederholschutz.
- [ ] AP07: Gemeinsame Ereignisse, persönliche Lesestände, Filter und Push.
- [ ] AP08: Gesicherte Inseratänderungen und Veröffentlichung aus dem vorhandenen Editor.
- [ ] AP09: Kontrollierter Pilot mit einem ausgewählten berechtigt nutzbaren Konto.
- [ ] AP10: Zweites Konto, Ausfalltests, Last, Kosten und Betriebsfreigabe.

Jeder weitere Schritt erhält zunächst fehlschlagende Tests, dann die minimale
Umsetzung und die passenden Regressionstests. Schema und Migration werden gemeinsam
reviewt. Nicht automatisch mergen oder deployen.

[Prüfprotokoll und offene Punkte](../../implementation/vinted-marketplace-progress.md)
