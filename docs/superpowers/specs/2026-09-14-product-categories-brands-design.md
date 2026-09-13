# Kategorie- und Markenauswahl für Artikel und Katalogprodukte

Stand: 14.09.2026 · Zweig `feat/product-categories-brands`

## Ziel

Kategorie und Marke sind bei Artikeln (`inventory_items`) und Katalogprodukten
(`catalog_products`) heute freie Textfelder. Das führt zu Tippfehlern, doppelten
Schreibweisen und Kategorien, die sich keiner Verkaufsplattform zuordnen lassen.

Künftig wird die Kategorie aus einem festen Baum gewählt und die Marke aus einer
Markenliste je Workspace, die beim Arbeiten mitwächst.

Dieses Projekt ist Teil 2 von dreien. Es kommt zuerst, weil die anderen darauf
aufbauen:

1. Listing Studio aufräumen (Design, keine falschen „KI“-Versprechen, verständliche
   Artikelauswahl, gespeicherte Listings mit Relisten)
2. **Kategorie- und Markenauswahl** (dieser Entwurf)
3. Kategorie auf Kleinanzeigen automatisch wählen (braucht feste Kategorien)

## Entscheidungen des Nutzers

| Frage                      | Entscheidung                                     |
| -------------------------- | ------------------------------------------------ |
| Quelle der Kategorien      | Shopify Standard Product Taxonomy, deutsch       |
| Quelle der Marken          | Eigene Liste je Workspace, wächst mit            |
| Wo                         | Artikel und Katalogprodukte                      |
| Vorhandene Kategorietexte  | Werden verworfen (Option C)                      |
| Vorhandene Markentexte     | Werden automatisch in die Markenliste übernommen |
| Speicherort der Kategorien | Tabelle in der Datenbank (Weg 1)                 |

Ohne Rückfrage festgelegt und im Chat nicht beanstandet:

- Die Kategorie ist freiwillig. Pflicht wird sie erst in Projekt 3 beim Inserieren.
- Jede Ebene ist wählbar, nicht nur die tiefste.
- Ausgeblendete Hauptbereiche: Geschenkgutscheine (`gc`), Dienstleistungen (`se`),
  Bundles (`bu`), Produkt-Add-Ons (`pa`), Nicht kategorisiert (`na`).
- Marken gelten je Workspace.

## Quelle der Kategorien

