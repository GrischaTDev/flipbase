# Artikelerfassung und Varianten am Shopify-Admin ausrichten

Stand: 25.09.2026 · umgesetzt im Zweig `juna/article-create-design`

## Ziel

Die eigene Seite `/catalog/new` bleibt der Einstieg über „Artikel erstellen“. Erstellen
und Bearbeiten verwenden weiterhin denselben Editor. Die Reihenfolge der Eingaben
soll der Arbeit am Artikel folgen: Grunddaten, Bilder, Varianten, Eigenschaften und
optionaler Shop-Eintrag. Ein Modell mit mehreren Schuhgrößen wird als ein Artikel
mit getrennten Varianten geführt. Der Aufbau orientiert sich an den sechs vom Nutzer
bereitgestellten Shopify-Screenshots und an
`docs/design/admin-ui-guidelines.md`; Flipbase übernimmt nur passende Funktionen.

## Geprüfter Bestand

- Die Artikelseite ist bereits zweispaltig. Derzeit liegen fast alle Eingaben in
  „Artikeldaten“ links; rechts stehen nur „Shop“ und „Einkauf und Bestand“.
- `app-category-picker` kann Kategorien suchen, stufenweise durchgehen, eine Ebene
  auswählen und die gewählte Kategorie entfernen. Er nutzt die importierte
  deutschsprachige Shopify-Taxonomie `2026-08` mit über 14.000 Einträgen. Fünf
  Hauptbereiche wurden laut bestehender Projektentscheidung ausgeblendet.
- Die Suche findet nur Wörter im deutschen Kategoriepfad. „High Heels“ ist darin
  nicht enthalten. Unter „Bekleidung & Accessoires > Schuhe“ existiert aber der
  Kategorieeintrag „Fersen“ (`aa-8-10`). Bezeichnung und Suchwörter sind hier
  fachlich zu prüfen, bevor etwas an der Taxonomie geändert wird.
- Marken können im Workspace gesucht und während der Erfassung angelegt werden.
  „Marken verwalten“ gibt es bislang im Produktdialog für Ersetzen/Löschen. Die
  Datenbank erlaubt bereits eine Umbenennung und hält verknüpfte Artikeltexte
  dabei aktuell; eine sichtbare Bearbeitung fehlt.
- Der Suchmaschineneintrag hat schon Seitentitel, Meta-Beschreibung, URL-Bezeichnung
  und Vorschau. Der Shop verwendet eine stabile Artikel-ID im Pfad und bleibt
  derzeit von Suchmaschinen ausgeschlossen.
- `color` und `material` sind Textspalten. Material wird auch im Listing Studio
  als Text verwendet. SKU ist eine freiwillige eigene Kennung und in Artikel- und
  Shopsuche nutzbar; die technische ID erfüllt diesen Zweck nicht.
- Einkaufslinien, Bestandslose, Verkäufe und Listings verweisen heute auf die ID
  eines `catalog_products`-Eintrags. Jede andere Schuhgröße braucht momentan
  einen eigenen Eintrag mit erneut erfassten Stammdaten.

## Zielaufbau der Seite

| Bereich                              | Inhalt und Verhalten                                                                                                                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kopf                                 | „Artikel erstellen“ als Seitentitel, Zurück, EAN scannen, KI-Fotosuche für berechtigte Nutzer, Speichern. Keine zweite große Überschrift im Formular.                                                                                                   |
| Linke Spalte: „Grunddaten“           | Name, Beschreibung, danach Kategorie im selben Block. Die Kategorie steht über dem Bilderblock.                                                                                                                                                         |
| Linke Spalte: „Bilder“               | Bestehenden Medieneditor mit Auswahl, Reihenfolge und Zuschnitt beibehalten; Überschrift und Leerzustand an die Admin-Referenz angleichen.                                                                                                              |
| Linke Spalte: „Varianten“            | Größe und Farbe je Ausführung zeigen; „Variante hinzufügen“ übernimmt die gemeinsamen Angaben. Verfügbarkeit je Variante sichtbar machen.                                                                                                               |
| Linke Spalte: „Suchmaschineneintrag“ | Kompakte Vorschau; Bearbeiten öffnet die vorhandenen drei Felder im selben Block.                                                                                                                                                                       |
| Rechte Spalte: „Eigenschaften“       | Gemeinsame Angaben wie Marke, Modell und Material. Zustand kann als Vorbelegung dienen; der tatsächliche Zustand und die Zustandsnotiz werden beim konkreten Bestand erfasst. Auf schmalen Bildschirmen folgt der Block unter den Grunddaten.           |
| Variante: „Kennungen“                | EAN/GTIN und freiwillige SKU gehören zur konkreten Größe/Farbe. EAN bleibt für die Produktsuche erreichbar; SKU heißt sichtbar „Eigene Artikelnummer (SKU)“. Bei nur einer Ausführung sind diese Eingaben ohne zusätzliche Tabellennavigation sichtbar. |
| Rechte Spalte: „Shop“                | Vorhandene Freigabe und Shoppreis. Der Hinweis zum Bestand bleibt dort, wo er den Veröffentlichungszustand erklärt.                                                                                                                                     |

