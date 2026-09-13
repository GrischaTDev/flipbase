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
   Artikelauswahl)
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
  MIT-Lizenz.
- Datei `dist/de/categories.txt` der stabilen Version **v2026-08** (erschienen
  24.08.2026). Nie `unstable` verwenden.
- Umfang dieser Version: 14.606 Kategorien, 26 Hauptbereiche, bis zu 8 Ebenen.
- Zeilenformat: `gid://shopify/TaxonomyCategory/el-2-4 : Elektronik > Videospiele > …`.
  Die Kennung hinter `TaxonomyCategory/` ist hierarchisch: `el-2-4` hat die
  Oberkategorie `el-2`.

## 1. Datenmodell

### `public.product_categories` (global)

| Spalte             | Typ                 | Bedeutung                               |
| ------------------ | ------------------- | --------------------------------------- |
| `id`               | `text` primary key  | Shopify-Kennung, z. B. `el-2-4`         |
| `parent_id`        | `text` → `id`, null | Oberkategorie; null bei Hauptbereichen  |
| `name`             | `text` not null     | Letzter Pfadteil, z. B. „Konsolen“      |
| `full_name`        | `text` not null     | Voller Pfad, Teile getrennt durch „ > “ |
| `level`            | `smallint` not null | 1 für Hauptbereiche                     |
| `taxonomy_version` | `text` not null     | z. B. `2026-08`                         |
| `is_deprecated`    | `boolean` not null  | Von Shopify entfernt, aber noch benutzt |

- Ausnahme von der Projektregel „`id` als `identity`“: Die Kennung ist die fremde
  Shopify-Kennung. Das gleiche Muster nutzt bereits `vinted_categories`.
- RLS aktiv. Policy „Angemeldete lesen Kategorien“: `select` für `authenticated`,
  `using (true)`. Keine Schreib-Policy. Tabellenrechte: `revoke all` von `anon`
  und `authenticated`, danach nur `select` für `authenticated`.
- Indexe auf `parent_id` und `is_deprecated`.
- `comment on table` und auf `full_name`.

### `public.brands` (je Workspace)

| Spalte         | Typ                                              | Bedeutung      |
| -------------- | ------------------------------------------------ | -------------- |
| `id`           | `uuid` primary key, `gen_random_uuid()`          |                |
| `workspace_id` | `uuid` not null → `workspaces` on delete cascade |                |
| `name`         | `text` not null, nicht leer                      | Anzeigename    |
| `name_key`     | `text` generated: `lower(btrim(name))`           | Vergleichsform |
| `created_at`   | `timestamptz` not null default `now()`           |                |
| `updated_at`   | `timestamptz` not null default `now()`           |                |

- `unique (workspace_id, name_key)` und `unique (workspace_id, id)` für den
  zusammengesetzten Fremdschlüssel.
- `uuid` statt `identity` wie bei allen anderen Workspace-Tabellen
  (`catalog_products`, `inventory_items`).
- RLS aktiv, vier getrennte Policies für `authenticated` mit
  `public.is_workspace_member(workspace_id)` (Muster „Artikelstamm …“ in
  `database.sql`). Index auf `workspace_id`.
- Schutz für archivierte Workspaces wie bei `catalog_products`
  (`00_protect_archived_workspace`).

### Neue Spalten an `inventory_items` und `catalog_products`

- `category_id text references public.product_categories (id) on delete restrict`
- `brand_id uuid`, Fremdschlüssel `(workspace_id, brand_id)` →
  `brands (workspace_id, id) on delete restrict`
- Indexe auf `category_id` und `(workspace_id, brand_id)`.
- Neue Spalten am Ende der Tabellendefinition.

### Textspalten bleiben, die Datenbank füllt sie

Die bestehenden Spalten `category` und `brand` bleiben erhalten. Shop, CSV- und
Prüfexport, Etiketten, Auswertungen, Listing Studio und Preisbeobachtung lesen sie
weiter unverändert.

