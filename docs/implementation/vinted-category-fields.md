# Echte Vinted-Merkmale je Kategorie

## Ausgangslage

Flipbase speichert den Verkaufsbaum je Vinted-Konto (`vinted_selling_category_snapshots`).
Die Auswahlwerte je Kategorie (Größengruppen wie S/M/L, EU, UK, US oder W/L, dazu
Zustände, Farben und Materialien) wurden dagegen nicht gespeichert. Erstellen,
Bearbeiten und Relisten nutzten eine fest geschriebene eigene Liste. Gespeicherte
Größen wie „W32“ galten deshalb als fehlend.

## Speicherung

- Tabelle `vinted_category_field_snapshots`: eine Zeile je Verbindung und Kategorie,
  gebunden an die externe Vinted-Konto-ID. Clients dürfen nur lesen.
- Geschrieben wird ausschließlich vom Worker über
  `marketplace_save_vinted_category_fields`. Ältere Lesestände überschreiben keine
  neueren, ein Kontowechsel verwirft die Werte des vorherigen Kontos.
- Vor dem Speichern entfernt der Worker inseratbezogene Angaben: Auswahlmarkierungen
  und die Marke des gelesenen Inserats.

## Woher die Werte kommen

Kein zusätzlicher Abruf bei Vinted. Die Werte fallen bei bestehenden Abrufen ohnehin an:

1. Detailabgleich im Kontoabgleich: Jeder Inseratabruf liefert die Felder der
   Kategorie mit. Je Abgleich höchstens zehn Detailabrufe innerhalb von 45 Sekunden.
2. Inseratabruf (zum Beispiel vor dem Übertragen) und Kategorieabruf beim Wechsel
   der Kategorie.

## Verwendung in Flipbase

- `VintedCategoryFieldStore` liest die Werte aus der Datenbank.
  `flipbaseVintedListingFields` übernimmt daraus Größe, Zustand, Farbe und Material.
  Felder, die Vinted für die Kategorie nicht anbietet, entfallen.
- Paketgröße, Zielgruppe und Marke bleiben bei der bisherigen Zuordnung.
- Liegen für eine Kategorie noch keine Werte vor, gilt weiter die eigene Liste.
  Gespeicherte einfache Größen bleiben darin gültig.
- Beim Relisten zählen die zusammen mit dem Inserat frisch gelesenen Werte.
- Vinted bleibt maßgeblich: Beim Veröffentlichen ordnet der Worker jede Angabe
  anhand ihrer Bezeichnung der aktuellen Vinted-Auswahl zu.
