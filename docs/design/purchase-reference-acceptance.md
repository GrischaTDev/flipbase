# Einkaufsoberfläche: Referenz und visuelle Abnahme

## Verbindlicher Auftrag

**Präzisierung vom 08.09.2026:** Statusbadges sind auf ausdrücklichen Nutzerwunsch reine Textbadges. Frühere Punkt-/Quadratmarker aus der Tabellenreferenz sind damit aufgehoben; keine führenden Icons oder dekorative Versalschrift. Gemeinsame Badge-Komponente in Übersicht, Details und Belegvorschau verwenden. Chronikmarkierungen bleiben erhalten.

**Präzisierung vom 07.09.2026:** Der neue [Tabellen-Konsistenzplan](../superpowers/plans/2026-09-07-admin-table-consistency.md) ersetzt für die Übersicht die frühere Forderung nach einer sichtbaren Textaktion „Ansicht zurücksetzen“. Verbindlich ist ein nur bei geänderter Tabellenkonfiguration sichtbares Icon mit zwei gegenläufigen Pfeilen; der Text bleibt Tooltip und zugänglicher Name. Statusauswahl/Suche erscheinen rahmenlos im Ruhezustand. Kostenstatus und Aktionsspalte entfallen in der Einkaufsliste; Statusbadges werden gemeinsam vereinheitlicht. Die heutigen Messwerte und noch offenen Produktentscheidungen stehen im neuen Plan.

Der Nutzer verlangt die sichtbare Gestaltung des Shopify-Admins als direkte Vorlage: Layout, Abstände, Texte, Titel, Schaltflächen, Dropdowns, Dialoge, Karten, Farben und Bewegung. Fachliche Anpassungen sind Verkäuferarten, Paketinhalte, eigene Statusführung und konfigurierbare Nummernkreise. Bestehendes Logo-Gelb bleibt die ausdrücklich vereinbarte Markenabweichung. Keine eigenständige gestalterische Neuinterpretation je Funktion.

## Erneute Live-Prüfung

Der angemeldete Shopify-Admin war in dieser Sitzung erreichbar. Inventar, Einkaufsübersicht, leere Einkaufserfassung und ein vorhandener Bestellentwurf wurden geöffnet und ihre zugängliche Seitenstruktur sowie Beschriftungen gelesen. Keine Shopdaten verändert oder Kommentare veröffentlicht.

Bestätigte Details:

- Übersicht: Seitentitel, Aktion zum Erstellen, Ansichtsumschalter, Suche, Anzeigeoptionen, Auswahlcheckboxen und kurze verlinkte Bestellnummern.
- Erfassung: eigener Seitentitel, Lieferanten-/Versandzielauswahl, Produktsuche als Dialogauslöser, daneben Import und Scanner. Kostenübersicht separat von Bestelldetails. Die obere Leiste zeigt ungespeicherte Änderungen sowie Verwerfen/Speichern; Speichern im leeren Zustand deaktiviert.
- Gespeicherter Entwurf: Nummer als Haupttitel, Statusbadge, Aktionen einschließlich „Als bestellt markieren“. Positionen enthalten Produktlink, optionale Lieferanten-SKU, Menge, Kosten, Steuer, Summe und Entfernen. Produktsuche bleibt unter den Positionen.
- Chronik: eigener Abschnitt unter Positionen, Kommentarfeld mit Posten-Aktion, interne Sichtbarkeit, Ereignisse nach Datum gruppiert. Kosten-/Detailkarten bleiben eigenständige Bereiche.

**Prüfgrenze:** Diese erneute Prüfung lieferte Seitenstruktur und Beschriftungen. Sie enthält keine neuen `getComputedStyle`-Messungen, keine neuen Pixel-Screenshots und keinen erneuten Test geöffneter Dropdowns oder Dialoge. Die dafür vorhandenen früheren Messungen und die sieben Nutzer-Screenshots werden ausdrücklich als separate Quellen verwendet. Der separate Playwright-Browser hatte nur `about:blank`; seine Sitzung ist kein Ersatz für die bestätigte In-App-Anmeldung.

## Messgrundlage

Konkrete CSS-Werte stammen aus dem früheren [Live-Messprotokoll](shopify-admin-live-reference.md), einschließlich damaliger Viewports und Messgrenzen. Unter anderem: Arbeitskarten 12 px Radius, Kartenpadding 16 px, normale Dialoge 620 px Breite/16 px Radius, kompakte Toolbarbuttons 28 px Höhe/8 px Radius, Felder im untersuchten Produktdetail 32 px Höhe/8 px Radius, Badges 20 px Höhe/8 px Radius. Diese Werte sind rollenbezogene Ausgangswerte, keine frisch gemessenen Werte aller Einkaufsbausteine.

