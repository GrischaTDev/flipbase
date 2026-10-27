# Aktionsübersicht in Vinted-Nachrichten

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Laufende, wartende und kürzlich erledigte Aktionen nach dem abgestimmten Mockup optional und passend zur verfügbaren Bildschirmbreite anzeigen.

**Architecture:** Der Server bleibt die Quelle für Aufträge und deren Status. Eine Feature-Komponente stellt diese Daten mit vorhandenen Shared Components dar. Eine persönliche Darstellungseinstellung steuert ausschließlich die Sichtbarkeit.

**Tech Stack:** Angular 22, Signals, Tailwind, vorhandener Supabase-Client, Vitest und Playwright. Keine neuen Abhängigkeiten.

**Spec:** Die folgenden Festlegungen entsprechen dem im Chat freigegebenen Entwurf.

## Freigegebener Entwurf

- Kompakte Aktionskacheln: laufend mit Spinner, wartend und zuletzt erledigt.
- Im Chat bleibt „Annahme beauftragt“; der Zusatz „siehe Aktionen rechts“ entfällt.
- Persönliche Einstellung „Aktionsübersicht anzeigen“, zunächst ausgeschaltet.
- Bei ausreichend Platz rechte Spalte; sonst Button „Aktionen (3)“ mit Ladeanzeige.
- Auf Tablets öffnet der Button ein seitliches Panel, auf Smartphones eine Ansicht
  von unten. Kein automatisches Öffnen.
- Ohne aktivierte Einstellung weder Spalte noch Button. Kurze Chatstatus und
  konkrete Fehler bleiben sichtbar. Die Ausführung läuft unabhängig weiter.
- Erfolg erst nach bestätigtem Ergebnis; unbekannte Ergebnisse ausdrücklich als
  unklar beziehungsweise in Prüfung darstellen. Reihenfolge nicht erfinden.

## Global Constraints

- Nutzer hat die nötige Backend-Erweiterung einschließlich Migration und Tests am 27.10.2026 ausdrücklich freigegeben.
- Keine Frontend-Ersatzschnittstellen oder simulierten Aufträge.
- Bezeichner Englisch; UI, Kommentare und Dokumentation Deutsch; Assistent Juna.
- Bestehende Shared Components und Markengelb `#fcc601` verwenden.
- Fremde Änderungen und Zweige erhalten; eigener Zweig ab `origin/master`.
- Vor Push die vorgeschriebene PR-/Merge-Frage stellen, erst nach fertiger Umsetzung.

## Review Focus

- Neuladen darf laufende Aktionen und Angebotszuordnungen nicht verlieren.
- Konto-/Workspace-/Nutzerwechsel darf keine fremden Aktionen anzeigen.
- Fehlgeschlagener Abruf darf keinen erfolgreichen oder fehlgeschlagenen Auftrag vortäuschen.
- Einstellung aus und Wechsel der Bildschirmbreite dürfen Fokus oder geöffnete Dialoge nicht verwaisen lassen.
- Unklarer Versand darf durch die Übersicht keine ungeprüfte Wiederholung auslösen.

## Aufgabe 1: Backend-Voraussetzung klären

- [x] Bestehende Nachrichten- und Verhandlungsverträge prüfen.
- [x] Fehlenden gemeinsamen Lesevertrag und Angebotszuordnung nach Neuladen belegen.
- [x] Übergabe unter `C:/Users/gt/Desktop/Backend Issues/message-action-queue/01-vinted-action-overview-read-contract.md` erstellen.
- [x] Ausdrückliche Backend-Freigabe für diese Funktion erhalten; Implementierung erfolgt auf demselben Aufgabenbranch.

## Aufgabe 2: Darstellungseinstellung

- [x] Bestehendes Muster für persönliche Einstellungen verwenden; fehlender oder
      ungültiger Wert bedeutet aus. Nutzerwechsel und Speicherfehler zuerst testen.
- [x] Geprüften Einstellungsservice und Shared-Steuerung implementieren.
- [x] Persönlichen App-Bereich unter `/settings/app` ergänzen, ohne bestehende Marktplatz-Einstellungen zu verschieben.

## Aufgabe 3: Echte Auftragsdaten und kompakte Übersicht

- [x] Den bereitgestellten Backend-Vertrag konsumieren. Tests für Gruppierung,
      Reihenfolge, Unklarheit, Fehler, Historienlimit und Kontextwechsel zuerst.
- [x] Komponente unter `features/marketplaces/components/vinted-action-overview/`
      anlegen; Angebots-/Nachrichtenkomponenten über bestätigte Belege anbinden.
- [x] Automatisches Statuslesen und bestehenden Idempotenzschutz erhalten.
      Angebotsstatus nach Neuladen aus dem Backend wiederherstellen.

## Aufgabe 4: Responsive Integration und Prüfung

- [x] Übersicht in `vinted-messages` bei ausreichender tatsächlicher Inhaltsbreite
      einblenden; sonst beschrifteter Button und vom Nutzer geöffnetes Panel.
- [x] Gemeinsame `ModalShellComponent` bei Bedarf um eine mobile Ansicht von unten
      erweitern. Fokusfalle, Escape, Rückfokus, Scrollen und reduzierte Bewegung testen.
- [x] Desktop, Tablet, 390/320 Pixel, Hell/Dunkel, Touch und AXE in der bestehenden
      Browserumgebung prüfen; Einstellung aus darf das Feature vollständig ausblenden.
- [x] Betroffene Tests, Formatierung, Lint und Angular-Bau ausführen; Ergebnis im
      AI-Changelog dokumentieren. Anschließend unabhängiger Gesamtbranchreview.

## Arbeitsstand

Lokal umgesetzt und gezielt geprüft. Neuer Lesevertrag, generierte Migration und
Typen, persönliche Einstellung und responsive Darstellung sind vorhanden.
259 SQL-Zusicherungen, 114 Anwendungstests, 64 Auswahlscript-/Registrierungsprüfungen
und 52 Browserfälle erfolgreich. Produktionsbau, Formatierung, Lint und beide
Typprüfungen bestanden. Unabhängiger Review abgeschlossen; alle konkreten Befunde
mit Regressionen korrigiert. Keine Veränderung an Produktion oder Kontofreigaben.

Die Übersicht zeigt echte Status und zeitliche Anzeigeordnung, keine zugesicherte
globale Serialisierung unabhängiger Dispatcher. Automatische Aufträge sperren
keine weiterhin zulässige manuelle Übernahme. Vor der ersten erfolgreichen
Wiederherstellungsabfrage sind neue manuelle Angebotsaufträge gesperrt.

Browsernachweis unter Windows/Chromium mit emuliertem Touch gegen ruhenden
Entwicklungsbau. Native Geräte und vollständige CI bleiben getrennte Nachweise.
Keine Abhängigkeit aktualisiert. PR/Push/Merge noch nicht freigegeben.

Flipbase ist nicht im verbundenen Lissie-Projektverzeichnis vorhanden; dort sind
Regelabruf und Änderungsbericht für dieses Projekt nicht möglich.