Die Beschreibung bleibt zunächst ein normales mehrzeiliges Feld. Eine
Formatierungsleiste wie im Screenshot würde auch Speicherung, sichere Ausgabe im
Shop und Listing Studio verändern und braucht eine eigene fachliche Entscheidung.

## Auswahl von Kategorie, Farbe und Material

**Kategorie:** Der bestehende gemeinsame Wähler ist die Grundlage. Das Suchfeld
soll unmittelbar beim Öffnen fokussiert sein, Ebenen und Zurückweg bleiben klar
sichtbar, und der ausgewählte Pfad erscheint gut lesbar im Feld. Suchtreffer
zeigen Kategorie und vollständigen Pfad. Bei `aa-8-10` soll eine geprüfte
Suchalias-Liste Begriffe wie „High Heels“, „Pumps“ und „Absatzschuhe“ auffindbar
machen, ohne neue Kategorie-IDs oder freie Kategorietexte einzuführen. Der Nutzer
sieht beim Treffer weiterhin den tatsächlichen Taxonomiepfad; missverständliche
Übersetzungen werden separat dokumentiert. Weitere vermisste Begriffe werden an
konkreten Beispielen geprüft, statt die gesamte Taxonomie pauschal zu ersetzen.

**Farbe:** Ein suchbarer gemeinsamer Auswahlbaustein bietet eine kleine,
verständliche Grundpalette, etwa Schwarz, Weiß, Grau, Braun, Beige, Blau, Grün,
Rot, Rosa, Gelb, Orange, Lila und Mehrfarbig. Tippen filtert sofort. Ein
abweichender Herstellerfarbname darf als eigener Wert übernommen werden, damit
Barcode- und KI-Vorschläge wie „Skydiver“ nicht verloren gehen. Der bestehende
Textwert bleibt zunächst das Speicherformat; vorhandene Werte sind weiter
bearbeitbar. Jede Variante erhält eine Farbangabe; mehrere Farben desselben
Modells werden als getrennte Varianten angelegt.

**Material:** Ein suchbares Feld mit Mehrfachauswahl und sichtbaren, einzeln
entfernbaren Einträgen. Die Vorschläge decken die häufigsten Materialien ab
(beispielsweise Baumwolle, Leder, Kunstleder, Polyester, Wolle, Leinen, Denim,
Seide, Kunststoff und Metall). Eigene Bezeichnungen bleiben möglich. Der
gespeicherte Anzeigetext wird aus den ausgewählten Werten mit `·` gebildet,
damit Shop- und Listing-Texte wie bisher funktionieren. Bestehende Werte mit
Kommas bleiben als ein Eintrag erhalten. Falls ältere Materialtexte bereits
`·` als Teil einer freien Bezeichnung enthalten, muss dieser Einzelfall beim
Bearbeiten geprüft werden.

Der neue Auswahlbaustein gehört nach `shared/components/`, wenn Farbe und
Material dieselbe Bedienrolle verwenden. Er muss mit Tastatur, Screenreader,
Touch und in Dialogen bedienbar sein und die vorhandene Popover-Ebene nutzen.
Die Produkt-Kurzmaske im Einkauf verwendet dieselben Auswahlbausteine und
Wertregeln, auch wenn ihr kompaktes Layout anders bleibt.

## Varianten und Bestand

Für das Beispiel „gleiches Schuhmodell, andere Größe“ wird der vorhandene Artikel
geöffnet und „Variante hinzufügen“ gewählt. Gemeinsame Angaben wie Name, Marke,
Modell, Beschreibung, Kategorie, Material, Bilder und Suchmaschineneintrag werden
nicht noch einmal eingegeben. Die neue Variante erhält mindestens ihre Größe;
Farbe, EAN/GTIN, eigene Artikelnummer und gegebenenfalls Shoppreis können
abweichen. Die EAN-Suche muss die konkrete Variante treffen. Pro Kombination
von Größe und Farbe darf es innerhalb einer Artikelgruppe nur eine Variante
geben, solange keine weitere unterscheidende Option eingeführt wird.

Bestand bleibt je Variante getrennt: Ein Einkauf über Größe 42 darf die
Verfügbarkeit von Größe 43 nicht erhöhen. Verkauf, Reservierung, Retoure und
Listing müssen dieselbe Variante behalten. Zustand und Einkaufskosten sind bei
gebrauchten Einzelstücken beziehungsweise Bestandslosen zu erfassen; sie dürfen
nicht durch das Hinzufügen einer weiteren Größe überschrieben werden. Im Shop
sind nicht verfügbare Größen erkennbar und können nicht verkauft werden.