- Trigger-Funktion `public.sync_category_brand_text()`, `security invoker`,
  `set search_path = ''`. Läuft vor `insert` und vor einem Update der Spalten
  `category_id`, `brand_id`, `category` oder `brand`:
  - `new.category := full_name` der gewählten Kategorie, sonst `null`.
  - `new.brand := name` der gewählten Marke im selben Workspace, sonst `null`.
- Dadurch ist freier Text nicht mehr speicherbar.
- Trigger an `brands` nach `update of name`: zieht den Text in allen Artikeln und
  Katalogprodukten dieser Marke nach.
- Trigger an `product_categories` nach `update of full_name`: zieht den Text nach
  (für spätere Shopify-Versionen).
- Die Trigger-Namen werden so gewählt, dass sie nach `00_protect_archived_workspace`
  und vor fachlichen Schutz-Triggern laufen. Die genaue Reihenfolge prüft der Plan
  gegen die vorhandenen Trigger an beiden Tabellen.

### Übernahme vorhandener Daten (eigene Migration, siehe Abschnitt 2)

1. **Marken:** Aus allen nicht leeren `brand`-Texten von Artikeln und
   Katalogprodukten entsteht je Workspace eine Marke je `lower(btrim(brand))`. Als
   Anzeigename gilt die häufigste Schreibweise, bei Gleichstand die alphabetisch
   erste. Danach wird `brand_id` gesetzt.
2. **Kategorien:** Alle `category`-Texte werden geleert. Das ist ausdrücklich
   gewünscht (Option C) und wird in der Migration ausführlich kommentiert.

**Offener Prüfpunkt für den Plan:** Die Schutz-Trigger (archivierte Workspaces,
verkaufte Artikel, Kosten- und Archivfelder, Paketinhalte) können das nachträgliche
Ändern blockieren. Der Plan prüft jeden dieser Trigger und legt fest, wie die
Übernahme sie berücksichtigt, ohne den Schutz dauerhaft abzuschwächen. Ein
Datenbanktest belegt das.

## 2. Import und Updates

### Skript `scripts/import-shopify-taxonomy.mjs`

- Aufruf mit fester Version, z. B. `node scripts/import-shopify-taxonomy.mjs v2026-08`.
- Lädt `dist/de/categories.txt` dieser Version.
- Liest je Zeile Kennung, Namen, Pfad und Ebene. Die Oberkategorie ergibt sich aus
  der Kennung (letzten `-`-Teil abschneiden).
- Lässt die Hauptbereiche `gc`, `se`, `bu`, `pa`, `na` samt Unterkategorien weg.
- Bricht ab bei doppelter Kennung, fehlender Oberkategorie oder einer Kennung, die
  nicht zum Pfad passt.
- Schreibt eine Migration `supabase/migrations/<UTC>_import_shopify_taxonomy_<version>.sql`
  mit Kopfkommentar (Zweck, Version, Anzahl) und MIT-Lizenzhinweis von Shopify.
- SQL in Kleinbuchstaben, Einfügen per `insert … on conflict (id) do update`.
- Ohne eigene Transaktionssteuerung, damit die Migration im Release-Lauf
  transaktional bleibt.

### Spätere Shopify-Versionen

- Skript mit neuer Version erzeugt eine neue Migration: neue Kategorien einfügen,
  geänderte Namen und Pfade aktualisieren, `taxonomy_version` setzen.
- Kategorien, die Shopify entfernt hat, werden auf `is_deprecated = true` gesetzt,
  nicht gelöscht.
- Die Tabellenstruktur liegt deklarativ in `supabase/schemas/150_product_categories_brands.sql`.
  Die Kategoriedaten stehen nur in der erzeugten Migration, nicht in der Schemadatei.
- Die Ladereihenfolge der Schemadateien ist in `supabase/config.toml` bindend
  festgelegt. Die neue Datei wird dort nach allen Dateien eingetragen, die sie
  benutzt (`database.sql`, `80_workspace_retention.sql`, `140_purchase_package_contents.sql`).
