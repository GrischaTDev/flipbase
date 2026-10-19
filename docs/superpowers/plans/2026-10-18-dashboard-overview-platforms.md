# Übersicht und Verkaufsplattformen: Umsetzungsplan

> Ausführung mit superpowers:executing-plans; abschließender unabhängiger Review.

**Ziel:** Den freigegebenen zweiten Bildentwurf mit dezenten Kennzahlenicons und Plattformlogos umsetzen; Plattformen je Workspace zentral pflegen und sortieren.

**Architektur:** Vorhandene Shared-Komponenten um ausdrücklich gewählte Darstellungsvarianten erweitern, ohne andere Seiten umzugestalten. Ein zentraler SalePlatformsService führt gespeicherte Stammdaten, Standardplattformen und vorhandene Verkaufskennungen zusammen. Eine eigene RLS-geschützte Konfiguration speichert die vollständige Reihenfolge atomar mit Versionsprüfung. Bestehende Verkäufe werden nicht umgeschrieben.

**Technik:** Angular 22, Signals, Tailwind, vorhandenes ApexCharts, typisierter Supabase-Client. Keine neuen Abhängigkeiten.

**Gestaltungsgrundlage:** Freigegebenes Bild im Chat vom 18.10.2026 und anschließender Nutzerwunsch: Kennzahlenicons und Plattformlogos ergänzen. Apple-Variante gilt für die Übersicht; übrige Seiten behalten den bestehenden Stil.

## Rahmenbedingungen

- Deutscher Oberflächentext, englische neue Codebezeichner, Juna als gemeinsame Bezeichnung.
- Keine Mini-Kurven, Aufgabenkarte, Kapital-Kennzahl, Durchschnitts-EK oder Bildoptimierer-Schnellaktion.
- Vier Kennzahlen; drei Aktionen; Inseratwahl mit Vinted-Einstieg und Platzhaltern für eBay und Kleinanzeigen.
- Gelb/Grau/Petrol im Diagramm, lesbare dunkle Variante, Tastatur- und Touchbedienung erhalten.
- Eigener Zweig; kein Push oder PR ohne die vorgeschriebene Abschlussfreigabe.

## Prüfschwerpunkte

- Historische unbekannte Plattformkennungen bleiben auswählbar und verlieren ihren Namen nicht.
- Verspätete Antworten eines anderen Workspace überschreiben weder Anzeige noch Speicherstand.
- Schreibfehler und konkurrierende Bearbeitung melden Fehler statt Erfolg.
- Lagerdauer nutzt das Einkaufsdatum; unbekannte/future Daten bleiben ausdrücklich unbekannt.
- Vier Kennzahlen, Filter, Dialog und Diagramm funktionieren bei schmaler Breite, Touch, Tastatur sowie hellem/dunklem Schema.

## Aufgaben

### 1. Plattformmodell und sichere Speicherung

- [x] Modelltests für Reihenfolge, Standardplattformen einschließlich StockX, historische Werte, Dubletten und stabile Kennungen ergänzen und rot ausführen.
- [x] `core/models/sale-platforms.ts` und `core/services/sale-platforms.service.ts` mit Workspace-Isolation, Ladefehlern und bestätigter Speicherung implementieren.
- [x] Deklaratives Schema mit RLS, Berechtigungen und versionierter Speicherfunktion ergänzen; Migration mit CLI erzeugen, prüfen und Typen neu erzeugen.
- [x] Datenbankprüfungen für Rollen, fremde/archivierte Workspaces, ungültige Listen und Versionskonflikte ausführen.

### 2. Stammdaten und Verkaufsansichten verbinden

- [x] Bestehende Stammdaten-/Verkaufstests um Erstellung, Umbenennung ohne Änderung historischer Kennungen sowie Reihenfolge ergänzen.
- [x] Stammdaten-Verkaufsplattformen um Erstellen, Bearbeiten und Sortieren per Ziehen und Schaltflächen erweitern.
- [x] Dashboard-, Verkaufsfilter und Verkaufserfassung auf dieselbe Serviceauswahl umstellen; Gebührenzusatz entfernen.
- [x] Vorhandene Plattformidentität für Namen/Logos verwenden und Namen eigener Plattformen berücksichtigen.

### 3. Übersicht und Schnellaktionen

- [x] Bestehende Dashboard-/Diagrammtests an vier Kennzahlen, Marktplatzwahl und korrigierte Altersgruppen anpassen; konkrete Fehlerfälle zuerst rot prüfen.
- [x] Gemeinsame Karten-/Buttonvarianten ergänzen; Dashboard mit Tailwind nach dem Entwurf umsetzen, alte lokale Dashboard-CSS entfernen.
- [x] Titel/Navigation „Übersicht“, dezente Icons, letzte Verkäufe mit Plattformlogos und vier Altersgruppen implementieren.
- [x] Drei Schnellaktionen und fokussierten Marktplatzdialog mit funktionierendem Vinted-Ziel und zwei klaren Platzhaltern umsetzen.
- [x] Diagrammhöhe und Zeigerauswahl verbessern, Palette umstellen, zugängliche Alternative erhalten.

### 4. Prüfung und Abschluss

- [x] Betroffene CI-Auswahl aus den tatsächlichen Änderungen erzeugen; passende bestehende Tests, Auswahlverträge, Format, Lint, Typen und Angular-Bau ausführen.
- [x] Relevante Browserfälle und eigene Interaktionen in ruhender Vorschau prüfen; Desktop/Touch und hell/dunkel mit Screenshots zum Bildentwurf vergleichen.
- [x] Unabhängiger Code-Review, wichtige Befunde beheben und gezielt erneut prüfen.
- [x] Designentscheidung, tatsächliche Prüfergebnisse und verbleibende Lücken im AI-Changelog dokumentieren.
- [x] Geprüften Zweig erhalten und fragen: „Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?“
