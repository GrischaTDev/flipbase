# Wiederverkauf-Kategorien filtern – Umsetzungsplan

> Ausführung: Juna setzt den ausdrücklich freigegebenen Umfang selbst in dieser Sitzung um. Bestehenden eigenen Kategorie-Zweig weiterverwenden.

**Goal:** Die freigegebenen Ausschlüsse auf neue Kategorieauswahl und Suche anwenden, vollständige Originaldaten und bestehende Zuordnungen erhalten.

**Architecture:** Kleine Regeln je Datenquelle; gemeinsame Entscheidung über auswählbare Kategorien und notwendige Navigationspfade. Die vorhandenen Quellen und der gemeinsame Wähler bleiben bestehen. Datenbankabfragen der internen Kategorien filtern vor dem Suchlimit; Einzelabrufe bestehender Werte bleiben vollständig.

**Tech Stack:** Bestehendes Angular 22, TypeScript, Supabase und vorhandene Tests. Keine neuen Abhängigkeiten oder Schemaänderungen.

**Spec:** `docs/research/2026-10-17-fashion-category-scope.md`, Nutzerfreigabe vom 17.10.2026.

## Verbindliche Grenzen

- Nur die vier freigegebenen Ausschlussgruppen entfernen; übrige Sortimente und nicht zusätzlich entschiedene Bereiche erhalten.
- Bekleidungsausnahmen erhalten; Kinderwagen und Autositze nicht als Fahrzeuge behandeln.
- Keine Originaldaten, Fremdkennungen, Herkunfts-/Lizenznachweise oder bestehende Werte löschen/umbenennen.
- Allgemeine Liste heißt Flipbase-Kategorien; Vinted und Kleinanzeigen bleiben eigene Quellen.
- Nur bestehende Auswahloberflächen ändern; keine Veröffentlichung auf zusätzliche Kategorien erweitern.

## Besondere Prüfpunkte

- Bestehende ausgeblendete Kategorie bleibt sichtbar und kann unverändert gespeichert werden.
- Ausgeblendete Eltern dürfen notwendige Bekleidungspfade zeigen, aber nicht neu auswählbar sein.
- Suche und Baum haben dieselben Regeln; entfernte Treffer dürfen die 50 sichtbaren Suchtreffer nicht verdrängen.
- Fachfremde Kinder unter erhaltenen Bereichen ebenfalls entfernen, etwa Fahrräder unter Sport und Tierbedarf unter Home.
- Nicht nach Namen filtern: Spielzeuglebensmittel und Lebensmittelbehälter bleiben Waren, Kabelschuhe keine Bekleidung.

## Aufgaben

### 1. Filter an allen drei Quellen

Dateien: kleine Auswahlregeln in `core/models/` und den jeweiligen Feature-Modellen; bestehender `product-category.service.ts`, `vinted-category-source.ts`, `kleinanzeigen-category-source.ts`.

- [x] Fehlende Filter mit realen Anbieterkennungen in bestehenden Quellentests rot nachweisen.
- [x] Ausschluss-/Bekleidungsausnahmen anhand der untersuchten vollständigen Bäume implementieren.
- [x] Bei internen Datenbankabfragen Regeln vor Begrenzung anwenden; getById ungefiltert erhalten.
- [x] Modelle/Services prüfen und tatsächliche Ergebnisse mit allen drei Originalbeständen vergleichen.

### 2. Gemeinsamer Wähler und Benennung

Dateien: `product-category.models.ts`, bestehender `category-picker` sowie aktuelle Kategorienkommentare/-dokumentation.

- [x] Rote Regression für nicht auswählbaren Navigationspfad ergänzen.
- [x] Ausgeblendete Eltern nur zur Navigation anzeigen; gespeicherte Werte weiter auflösen.
- [x] Aktuelle allgemeine Kategoriebezeichnungen auf Flipbase-Kategorien umstellen; Herkunft/Lizenz und historische Importdateien erhalten.
- [x] Betroffene Komponentenfälle, Browserbreiten/Farbschemata und AXE prüfen.

### 3. Prüfung und eBay-Einordnung

- [x] Testauswahl aus geänderten Dateien/Einsatzstellen bestimmen; Registrierung prüfen, Typen/Lint/Format und Produktionsbau ausführen.
- [x] Aktuelle eBay-Dokumentation zu Marktbaum, Version und Pflichtmerkmalen mit vorhandenem Code vergleichen; nächsten sinnvollen Schritt dokumentieren.
- [x] Sitzungsprotokoll und tatsächliche Grenzen aktualisieren. Lokalen Stand sichern, keinen neuen Push/PR ohne die vorgesehene Freigabe starten.

Lokale Ausführung abgeschlossen. Die im Umsetzungsbericht abgegrenzten breiten CI-Prüfungen bleiben vor einem Merge erforderlich.
