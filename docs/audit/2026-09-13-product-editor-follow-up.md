# Nächster Schritt: Produkterstellung, Medien und Shop

Stand: 13. September 2026. Nutzerwunsch nach dem Abschluss des Artikel-/Bestands-PRs.
Dieser Bericht hält den Folgeumfang fest; er ist keine Umsetzung dieses Umbaus.

## Festgestellter Stand

- `CatalogService` und die aktuelle Detailseite erlauben Shopfreigabe und Shoppreis.
- `StoreService.publicProducts` nimmt Katalogartikel bei Freigabe, positivem Preis
  und verfügbarem Bestand auf. Erstellen allein veröffentlicht daher nicht alles.
- Die Katalogprojektion des Shops übernimmt bisher weder die neue Beschreibung
  noch die Produktmedien. Die Shop-Detailseite sucht ausschließlich in
  `InventoryService.items()`. Eine vollständige öffentliche Katalogproduktseite
  ist damit noch nicht durchgängig angeschlossen.
- Mehrere Medien je Katalogartikel sind bereits im Datenmodell und Upload möglich.
- `shared/components/image-cropper-modal` nutzt bereits `ngx-image-cropper`.
  Der Bildoptimierer besitzt zusätzliche Funktionen, die im einfachen Produkt-
  Bilddialog nicht benötigt werden. Wiederverwendung vor neuen Abhängigkeiten.
- Die allgemeine Neuanlage erfolgt bisher im kompakten Produktdialog; Bearbeiten
  hat durch den aktuellen PR eine eigene Seite erhalten.

## Empfohlener Folgeumfang

1. Eigene Seite „Artikel erstellen“, im Aufbau passend zur Artikelbearbeitung
   und den vorhandenen Erfassungsseiten. Einkaufsdialoge dürfen einen schlanken
   Einstieg behalten, müssen aber dieselben Artikeldaten und Validierungen nutzen.
2. Titel, Beschreibung, Kategorie, Marke/Modell, EAN und Preis. Veröffentlichung
   klar erkennbar und bewusst steuerbar; Neuanlage soll zunächst intern bleiben.
3. Mehrere Bilder hinzufügen, per Drag-and-drop oder Dateiauswahl. Hauptbild und
   Reihenfolge festlegen, entfernen; kleiner zugänglicher Dialog für Zuschnitt
   und gegebenenfalls Drehen, ohne den vollständigen Bildoptimierer einzubauen.
4. Öffentliche Produktseite für Katalogartikel vollständig anbinden: Beschreibung,
   Galerie, Preis, Verfügbarkeit und direkte Links. Stückbezogene Zustände und
   Fotos erhalten; keine Zusammenfassung aufgrund gleicher Namen.
5. Optionaler Bereich „Suchmaschineneintrag“ mit Seitentitel, Meta-Beschreibung,
   URL und Vorschau. Einfache Standardwerte aus den Artikeldaten. Die Vorschau
   ist eine mögliche Darstellung, keine Zusage für Googles tatsächliche Anzeige.
   Metadaten müssen auf der öffentlichen Seite tatsächlich ausgegeben werden;
   ein rein dekoratives Vorschaufenster reicht nicht.
6. Suchmaschinen-Erreichbarkeit und öffentliche Freigaben im Folgeumfang prüfen;
   ebenso Bildrechte, Fehlerzustände, mobile Bedienung und unveröffentlichte Entwürfe.

## Herstellerabgleich

Shopify dokumentiert eine eigene Produktdetailseite mit Titel/Beschreibung,
Medien, Preisen, Inventar, Veröffentlichung und Suchmaschineneintrag. Letzterer
zeigt Produkttitel, URL und Beschreibung als mögliche Darstellung in Suchmaschinen.
Der Aufbau ist ein passendes Vorbild; eine pixelgenaue Übereinstimmung wurde
hier nicht geprüft. Bestehende gemessene Admin-UI-Regeln bleiben maßgeblich.

- [Shopify: Produktdetailseite](https://help.shopify.com/de/manual/products/details/product-details-page)
- [Shopify: Produkte hinzufügen und aktualisieren](https://help.shopify.com/de/manual/products/add-update-products)

## Reihenfolge

Zunächst den bereits geprüften Artikel-/Bestandsumbau über PR und erfolgreiche
Pflichtprüfungen abschließen. Produkterstellung, Bilddialog, öffentliche
Produktseite und Suchmaschineneintrag anschließend als zusammenhängenden eigenen
Umbau behandeln. Steuerliche Modellkorrekturen bleiben separat dokumentiert.
