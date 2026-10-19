# Apple-orientiertes Flipbase-Design: Recherche und Zielbild

Stand: 19.10.2026. Assistent: Juna. **Status: Recherche und Vorschlag, noch keine Freigabe konkreter globaler Maße und keine UI-Umsetzung.**

## Ergebnis

Der passende Ansatz ist ein gemeinsames Flipbase-Designsystem mit macOS-orientierter Desktop-Dichte und eigener Touch-Darstellung. Die Grundlage sind Apples aktuelle Human Interface Guidelines (HIG); Lissie ist eine zusätzliche Projekt- und Gestaltungsreferenz. Die bestehende Angular-Anwendung und ihre gemeinsamen Komponenten bleiben die technische Grundlage.

Hohe Referenztreue ist möglich. Eine pauschale Zusage „alle Apple-Maße eins zu eins“ wäre derzeit unbelegt: Apple beschreibt verschiedene native Plattformen, adaptive Systemkomponenten und teilweise konkrete Textwerte, aber keine vollständige plattformübergreifende CSS-Spezifikation. Im aktuellen Auftrag wurden keine nativen Apple-Controls auf einem Mac vermessen.

## 1. Prüfgrundlage und Grenzen

- Flipbase-Arbeitsstand: `8f70c528`, einschließlich `origin/master 7b80b8fa` und der bereits lokal abgestimmten Marktplatzänderungen.
- Untersucht: aktuelle Gestaltungsrichtlinie, Dashboard-Plan, Code gemeinsamer Komponenten, globale Styles, Shell/Header, Browser-Testauswahl, PR441–444 und der ursprüngliche Dashboard-Chat.
- Drei getrennte Recherchen: Lissie, Apple-Primärquellen und Dashboard-Historie. Ergebnisse gegen lokale Quellen zusammengeführt.
- Zusätzlich bestehende Marktplatzübersicht und Hinzufügen-Modal in Chromium vermessen: 1440px Hell/Dunkel mit Maus, 834px Hell und 390px Dunkel mit Touch. Ausschließlich simulierte Konten und Antworten; keine realen Konten verändert.
- Keine native macOS-/Safari-Gerätemessung, keine vollständige Browsermatrix, kein neuer vollständiger AXE-/WCAG-Nachweis. Die vier Aufnahmen sind Bestandsbelege, keine globale Abnahme.
- Fremde Hauptcheckout-Dateien bleiben unangetastet. Dort liegt eine ältere, unversionierte Recherche: `K:/GitHub/Repos/flipbase/docs/design/2026-10-18-dashboard-apple-design-review.md`. Deren Feststellungen wurden gelesen, die Datei weder verschoben noch überschrieben.

## 2. Was Lissie tatsächlich gemacht hat

