# Einheitliche Produkte und konsistente Verwaltungsoberfläche

Status: Entwurf zur Abnahme des Umsetzungsplans. Stand: 08.09.2026.

## Ziel und festgelegter Umfang

Flipbase wird ausschließlich für den eigenen Betrieb verwendet, nicht als Händlerplattform angeboten. Es gibt genau einen Erfassungsweg für Produkte: Menge 1 und Menge 12 verwenden dasselbe Produktmodell und dieselben Eingaben. Der aktuelle Lieferanten-Speicherfehler wird vor dem größeren Umbau isoliert behoben. Die Einkaufsoberfläche folgt der Shopify-Referenz; Dashboard und Verkaufsjournal erhalten die gemeinsamen Gestaltungsregeln. ApexCharts ist die gewünschte Diagrammbibliothek, vorbehaltlich der passenden Lizenz.

Dies ist ein Architekturumbau, nicht nur eine Umbenennung von Buttons. Der Entwurf bevorzugt eine schrittweise Umstellung auf den vorhandenen Produkt-/Losbestand. Nur die zwei bisherigen Einstiege zu verstecken würde die widersprüchlichen Speicherwege erhalten. Ein vollständiger Neuaufbau mit Datenreset wäre dagegen unnötig riskant und ist nicht Bestandteil dieses Auftrags.

## Einheitliches Produktmodell

- `catalog_products` bleibt die zentrale Produktidentität. Kein Produkt wird wegen einer Bestandsmenge von eins als andere Art gespeichert.
- Titel ist für eine ausdrückliche Produktneuanlage erforderlich. Bild, Marke, Modell, EAN, Kategorie und weitere Details bleiben optional. Kein Pflicht-Barcode für gebrauchte Einzelangebote.
- Produktdaten und Einkaufspreis sind getrennt: derselbe Artikel kann aus mehreren Einkäufen zu verschiedenen Preisen stammen.
- Ein Einkauf besteht aus Positionen mit Produktbezug, Menge, bekannten oder noch unbekannten Kosten. Jede Position gehört zu genau einem Workspace und Einkauf.
- Jeder tatsächliche Wareneingang erzeugt einen Zugang mit Herkunft, Menge und Kostenstand. Anlegen eines Produkts und Speichern eines Entwurfs erhöhen den Bestand nicht.
- Verkäufe beziehen sich künftig auf das Produkt und entnehmen Mengen aus seinen Zugängen. Bestehende Zuordnungs-/Rundungsregeln, Retouren, Abschluss- und Korrektursperren bleiben wirksam.
- Ein individuell abweichendes gebrauchtes Stück kann ein eigenes normales Produkt mit Menge eins sein. Unterschiede bei Zustand, Mängeln, Fotos oder Verkaufsbeschreibung werden nicht automatisch zusammengeführt. Gleiche EAN oder gleicher Titel allein beweisen keine Austauschbarkeit.
- Keine neue Seriennummernverwaltung und kein vollständiges Varianten-System in diesem Umbau. Größen-/Modellunterschiede lassen sich zunächst als eigene eindeutig beschriebene Produkte führen.
- `tracking_mode` und `line_kind` dürfen in neuen fachlichen Schreibwegen nicht länger zwischen zwei Bestandsarten entscheiden. Historische Referenzen dürfen bis zum geprüften Übergang bestehen bleiben; das ist kein zweiter Erfassungsweg.

### Bekannter und unbekannter Inhalt

Unbekannter Inhalt und unbekannte Preise sind verschiedene Zustände. Ein Einkauf mit Gesamtbetrag und noch unbekannten Artikeln bleibt speicherbar, ohne erfundene Produktstämme und ohne Bestand. Bei späterer Identifikation wird ein vorhandenes Produkt gewählt oder ein normales Produkt angelegt. Bekannte Produkte mit unbekanntem Einzelpreis bleiben möglich. Unbekannt wird als `null`/offen geführt, niemals als kostenloser Artikel mit Preis null. Bestehende Kostenabschluss- und Verkaufssperren nicht beiläufig lockern.

### Beispielvertrag

| Vorgang                                        | Produkt                              | Menge/Bestand                       | Herkunft/Kosten                      |
| ---------------------------------------------- | ------------------------------------ | ----------------------------------- | ------------------------------------ |
| Entwurf mit einem Schuh anlegen                | Ein normales Produkt                 | Bestellt 1, Bestand unverändert     | Noch kein Zugang                     |
| Ware vollständig erhalten                      | Dasselbe Produkt                     | Bestand +1                          | Zugang aus genau diesem Einkauf      |
| Später zwölf gleiche Artikel kaufen            | Vorhandenes Produkt wählen           | Bestellt 12, Zugang erst bei Erhalt | Neuer Einkauf, eigener Preis         |
| Zwei Käufe: 2 × 10 EUR und 3 × 15 EUR          | Eine Produktidentität                | Nach Erhalt Bestand 5               | Zwei getrennte Zugänge               |
| Verkauf von 3 Stück bei bestehender FIFO-Regel | Dasselbe Produkt                     | Bestand 2                           | Wareneinsatz 35 EUR, nicht 30/45 EUR |
| Abweichendes beschädigtes Exemplar             | Eigenes normal beschriebenes Produkt | Menge 1                             | Eigene Bilder/Zustandsbeschreibung   |

