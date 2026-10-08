# Marken-, Label- und Größenreferenzen: Umsetzungsplan

> Umsetzung mit superpowers:subagent-driven-development; bestehende Architektur
> fortführen und die ausdrückliche vollständige Backendfreigabe berücksichtigen.

**Ziel:** Das Referenzlexikon vollständig lokal integrieren und überprüfbar machen.
**Architektur:** Bestehende Labelrevisionen und RPCs, private geprüfte Medien und
größenbezogene Tabellen mit getrenntem Entwurf und veröffentlichtem Inhalt.
**Stack:** Angular 22, Shared-Komponenten, Supabase/PostgreSQL, native Edge-Web-APIs.
**Entwurf:** `docs/superpowers/specs/2026-10-08-reference-library-design.md`.

## Vorgaben

- Änderungen nur in eigener Arbeitskopie; fremde Remotezweige bleiben erhalten.
- Keine generierten Typen von Hand ändern; keine weiteren Produktabhängigkeiten.
- Deutsche UI-/Dokumentationstexte, englische Bezeichner, persönliche Du-Ansprache.
- Gleiche Berechtigungs-, Versions- und Retrygrenzen für alle Schreibaktionen.
- Keine Produktionsänderung vor erfolgreicher Prüfung und PR-Abschlussfreigabe.

## Task 1: Labelredaktion

- [x] Adminliste mit Suche, Status, Marke und Pagination anhand
      `list_label_admin_references` und `get_label_admin_reference` erstellen.
- [x] Explizite Aktionen zum Anlegen und Bearbeiten anhand `create_label_draft`
      und `edit_label_reference`; vorhandene Draft-/Content-/RPC-Module weiterverwenden.
- [x] Vollständiges Formular für Inhalte, Datierungen, Quellen, Prüfhilfen,
      Merkmale, Grenzen, Verweise und Bildzuordnung mit Reihenfolge implementieren.
- [x] Speichern, Prüfen, Veröffentlichen, Verwerfen, Archivieren und Wiederherstellen
      anhand registrierter RPCs. Erfolgszustände erst nach bestätigter Antwort.
- [x] Unveränderliche Aufträge für bewusste Wiederholung; Versionskonflikt erhält
      Eingaben. Nutzer-/Rollen-/Workspacewechsel verwerfen verspätete Antworten.
- [x] Shared-Komponenten, Unsaved-Guard-Vertrag und beforeunload berücksichtigen.
- [x] Sinnvolle Modell-/Interaktionstests, gezielter Lint und Formatierung.

## Task 2: Datenbank, Medien und Größen

- [x] Vorhandene SQL-Kandidaten als Schemata registrieren und gegen echten
      isolierten PostgreSQL-/Supabase-Stand prüfen.
- [x] Native begrenzte PNG-Prüfung, authentifizierter Upload und private Auslieferung.
- [x] Betreiberverwaltung von Bildrechten, Marken-/Linienarchiv und Leserfreigabe.
- [x] Größenreferenz-RPCs, Leseransicht und pflegbare Tabelle nach Entwurf ergänzen.
- [x] Migrationen erzeugen, kontrollieren, frisch anwenden und Typen generieren.

## Task 3: Integration und Abnahme

- [x] App-/Betreiberrouten, Navigation, Markenfilter und echte Bilder anbinden.
- [x] Fehler-, Leer-, Rollenwechsel-, Konflikt- und unklare Retryfälle prüfen.
- [x] Feature-SQL, Edge-/Frontendtests, Typen, Lint, Format, Shared-UI und Build prüfen.
- [x] Browser-/AXE-Prüfung und unabhängiges Review; Befunde korrigieren.
- [x] Integrationsdokumentation und AI-Changelog aktualisieren; PR-Freigabe erst
      nach vollständiger lokaler Abnahme erfragen.