Der Nutzer bestätigte den Namen **Lissie Harness**. Passendes Repository: [GrischaTDev/lissie](https://github.com/GrischaTDev/lissie), geprüft an Commit [4a67c68f](https://github.com/GrischaTDev/lissie/tree/4a67c68f02f034e5701e42bc6d4a6cc9d2477d85). Kein passendes lokales Checkout gefunden; Dokumentation und Quellen schreibgeschützt über GitHub gelesen.

Lissie verwendet Angular 21.2 in Electron 44.7 sowie interne LUI-/Metronic-Pakete. Es ist damit ebenfalls eine Weboberfläche mit Desktop-Hülle. [Paketdefinition](https://github.com/GrischaTDev/lissie/blob/4a67c68f02f034e5701e42bc6d4a6cc9d2477d85/package.json)

Die [Entwicklungsdokumentation](https://github.com/GrischaTDev/lissie/blob/4a67c68f02f034e5701e42bc6d4a6cc9d2477d85/docs/development.md#L39) nennt macOS-Bedienelemente, Apple-Systemschrift auf macOS und Inter unter Windows. Native Windows-Fensterknöpfe bleiben erhalten. Sie verweist auf Apple Buttons, Sidebars, Windows, Fonts und Toolbars.

| Belegter Lissie-Wert                       | Einordnung                                                     |
| ------------------------------------------ | -------------------------------------------------------------- |
| Grundschrift 14px, Buttons 13px            | Eigene Webwerte                                                |
| Hauptbuttons mindestens 38px, Radius 980px | Eigene Kapselgestaltung, keine belegte universelle Apple-Regel |
| Iconbuttons 34px, Aufgabenaktionen 32px    | Desktop-Werte; nicht ungeprüft für Flipbase-Touch geeignet     |
| Werkzeugleiste 61px                        | Projektwert                                                    |
| Dialogradius 23px, Dialogtitel 24px        | Projektwerte                                                   |

Belege: [globale Styles](https://github.com/GrischaTDev/lissie/blob/4a67c68f02f034e5701e42bc6d4a6cc9d2477d85/angular/apps/desktop-ui/src/styles.scss#L82), [Shell](https://github.com/GrischaTDev/lissie/blob/4a67c68f02f034e5701e42bc6d4a6cc9d2477d85/angular/libs/shell/src/lib/shell/shell.scss#L245), [Aufgabenleiste](https://github.com/GrischaTDev/lissie/blob/4a67c68f02f034e5701e42bc6d4a6cc9d2477d85/angular/libs/shell/src/lib/task-toolbar/task-toolbar.scss#L31).

Übernehmbar sind klare Ebenen, gruppierte Aktionen, wenige Umrandungen und gemeinsame Zustände. Nicht belegt ist ein vollständiges Apple-Maßsystem. Lissie setzt global `color-scheme: light`, hat eine Desktop-Mindestfenstergröße von 1040×720px und liefert in den untersuchten Dateien keinen vollständigen Touch-/Dark-Mode-Vertrag. Seine Electron-Drag-Flächen und Fensterknöpfe gehören nicht in Flipbases Browseroberfläche.

## 3. Was am Dashboard bereits vereinbart und umgesetzt wurde

Der nachgelesene Chat heißt **„Dashboard zur Übersicht vereinfachen“**, ID `01a1507b-ba71-7922-a157-cc14d0b64fbd`. Freigegeben wurde der zweite erzeugte Bildentwurf, anschließend ergänzt um Kennzahlenicons und Plattformlogos. Es war keine gemessene Apple-Originaloberfläche.

| PR                                                      | Tatsächlicher Umfang                                                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [441](https://github.com/GrischaTDev/flipbase/pull/441) | Vereinfachte Übersicht, vier Kennzahlen, drei Aktionen, Diagramm und Vorschautabellen; zusätzlich zentrale Verkaufsplattformen |
| [442](https://github.com/GrischaTDev/flipbase/pull/442) | Lange Artikelnamen auf die Tabellenzelle begrenzen                                                                             |
| [443](https://github.com/GrischaTDev/flipbase/pull/443) | Schmale Plattformlogo-Spalte und mehr Platz für Artikelnamen                                                                   |
| [444](https://github.com/GrischaTDev/flipbase/pull/444) | Dunkle Gewinnfarbe und gröbere Diagrammschraffur                                                                               |

Die [bestehende Richtlinie](admin-ui-guidelines.md) und der [Umsetzungsplan](../superpowers/plans/2026-10-18-dashboard-overview-platforms.md) begrenzen die Apple-Variante ausdrücklich auf den Seiteninhalt der Übersicht. Shared Card, Button und PageHeader bekamen opt-in Varianten. Header, Sidebar, allgemeine Selects und DataTable wurden nicht entsprechend umgestellt.

20px-Kartenradien, Kapselaktionen, 280px-Diagrammhöhe, 64%-Säulengruppenbreite und 12px-Schraffur sind freigegebene Flipbase-Entscheidungen. Sie sind keine nachgewiesenen Apple-Originalmaße. Der bisherige begrenzte Umfang entsprach somit dem damaligen Auftrag; der jetzige Auftrag erweitert das Ziel auf die gesamte Verwaltungsoberfläche.

## 4. Was Apple vorgibt und was wir festlegen müssen

### Plattform und Version

Als neue Referenz wird die aktuelle macOS-Produktivitätsoberfläche vorgeschlagen, ergänzt um iPadOS/iOS für Touch. Apple meldete am 14.09.2026 die Verfügbarkeit von macOS 27, iPadOS 27 und iOS 27. Deshalb WWDC25-Beispiele nicht stillschweigend als neuesten unveränderten Stand behandeln. Konkrete OS-Version, Build und Einstellungen werden bei der Messung eingefroren. [Apple-Veröffentlichung](https://www.apple.com/newsroom/2026/09/major-updates-for-apples-software-platforms-are-now-available/)

[Designing for macOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-macos/) und [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) begründen Desktop-Dichte, klare Hierarchie und anpassbare Flächen. Daraus folgt kein einzelnes verbindliches Web-Raster mit universellen Radien.

### Schrift

Die offizielle Typografie enthält native Textstile:

| Textstil    | macOS Größe/Zeilenhöhe in pt | iOS/iPadOS Standard „Large“ in pt |
| ----------- | ---------------------------- | --------------------------------- |
| Large Title | 26/32                        | 34/41                             |
| Title 1     | 22/26                        | 28/34                             |
| Title 2     | 17/22                        | 22/28                             |
| Title 3     | 15/20                        | 20/25                             |
| Body        | 13/16                        | 17/22                             |

[Typography](https://developer.apple.com/design/human-interface-guidelines/typography); vollständig lesbare Tabellen auch in Apples [japanischer Fassung](https://developer.apple.com/jp/design/human-interface-guidelines/typography). Native Punkte sind keine Anweisung, CSS-`pt` einzusetzen. Zeilenhöhe, Fontmetriken, Zoom und tatsächliche Darstellung im Browser müssen gemeinsam geprüft werden.

Vorschlag: vorhandene Systemschrift zuerst auf Apple-Geräten, vorhandenes Inter als Windows-/Web-Fallback. Keine heruntergeladenen SF-Pro-Dateien oder SF-Symbol-Pakete pauschal als Webassets verteilen; deren Ressourcenbedingungen gesondert beachten. [Apple Fonts](https://developer.apple.com/fonts/), [Apple SDK-Lizenz, Abschnitt 2.11](https://images.apple.com/legal/sla/docs/xcode.pdf). Lucide bleibt als vorhandenes Iconset; optische Größe, Strichstärke und Ausrichtung werden vereinheitlicht.

### Controls

Apple unterscheidet Plattformen und sichtbare Controlgröße von ihrer Trefferfläche. Die 28/32/44/52/64-pt-Tabelle auf der Buttons-Seite gehört zu **visionOS**; sie ist keine macOS-Buttonstaffel. [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)

Für Flipbase werden Desktop-Dichte und Touch getrennt definiert. 44×44 CSS-Pixel für gewöhnliche Touchziele ist unser Web-Ziel, keine behauptete punktgenaue Übernahme einer universellen Apple-Regel. Kompakte Datentabellen und erkennbare Fokus-/Lade-/Fehlerzustände bleiben erforderlich.

### Header, Navigation und Materialien

Apple trennt Bedienebene und Inhalt. Toolbars gruppieren zusammengehörige Funktionen; einzelne Icons benötigen nicht alle eine eigene sichtbare Box. [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars), [WWDC25: AppKit](https://developer.apple.com/videos/play/wwdc2025/310/)

Liquid Glass ist für Navigation und Controls gedacht und soll sparsam eingesetzt werden; die Inhaltsebene soll nicht damit überzogen werden. Für Flipbase heißt das: ruhige Formulare und Tabellen, begrenzte Materialwirkung in Shell/Popover, vollständig deckende Alternative. Ein CSS-Blur ist kein vollständiger Nachbau nativen Liquid Glass. [Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [WWDC25: neues Designsystem](https://developer.apple.com/videos/play/wwdc2025/356/)

### Tabellen, Auswahl und Dialoge

- Tabellen: klare Spalten, passende Ausrichtung, Sortierung und bei Bedarf veränderbare Breiten. [Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)
- Flache Einzelauswahl, Aktionsmenü, durchsuchbare Auswahl und Kategoriebaum unterscheiden. Apples Pop-up-Button ist kein Ersatz für jeden dieser Fälle. [Pop-up buttons](https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons), [Menus](https://developer.apple.com/design/human-interface-guidelines/menus)
- Modale Aufgaben kurz und klar begrenzen; Popover verankern; auf engen Ansichten passende große Flächen; Schließen und Schutz ungespeicherter Arbeit gemeinsam lösen. [Modality](https://developer.apple.com/design/human-interface-guidelines/modality), [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets), [Popovers](https://developer.apple.com/design/human-interface-guidelines/popovers/)

### Barrierefreiheit

Semantische Farben, lesbare Kontraste, Textvergrößerung, Tastaturbedienung und reduzierte Bewegung sind Teil des Systems. Eine helle Vorschau genügt nicht. [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode), [Keyboards](https://developer.apple.com/design/human-interface-guidelines/keyboards)

Für Flipbase gelten weiterhin WCAG AA und die vorhandenen AXE-Prüfungen. Transparenz bleibt zusätzliche Darstellung; fehlende Browserunterstützung oder reduzierte Transparenz muss eine voll nutzbare solide Oberfläche ergeben.

## 5. Bestandsaufnahme in Flipbase

51 Komponenten-TS-Dateien in 50 Shared-Komponentenverzeichnissen; 19 dieser Verzeichnisse enthalten SCSS. Das ist keine Liste von 50 neu zu bauenden Controls. Viele fachliche Picker und Medienbausteine können die verbesserten Grundlagen weiterverwenden.

| Bereich                    | Bestehende Dateien unter src/app                                                                                        | Befund / Ziel                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Globale Gestaltung         | `styles/flipbase-theme.css` außerhalb app; `src/styles.css`                                                             | Semantische Farben vorhanden; Geometrie und Typografie teilweise verteilt; globale `linear-*`-/`.fb-admin`-Regeln können Komponentenwerte übersteuern |
| Shell                      | `layout/shell/`, `layout/sidebar/`, `layout/bottom-nav/`                                                                | Gemeinsame Navigation, Seitenbreite, sichere Bereiche und adaptive Dichte zusammen prüfen                                                             |
| Header                     | `layout/header/`                                                                                                        | Workspace, Glocke, Theme und Profil besitzen lokale native Buttons; 14 button-Tags, kein app-button im Template                                       |
| Grundcontrols              | `shared/components/button/`, `text-field/`, `number-input/`, `custom-checkbox/`, `custom-search-input/`, `date-picker/` | Größen, Trefferflächen, Beschriftung und Zustände zusammenführen                                                                                      |
| Auswahl                    | `custom-select/`, `search-multi-select/`, `category-picker/`, `attribute-picker/`, `brand-picker/`, `article-picker/`   | Bestehende Verträge und Tastaturbedienung bewahren; Menü, Auswahl und Hierarchie unterscheiden                                                        |
| Flächen und Überschriften  | `card/`, `page-header/`, `entry-page-layout/`, `two-column-layout/`, `split-pane/`                                      | Weniger unnötige Verschachtelung, einheitliche Überschriften und Seitenabstände                                                                       |
| Tabellen                   | `data-table/`, `table-sort-header/`, `table-action-button/`, `table-column-menu/`, `table-column-picker/`               | Toolbar, Filter, Zeilen, Auswahl, Summen und schmale Darstellung gemeinsam abstimmen; Feature-Templates projizieren teilweise eigene Tabellen         |
| Dialoge                    | `modal-shell/`, `confirm-dialog/`, `workspace-modal/`; `shared/directives/modal-dialog.directive.ts`                    | Ein Titel-/Inhalt-/Aktionsvertrag; Fokus, Escape und Fokusrückgabe erhalten                                                                           |
| Rückmeldungen              | `badge/`, `notice-banner/`, `toast/`, `loading-indicator/`, `cost-state/`                                               | Einheitliche semantische Zustände statt beliebiger zusätzlicher Boxen                                                                                 |
| Navigation                 | `route-tabs/`, `section-navigation/`                                                                                    | Auswahl und Fokus klar, Hover nicht Voraussetzung für Bedienung                                                                                       |
| Fachliche Shared-Bausteine | Marktplatzidentität, Medien/Galerie, Rechnungs-/Scanner-/Bilddialoge, Historie, Chart                                   | Nach Grundlagenmigration gezielt visuell und funktional prüfen; nicht fachlich neu bauen                                                              |

Die Verzeichnisse sind vorhandene Zuständigkeiten, keine Zusage zusätzlicher Komponenten.

### Gemessene Browserwerte des Iststands

| Element                    | Desktop 1440px                   | Touch 834/390px       |
| -------------------------- | -------------------------------- | --------------------- |
| Header                     | 56px hoch                        | 56px hoch             |
| Workspace-Trigger          | 36px hoch, Text 13px, Radius 8px | weiterhin 36px        |
| Glocke / Theme             | 36×36px, Radius 8px              | weiterhin 36×36px     |
| Gemeinsamer Standardbutton | 28px hoch, Text 13px             | 44px hoch             |
| Titel Marktplatzübersicht  | 20px/28px, Gewicht 450           | gleicher Textstil     |
| Modal-X                    | 32×32px                          | weiterhin 32×32px     |
| Hinzufügen-Modal           | nach Einblendung 12px Radius     | ebenfalls 12px Radius |

Inter war im gemessenen Browser geladen. Das Modal zeigt beispielhaft das Kaskadenproblem: `ModalShell` fordert `rounded-2xl`, die globale `linear-surface`-Klasse setzt effektiv 12px. Nur Tailwind-Klassen im Template auszutauschen wäre deshalb unzuverlässig.

Aufnahmen und JSON-Messwerte liegen als lokale Sitzungsartefakte unter `C:/Users/Grisc/.codex/visualizations/2026/10/15/01a14148-c12a-7441-8dce-be7cc65c7d4d/apple-design-audit/`. Anfangs erfasste Zwischenwerte aus der Modalanimation wurden verworfen und nach abgeschlossener Einblendung erneut erhoben. Die vier finalen Messläufe waren erfolgreich.

## 6. Empfohlenes Zielbild

**Header:** links eindeutiger Workspace-Kontext, rechts eine ruhig zusammengehörige Gruppe aus Glocke, Theme und Profil. Einheitliche optische Achse, Trefferflächen und verankerte Menüs. Theme bleibt zwischen Glocke und Profil. Weniger sichtbare Einzelrahmen. Workspace-Sperren und Benachrichtigungsabläufe bleiben erhalten.

**Sidebar:** kompakte Mac-orientierte Navigation am Desktop; klare aktive Zeile, zurückhaltende Gruppenlabels und brauchbare Touchzeilen. Desktop-Dichte nicht allein aus Bildschirmbreite ableiten. Die vorhandene mobile Navigation bleibt eine eigene passende Darstellung.

**Inhalt:** Flächen nur dort, wo sie Gruppierung erklären. Kein allgemeines Card-in-Card-Muster, kein Glas auf Datentabellen. Bestehende globale Breiten 1024/1280/voll bleiben.

**Formulare:** klare Feldbeschriftung, einheitliche Höhen/Ausrichtung, fokussierte Fehler direkt am Feld. Einfache Auswahl und durchsuchbarer Kategoriebaum bleiben unterscheidbar. Lange Inseratformulare sollen nicht durch riesige Abstände unnötig wachsen.

**Tabellen:** datenorientierte Dichte mit ausgerichteten Text-/Zahlenspalten und konsistenten Aktionsstellen. Mehrfachauswahl, Sortierung, Pagination, Spaltenwahl, unbekannte Werte und Touchbedienung erhalten.

**Dialoge:** eine erkennbare Aufgabe, klare Hauptaktion und angemessene Nebenaktionen. Bestehende Marktplatz-Kontoköpfe mit Logo links, Identität mittig daneben und Status rechts erhalten und systematisch einpassen.

**Marke:** Logo und `#fcc601` bleiben. Apple-Nähe erfordert keine blaue Marke. Freigegebene Diagrammfarben und Funktionsbedeutungen bleiben Ausgangspunkt.

## 7. Messvertrag statt geschätzter „Apple-Maße“

Jeder Zielwert erhält eine Herkunft:

- **A – Apple dokumentiert:** exakte Quelle, Plattform und native Einheit.
- **M – gemessene Referenz:** App/Control, OS-Build, Thema, Textgröße, Eingabemethode, Auflösung/Skalierung, Zustand und Messbild.
- **F – Flipbase-Webentscheidung:** bewusste Browserübertragung mit Begründung und Abnahme.

Für jedes Control festhalten: sichtbare Höhe/Breite, Trefferfläche, Schrift/Zeilenhöhe/Gewicht, Icongröße, Innen-/Außenabstände, Radius, Farbe, Fokus und Zustände. Normal, Hover, gedrückt, ausgewählt, deaktiviert, Laden, Fehler und Tastaturfokus getrennt erfassen.

Als **vorläufige F-Kandidaten**, nicht als Apple-Norm: Desktop-Controls in den vorhandenen Rollen 28/32/36px prüfen, Touchziele mindestens 44px; Desktop-Lesetext 13–14px und längere Formulartexte gegebenenfalls größer; Hauptseitentitel an 26/32 der Mac-Referenz abgleichen. Erst ein gerenderter Prototyp legt die endgültigen CSS-Werte fest. Keine universellen Karten-/Modalradien vor der Referenzmessung behaupten.

## 8. Umsetzung und Freigabepunkte

1. Referenz und Messvertrag vervollständigen; gerenderte Musteransicht mit Header, Tabelle, Formular und Modal in Hell/Dunkel sowie Desktop/Touch.
2. Nach Abnahme Grundlagen und globale Kaskade ordnen; bestehende Shared-Komponenten weiterentwickeln.
3. Shell, Header und Menüs umstellen.
4. Formulare, Auswahl und Dialoge umstellen.
5. Tabellen und tatsächliche Feature-Verbraucher schrittweise umstellen.
6. Alte Varianten nur entfernen, wenn alle Einsatzstellen migriert und geprüft sind.

Kein zweites paralleles `AppleButton`-/`AppleSelect`-System, keine neue UI-Bibliothek, kein Frameworkwechsel. Kleine abgeschlossene PRs statt eines unüberschaubaren Gesamtumbaus. Bestehende Fachfunktionen und Backend-Prozesse gehören nicht in diesen Designumbau.

Die derzeit verbindliche Shopify-Richtlinie wird in dieser Recherche noch nicht ersetzt. Nach Abnahme des neuen Musterstands erhält sie eine klare neue Rangfolge und einen Verweis auf das gemessene Apple-orientierte Zielsystem. Steuer/DATEV bleibt im Seiteninneren vorerst auf Tabellen beschränkt; die gemeinsame Shell gilt auch dort.

Der konkrete Arbeitsplan steht in [Apple-Designsystem: Umsetzungsplan](../superpowers/plans/2026-10-19-apple-design-system.md).

## 9. Nutzerpräzisierung und zugängliches Apple-Kit vom 19.10.2026

Die separate Artikeldemo entsprach nicht dem gewünschten echten Seitenumbau. Der Nutzer verlangt die vorhandene Übersicht als Arbeitsgrundlage und tatsächliche Kit-Komponenten einschließlich geöffneter Auswahlmenüs. Der bisherige Demo-Einstieg wird verworfen; die freigegebenen gedeckten Kleidungsplatzhalter werden im vorhandenen Produktbildbaustein erhalten.

Mit dem bereitgestellten Figma-Dateilink ist das macOS-27-Kit strukturell und als Screenshot lesbar. Nodes 4354:7698/4354:7867 zeigen Button und Menü in Hell/Dunkel; 483:6228 und 218:4483 zeigen unterschiedliche Popup-Kontexte, 4356:13469 einen Tabellenkopf. Gelesene Maße bilden die neue Quellenklasse K; sie sind weiterhin keine Gerätemessung M. Konkrete Werte und Webübertragungen stehen in [apple-ui-reference.md](apple-ui-reference.md).

Zusätzlich die offiziellen [Design Resources](https://developer.apple.com/design/resources/), [Safari-Webhinweise](https://developer.apple.com/documentation/webkit/optimizing-your-website-for-safari) und [Web-View-HIG](https://developer.apple.com/design/human-interface-guidelines/web-views) geprüft. Kein separates allgemeines Apple-Web-UI-Kit gefunden. Web views bezeichnet native Einbettung, keine Web-Komponentenbibliothek. Deshalb macOS als visuelle Referenz und Safari/Webstandards als ergänzende Umsetzungsanforderungen verwenden. Keinen universellen Apple-CSS-Maßstandard behaupten.