- Repository [Shopify/product-taxonomy](https://github.com/Shopify/product-taxonomy),
  MIT-Lizenz („Copyright (c) Shopify“).
- Datei `dist/de/categories.txt` der stabilen Version **v2026-08** (erschienen
  24.08.2026). Nie `unstable` verwenden.
- Umfang dieser Version: 14.606 Kategorien, 26 Hauptbereiche, bis zu 8 Ebenen.
- Zeilenformat: `gid://shopify/TaxonomyCategory/el-6-6 : Elektronik > Computer > Laptops`.
  Die Kennung hinter `TaxonomyCategory/` ist hierarchisch: `el-6-6` hat die
  Oberkategorie `el-6`.

## 1. Datenmodell

### `public.product_categories` (global)

| Spalte             | Typ                 | Bedeutung                               |
| ------------------ | ------------------- | --------------------------------------- |
| `id`               | `text` primary key  | Shopify-Kennung, z. B. `el-6-6`         |
| `parent_id`        | `text` → `id`, null | Oberkategorie; null bei Hauptbereichen  |
| `name`             | `text` not null     | Letzter Pfadteil, z. B. „Laptops“       |
| `full_name`        | `text` not null     | Voller Pfad, Teile getrennt durch „ > “ |
| `level`            | `smallint` not null | 1 für Hauptbereiche                     |
| `is_leaf`          | `boolean` not null  | Hat keine Unterkategorien               |
| `taxonomy_version` | `text` not null     | z. B. `2026-08`                         |
| `is_deprecated`    | `boolean` not null  | Von Shopify entfernt, aber noch benutzt |

- Ausnahme von der Projektregel „`id` als `identity`“: Die Kennung ist die fremde
  Shopify-Kennung. Das gleiche Muster nutzt bereits `vinted_categories`.
- RLS aktiv. Policy „Angemeldete lesen Produktkategorien“: `select` für
  `authenticated`, `using (true)`. Keine Schreib-Policy. Tabellenrechte:
  `revoke all` von `anon` und `authenticated`, danach nur `select` für
  `authenticated`.
- Indexe auf `parent_id` und `is_deprecated`.
- `comment on table` und auf `full_name`.

### `public.brands` (je Workspace)

| Spalte         | Typ                                              | Bedeutung      |
| -------------- | ------------------------------------------------ | -------------- |
| `id`           | `uuid` primary key, `gen_random_uuid()`          |                |
| `workspace_id` | `uuid` not null → `workspaces` on delete cascade |                |
| `name`         | `text` not null, getrimmt, 1–120 Zeichen         | Anzeigename    |
| `name_key`     | `text` generated: `lower(name)`                  | Vergleichsform |
| `created_at`   | `timestamptz` not null default `now()`           |                |

- `unique (workspace_id, name_key)` und `unique (workspace_id, id)` für den
  zusammengesetzten Fremdschlüssel. Der erste eindeutige Index beginnt mit
  `workspace_id` und deckt damit die Policies ab.
- `uuid` statt `identity` wie bei allen anderen Workspace-Tabellen
  (`catalog_products`, `inventory_items`).
- Kein `updated_at`: Es gibt im Projekt keine allgemeine Trigger-Funktion dafür,
  und nichts liest den Wert.
- RLS aktiv, vier getrennte Policies für `authenticated` mit
  `public.is_workspace_member(workspace_id)` (Muster „Artikelstamm …“ in
  `database.sql`). `anon` erhält kein Tabellenrecht.
- Schutz für archivierte Workspaces wie bei `catalog_products`
  (`00_protect_archived_workspace`).

### Neue Spalten an `inventory_items` und `catalog_products`

- `category_id text references public.product_categories (id)`
- `brand_id uuid`, Fremdschlüssel `(workspace_id, brand_id)` → `brands (workspace_id, id)`
- Beide Fremdschlüssel mit `on delete no action`: Eine benutzte Kategorie oder
  Marke lässt sich nicht löschen (Fehler `23503`). Anders als `restrict` prüft
  `no action` erst am Ende der Anweisung, sodass das Löschen eines ganzen Workspace
  per Kaskade weiter funktioniert.
- Indexe auf `category_id` und `(workspace_id, brand_id)`.
- Die Spalten kommen per `alter table … add column` in die neue Schemadatei, weil
  `product_categories` erst nach `database.sql` entsteht.

### Textspalten bleiben, die Datenbank füllt sie

Die bestehenden Spalten `category` und `brand` bleiben erhalten. Shop, CSV- und
Prüfexport, Etiketten, Auswertungen, Listing Studio und Preisbeobachtung lesen sie
weiter unverändert.

Trigger-Funktion `public.sync_category_brand_text()`, `security invoker`,
`set search_path = ''`. Trigger `"10_sync_category_brand_text"` vor `insert` und
vor einem Update der Spalten `category_id`, `brand_id`, `category` oder `brand`:

- **Kategorie:** `new.category := full_name` der gewählten Kategorie, sonst `null`.
  Freier Kategorietext wird nie ausgewertet (Option C).
- **Marke:** Die Kennung hat Vorrang. Ein Markentext wird nur ausgewertet
  - beim Anlegen, wenn keine `brand_id` mitkommt, oder
  - beim Ändern, wenn sich der Text ändert und die `brand_id` gleich bleibt.

  Dann wird die Marke mit gleicher Vergleichsform gesucht und bei Bedarf angelegt.
  Ein leerer Text entfernt die Marke. Anschließend gilt
  `new.brand := name` der Marke, sonst `null`.

Warum der Markentext ausgewertet wird: Die Paketerfassung
(`capture_purchase_package_contents`), der CSV-Import des Katalogs und die
Barcode-Übernahme liefern Markentext. So bleiben diese Wege unverändert, und die
Markenliste bleibt trotzdem sauber.

Der Name beginnt mit `10_`: Postgres führt gleichartige Trigger alphabetisch aus.
Er läuft damit nach `00_protect_archived_workspace` und vor den fachlichen
Schutz-Triggern (`protect_…`, `sync_inventory_item_ean`). Keiner dieser
Schutz-Trigger prüft Kategorie oder Marke.

**Nachziehen bei Umbenennung:**

- `public.sync_brand_name_to_records()` nach `update of name` an `brands`.
  `security definer`, weil `guard_inventory_item_costing_fields` angemeldeten
  Nutzern jede Änderung an Artikeln abgeschlossener Einkäufe verbietet und sonst
  jede Umbenennung scheitern würde. Geändert wird nur der Markentext im Workspace
  der Marke.
- `public.sync_category_name_to_records()` nach `update of full_name` an
  `product_categories` (für spätere Shopify-Versionen). Ebenfalls
  `security definer`. Artikel archivierter Workspaces bleiben unverändert, weil
  deren Schutz auch `postgres` sperrt; sie erhalten den neuen Text beim nächsten
  Speichern nach einer Wiederherstellung.

### Übernahme vorhandener Daten

Funktion `public.migrate_legacy_category_brand_texts()` in der Schemadatei, von
einer eigenen Migration aufgerufen. Kein Ausführungsrecht für `public`, `anon`,
`authenticated` und `service_role`; nur `postgres` ruft sie auf. Sie bleibt
bestehen, damit der Datenbanktest sie mit Altbestand prüfen kann.

1. **Marken:** Aus allen nicht leeren `brand`-Texten von Artikeln und
   Katalogprodukten entsteht je Workspace eine Marke je `lower(btrim(brand))`. Als
   Anzeigename gilt die häufigste Schreibweise, bei Gleichstand die alphabetisch
   erste. Danach wird `brand_id` gesetzt; vorhandene Verweise bleiben.
2. **Kategorien:** Alle `category`-Texte ohne `category_id` werden geleert. Das ist
   ausdrücklich gewünscht (Option C) und in Funktion und Migration ausführlich
   kommentiert.

Schutz-Trigger bei der Übernahme:

| Trigger                                 | Wirkung bei der Übernahme als `postgres`                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `00_protect_archived_workspace`         | Sperrt auch `postgres` → innerhalb der Funktion kurz abgeschaltet und wieder eingeschaltet |
| `protect_inventory_item_costing_fields` | Lässt `postgres` durch                                                                     |
| `protect_inventory_item_sold_status`    | Nur bei Statusänderung                                                                     |
| `protect_inventory_archive_metadata`    | Nur bei Archivfeldern                                                                      |
| `protect_purchase_package_inventory`    | Nur bei Herkunftsfeldern                                                                   |
| `protect_inventory_tax_cost`            | Nur bei Steuerfeldern                                                                      |

Das Abschalten erfolgt per `alter table … disable trigger` in derselben
Transaktion. Scheitert die Übernahme, rollt Postgres auch das Abschalten zurück.

## 2. Import und Updates

### Skript `scripts/import-shopify-taxonomy.mjs`

- Aufruf mit fester Version: `node scripts/import-shopify-taxonomy.mjs v2026-08`.
- Lädt `dist/de/categories.txt` und `LICENSE` dieser Version.
- Liest je Zeile Kennung, Namen, Pfad und Ebene. Die Oberkategorie ergibt sich aus
  der Kennung (letzten `-`-Teil abschneiden). `is_leaf` ergibt sich daraus, ob eine
  andere Kategorie auf sie verweist.
- Lässt die Hauptbereiche `gc`, `se`, `bu`, `pa`, `na` samt Unterkategorien weg.
- Bricht ab bei falscher Version, unbekanntem Zeilenformat, doppelter Kennung,
  fehlender Oberkategorie oder einer Kennung, die nicht zum Pfad passt.
- Schreibt eine Migration `supabase/migrations/<UTC>_import_shopify_taxonomy_v2026_08.sql`
  mit Kopfkommentar (Zweck, Version, Anzahl) und dem MIT-Lizenztext von Shopify.
- SQL in Kleinbuchstaben, Einfügen in Blöcken per
  `insert … on conflict (id) do update`, Eltern vor Kindern.
- Ohne eigene Transaktionssteuerung, damit die Migration im Release-Lauf
  transaktional bleibt.

### Spätere Shopify-Versionen

- Skript mit neuer Version erzeugt eine neue Migration: neue Kategorien einfügen,
  geänderte Namen und Pfade aktualisieren, `taxonomy_version` setzen.
- Kategorien, deren `taxonomy_version` danach nicht der neuen Version entspricht,
  werden auf `is_deprecated = true` gesetzt, nicht gelöscht.
- Die Tabellenstruktur liegt deklarativ in
  `supabase/schemas/150_product_categories_brands.sql`. Die Kategoriedaten stehen
  nur in der erzeugten Migration.
- Die Ladereihenfolge der Schemadateien ist in `supabase/config.toml` bindend
  festgelegt. Die neue Datei steht dort nach `140_purchase_package_contents.sql`.

### Reihenfolge der Migrationen

1. Struktur per `supabase db diff -f product_categories_brands` (danach lesen und
   prüfen)
2. Kategorien per Skript
3. Übernahme per Hand: `select public.migrate_legacy_category_brand_texts();`

## 3. Bedienoberfläche

Beide Wähler sind gemeinsame Bausteine unter `src/app/shared/components/`, weil
Artikel und Katalogprodukte sie brauchen. Sie implementieren `ControlValueAccessor`,
nutzen Signals, `OnPush`, externe Templates und Tailwind. Daten laden sie über die
Services aus Abschnitt 4, nicht selbst.

### Kategorie-Wähler `app-category-picker`

- Wert: Kategorie-Kennung oder `null`.
- Geschlossen: Feld im Stil von `app-text-field`, zeigt den Pfad mit „›“, Knopf
  „Kategorie entfernen“.
- Geöffnet: Popover (Radius 12 px, Popover-Schatten wie `app-custom-select`) mit
  Suchfeld.
  - **Ohne Suchbegriff:** Liste der aktuellen Ebene, beginnend mit den
    Hauptbereichen. Zeilen mit Unterkategorien tragen „›“; ein Klick öffnet die
    Ebene. Zeilen ohne Unterkategorien werden per Klick gewählt. In einer Ebene
    stehen oben „Zurück“, der Pfad und „„Computer“ auswählen“ – so ist jede Ebene
    wählbar, ohne verschachtelte Schaltflächen.
  - **Ab 2 Zeichen:** Trefferliste, Name in der ersten Zeile, voller Pfad darunter.
    Jeder Treffer ist direkt wählbar. Höchstens 50 Einträge, Hinweis „Mehr als 50
    Treffer – bitte genauer suchen“.
  - Veraltete Kategorien erscheinen nicht.
- Zustände getrennt: Lädt, Keine Treffer, Fehler mit „Erneut versuchen“.
- Ist die gewählte Kategorie veraltet: Hinweis „Kategorie wird nicht mehr geführt“.
- Eingang `suggestion`: Text aus Barcode-Suche oder Erkennung, der beim Öffnen im
  Suchfeld steht, aber nichts auswählt.

### Marken-Wähler `app-brand-picker`

- Wert: Marken-Kennung oder `null`.
- Combobox-Eingabefeld: Tippen filtert die Marken des Workspace (Anfang vor
  Enthaltensein, Vergleich wie `name_key`).
- Gibt es keine exakte Übereinstimmung: letzte Zeile „„…“ als neue Marke anlegen“.
- Anlegen wählt die neue Marke aus. Bei Eindeutigkeitskonflikt wird die vorhandene
  Marke gewählt.
- Fehler beim Anlegen erscheinen unter dem Feld, der Text bleibt stehen.
- Getippter Text ohne Auswahl: Hinweis „Noch nicht übernommen – Marke auswählen
  oder neu anlegen“.
- Eingang `suggestion`: passt er zu einer Marke, wird sie vorausgewählt, sonst steht
  er im Feld und kann angelegt werden.

### Gemeinsam

- Suchfeld als ARIA-Combobox mit Listbox, Pfeiltasten, Enter wählt bzw. öffnet eine
  Ebene, → öffnet eine Ebene (nur Kategorie), ← zurück, Esc schließt, Fokus kehrt
  zum Feld zurück.
- AXE-Prüfung und WCAG AA (Kontrast, Fokus sichtbar, zugängliche Namen).
- Keine eigenen Farb-, Radius- oder Schattenvarianten außerhalb der Richtlinien.
- Die Architekturprüfung für Admin-Oberflächen (`check-admin-shared-ui`) muss
  bestehen.

### Einsatzorte (Freitextfelder werden ersetzt)

- `features/inventory/components/item-create-modal` – Anlegen und Bearbeiten von
  Artikeln (die Detailseite öffnet zum Bearbeiten denselben Dialog)
- `features/inventory/pages/item-create` – übergibt Erkennungstexte als Vorschlag
- `features/catalog/components/product-dialog`
- `features/catalog/pages/product-detail`

Nicht betroffen:

- Paketerfassung: Der Dialog hat kein Markenfeld; die Datenbank wertet
  Markentext aus.
- CSV-Import des Katalogs: liefert nur Markentext, wird ausgewertet.
- `single_item_category` in `purchase.service.ts` und `category` in
  `addItemToPurchase`: von keinem Formular benutzt, werden entfernt.

Barcode-Suche und Erkennung liefern weiter Text. Marke: Vorschlag an den
Marken-Wähler. Kategorie: nur Suchvorschlag, keine automatische Auswahl. Wird bei
der Barcode-Suche ein Katalogprodukt gefunden, übernimmt der Artikel dessen
`category_id` und `brand_id`.

## 4. Services, Demo-Modus, Fehler

### `ProductCategoryService` (`core/services`, `providedIn: 'root'`)

- `loadChildren(parentId: string | null)`: Unterkategorien einer Ebene, sortiert
  nach Namen, ohne veraltete. Zwischenspeicher je Ebene; ein Fehler leert den
  Eintrag, damit „Erneut versuchen“ wirklich neu lädt.
- `search(term: string)`: jedes Wort als `full_name ilike`, Platzhalter maskiert,
  höchstens 51 Zeilen abfragen, um „mehr als 50“ zu erkennen.
- `getById(id: string)`: für die Anzeige einer gewählten Kategorie, auch veraltet.

### `BrandService` (`core/services`, `providedIn: 'root'`)

- `brands`: Signal mit den Marken des aktuellen Workspace, sortiert nach Namen.
  Gehört der geladene Stand zu einem anderen Workspace oder Modus, ist die Liste
  leer.
- `ensureLoaded()`, `search(term)`, `findByName(name)`, `findById(id)`.
- `create(name)`: liefert eine vorhandene Marke gleicher Vergleichsform, legt sonst
  an; bei Eindeutigkeitskonflikt lädt er neu und liefert die vorhandene Marke.
- Kontext ist Workspace und Demo-Modus. Kein `AuthService`, damit der Dienst in
  Formular-Tests ohne Anmeldekette auskommt.

### Bestehende Services

- `CreateItemPayload`: `category_id` und `brand_id` statt `category`; `brand` bleibt
  als Text für Übernahmen.
- `InventoryService.updateItem`: Ändert eine Aktualisierung Kategorie oder Marke,
  liest er danach `category_id, category, brand_id, brand` aus der Datenbank nach,
  damit die Liste den von der Datenbank gesetzten Text zeigt.
- `CatalogService`: `categoryId` und `brandId` statt `category`; `brand` bleibt als
  Text für den CSV-Import.
- `PurchaseService`: unbenutzte Kategorie-Eingaben entfallen.
- Nach der Migration werden die Typen neu erzeugt (`supabase.types.ts`).

### Demo-Modus

- `demo-product-categories.ts`: 31 feste Beispielkategorien mit echten
  Shopify-Kennungen und -Pfaden über mehrere Ebenen.
- `MockDataStoreService`: Demo-Marken (`flipbase_local_brands`) und
  `applyCategoryBrandText()`, das den Datenbank-Trigger nachbildet. Genutzt beim
  Anlegen und Ändern von Artikeln und Katalogprodukten sowie in der
  Demo-Paketerfassung.

### Fehlerfälle

- Kategorien laden nicht: Fehlerzustand im Popover, Formular bleibt benutzbar.
- Marken laden nicht: Fehlerzustand in der Liste mit „Erneut versuchen“.
- Marke lässt sich nicht anlegen: Feldmeldung, Eingabe bleibt.
- Speichern mit ungültiger Kennung: Die Datenbank lehnt ab (Fremdschlüssel); die
  Meldung läuft über den vorhandenen Fehlerweg des Services.

## 5. Tests

- **Datenbanktest** `supabase/tests/product_categories_brands.test.sql`:
  Tabellen und RLS, Trigger füllt Text, wertet Markentext aus, überschreibt freien
  Kategorietext, Umbenennung zieht nach (auch bei abgeschlossenem Einkauf),
  doppelte Marke nicht möglich, benutzte Marke nicht löschbar, fremder Workspace
  ohne Zugriff, Kategorien nur lesbar, `anon` ohne Zugriff, Übernahme mit
  archiviertem Workspace, Archivschutz danach wieder aktiv, importierte Kategorien
  vollständig und ohne ausgeblendete Bereiche.
- **Skript-Test** `scripts/import-shopify-taxonomy.test.mjs` mit kleiner
  Beispieldatei: Ebenen, Oberkategorien, Blätter, ausgeblendete Bereiche, doppelte
  Kennung, fehlende Oberkategorie, falscher Pfad, falsche Version, erzeugtes SQL,
  Dateiname. In `test:workflow` aufnehmen.
- **Angular- und Service-Tests:** beide Wähler (Tastatur, Zustände, Suche, Ebenen,
  neu anlegen, Konflikt, AXE), beide Services, Demo-Nachbildung des Triggers, jedes
  umgestellte Formular gegen Laden und Speichern.
- **Abschluss:** Typprüfung, Lint, Bau, Architekturprüfung, Sichtprüfung im Browser.

## Nicht Teil dieses Projekts

- Listing Studio aufräumen und Listings speichern (Projekt 1).
- Kategorie auf Kleinanzeigen automatisch wählen (Projekt 3).
- Die Stichwort-„Erkennung“ in `ai-assistant.service.ts` ersetzen oder umbenennen.
- Eigenschaften (Farbe, Größe …) aus der Shopify-Taxonomie.
- Kategorie als Filter in Inventar- oder Katalogtabellen.
- Markenverwaltung (Umbenennen, Zusammenführen) als eigene Seite.
