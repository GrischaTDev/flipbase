# Shopify Admin: live geprüfte Gestaltungsreferenz

Messdatum: 6. September 2026. Angemeldeter Shopify Admin im Codex-Browser, helle Oberfläche. Zunächst Viewport 968 × 1214 CSS-px, später durch Änderung der Browseransicht 1482 × 1214 CSS-px. Browserzoom nicht separat verifiziert. Werte aus `getComputedStyle()` und `getBoundingClientRect()`, einschließlich offener Shadow Roots; ergänzend sichtbare Screenshots und Bedienproben. Keine Shopdaten gespeichert, keine Exporte ausgeführt, keine Einstellungen geändert. Testsuche und temporäre Produktauswahl zurückgesetzt; leeren Bestellentwurf ohne Speichern verlassen.

Diese Referenz ergänzt die [Designrichtlinien](admin-ui-guidelines.md) und ersetzt dort frühere Annahmen über noch nicht zugängliche Admin-Maße. Sie ist eine untersuchte Stichprobe der Komponentenfamilien, keine Behauptung, jede Shopify-Unterseite und jeder Zustand sei vollständig getestet.

## Tatsächlich durchgegangene Seiten und Zustände

Routen sind relativ zum geöffneten Shop angegeben. Geschäftsinhalte und personenbezogene Werte werden hier nicht übernommen.

| Seite                | Route                   | Geprüfte Oberfläche und Bedeutung für Flipbase                                                                                                                                                                    |
| -------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inventar             | `/products/inventory`   | Gefüllte Tabelle, horizontaler Überlauf bei schmaler Ansicht, Anzeigeoptionen, Spaltenliste, Sortieruntermenü, Filterkategorien und Produktstatus-Unterauswahl, Exportdialog. Wichtigste Inventarreferenz         |
| Produkte             | `/products`             | Tabelle mit Bild, Status, Nebenaktionen; Auswahl aktiviert und wieder aufgehoben. Auswahlleiste bietet Anzahl, Sammelbearbeitung und Aktionsmenü                                                                  |
| Produktdetail        | `/products/:id`         | Titel, Beschreibung/Rich-Text-Werkzeugleiste, Medienbereich, Preis, Bestandstabelle, Versand, Varianten, Status, Organisation, Tags, Suchmaschinenabschnitt. Karten und Felder gemessen; keine Inhalte bearbeitet |
| Kollektionen         | `/collections`          | Gefüllte Tabelle; Suche ohne Treffer ausgelöst und geleert. Toolbar bleibt sichtbar; eigener Hinweis und Aktion „Suche und Filter löschen“                                                                        |
| Einkaufsbestellungen | `/purchase_orders`      | Gefüllte kompakte Tabelle, Status-Badges, Transferbezug, Mengen und rechtsbündige Summen. Starkes Vorbild für Einkäufe                                                                                            |
| Einkaufsdetail       | `/purchase_orders/:id`  | Herkunft/Ziel, Chronik, Kommentarfeld und Werkzeuge, Kostenübersicht, Bestelldetails, Transferbezug, Tags. Keine Kommentare abgesendet                                                                            |
| Transfers            | `/transfers`            | Kennzahlen mit Zeitraum über gemeinsamer Tabellentoolbar; gefüllte Tabelle und Vorschauaktionen                                                                                                                   |
| Gutscheine           | `/gift_cards`           | Leere Ressource mit Titel, Erklärung, Erstellaktionen und deaktiviertem Export                                                                                                                                    |
| Kunden               | `/customers`            | Segmenteingabe, Suche, Anzeigeoptionen und leerer Ergebniszustand                                                                                                                                                 |
| Neuer Kunde          | `/customers/new`        | Eigene Formularseite, keine kleine Eingabemaske: Identität, Sprache, Kontakt, Adresse, Steuerdetails, Notizen, Tags; deaktivierte abhängige Einwilligungsfelder                                                   |
| Bestellungen         | `/orders`               | In diesem Testshop nur Einstieg mit Planhinweis; gefüllte Verkaufsbestellliste nicht verfügbar                                                                                                                    |
| Bestellentwürfe      | `/draft_orders`         | Leerer Einstieg mit Erklärung und Erstellaktion                                                                                                                                                                   |
| Neuer Bestellentwurf | `/draft_orders/new`     | Kontextuelle Speicherleiste oben; Produkt-/Zahlungskarten, Kunde und Notizen. Dialog „Benutzerdefinierter Artikel“ geöffnet, ohne Eingaben abgebrochen; Entwurf verworfen                                         |
| Rabatte              | `/discounts`            | Leerer Einstieg und Dialog zur Auswahl einer Rabattart; neuere Dialogimplementierung gemessen                                                                                                                     |
| Startseite           | Shopwurzel              | Onboarding-/Empfehlungskarten, erklärende Texte, Fortschritt, Aktionen und KI-Eingabe. Eigenständige Kartenfamilie, kein Vorbild für jede Arbeitskarte                                                            |
| Statistiken          | `/analytics`            | Kennzahlen, Diagrammkarten, tabellarisch zugängliche Diagrammdaten, Keine-Daten-Zustände; Datumspopover mit Vorauswahl, Kalender, Zeitraumfeldern, Abbrechen/Anwenden                                             |
| Inhalt               | `/content/metaobjects`  | Such-/Ansichtsleiste und Metaobjektübersicht                                                                                                                                                                      |
| Märkte               | `/markets`              | Baum-/Diagrammansicht neben Liste; eigene Filter und Sortierung                                                                                                                                                   |
| Finanzen             | `/finance`              | Hinweisfläche, Steuerabschnitt und Auszahlungskarten                                                                                                                                                              |
| Wachstum             | `/growth`               | Einführung, Kennzahlen mit Zeitraum, Kampagnenbereiche                                                                                                                                                            |
| Einstellungen        | `/settings`             | Eigener großer Bereich mit interner Navigation und gruppierten Abschnitten; unterschiedliche Kartenrollen                                                                                                         |
| Standorte            | Einstellungs-Unterseite | Tabs Alle/Aktiv/Inaktiv/Physische Storefront, Suchen/Filtern/Sortieren, ergänzende App-Karte                                                                                                                      |