## Verbindliche Einkaufsdarstellung

Am 08.09.2026 erneut angemeldet lesend geprüft: Shopify-Einkaufsentwurf bei 1440 × 1000 sowie in der schmalen Browseransicht. Keine Shopify-Daten geändert. Desktop zeigt Produkt/Bild, Lieferanten-SKU, Anzahl, Kosten samt Steuerfeld, Gesamt und Entfernen. Darunter stehen Produktsuche sowie Import-/Scanner-Icons. Mobil werden die Angaben innerhalb einer Produktzeile untereinander angeordnet.

Für Flipbase bewusst reduzierte Grundzeile:

| Artikel                        | Menge | Stückpreis |    Gesamt |                |
| ------------------------------ | ----: | ---------: | --------: | -------------- |
| Bild/Platzhalter + Produktname |     3 |  12,00 EUR | 36,00 EUR | Entfernen-Icon |

- Bild und Name bilden gemeinsam die breite Artikelspalte. Vorschauformat zunächst 40 × 40 px als Flipbase-Zielwert, nicht als behauptete Shopify-Messung; endgültige Abnahme gegen Referenz.
- Keine Lieferanten-SKU-, Steuer-, EAN-, Kategorie-, Zustands-, Marktwert- oder Artikelart-Spalte im Grundzustand. Die Shopify-Steuerbedienung wird nicht ohne fachliche Steuerlogik kopiert.
- Klick auf den Produktnamen öffnet die Produktdetails; Menge und Einkaufspreis bleiben direkt in der Zeile editierbar. Kein eigener Artikel-bearbeiten-Button und kein Spaltenkonfigurator.
- Bei Gesamtpreisführung zeigt der Stückpreis den tatsächlichen Kostenstand; keine künstliche Gleichverteilung während unvollständiger Erfassung. Fehlender Wert heißt „Offen“, ein expliziter Nullpreis bleibt 0,00 EUR.
- Unter den Positionen eine zusammenhängende Zeile: Suchsymbol und „Produkte zum Hinzufügen suchen“, rechts Import- und Scanner-Icon. Keine zweite Leiste oberhalb und keine zusätzlichen Einzelstück-/Mengenartikel-Buttons.
- Suche führt zu Auswahl mit Mehrfachauswahl und einem einzigen Einstieg „Produkt erstellen“. Suchtext bleibt beim Öffnen erhalten. Keine automatische Neuanlage aus einem unbekannten Barcode.
- Import zeigt vor Übernahme eine Vorschau mit Zuordnungen und Zeilenfehlern; Schließen verwirft die Vorschau. Scanner unterstützt den vorhandenen manuellen/Hardware-Weg; Kamera erst nach ausdrücklicher Aktion und Browserfreigabe.
- Icons besitzen Tooltip, zugänglichen Namen, Tastaturbedienung und ausreichende Touchfläche.
- Mobile Darstellung ist eine Umordnung derselben Positionsmaske, keine zweite fachliche Implementierung.

Gemessen: Der Shopify-Suchauslöser hatte bei 1440 × 1000 eine Höhe von 36 px, Schrift 13 px, Zeilenhöhe 20 px, Padding 8 px, Radius 8 px und keinen sichtbaren Rahmen im Ruhezustand. Das native innere Mengenfeld hatte 20 px Höhe; dies ist ausdrücklich nicht die äußere Feldhöhe. Vollständige Hover-/Fokus-/Feldrahmenmessung ist vor der visuellen Abnahme zu ergänzen.

## Shared-Komponenten und unveränderte Regeln

Bestehende Buttons, Zahlen-/Textfelder, Suche, Dialoge, Karten, Tabellenbausteine und Chronik wiederverwenden. Ein kleiner serverfreier Produktbild-Baustein wird gemeinsam für Einkauf, Katalog und Bestand verwendet; keine separaten Bild-/Platzhalter-Nachbauten. Produktzeile und Auswahl bleiben fachliche Einkaufskomponenten. Medienladen/-speichern gehört in Services.

Statusbadges enthalten künftig nur Text: kein Punkt/Quadrat und keine dekorative Versalschrift. Dies betrifft nicht Chartlegenden, Chronikereignispunkte oder fachliche Zustandsicons außerhalb von Badges. Shared-API und sämtliche Marker-Aufrufer gemeinsam umstellen.