- Struktur-Migration per `supabase db diff`; die erzeugte Datei wird danach gelesen
  und geprüft. Die Datenübernahme (Marken, Leeren der Kategorien) steht in einer
  eigenen, von Hand geschriebenen Migration direkt danach, die Kategorien in der
  vom Skript erzeugten Migration dazwischen.

## 3. Bedienoberfläche

Beide Wähler sind gemeinsame Bausteine unter `src/app/shared/components/`, weil
Artikel und Katalogprodukte sie brauchen. Sie implementieren `ControlValueAccessor`,
nutzen Signals, `OnPush`, externe Templates und Tailwind. Daten laden sie über die
Services aus Abschnitt 4, nicht selbst.

### Kategorie-Wähler `app-category-picker`

- Wert: Kategorie-Kennung oder `null`.
- Geschlossen: Feld im Stil von `app-text-field`, zeigt den Pfad mit „›“, Knopf
  „Kategorie entfernen“.
- Geöffnet: Popover (Radius 12 px, gemessener Popover-Schatten aus
  `shopify-admin-live-reference.md`) mit Suchfeld.
  - Ohne Suchbegriff: Liste der aktuellen Ebene, beginnend mit den Hauptbereichen.
    Zeilen mit Unterkategorien haben „›“ zum Öffnen. Oben „Zurück“ und der Pfad.
    Jede Zeile ist wählbar.
  - Ab 2 Zeichen: Trefferliste mit vollem Pfad, Treffer hervorgehoben, höchstens
    50 Einträge, Hinweis „Bitte genauer suchen“ bei mehr Treffern.
  - Veraltete Kategorien erscheinen nicht.
- Zustände getrennt: Lädt, Keine Treffer, Fehler mit „Erneut versuchen“.
- Ist die gewählte Kategorie veraltet: Hinweis „Kategorie wird nicht mehr geführt“.
- Optionaler Eingang für einen Suchvorschlag (Text aus Barcode-Suche oder
  Erkennung), der beim Öffnen im Suchfeld steht, aber nichts auswählt.

### Marken-Wähler `app-brand-picker`

- Wert: Marken-Kennung oder `null`.
- Combobox: Tippen filtert die Marken des Workspace (Vergleich wie `name_key`).
- Gibt es keine exakte Übereinstimmung: letzte Zeile „„…“ als neue Marke anlegen“.
- Anlegen wählt die neue Marke aus. Bei Eindeutigkeitskonflikt wird die vorhandene
  Marke gewählt.
- Fehler beim Anlegen erscheinen unter dem Feld, der Text bleibt stehen.
- Optionaler Eingang für einen Markenvorschlag: passt er zu einer Marke, wird sie
  vorausgewählt, sonst steht er als „neu anlegen“ bereit.

### Gemeinsam

- ARIA-Combobox mit Listbox, Pfeiltasten, Enter wählt, → öffnet eine Ebene (nur
  Kategorie), ← zurück, Esc schließt, Fokus kehrt zum Feld zurück.
- AXE-Prüfung und WCAG AA (Kontrast, Fokus sichtbar, zugängliche Namen).
- Keine eigenen Farb-, Radius- oder Schattenvarianten außerhalb der Richtlinien.
- Die Architekturprüfung für Admin-Oberflächen (`check-admin-shared-ui`) muss
  bestehen.

### Einsatzorte (Freitextfelder werden ersetzt)

- `features/inventory/components/item-create-modal` (Anlegen im Dialog)
- `features/inventory/pages/item-create` (Anlegen als Seite, übernimmt Erkennung)
- Artikel bearbeiten (Ort im Plan bestimmen; die Detailseite zeigt die Werte heute
  nur an)
- `features/catalog/components/product-dialog`
- `features/catalog/pages/product-detail`
- Einkauf: Kategorie beim Einzelartikel (`single_item_category` in
  `purchase.service.ts`) und Marke bei Paketinhalten (`purchase-package.service.ts`)

