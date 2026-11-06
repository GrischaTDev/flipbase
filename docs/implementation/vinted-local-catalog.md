# Lokaler Vinted-Katalog

Ziel: Erstellen, Bearbeiten und Relisten arbeiten ausschließlich mit einem lokal
gespeicherten Vinted-Katalog. Die Kategorie-ID bestimmt die Felder und ihre
Auswahlwerte mit Vinteds Originalkennungen. Erst beim Absenden wird mit Vinted
abgeglichen. Eigene Größenlisten, Zuordnungen über Bezeichnungen und
inseratbezogene Teilmerkmale entfallen.

## Nachweis vom 06.11.2026 (Schritt 1)

Gelesen im angemeldeten, leeren Verkaufsformular von vinted.de. Nichts gespeichert
oder veröffentlicht. Testdaten:
[`vinted-catalog-attributes.json`](../../services/marketplace-worker/test/fixtures/vinted-catalog-attributes.json).

### Quellen

| Inhalt              | Abruf                                                                                         | Ergebnis                                                  |
| ------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Verkaufsbaum        | `GET /api/v2/item_upload/catalogs`                                                            | 2.874 Kategorien, 2.462 Endkategorien                     |
| Felder je Kategorie | `POST /api/v2/item_upload/attributes` mit `{"attributes":[{"code":"category","value":[ID]}]}` | Felder mit Pflicht, Auswahlart, Höchstanzahl und Optionen |
| Farben              | `GET /api/v2/item_upload/colors`                                                              | 29 Farben mit ID, Name, Farbwert und Code                 |
| Marken              | `GET /api/v2/item_upload/brands?category_id=ID`                                               | Suche, nicht vollständig speicherbar                      |
| Paketgrößen         | im Formular, kein eigener Abruf beobachtet                                                    | 1 Klein, 2 Mittel, 3 Groß; Empfehlung je Kategorie        |

Die Abrufe brauchen die Sitzung samt CSRF-Kennung des Formulars.

### Größen

Das Feld `size` liefert Größengruppen, jede mit ihren Größen und IDs. Gruppen
werden über Kategorien hinweg geteilt (11 Gruppen in 10 Kategorien):

| Kategorie                                              | Größengruppen                                            |
| ------------------------------------------------------ | -------------------------------------------------------- |
| Damen Jeans, Damen Bomberjacken, Damen Trainingsanzüge | 80 S/M/L, 82 EU, 81 UK, 83 FR, 84 IT, 85 US              |
| Herren Jeans                                           | 14 Größen Männer, 77 Hosen für Herren (`W32 \| DE 48` …) |
| Herren Bomberjacken, Herren Trainingsanzüge            | 14 Größen Männer                                         |
| Damen Sneaker                                          | 7 Schuhe                                                 |
| Herren Sneaker                                         | 38 Schuhe Männer                                         |
| Kinder Mädchen Jeans                                   | 32 Baby- und Kindergrößen                                |
| Tücher & Schals                                        | keine Größe, dafür Zielgruppe                            |

### Folgerungen für die bisherigen Fehler

- Kategorienamen taugen nicht als Regel: Damenjeans enthalten Endkategorien wie
  „Schlaghosen“ oder „Röhrenjeans“.
- Bezeichnungen weichen ab: Vinted nennt „W32 \| DE 48“ statt „W32“ und
  „Neu, mit Etikett“ statt „Neu mit Etikett“. Zuordnung nur über IDs.
- Damenjeans haben keine W-Gruppe; Herrenjeans haben zwei Gruppen. Eine einzige
  gespeicherte Gruppe je Kategorie reicht nicht.

## Datenbank (Schritt 2)

Schema: [`540_vinted_listing_catalog.sql`](../../supabase/schemas/540_vinted_listing_catalog.sql).
Zentral für alle Konten, ohne Arbeitsbereichsbezug. Angemeldete Nutzer lesen alles;
geschrieben wird nur mit dem Dienstschlüssel über die Funktionen.

| Tabelle                               | Inhalt                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `vinted_listing_categories`           | Verkaufsbaum mit Vinted-ID, Elternkategorie, Pfad, Reihenfolge, Endkategorie und Lesezeitpunkten |
| `vinted_listing_size_groups`          | Größengruppen wie „S/M/L“ oder „Hosen für Herren“                                                |
| `vinted_listing_sizes`                | Größen mit Vinted-ID und exakter Bezeichnung                                                     |
| `vinted_listing_options`              | übrige Werte je Merkmal: Zustand, Farbe (mit Farbwert), Material, Zielgruppe, Paketgröße         |
| `vinted_listing_category_fields`      | Felder je Endkategorie mit Pflicht, Auswahlart, Höchstanzahl und erlaubten Werten                |
| `vinted_listing_category_size_groups` | Größengruppen je Endkategorie in Vinteds Reihenfolge                                             |