Navigationsbaum einschließlich auf-/zugeklappter Untergruppen geprüft. App-Installationen, Theme-Editor, Abrechnung, Zahlungsaktivierung und sämtliche schreibenden Fachabläufe sind nicht Teil dieser Designprüfung.

## Gemessene Geometrie und Typografie

| Baustein/Zustand             | Tatsächlich gemessen                                                                             | Übertragung                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Adminrahmen                  | Topbar 56 px hoch, Sidebar 240 px breit in beiden Ansichten; Inhaltsgrund `#f1f1f1`              | Grundgerüst gemeinsam mit Inhaltsbreite abgleichen                               |
| Schriftfamilie               | Inter, danach sprach-/systemabhängige Ersatzschriften                                            | Vorhandenes lokales Inter passt grundsätzlich; Gewichte ebenfalls abgleichen     |
| Normaltext                   | häufig 13/20 px, Gewicht 450, Farbe `#303030`                                                    | Keine pauschale Vergrößerung aller Verwaltungsbausteine                          |
| Regulärer Seitentitel        | Inventar 18/24 px, Gewicht 600                                                                   | Gilt für Arbeitsseiten; Startseite hat eigenes Titelmuster                       |
| Standard-Arbeitskarte        | Weiß, Radius 12 px, mehrteiliger Schatten; `section.level-1`                                     | Ziel für Card/Surface und Tabellencontainer                                      |
| Karteninnenabstand           | `padding-base`: 16 px; `padding-none`: 0 px mit separat gegliederten Kindern                     | Keine zusätzliche doppelte Innenpolsterung                                       |
| Verschachtelter Abschnitt    | Produktdetail `section.level-2`: Radius 0, kein Schatten, transparent, kein eigenes Padding      | Gruppierung benötigt nicht automatisch eine zweite sichtbare Karte               |
| Tabellencontainer            | Inventar 680 px breit im 968-px-Viewport, Kollektionen 1194 px im 1482-px-Viewport; Radius 12 px | Breite ist kontextabhängig, kein fixer 680-px-Token                              |
| Tabellenkopf                 | Inventar/Einkäufe 36 px; Hintergrund `#f7f7f7`, Text `#616161`, 12/16 px, Gewicht 550            | Tatsächliche Gesamthöhe messen, nicht nur CSS-Mindesthöhe                        |
| Sortierbutton im Kopf        | 28 px hoch, 6 px Padding, kein eigener Radius                                                    | Darf die Kopfzeile nicht durch zusätzliche Abstände aufblasen                    |
| Inventarzellen               | 52 px hoch, inkl. Bild-/Produktdarstellung                                                       | Mit Flipbases notwendigen Zusatzzeilen gesondert vergleichen                     |
| Einkaufszellen               | 33 bzw. 36 px je Zeileninhalt, 12/16 px                                                          | Nicht sämtliche Tabellen zwangsweise auf Inventarhöhe bringen                    |
| Basis-/Toolbarbutton         | 28 px hoch, Radius 8 px, 12/16 px, Gewicht 550; Textbutton Padding 6 px 12 px                    | Eigene kompakte Variante; allgemeines globales min-height entfernen              |
| Iconbutton der Toolbar       | 28 × 28 px, Padding 4 px, Radius 8 px                                                            | Zugänglichen Namen und tatsächliche Trefferfläche prüfen                         |
| Ansichtsumschalter           | 24 px hoch, Radius 8 px, 13/20 px, Gewicht 450                                                   | Andere Rolle als primärer Seitenbutton                                           |
| Feldrahmen im Produktdetail  | 32 px hoch, Radius 8 px, Grund `#fdfdfd`, 0,66 px Inset-Schatten `#8a8a8a`                       | Sichtbarer Rahmen liegt teilweise auf separatem Backdrop, nicht dem input selbst |
| Checkbox                     | Sichtbare Fläche 16 × 16 px, Radius 4 px, Inset-Kontur 0,66 px                                   | Sichtbare Größe nicht mit kompletter Klickfläche verwechseln                     |
| Badge                        | 20 px hoch, Radius 8 px, 12/16 px, Gewicht 550; Padding 2 px 8 px, mit Icon links 4 px           | Kein pauschales vollständig rundes Pill-Design                                   |
| Erfolgs-Badge                | Grund `#affebf`, Text `#014b40`                                                                  | Fachliche Statusfarbe getrennt vom Marken-Gelb                                   |
| Informations-Badge           | Grund `#d5ebff`, Text `#003a5a`                                                                  | Gleiche Form wie andere Status-Badges                                            |
| Spaltenpopover               | Breite 276 px, Höhe 263 px im untersuchten Zustand, Radius 12 px                                 | Höhe folgt Inhalt; Breite als konkrete Referenz führen                           |
| Sortieruntermenü             | Breite 142 px, Höhe 297 px, Radius 12 px; Optionen 28 px hoch                                    | Kein willkürlich breites identisches Zweitpanel                                  |
| Kalenderpopover              | 550 × 393 px, Radius 12 px im untersuchten Zustand                                               | Vorauswahl links, Kalender rechts, Aktionen unten                                |
| Normaler Dialog              | Beide gemessenen Varianten 620 px breit, Radius 16 px                                            | Höhe folgt Inhalt; Schatten/Motion unterscheiden sich nach Generation            |
| Einstellungsrahmen           | Beim 968-px-Viewport 968 × 1158 px, oben Radius 12 px, unten 0                                   | Eigene Seitenebene, kein gewöhnlicher 620-px-Dialog                              |
| Startseiten-Empfehlungskarte | 338 × 320 px im 968-px-Viewport, Radius 24 px                                                    | Nur für entsprechende Einstiegs-/Empfehlungsrolle verwenden                      |