Primärfarbe bleibt `#fcc601`; Standardbuttons 28 px auf Desktop, Touchziele mindestens 44 × 44 px. Shared-Felder behalten ihren geprüften CVA-/Reactive-Forms-Vertrag. Keine eigenen Buttonvarianten in Features. Erstellen und gespeicherter Entwurf verwenden dieselbe Maske; Chronik bleibt links darunter, Speichern oben rechts. Feste Sidebar, Dropdowns über Dialogen, Dirty-Guard, Nachladefehlerbehandlung und Abschluss-Sperren bleiben erhalten.

## Dashboard und ApexCharts

- Überschriften „Verkaufsergebnis im Zeitraum“ und „Verkaufsjournal“ normal geschrieben, ohne `uppercase` und dekorative Buchstabenabstände. Ergänzende Texte mindestens 12 px, normale UI-Texte mindestens 13 px.
- Journal als kompakte Berichtstabelle mit gemeinsamen Tabellen-/Kartenbausteinen, rechtsbündigen Zahlen und konsequenten Leer-/Lade-/Fehlerzuständen. Keine Spaltenmenüs nur um ihrer selbst willen.
- ApexCharts ersetzt den Renderer im vorhandenen Shared-`RevenueChartComponent`. Bestehender Eingang `points: readonly DashboardTimePoint[]` und fachliche Kennzahlberechnung bleiben erhalten.
- Ziel: ruhiges Zeitreihen-Liniendiagramm, dezentes Raster, klare EUR-Achse und gemeinsame Detailanzeige je Datum. Alle vier vorhandenen Reihen bleiben erreichbar. Keine 3D-Effekte, keine optische Glättung über fehlende Daten, keine dekorativen Daueranimationen. Negative Ergebnisse und unbekannte Kosten bleiben korrekt.
- Chart.js erst entfernen, wenn keine Verbraucher mehr darauf zugreifen und Tests/Build/Browserabnahme grün sind. Keine zweite Diagrammbibliothek dauerhaft parallel betreiben. ApexGrid ist nicht automatisch Teil des Auftrags; Tabellen folgen unserem Shared-Design.
- Nur interne Betriebsnutzung bestätigt. Die Community-Lizenz setzt zusätzlich weniger als 2 Mio. USD Jahresumsatz inklusive verbundener Unternehmen voraus. Vor Installation dieses Kriterium bestätigen oder passende kommerzielle Lizenz klären; keine Lizenz kaufen oder Bedingungen als geprüft behaupten.

## Datenübergang und Sicherheitsgrenzen

Kein Reset als Standard. Vor dem Kernumbau aktueller konsistenter Export mit Medienreferenzen sowie geprüfte Restore-Möglichkeit. Die ältere Referenzsicherung ersetzt das nicht. Alte Verkäufe, Belege, Kosten und Chronik dürfen nicht umgeschrieben oder erfunden werden. Bestehende Datensätze über eine nachvollziehbare Zuordnung auf Produkte/Zugänge überführen; nicht automatisch nach Titel/EAN deduplizieren. Unklare Zuordnungen sperren den Übergang und werden einzeln geklärt.

Erweiterung, Überführung, Umschaltung und Entfernung alter Schreibwege sind getrennte Schritte. Zählungen, Mengen, Kosten und Referenzen werden vor/nachher abgeglichen. Keine Dual-Writes ohne atomaren Vertrag. Nach neuen Buchungen ist ein bloßes Zurückrollen der Anwendung kein sicherer Datenbank-Rollback; Backup-Wiederherstellung oder geprüfte Vorwärtskorrektur gesondert entscheiden.

Auf diesem Arbeitslaptop kein Docker und keine lokale Datenbankeinrichtung. Datenbankprüfungen und Typgenerierung in freigegebener isolierter CI/Testumgebung; keine Produktionsdatenbank als Testsystem. Schemas und neue erzeugte Migrationen im selben PR, veröffentlichte Migrationen unverändert. Produktivschaltung erst nach grünem PR und ausdrücklichem Veröffentlichungsauftrag. Kein ungefragter Datenreset, keine Paket-Upgrades außerhalb ApexCharts und notwendiger Wrapper-Abhängigkeiten.

## Quellen

- [Shopify-Inventarmodell](https://shopify.dev/docs/apps/build/orders-fulfillment/inventory-management-apps/manage-quantities-states)
- [Shopify-Produkte und Varianten](https://help.shopify.com/en/manual/products/variants)
- [ApexCharts Angular](https://apexcharts.com/docs/angular-charts/)
- [Community-Lizenz](https://apexcharts.com/license/community/)
- Lokale Gestaltungsgrundlage: `docs/design/admin-ui-guidelines.md`.

Die Referenz dokumentiert Gestaltung, keine rechtliche Konformität unserer Chronik. Frühere Pläne gelten weiter, soweit sie nicht den hier explizit ersetzten Einzelstück-/Mengenartikel-Einstiegen, Badge-Markern oder dem Chart.js-Zielrenderer widersprechen.