| Funktion                                          | Zweck                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `marketplace_save_vinted_listing_categories`      | ersetzt den Baum vollständig; entfernte Kategorien verlieren ihre Felder; ältere Lesestände werden ignoriert |
| `marketplace_save_vinted_listing_category_fields` | ersetzt die Felder einer Endkategorie samt Größengruppen und Werten; ältere Lesestände werden ignoriert      |
| `marketplace_save_vinted_listing_options`         | speichert merkmalsweite Listen wie Farben; nicht mehr angebotene Werte entfallen                             |

Ein Feld ohne erlaubte Werte (`option_ids` leer) nutzt alle Werte des Merkmals, so wie
Vinted die Farben getrennt liefert.

## Abgleich im Worker (Schritt 3)

Der Katalog wird beim normalen Kontoabgleich in derselben Vinted-Sitzung nachgelesen;
ein eigener Zeitplan ist nicht nötig. Ablauf:

1. Der Hauptprozess fragt `vinted_listing_categories` ab
   (`SupabaseVintedListingCatalogStore.work`): Baum und Farben sind fällig, wenn sie
   fehlen oder älter als sieben Tage sind; dazu bis zu 60 Endkategorien ohne Felder
   oder mit Feldern älter als sieben Tage, die ältesten zuerst.
2. Der abgeschottete Browser liest in einer eigenen, leeren Verkaufsseite
   (`readVintedListingCatalog`): Baum, Farben und die Felder der fälligen Kategorien,
   mit 400 ms Pause je Abruf und höchstens 60 Sekunden. Bei 429 oder 403 endet der
   Lauf mit dem bis dahin Gelesenen.
3. Das Ergebnis wird an der Prozessgrenze erneut geprüft
   (`parseVintedListingCatalogRead`) und über die Funktionen aus Schritt 2 gespeichert.
   Eine abgelehnte Kategorie hält die übrigen nicht auf.

Fehler im Katalog ändern weder Ergebnis noch Status des Kontoabgleichs. Der erste
Abgleich speichert Baum und Farben; ab dem nächsten folgen die Felder in Blöcken.
Bei rund 2.460 Endkategorien ist der Katalog nach etwa 41 Kontoabgleichen vollständig.

## Plan

1. **Nachweis** – erledigt (oben).
2. **Datenbank** – erledigt (oben): zentrale Tabellen ohne Kontobezug: Verkaufsbaum, Größengruppen
   mit Größen, Felder je Kategorie (Pflicht, Auswahlart, Höchstanzahl,
   Größengruppen) sowie Zustände, Farben, Materialien, Zielgruppen und
   Paketgrößen mit Original-IDs. Lesen für angemeldete Nutzer, Schreiben nur
   der Worker. Stand und Zeitpunkt je Kategorie.
3. **Katalog-Abgleich im Worker** – erledigt (oben), ohne Knopf: Baum und Felder aller Endkategorien mit einer
   angemeldeten Sitzung lesen, gedrosselt, nur Änderungen schreiben. Auslöser
   wöchentlich und per Knopf im Plattform-Admin, Fortschritt sichtbar.
4. **Oberfläche nur aus der Datenbank:** Kategorie wählen zeigt sofort ihre
   Felder und Werte. Gespeichert werden IDs. Bestehende Inserate öffnen mit
   ihren IDs (die Item-Abfrage liefert sie) vorausgewählt.
5. **Absenden:** Der Worker überträgt IDs und gleicht sie vor dem Speichern mit
   Vinted ab. Bei Abweichung klare Meldung und erneutes Einlesen der Kategorie.

Danach entfallen `vinted_category_field_snapshots`, die eigenen Listen in
`flipbase-vinted-listing-form.ts` und die Zuordnung über Bezeichnungen.

## Offen

- Knopf mit Fortschrittsanzeige im Plattform-Admin für einen sofortigen Abgleich.
- Paketgrößen werden noch nicht gespeichert (Herkunft der Werte und der Empfehlung offen).

- Paketgrößen-Empfehlung je Kategorie: Quelle noch nicht ermittelt.
- Pflichtstatus der Farbe: im Feld ohne Konfiguration geliefert; das Formular
  erlaubt bis zu zwei Farben.
- Laufzeit und Drosselung des vollständigen Abgleichs (2.462 Abrufe).
