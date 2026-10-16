# Umsetzungsfolge: Marktplatzübersicht und Vinted → Kleinanzeigen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Eine Umsetzung mit getrennten Agenten ist alternativ nach Auswahl durch den Nutzer über superpowers:subagent-driven-development möglich. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Einen vollständigen Weg vom eigenen Vinted-Inserat zum bestätigten
Kleinanzeigen-Inserat über die zentrale Marktplatzübersicht liefern.

**Architecture:** Plattformübergreifende Leseansicht mit getrennten Plattformdiensten.
Bestehende Kleinanzeigen-Entwürfe werden erweitert. Accountabgleich und
Veröffentlichungsaufträge sind getrennte, überprüfbare Abläufe.

**Tech Stack:** Angular 22, Signals, Reactive Forms, Tailwind, Supabase/Postgres,
Chrome Manifest V3, vorhandene Vitest-/Playwright-/Deno-/SQL-Tests.

**Spec:** [Freigegebener Aufbau und konkretisierte Spezifikation](../specs/2026-10-15-marketplace-overview-transfer-design.md).

## Global Constraints

Die verbindlichen Entscheidungen der Spezifikation gelten für alle Teilpläne.
Keine Paketinstallation oder Major-Aktualisierung ist Teil dieses Auftrags.
Zielweg zunächst genau ein bestehendes eigenes Vinted-Inserat zu Kleinanzeigen.
Relisting und Bulk-Ausführung sind ausdrücklich spätere Umsetzungspakete.

## Review Focus

- Veraltete Antworten nach Workspace-/Accountwechsel: Paket A, Aufgaben 1 und 3.
- Unvollständiger Import: Paket B, Aufgabe 3; keine Löschung fehlender Einträge.
- Quellinserat ohne Lagerzuordnung: Paket C, Aufgabe 1; Entwurf bleibt möglich.
- Browserneustart nach Submit: Paket C, Aufgabe 4; ausschließlich Abgleich.
- Gebühren-/Verarbeitungszustand: Paket C, Aufgaben 4 und 5; kein falsches „online“.

## Abhängigkeiten und einzeln lieferbare Pakete

| Paket | Ergebnis                                                                  | Voraussetzung                        | Plan                                                                  |
| ----- | ------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| A     | Gemeinsame Übersicht mit Vinted/eBay und bestehender Entwurfsverwaltung   | aktuelles origin/master              | [Übersicht](2026-10-15-marketplace-overview.md)                       |
| B     | Kleinanzeigen-Account anbinden und eigene Inserate vollständig abgleichen | A integriert; Anbieterbericht aus B1 | [Kleinanzeigen-Abgleich](2026-10-15-kleinanzeigen-account-sync.md)    |
| C     | Vinted → Kleinanzeigen prüfen, veröffentlichen und bestätigen             | A und B integriert                   | [Vollständiger Transfer](2026-10-15-vinted-kleinanzeigen-transfer.md) |

- [ ] Spezifikation und alle drei Teilpläne im Chat prüfen.
- [ ] Ausführungsweise auswählen: direkt in dieser Sitzung oder mit getrennten
      Umsetzungs-/Prüfagenten. Aktuell wurde noch keine Methode gewählt.
- [ ] Paket A umsetzen und gezielt prüfen; nach Nutzerfreigabe über grünen PR integrieren.
- [ ] Paket B auf aktuellem origin/master umsetzen; Anbieterprüfung nicht überspringen.
- [ ] Paket C auf aktuellem origin/master umsetzen und den vollständigen Weg abnehmen.
- [ ] Je Paket Sitzungseintrag, tatsächlich ausgeführte Prüfungen und verbleibende
      Live-/Linux-Lücken dokumentieren.

## Was danach folgt

1. Fehlende Einzelaktionen für Bearbeiten/Löschen und plattformspezifisches Relisting.
   Eine parallel entstehende Vinted-Relisting-Funktion wird über denselben
   Aktionsdienst aus Kleiderschrank, Detailseite und Übersicht aufgerufen.
2. Sammelausführung mit Einzelaufträgen, Accountwarteschlange und Teilergebnissen.
3. Weitere Übertragungsrichtungen und eigene Plattformreiter bei Mehrfacherstellung.
4. Mehrere eBay-Accounts und vollständiges eBay-Neuanlegen als getrennte Erweiterungen.

Diese Folgeschritte werden erst nach Abnahme des ersten Wegs konkret geplant.
Die Checkboxen in Paket A sind eine Auswahlgrundlage, keine Behauptung fertiger
Sammelaktionen.

## Prüfstatus dieser Planung

Lokale Verträge, Tabellen, Extension-Einstiege und tatsächliche CI-Auswahl gelesen.
Offizielle Kleinanzeigen-Hilfe sowie Supabase-Dokumentation herangezogen.
Keine Produktcodeänderung, Migration, Browserautomatisierung oder Live-Veröffentlichung.
Die Befehle in den Teilplänen sind künftige Prüfungen, keine bereits bestandenen Tests.