Barcode-Suche und Erkennung liefern weiter Text. Marke: Abgleich mit der Liste wie
oben. Kategorie: nur Suchvorschlag, keine automatische Auswahl.

## 4. Services, Demo-Modus, Fehler

### `ProductCategoryService` (`core/services`, `providedIn: 'root'`)

- `loadChildren(parentId: string | null)`: Unterkategorien einer Ebene, sortiert
  nach Namen, ohne veraltete.
- `search(term: string)`: `full_name ilike`, höchstens 51 Zeilen abfragen, um „mehr
  als 50“ zu erkennen.
- `getById(id: string)`: für die Anzeige einer gewählten Kategorie.
- Zwischenspeicher je Ebene; Kategorien sind global und ändern sich nur mit
  Migrationen.

### `BrandService` (`core/services`, `providedIn: 'root'`)

- Signal mit den Marken des aktuellen Workspace, sortiert nach Namen.
- `create(name)`: legt an; bei Eindeutigkeitskonflikt lädt und liefert er die
  vorhandene Marke.
- `matchSuggestion(text)`: sucht eine Marke mit gleichem `name_key`.
- Leert seinen Stand bei Workspace- oder Sitzungswechsel.

### Bestehende Services

- `InventoryService`, `CatalogService`, `PurchaseService`,
  `PurchasePackageService` schreiben `category_id` und `brand_id` statt
  `category` und `brand`. Modelle und Eingabetypen bekommen die neuen Felder.
- Nach der Migration werden die Typen neu erzeugt (`supabase.types.ts`).

### Demo-Modus

- `MockDataStoreService` bekommt rund 30 feste Beispielkategorien mit echten
  Shopify-Kennungen über mehrere Ebenen sowie Demo-Marken.
- Beide Services lesen im Demo-Modus aus diesen Daten; der Text an Demo-Artikeln
  wird beim Speichern lokal genauso gesetzt wie in der Datenbank.

### Fehlerfälle

- Kategorien laden nicht: Fehlerzustand im Popover, Formular bleibt benutzbar.
- Marke lässt sich nicht anlegen: Feldmeldung, Eingabe bleibt.
- Speichern eines Artikels mit ungültiger Kennung: Die Datenbank lehnt ab
  (Fremdschlüssel); die Meldung läuft über den vorhandenen Fehlerweg des Services.

## 5. Tests

- **Datenbanktest** `supabase/tests/product_categories_brands.test.sql`:
  Trigger füllt Text, überschreibt freien Text, Umbenennung zieht nach, doppelte
  Marke nicht möglich, benutzte Marke nicht löschbar, fremder Workspace ohne
  Zugriff, Kategorien nur lesbar, `anon` ohne Zugriff, Datenübernahme inklusive
  archivierter Workspaces und verkaufter Artikel.
- **Skript-Test** `scripts/import-shopify-taxonomy.test.mjs` mit kleiner
  Beispieldatei: Ebenen und Oberkategorien, ausgeblendete Bereiche, doppelte
  Kennung, fehlende Oberkategorie, erzeugtes SQL. In `test:workflow` aufnehmen.
- **Angular-Tests:** beide Wähler (Tastatur, Zustände, Suche, Ebenen, neu anlegen,
  Konflikt), beide Services, jedes umgestellte Formular vollständig gegen Laden und
  Speichern.
- **Abschluss:** Typprüfung, Lint, Bau, AXE, Sichtprüfung im Browser.

## Nicht Teil dieses Projekts

- Listing Studio aufräumen (Projekt 1).
- Kategorie auf Kleinanzeigen automatisch wählen (Projekt 3).
- Die Stichwort-„Erkennung“ in `ai-assistant.service.ts` ersetzen oder umbenennen.
- Eigenschaften (Farbe, Größe …) aus der Shopify-Taxonomie.
- Kategorie als Filter in Inventar- oder Katalogtabellen.