Technisch ist eine Artikelgruppe mit mehreren weiter einzeln identifizierbaren
`catalog_products`-Einträgen der schonendste Weg. Ihre bestehenden IDs bleiben
in Einkaufs-, Bestands-, Verkaufs- und Listing-Datensätzen erhalten. Eine neue
Gruppenkennung verbindet sie; gemeinsam bearbeitete Angaben müssen in einer
Transaktion konsistent für die Gruppe gespeichert werden. Die genaue
Spaltenaufteilung und die Übernahme vorhandener Einzelartikel werden vor der
Migration anhand aller Schreibwege festgelegt. Bisherige Einzelartikel bleiben
bis zur ersten zusätzlichen Variante ohne Gruppenkennung; neue Artikel bilden
sofort eine Einzelgruppe. Historische Bestands- und Verkaufsdatensätze ändern
ihre Produkt-ID nicht. Zusammenführen bereits getrennt
erfasster Größen wird nur angeboten, wenn gemeinsame Stammdaten und Zuordnungen
geprüft wurden.

## Marken als Stammdaten

Eine Seite „Marken“ im Artikelbereich zeigt die Marken des aktiven Workspace mit
Suche und Aktionen für Anlegen, Umbenennen und Zusammenführen/Löschen. Alle
Workspace-Mitglieder dürfen sie verwenden; die vorhandenen Datenbankrechte sind
darauf bereits ausgerichtet. Die bestehende Ersetzung beim Löschen wird
weiterverwendet. Vor dem Löschen wird die Auswirkung auf verknüpfte Artikel
verständlich angezeigt. Die Marke bleibt auch direkt im Artikel anlegbar.
Der Zugang erfolgt über „Marken verwalten“ in der Artikelliste; eine spätere
Sidebar-Navigation kann mit dem dortigen Umbau abgestimmt werden.

## Suchmaschineneintrag

Die Vorschau zeigt den tatsächlichen Flipbase-Shop-Pfad und den wirksamen Titel
und Beschreibungstext. Ein klarer Bearbeiten-Knopf öffnet Seitentitel,
Meta-Beschreibung und URL-Bezeichnung. Die aktuelle optionale Speicherung und
Fallbacks bleiben erhalten; Zähler können beim Schreiben Orientierung bieten.
Die URL-Bezeichnung ändert nur den lesbaren Teil hinter der stabilen Artikel-ID.
Der Abschnitt erklärt knapp, dass der Shop derzeit keine Google-Indexierung
erlaubt, damit die Vorschau keine Veröffentlichung verspricht.

## Umsetzung in prüfbaren Schritten

1. Variantenmodell und alle Verbraucher der Produkt-ID prüfen: Einkauf,
   Bestandslose, Verkauf, Listings, Shop, Bilder und Suche. Die Migration so
   entwerfen, dass vorhandene IDs und Buchungen erhalten bleiben.
2. Artikelgruppen, Variantenanlage und Auswahl im Einkauf und Shop umsetzen.
   Größe/Farbe, EAN/SKU, Preis und Verfügbarkeit je Variante prüfen.
3. Artikelseite umgruppieren, mobile Reihenfolge und vorhandene Speicher- und
   Fehlerzustände bewahren. Die Kategorie in „Grunddaten“ verschieben und die
   Suchmaschinenkarte an den Screenshot angleichen.
4. Kategorie-Suchbegriffe anhand von „High Heels“ prüfen und gezielte Alias-Suche
   ergänzen. Auswahl speichert weiterhin die Shopify-Kennung.
5. Suchbare Farb- und Materialauswahl als gemeinsame Bausteine umsetzen und auf
   Artikelseite sowie Produkt-Kurzmaske einsetzen. Bestandswerte, KI-Vorschläge
   und Material-Mehrfachwerte verlustfrei laden und speichern.
6. Markenverwaltung als eigene Artikel-Unterseite ergänzen; die vorhandene
   Erstellen-/Ersetzen-/Löschen-Logik verwenden und Umbenennen hinzufügen.
7. Gezielte Angular- und Service-Tests, Tastatur- und AXE-Prüfung, mobile
   Ansicht, Admin-Referenzvergleich und Produktionsbau ausführen. Falls eine
   Material-Spalte hinzukommt: Schema, erzeugte Migration, Typen und passende
   Datenbanktests im selben Änderungszweig prüfen. Varianten-Migration und
   Bestands-/Verkaufstransaktionen benötigen ebenfalls Datenbanktests.

## Bereits abgestimmte Entscheidungen

- Erst diesen Plan prüfen, danach umsetzen.
- SKU als freiwillige eigene Artikelnummer behalten.
- Mehrere Materialien auswählbar machen.
- Größe und Farbe als Varianten desselben Modells führen.
