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

| Inhalt              | Abruf                                                                                                                     | Ergebnis                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Verkaufsbaum        | `GET /api/v2/item_upload/catalogs`                                                                                        | 2.874 Kategorien, 2.462 Endkategorien                          |
| Felder je Kategorie | `POST /api/v2/item_upload/attributes` mit `{"attributes":[{"code":"category","value":[ID]}]}`                             | Felder mit Pflicht, Auswahlart, Höchstanzahl und Optionen      |
| Farben              | `GET /api/v2/item_upload/colors`                                                                                          | 29 Farben mit ID, Name, Farbwert und Code                      |
| Marken              | `GET /api/v2/item_upload/brands?category_id=ID`                                                                           | Suche, nicht vollständig speicherbar                           |
| Paketgrößen         | `api.vinted.de/shipping-estimation/external/catalogs/{id}/package_sizes`, Vorschlag per `POST …/package_sizes/suggestion` | 1–3 Standard, 8–10 schwer (5/10/20 kg); Vorschlag je Kategorie |

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
Seit der Erstbefüllung (unten) ist der Katalog sofort vollständig; der Abgleich hält ihn
nur noch aktuell und liest Felder erneut, sobald sie älter als sieben Tage sind.

## Masken aus dem Katalog (Schritt 4)

`VintedCategoryFieldStore` liest zuerst den zentralen Katalog und baut daraus mit
`vintedListingCatalogCategoryFields` Größe, Zustand, Farbe, Material und Zielgruppe mit
Vinteds Kennungen. Damit erhalten Erstellen, Bearbeiten, Vorschau und Relisten dieselben
Werte. Solange eine Kategorie im Katalog noch fehlt, gelten die zuletzt beim Inseratabruf
des Kontos gelesenen Werte und danach die eigene Liste.

- Das gemeinsame Feldformat nimmt für gespeicherte Werte mehrere Größengruppen an (jede
  Größe trägt ihre Gruppe). Was aus dem Vinted-Formular gelesen wird, bleibt bei genau
  einer sichtbaren Gruppe.
- Gleiche Bezeichnungen mehrerer Gruppen („Sonstige“, „Einheitsgröße“) erscheinen einmal,
  aus der ersten Gruppe.
- Bei Vinted gelesene Inserate werden über ihre Kennungen vorausgewählt. Entwürfe der
  eigenen Liste (Merker `flipbaseListingForm`) werden weiter über Bezeichnungen zugeordnet.
- Paketgröße und Marke bleiben bei der bisherigen Zuordnung.

## Absenden mit Größengruppen (Schritt 5)

Beobachtet am 06.11.2026 im leeren Verkaufsformular:

- Herrenjeans zeigen beide Größengruppen zugleich (14 „Größen Männer“, 77 „Hosen für
  Herren“). Bisher galt eine solche Auswahl beim Lesen als ungültig.
- Damenjeans zeigen sechs Gruppen als Umschaltknöpfe (`button.web_ui__Chip__chip`,
  aktiv mit `aria-pressed="true"`); im Formular steht nur die aktive Gruppe. Das Feld
  heißt dort `category-size-single-grid_chips-input`, bleibt aber `input#size`.

Änderungen im Worker:

- Größen aus mehreren Gruppen sind beim Lesen gültig; jede Größe trägt ihre Gruppe.
- Mit dem Hinweis `sizeId` schaltet das Öffnen der Größenauswahl die Gruppen durch, bis
  die gesuchte Größe sichtbar ist. Umschalten wählt nichts aus.
- Ausgewählt wird über die Gruppe der jeweiligen Größe; der frühere Abgleich einer
  einzigen Feldgruppe entfällt.
- Veröffentlichen und Bearbeiten geben die gewünschte Größe als Hinweis mit. Fehlt beim
  Bearbeiten eine geänderte Marke oder Größe in den gelesenen Werten, wird genau dieses
  Feld mit Suche bzw. Gruppenwechsel neu gelesen.

## Erstbefüllung (06.11.2026)

Damit der Katalog nicht erst über rund 41 Kontoabgleiche entsteht, liefert die Migration
`20261106150415_vinted_listing_catalog_seed.sql` ihn vollständig mit. Gelesen im
angemeldeten, leeren Verkaufsformular von vinted.de mit 400 ms Pause je Abruf; nichts
gespeichert oder veröffentlicht.

| Inhalt                                                           | Anzahl       |
| ---------------------------------------------------------------- | ------------ |
| Kategorien im Verkaufsbaum                                       | 2.874        |
| Endkategorien mit Feldern                                        | 2.462 (alle) |
| Endkategorien mit Größe                                          | 595          |
| Größengruppen / Größen                                           | 36 / 709     |
| Merkmalswerte (Zustand, Farbe, Material, Zielgruppe und weitere) | 301          |
| unterschiedliche Feldmuster                                      | 65           |

Die Migration ist nicht destruktiv: Vorhandene Zeilen, etwa aus einem bereits gelaufenen
Worker-Abgleich, bleiben unverändert; Felder einer Kategorie werden nur ergänzt, wenn für
sie noch keine gespeichert sind. Neben Größe, Zustand, Farbe und Material speichert der
Katalog weitere Merkmale einzelner Kategorien (z. B. `measurements`, `skirt_length`,
`video_game_platform`); die Masken zeigen davon bisher die bekannten Felder.

1. **Nachweis** – erledigt (oben).
2. **Datenbank** – erledigt (oben): zentrale Tabellen ohne Kontobezug: Verkaufsbaum, Größengruppen
   mit Größen, Felder je Kategorie (Pflicht, Auswahlart, Höchstanzahl,
   Größengruppen) sowie Zustände, Farben, Materialien, Zielgruppen und
   Paketgrößen mit Original-IDs. Lesen für angemeldete Nutzer, Schreiben nur
   der Worker. Stand und Zeitpunkt je Kategorie.
