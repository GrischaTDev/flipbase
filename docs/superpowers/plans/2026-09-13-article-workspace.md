# Artikelverwaltung und Bestandsübersicht – Umsetzungsplan

**Ziel:** Bearbeitbare Artikel und eine übersichtliche Bestandsliste in einem
gemeinsamen Bereich „Artikel“ mit den Ansichten „Alle Artikel“ und „Bestand“.

**Architektur:** Bestehende Katalogartikel und einzelne Bestandsstücke behalten
ihre Kennungen und Belegverknüpfungen. Eine neue Katalogdetailseite ergänzt die
bereits vorhandenen Stückdetails. Navigation und Darstellung vereinheitlichen
die Einstiege, ohne historische Stücke anhand gleicher Namen zusammenzuführen.

**Technik:** Angular 22, Signals, bestehende Shared-Komponenten, Supabase.

**Freigegebener Entwurf:** `docs/audit/2026-09-13-inventory-model-review.md`,
Abschnitt „Präzisierung: Navigation und Tabellen“, und Nutzerfreigabe „dann bitte
umsetzen“. Der vorangehende steuerliche Datenmodellumbau bleibt ein gesonderter
Arbeitsschritt; dieser Plan setzt den zuletzt konkret freigegebenen Bedienumbau um.

## Vorgaben

- AGENTS.md und docs/design/admin-ui-guidelines.md befolgen; Logo-Gelb #fcc601.
- Vorhandener eigener Worktree codex/inventory-model-review auf aktuellem master.
- Gemeinsame Komponenten, externe Templates, OnPush, keine neuen Abhängigkeiten.
- Bestehende Links /catalog und /inventory bleiben erreichbar.
- Historische Einkaufs- und Verkaufsangaben nicht über Stammdaten überschreiben.
- Fehler, unbekannte Mengen und tatsächliche Bestandskonflikte bleiben erkennbar.
- Kein Push, PR oder Merge ohne die vorgeschriebene abschließende Freigabe.

## 1. Artikel öffnen und bearbeiten

Schreibbereich: `core/services/catalog.service.ts` und zugehörige Tests,
`features/catalog/pages/product-detail/*`; nötige Beschreibungserweiterung in
Modellen und deklarativem Schema einschließlich erzeugter Migration/Typen.

- [x] Service `updateProduct(productId, input)` liefert `MutationResult<CatalogProduct>`;
      schützt Workspace-Zuordnung, erhält nicht bearbeitete Medien/Bestandsfelder,
      aktualisiert Demo und echte Daten ohne Neuanlage oder Belegänderung.
- [x] Route `/catalog/:id` bekommt eine ladbare Detailseite mit Name, Marke,
      Modell, EAN, Kategorie, Beschreibung, allgemeinen Bildern und Shopdaten.
      Speichern, Fehler, fehlender Artikel, Workspacewechsel und ungespeicherte
      Änderungen werden sauber behandelt; Formular darf laufende Eingaben nicht
      durch einen Reload überschreiben.
- [x] Detailseite enthält Abschnitt „Bestand“ mit echten vorhandenen
      Produktpositionen und Einkaufsverweisen; `?view=stock` aktiviert diesen Abschnitt.
- [x] Gezielte Tests: Änderung statt Neuanlage; Workspacewechsel und Fehler;
      Medienspeicherfehler; alter Einkaufstext bleibt unverändert.

## 2. Bestandsdarstellung reduzieren

Schreibbereich: `features/inventory/*` außer vorhandener Stückdetailseite;
Inventarabschnitt in `core/config/table-defaults.config.ts` und nötige Tests.

- [x] Standardspalten: Artikel/Bild, auf Lager, verfügbar, reserviert; Auswahl
      und zurückhaltende Aktionen bleiben möglich. Herkunft, Kosten, Wert, Zustand,
      Verkauf optional. Keine zusammengesetzte Absatzsammlung in der Mengenzelle.
- [x] Auf Lager schließt ausgelieferte Stücke aus, enthält aber anwesende nicht
      verfügbare Ware. Unbekannte Mengen erscheinen nicht als Null. Historische
      Verkäufe über eigene Ansicht erreichbar, aktive Konflikte bleiben sichtbar.
