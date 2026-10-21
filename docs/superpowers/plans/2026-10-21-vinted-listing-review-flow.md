# Inseraterstellung mit zwei Schritten

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** KI-Fotoangabe im Entwurf speichern, Prüfung als zweite Seite und Veröffentlichung ohne zusätzliche Erlaubnis-Checkbox anbieten.

**Architecture:** Bestehenden Editor und seine Prüfung wiederverwenden. Der Editor hält beide Schritte; die Prüfkomponente wird ohne Modal eingebettet. Eine optionale boolesche `aiPhoto`-Angabe im vorhandenen JSON-Inhalt erhält alte Entwürfe und unveränderte Konto-/Auftragsschutzprüfungen.

**Tech Stack:** Angular 22, bestehende Shared Components, Supabase/Postgres; keine neuen Abhängigkeiten.

**Spec:** `docs/design/2026-10-21-vinted-listing-review-flow.md`; Nutzer bestätigt zwei Schritte.

## Global Constraints

- Fremden Hauptcheckout und fremde Zweige nicht verändern.
- Kein echtes Inserat veröffentlichen, duplizieren oder ändern.
- Bestehende serverseitige Rechteprüfung und Schutz vor doppelten Aufträgen erhalten.
- Deutsch in UI/Dokumentation, Englisch in Codebezeichnern; vorhandenes Design verwenden.

## Review Focus

- Alte Entwürfe ohne Fotoangabe bleiben les- und speicherbar.
- Zurückwechseln erhält Fotoangabe und Veröffentlichungszeitpunkt.
- Keine Kontofreigabe oder Auftragserteilung allein durch Öffnen der Prüfung.
- Konto-/Workspacewechsel verwirft eine veraltete Prüfung.
- Unklare Auftragsantwort verwendet bei Wiederholung dieselbe Anfragekennung.

### Task 1: Dauerhafte KI-Fotoangabe

Dateien: `marketplace-listing-contracts.d.ts`, `vinted-listing-content.ts` und zugehörige Tests, deklaratives Schema `460_marketplace_listing_drafts.sql`, erzeugte Migration, vorhandener Datenbanktest für Entwürfe.

- [x] Modelltest für true/false, fehlenden Altwert und ungültigen Typ zuerst rot ausführen.
- [x] Optionales `aiPhoto?: boolean` im Vertrag; Parser normalisiert fehlenden Wert auf false und prüft booleschen Typ. SQL-Validator akzeptiert ausschließlich booleschen Wert.
- [x] Migration mit vorhandener CLI aus dem deklarativen Schema erzeugen, lesen und lokal anwenden; Typen neu erzeugen.
- [x] Betroffene Modell- und Datenbankfälle grün prüfen.

### Task 2: Editor und Prüfseite

Dateien: bestehende Editor-/Prüfkomponenten einschließlich HTML und Angular-Tests; vorhandene `e2e/vinted-listing-drafts.spec.ts`.

- [x] Bestehende Prüfkomponententests auf ausdrückliche Abschlussaktion ohne Checkbox umstellen; zuerst rot ausführen.
- [x] Foto-FormControl im Editor speichern/laden; Checkbox unter Galerie; Prüfkomponente liest unveränderlichen Entwurfswert.
- [x] Schrittanzeige und eingebettete Prüfseite ergänzen. Editor beim Wechsel erhalten, ausblenden und entkoppelte Fokusführung sicherstellen. Zurück/Fertig und Konto-/Workspacewechsel berücksichtigen.
- [x] Freigabeblock aus UI entfernen; Freigabe nur innerhalb abschließender Auftragsaktion erzeugen. Terminwahl im Editorzustand über Zurückwechsel erhalten.
- [x] Bestehende Browsertests auf zwei Seiten umstellen; Rückkehr, Speicherung/Wiederöffnung, keine vorzeitige Freigabe, doppelte Klicks und bestehende Fehlerszenarien prüfen.

### Task 3: Abnahme

- [x] Betroffene CI-Auswahl ermitteln und vollständig lokal ausführen; Registrierung/Soll-Listen prüfen.
- [x] Formatierung, gezieltes Lint, Root-Typen, Shared-UI, Angular-Bau und betroffene Browsermatrix gegen ruhende Vorschau prüfen.
- [x] Gesamten Unterschied unabhängig reviewen lassen; belegte Fehler gezielt korrigieren und nachprüfen.
- [x] Ergebnis und Grenzen im AI-Changelog ergänzen, mit Nutzerautorschaft committen; erst danach die vorgeschriebene PR-/Merge-Frage stellen.