**Wichtiger Quellenunterschied:** Die öffentlichen Visual-Design-Richtlinien nennen mindestens 13 px für normalen/interaktiven Text. Der gemessene interne Admin verwendet bei kompakten Buttons und Tabellen auch 12 px. Das ist ausdrücklich keine pauschale Freigabe für kleinere Schrift. Vor Umsetzung als bewusste Dichteentscheidung mit Lesbarkeit, Zoom, Kontrast und Zielgrößen abgleichen. Interne Bedienfehler nicht nachbauen: Im geprüften Sortiermenü blieb nach Öffnen und einmal Pfeil-nach-unten der Fokus auf „Produkt“. Daraus folgt weder ein vollständiger Tastaturtest noch ein brauchbarer Tastaturvertrag für Flipbase.

## Schatten und Bewegung: genaue Referenzen

Gemessener Schatten normaler Arbeitskarten:

```css
box-shadow:
  0 5px 5px -2.5px rgb(0 0 0 / 3%),
  0 3px 3px -1.5px rgb(0 0 0 / 2%),
  0 2px 2px -1px rgb(0 0 0 / 2%),
  0 1px 1px -0.5px rgb(0 0 0 / 3%),
  0 0.5px 0.5px 0 rgb(0 0 0 / 4%),
  0 0 0 1px rgb(0 0 0 / 6%);
```

Gemessener Schatten der Spalten-, Sortier- und Kalenderpopover:

```css
box-shadow:
  0 8px 24px -8px rgb(0 0 0 / 28%),
  0 8px 16px -4px rgb(0 0 0 / 5%),
  0 3px 6px 0 rgb(0 0 0 / 5%),
  0 2px 4px 0 rgb(0 0 0 / 5%),
  0 1px 2px 0 rgb(0 0 0 / 5%),
  0 0 0 1px rgb(0 0 0 / 6%);
transition:
  opacity 250ms cubic-bezier(0.19, 0.91, 0.38, 1),
  transform 250ms cubic-bezier(0.19, 0.91, 0.38, 1);
```

Weitere nachgewiesene Unterschiede:

- Neuer Rabattart-Dialog: 250 ms für opacity/transform sowie diskrete display-/overlay-Übergänge, dieselbe Kurve wie Popover. Schatten: `0 20px 32px -12px #0003`, `0 10px 16px -6px rgb(0 0 0 / 8%)`, `0 3px 6px rgb(0 0 0 / 8%)`, `0 2px 4px rgb(0 0 0 / 8%)`, `0 1px 2px rgb(0 0 0 / 5%)`, `0 0 0 1px rgb(0 0 0 / 6%)`.
- Älterer Inventar-Exportdialog: transform 150 ms mit derselben Kurve; Schatten `0 8px 16px -4px rgb(26 26 26 / 22%)`. Backdrop schwarz mit 50 % Deckkraft, Fade-in 200 ms. Kein Beweis, dass alle Dialoge diesen älteren Stil benutzen sollen.
- Startseitenkarten: height/transform/box-shadow 350 ms, `cubic-bezier(0.34, 1.8, 0.64, 1)`; diese federnde Bewegung nicht auf Geschäftstabellen übertragen.
- Checkbox-Kontur: 100 ms, `cubic-bezier(0.19, 0.91, 0.38, 1)`; Schalter: Hintergrund/Rand 100 ms, `cubic-bezier(0.42, 0, 0.58, 1)`.
- Die gemessenen modernen Basisbuttons haben `transition: none`. Keine zusätzliche universelle Button-Skalierung aus Geschmacksgründen ergänzen.

Dies sind ausgelesene CSS-Deklarationen, keine per Video bewiesenen vollständigen Bewegungsabläufe. Start-/Endtransformation, Ursprung je Öffnungsrichtung, Exit-Lebensdauer, Hover/Pressed/Fokus und Reduced Motion brauchen weiterhin gezielte Abnahme. `transition: all` ohne Dauer wurde nicht als aktive Animation interpretiert.

## Konkrete Änderungen am Flipbase-Plan

1. Die bisher nur vorgeschlagenen Werte durch rollenbezogene Referenzen ersetzen: Arbeitskarte 12, Feld/Button/Badge 8, Checkbox 4, Dialog 16 px. Startseitenkarte 24 px bleibt eine gesonderte Rolle.
2. Globale Admin-Radius- und Button-Mindesthöhen-Overrides beseitigen. Varianten müssen die tatsächlich gerenderte Geometrie steuern können.
3. Gemeinsame Tabellenhülle: permanente Such-/Filter-/Ansichtsleiste; separate Zustände für Laden, leere Sammlung, keine Treffer und Fehler. Auswahlleiste innerhalb desselben Containers. Suche/Filter jederzeit rücksetzbar.
4. Tabelle nach Inhalt verdichten: Kopf 36 px als gemessene Referenz; textbasierte Einkaufszeilen und Inventarzeilen mit Bild als unterschiedliche Dichtefälle. Fachlich nötige Informationen erhalten. Mengen/Beträge rechts, Titel und Status klar unterscheiden.
5. Overlay-Grundlage für Spalten, Sortierung, Filter, Kalender und Dialoge: korrekte Positionierung, keine abgeschnittenen Panels, Tastatur/Fokusrückgabe, explizite Exit-Phase. Schatten/Motion nach Rolle statt `shadow-xl` plus einheitlicher 160-ms-Animation.
6. Detail-/Formularseiten nach zusammengehörigen Aufgaben gliedern, 16-px-Innenabstand und kontextuelle Speicheraktionen; verschachtelte Abschnitte nicht unnötig erneut einrahmen.
7. Zuerst Inventar und Einkäufe als gemeinsam abgenommene Referenz umsetzen, danach Verkäufe, Betreiber-/Katalogtabellen; Steuer/DATEV weiterhin nur Tabelle. Anschließend übrige Verwaltungsseiten. Markenfarbe bleibt `#fcc601`.

## Verbleibende Abnahme statt unbelegter Vollständigkeit

- Exakt gleiche Viewports für Flipbase/Shopify-Screenshotvergleich, zusätzlich Mobile/Touch und 200-%-Zoom. Die zwei beobachteten Desktopbreiten sind kein vollständiger Responsive-Test.
- Vollständige Hover-, Pressed-, Focus-visible- und Disabled-Matrix, Tooltip-Verhalten, Ein-/Ausblendung und Reduced Motion. Keine Erfolgstoasts oder Serverfehler durch Shopänderungen künstlich erzeugt.
- Sortierung, Spaltenumordnung einschließlich Tastaturalternative, Ansichtsspeicherung und Pagination fachlich in Flipbase prüfen; im Shop keine Ansichten gespeichert oder serverseitigen Zustände verändert.
- Gefüllte Verkaufsbestellungen, lange Datenmengen, verschachtelte Fehlerfälle, mobile Dialoge und alle nicht besuchten Unterseiten bleiben offen. Die oben protokollierten Seiten bilden die jetzt belegte Grundlage.