- [x] Katalogbezogene Zeilen verlinken `/catalog/:id?view=stock`, einzelne Stücke
      ihre vorhandenen Details. Zugehörige Stücke nur bei nachgewiesener Verbindung
      gruppieren, niemals allein wegen identischer Namen oder EAN zusammenführen.
- [x] Primäraktion „Einkauf erfassen“ statt „Produkt erstellen“ im Bestand.
- [x] Mobile Darstellung und vorhandene Filter/Archiv/Etiketten erhalten;
      gespeicherte Nutzeransichten verträglich übernehmen, einfache Defaults anwenden.
- [x] Mengen-/Darstellungstests und relevante Komponentenprüfungen durchführen.

## 3. Gemeinsame Navigation und vollständige Artikelliste

Schreibbereich: Layout/Navigation, `app.routes.ts`, `features/catalog/catalog.component.*`,
neue featurebezogene Navigationskomponente und gegebenenfalls Listenadapter,
Katalogabschnitt der Tabellenkonfiguration, Übersetzungen und Integrationsprüfungen.

- [x] Ein Hauptmenüpunkt „Artikel“, aktiv für Katalog und Bestand samt Details.
      Unteransichten über zugängliche Navigationslinks „Alle Artikel“/„Bestand“.
- [x] Katalogtitel werden echte Links. Erstellter Artikel öffnet seine Details.
      Auch eigenständige Bestandsstücke sind in „Alle Artikel“ auffindbar; keine
      doppelte Anzeige eines nachweislich bereits zum Katalog gehörenden Stücks.
- [x] Nachverfolgung/Mengenartikel aus dem täglichen Katalog entfernen.
- [x] Such-/Filterzustand und Rückweg erhalten; Desktop und Mobil konsistent.
- [x] Router-/Listentests, Angular-Bau, gezieltes Lint/Format und Browserabläufe
      einschließlich Tastatur und AXE; unabhängiges Review und Befunde beheben.

## Fortschritt

- [x] Bestehenden eigenen Worktree und unveränderten aktuellen master geprüft.
- [x] Freigegebenen Entwurf und Schreibbereiche abgegrenzt.
- [x] Implementierung und Einzelprüfungen.
- [x] Integration, Browserabnahme und Review.
- [x] AI-Änderungsprotokoll mit tatsächlichen Ergebnissen; Abschlussfrage zum PR.

## Abnahme

- 132 gezielte Node-Tests und 119 Angular-Tests erfolgreich.
- 34 Browserfälle mit Playwright erfolgreich: Desktop/Mobil, hell/dunkel,
  Tastatur, AXE, Bearbeiten und Neuladen, Suche/Rückwege, Bilder, Reservierungen,
  Verkauf, Archiv, Spaltenpräferenzen und Einkaufseinstiege.
- Produktionsbau, Anwendungs- und Test-Typprüfung, gezieltes ESLint/Prettier,
  Shared-UI-Prüfung, Suite-Audit und `git diff --check` erfolgreich.
- Beschreibungsmigration durch CLI erzeugt, generierte Typen abgeglichen;
  159 Datenbankprüfungen in isolierter lokaler Instanz erfolgreich. Historische
  Einkaufsdaten und Workspacegrenzen bleiben erhalten.
- Drei P2-Befunde des unabhängigen Reviews behoben und nachgeprüft:
  versteckten Shoppreis erhalten, Reservierungsberechnung vereinheitlichen,
  erfolgreichen Bildupload bei Workspacewechsel im richtigen Entwurf quittieren.
- Browser plugin not available; vorhandene Playwright-Installation verwendet.
  Screenshots visuell geprüft, Artefakte außerhalb des Repositorys unter
  `C:/Users/Grisc/AppData/Local/Temp/flipbase-article-final-qa`.
- Kein Commit, Push, PR oder Produktionszugriff. Die nächste Aktion ist die
  in AGENTS.md festgelegte Freigabefrage zur Veröffentlichung.