3. **Katalog-Abgleich im Worker** – erledigt (oben), Knopf siehe unten: Baum und Felder aller Endkategorien mit einer
   angemeldeten Sitzung lesen, gedrosselt, nur Änderungen schreiben. Auslöser
   wöchentlich und per Knopf im Plattform-Admin, Fortschritt sichtbar.
4. **Oberfläche nur aus der Datenbank** – erledigt (oben), mit Übergang bis der Katalog vollständig ist: Kategorie wählen zeigt sofort ihre
   Felder und Werte. Gespeichert werden IDs. Bestehende Inserate öffnen mit
   ihren IDs (die Item-Abfrage liefert sie) vorausgewählt.
5. **Absenden** – erledigt (oben) für Größengruppen: Der Worker überträgt IDs und gleicht sie vor dem Speichern mit
   Vinted ab. Bei Abweichung klare Meldung und erneutes Einlesen der Kategorie.

Danach entfallen `vinted_category_field_snapshots`, die eigenen Listen in
`flipbase-vinted-listing-form.ts` und die Zuordnung über Bezeichnungen.

## Übertragung über IDs, Zusatzfelder und Neu-Einlesen (06.11.2026)

- **IDs statt Bezeichnungen:** Liegen für eine Kategorie Katalogwerte vor, setzt
  `prepareFlipbaseVintedListingContent` den Merker `flipbaseListingForm` nicht mehr; der
  Worker überträgt Größe, Zustand, Farben und Material direkt über Vinteds Kennungen.
  Ältere Entwürfe der eigenen Liste werden dabei einmal über den Katalog zugeordnet. Ohne
  Katalogwerte bleibt die Zuordnung über Bezeichnungen.
- **Zusatzfelder:** Der Katalog speichert Vinteds Feldtitel (`title`). Editor und
  Bearbeiten zeigen Zusatzfelder der Kategorie mit Vinteds Titel und Werten, Pflicht nur
  wo Vinted sie verlangt. Gespeichert werden sie in `attributes`: Auswahlfelder als
  `<code>` mit Vinted-Kennungen (z. B. `skirt_length: "392"`), freie Felder als
  `text_<name>`. Maße (`text_shoulder_width`, `text_height` in cm) und ISBN (`text_isbn`)
  stehen nicht in Vinteds Merkmalsabfrage, sondern nur im Formular und sind deshalb fest
  hinterlegt. Der Worker liest Zusatzauswahlen bestehender Inserate mit und setzt geänderte
  Zusatzfelder beim Veröffentlichen und Bearbeiten (`vinted-browser-listing-extras.ts`).
- **Marke nur, wo Vinted sie hat:** Kategorien ohne Marke (z. B. Bücher, Videospiele)
  bieten keine Marke an; eine vorhandene wird beim Vorbereiten entfernt.
- **Neu-Einlesen:** Seite „Vinted-Katalog“ im Plattform-Admin mit Umfang, Aktualität und
  Knopf „Jetzt neu einlesen“. Der Auftrag (`vinted_listing_catalog_refreshes`) macht alles
  vor ihm Gelesene fällig; der Worker liest dann je Kontoabgleich bis zu 200 Kategorien
  in höchstens drei Minuten, bis nichts mehr fällig ist.

## Paketgrößen mit Vinteds Vorschlag (06.11.2026)

- **Quelle:** Im angemeldeten Formular beobachtet. Die angebotenen Paketgrößen einer
  Kategorie liefert `GET https://api.vinted.de/shipping-estimation/external/catalogs/{id}/package_sizes`,
  den Vorschlag `POST …/package_sizes/suggestion` mit `catalog_id` und einer beliebigen
  `upload_session_id` (ohne sie 422). Deutsche Titel nur mit der Kopfzeile `Locale: de-DE`.
  Der Vorschlag hängt mit leerem Titel, Marke und Preis nur an der Kategorie (z. B. Kniehohe
  Stiefel 3, Röcke kein Vorschlag).
- **Schwere Artikel:** Manche Kategorien (z. B. Möbel) bieten statt Klein/Mittel/Groß (1–3)
  nur 5 kg, 10 kg und 20 kg (8–10) an. Die feste Liste 1–3 war dort nie gültig.
- **Speicherung:** Der Worker liest beides beim Katalogabgleich je Endkategorie mit und
  speichert es als Feld `package` in `vinted_listing_category_fields` (Werte in
  `vinted_listing_options`), den Vorschlag in der neuen Spalte `recommended_option_id`.
  Scheitert nur der Paketabruf, bleiben die übrigen Felder gültig.
- **Masken:** Mit Katalogwerten bieten Editor und Bearbeiten die Paketgrößen der Kategorie
  an. Beim Vorbereiten bleibt eine angebotene Wahl; fehlt sie oder passt sie nicht zur
  Kategorie, gilt Vinteds Vorschlag, ohne Vorschlag keine Angabe. Der Editor zeigt die
  vorbelegte Größe mit „(empfohlen)“.
- **Nachlesen:** Die Migration legt einen Auftrag zum Neu-Einlesen an; der Worker liest
  dadurch alle Kategorien mit Paketgrößen nach. Bis dahin gilt für eine Kategorie die
  bisherige Auswahl 1–3.

## Offen

- Pflichtstatus der Farbe: im Feld ohne Konfiguration geliefert; das Formular erlaubt bis
  zu zwei Farben.
- Freie Zusatzfelder bestehender Inserate (Maße, ISBN) liefert Vinteds Inseratabfrage
  nicht; beim Bearbeiten bleiben sie bei Vinted unverändert, solange sie nicht neu
  eingegeben werden.