Erneut gelesene offizielle Quellen:

- [Layout](https://shopify.dev/docs/apps/design/layout): 4-px-Raster, responsive Layouts, breite Datenübersichten, gleichmäßige Informationsdichte, zurückhaltende Tabellenaktionen.
- [Visual design](https://shopify.dev/docs/apps/design/visual-design): überwiegend neutrale Texte, funktionale Statusfarben, Farben mit Text/Symbol kombinieren, konsistente Typografie und Komponenten.

## Verbindliche Abnahmematrix für die Umsetzung

| Bereich        | Referenztreu umzusetzen                                                                                                                                           | Vor Abschluss nachzuweisen                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seitenrahmen   | Zentrierte Erfassung, breite Arbeits- und schmale Nebenkarte; breite Übersicht                                                                                    | Maximalbreite, Spaltenbreiten, Außenabstand und Umbruch bei dokumentiertem Viewport                                                                                             |
| Überschriften  | Normale Schreibweise, abgestufte Hierarchie, Nummer als Detailtitel                                                                                               | Schriftgröße, Gewicht, Zeilenhöhe; keine dekorativen Versalien                                                                                                                  |
| Karten         | Neutrale Flächen, einheitliche Konturen und Schatten                                                                                                              | Radius, Padding, Abstand zwischen Karten, keine doppelte Innenpolsterung                                                                                                        |
| Buttons        | Referenzgrößen und Aktionshierarchie, kompakte Iconaktionen                                                                                                       | Normal, Hover, Aktiv, Fokus, Deaktiviert und Laden                                                                                                                              |
| Eingaben       | Ruhige Felder, konsistente Label-/Hilfetextabstände                                                                                                               | Höhe, Rahmen, Radius, Fehler/Fokus, Zahlen-/Währungsausrichtung                                                                                                                 |
| Dropdowns      | Referenzbreite, Optionen, Auswahlkennzeichnung und Scrollverhalten                                                                                                | Offen/geschlossen, Tastatur, Escape, Fokusrückgabe und Viewportränder                                                                                                           |
| Artikelauswahl | Suche/Filter oben, Auswahlzeilen, fixe Aktionen unten                                                                                                             | Mehrfachauswahl, Leer-/Lade-/Fehlerzustand, Bildschirmhöhe und Mobilansicht                                                                                                     |
| Kosten         | Separate rechte Karte und kleiner Bearbeitungsdialog                                                                                                              | Zeilenabstände, Summenlinie, rechtsbündige Beträge, Anpassungszeilen                                                                                                            |
| Chronik        | Kommentarbereich oberhalb gruppierter Ereignisse                                                                                                                  | Reihenfolge, Abstände, Ereignismarkierungen, Zeit-/Autorentexte                                                                                                                 |
| Übersicht      | Links Statusdropdown „Alle“, daneben breite Suche mit strukturierten Filtern, rechts Anzeigeoptionen und Textaktion „Ansicht zurücksetzen“; ruhige Tabellenzeilen | Keine Einkaufsart-Reiter; offene Menüs und Filtervorschläge, entfernbare Bedingungen, Rücksetzzustände; Kopf-/Zeilenhöhe, Hover/Auswahl, Nummernlink und zugängliche Navigation |
| Bewegung       | Referenznahe kurze Übergänge                                                                                                                                      | Dauer/Easing und Reduced-Motion-Verhalten                                                                                                                                       |

Für jeden Bereich Referenz und Flipbase bei gleicher Fenstergröße vergleichen; Screenshots und Messwerte mit Quellenstatus festhalten. Fachlich notwendige Unterschiede ausdrücklich benennen. Ein erfolgreicher Build oder funktionierender Ablauf allein ist keine visuelle Abnahme. Noch nicht geprüfte Zustände bleiben als solche markiert, statt als 1:1 umgesetzt bezeichnet zu werden.

Die fremden Shoptexte werden nur dort wörtlich verwendet, wo ihre Bedeutung passt. Für Flipbase gelten beispielsweise „Verkäufer“, „Einkauf“, „Inhalt erfassen“ und konfigurierbare Nummern. Entfernte Funktionen wie Versandziel/Transfer/Flohmarkt dürfen nicht durch eine optische Kopie zurückkehren. Kürze und Ton der Beschriftungen folgen derselben Referenz.
