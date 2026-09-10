# Paket B – Produktmodell und Artikelerfassung vereinheitlichen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Produkt mit beliebiger positiver Menge durchgehend von Einkauf bis Verkauf/Retoure führen und kompakt wie die Shopify-Referenz erfassen.

**Architecture:** `catalog_products`, `purchase_lines`, `stock_lots` und `sale_lines` bilden den gemeinsamen neuen Schreibweg. Historische Einzelreferenzen werden nachvollziehbar zugeordnet, nicht gelöscht. Shared-Bildelement und vorhandene Eingabe-/Dialogbausteine bilden die Oberfläche.

**Tech Stack:** Angular 22, Supabase/PostgreSQL, Reactive Forms, Vitest, Playwright, pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-08-unified-products-admin-design.md`

## Globale Grenzen und Freigabepunkte

Die Grenzen des [Hauptplans](2026-09-08-unified-products-admin.md) gelten vollständig. B1–B4 sind ein zusammenhängender fachlicher Umbau; keine UI-Umschaltung auf einen nur teilweise unterstützten Backendvertrag. Produktive Datenüberführung benötigt den aktuellen Zuordnungsbericht und explizite Migrationsfreigabe. Kein Datenreset als stillschweigende Alternative. Keine lokal gestarteten Datenbankcontainer.

### Konkretisierung des kompatiblen PR-Schnitts

Neue Produkte und neue bekannte Einkaufspositionen verwenden unabhängig von Menge den Produkt-/Losweg. Historische Einzelartikel behalten vorerst ihre echten Verkaufs- und Retourenreferenzen; die Oberfläche bietet keine Wahl einer neuen Bestandsart mehr. Alt- und Neubestand werden getrennt gelesen und nicht doppelt gezählt. Bereits teilweise empfangene Altpositionen werden nicht stillschweigend umgeschrieben. Unempfangene Altpositionen können nach ausdrücklicher Produktzuordnung beim Speichern normalisiert werden.

Eine automatische Überführung verkaufter Altartikel in Schattenlose wäre fachlich falsch: Sie erforderte erfundene historische Abgänge oder verletzte die Losbilanz. Daher sind B1-Datensicherung, bestätigte Zuordnung und produktiver Backfill ein gesondertes Freigabegate, keine vorgetäuschte Leistung dieses PRs. Alte Schreibfunktionen bleiben nur für belegte historische Abläufe verfügbar, bis dieses Gate erfüllt ist. Kein Löschen, kein Produktionszugriff und kein Merge sind mit der PR-Erstellung verbunden.

Die Analyse hat außerdem ergeben, dass Wareneingänge bislang keine vollständige Request-Idempotenz besitzen. B3 muss diese ergänzen und testen; sie darf nicht lediglich als bestehend dokumentiert werden.

## B1 – Datenzuordnung und Invarianten vor der Migration

**Dateien:** Lesen `supabase/schemas/database.sql`, `src/app/core/models/flipbase.models.ts`, `src/app/core/models/sale-target.models.ts`, Kernservices `catalog.service.ts`, `purchase.service.ts`, `stock.service.ts`, `inventory.service.ts`, `sales.service.ts`, `return.service.ts`, `media.service.ts`, `store.service.ts`; vorhandenen `audit-export.service.ts` für Exportumfang heranziehen. Erzeugen `docs/superpowers/plans/2026-09-08-product-transition-checklist.md` ohne Geschäftsdaten.

- [ ] Alle Aufrufer von `tracking_mode`, `line_kind`, `receive_individual_purchase_line`, `record_legacy_inventory_sale` und alternativen Verkaufsreferenzen erfassen. Katalog, Einkaufsmaske, Bestandsübersicht, Artikelpflege, Verkaufsauswahl, Retouren, Store, Exporte und Dashboard jeweils einem neuen Schreib-/Lesepfad zuordnen.
- [ ] Aktuellen Export mit Medienreferenzen außerhalb des Repositories sichern; letzte Referenzsicherung nicht als aktuelle Vollsicherung ausgeben. Restore in isolierter Umgebung testen.
- [ ] Zuordnung außerhalb des Repositories vorbereiten: vorhandene Produkt-ID weiterverwenden, wenn Identität/Zustand tatsächlich passen; eigenständigen bisherigen Einzelartikel sonst genau einem neuen normalen Produkt zuordnen. Identische Titel/EAN nicht automatisch verschmelzen.
- [ ] Prüfbericht enthält pro Workspace: alte/neue Produkte, verfügbare/reservierte/verkaufte Mengen, Einkaufssummen, zugeordnete/offene Kosten, Verkaufswareneinsatz, Retouren, Medienreferenzen, verwaiste IDs und Mehrfachzuordnungen. Keine ungeklärte Zeile darf beim Umschalten verschwinden.
- [ ] Bestehende Referenzen von `sales`, `sale_lines`, `item_media`, Chronik und Belegen kennzeichnen: historische Identität bleibt erhalten, neuer Produktbezug wird zusätzlich zugeordnet. Kein nachträgliches Neuberechnen bereits gebuchter Verkäufe.

**Ausgang:** Vollständige Zuordnung und bestätigte unveränderte Summen. Bei unklaren Altständen nur den betroffenen Übergang stoppen, nicht raten. Das ist ein konkreter Datenfreigabepunkt, kein offenes Architekturkonzept.

## B2 – Einheitlichen Backendvertrag erweitern

**Dateien:** Ändern `supabase/schemas/database.sql`, neue erzeugte Migration(en); `src/app/core/models/flipbase.models.ts`, `src/app/core/services/catalog.service.ts`; neue `supabase/tests/unified_product_stock.test.sql`, `src/app/core/services/unified-product-stock.spec.ts`. `supabase.types.ts` ausschließlich generieren.

**Geplanter Clientvertrag:** `CatalogService.createProduct` behält Name/Rückgabetyp, verliert die Pflichtauswahl `trackingMode`. Der Eingabetyp wird in `catalog.service.ts` definiert, nicht als Übergangs-Dummy:

```ts
export interface CreateCatalogProductInput {
  readonly workspaceId: string;
  readonly title: string;
  readonly brand?: string | null;
  readonly model?: string | null;
  readonly ean?: string | null;
  readonly category?: string | null;
  readonly condition?: string | null;
  readonly conditionNotes?: string | null;
  readonly isPublicStore?: boolean;
  readonly listingPrice?: number | null;
}
```

Die neuen Zustandsfelder erst nach entsprechendem Schema und generierten Typen verwenden. Bestehende `ItemCondition`-Werte serverseitig validieren; kein unbeschränktes Freitext-Ersetzen der Zustandslogik.

- [ ] Regression zunächst rot: dieselbe Produkt-ID mit Mengen 1, 3, 12 anlegen/erfassen; kein `trackingMode` aus der UI nötig. Produktanlage allein erzeugt keinen Zugang.
- [ ] Bekannte Position benötigt Produktbezug vor Wareneingang. Nicht identifizierter Entwurfsinhalt darf ohne Produktbezug gespeichert, aber nicht als verkaufbarer Bestand gebucht werden.
- [ ] Neue bekannte Positionen unabhängig von Menge über denselben Pfad verarbeiten. Vorübergehend nötige Altspalten haben ausschließlich Kompatibilitätsfunktion und dürfen nicht erneut aus `quantity === 1` befüllt werden.
- [ ] Funktionen `create_purchase`, `update_purchase_draft`, `add_purchase_lines`, `receive_purchase_lines`, `build_purchase_costing_plan`, `finalize_purchase_costing`, `correct_purchase_costing`, `reopen_purchase_costing` auf den gemeinsamen Vertrag ausrichten. Bestehende Signaturen nur bei nachgewiesener Notwendigkeit versioniert ändern; alle Aufrufer im selben Paket anpassen.
- [ ] Unbekannte Kosten berücksichtigen: `stock_lots.unit_cost` ist derzeit nicht nullable. Solange Kosten offen sind, keinen erfundenen Nullwert persistieren. Vertrag mit ausdrücklichem offenem Kostenstand erweitern und bestehende Verkaufs-/Abschlussregeln daran prüfen; keine neue Verkaufserlaubnis durch diesen Umbau.
- [ ] RPCs erhalten Auth, Workspace-Fremdschlüssel, Locks, Request-Idempotenz und atomare Ereignisse. Menge muss positiv/ganzzahlig und innerhalb vorhandener Grenzen bleiben; Preis nur gültige Centwerte oder fachlich erlaubtes `null`.
- [ ] RLS pro Operation und Workspace sowie interne Funktionsrechte prüfen; neue Medien-/Mappingtabellen nicht pauschal freigeben. Neue Migrationen transaktional und ohne eigene `begin`/`commit`/psql-Befehle.
- [ ] Schema frisch und als Upgrade des Masterstandes in isolierter CI aufbauen, SQL-Tests ausführen, Clienttypen aus genau diesem Schema erzeugen. Typen nicht per Hand aus vermuteten RPC-Rückgaben bauen.

## B3 – Wareneingang, Verkauf und Retoure anschließen

**Dateien:** `stock.service.ts`, `purchase.service.ts`, `sales.service.ts`, `return.service.ts`, `inventory.service.ts`, `store.service.ts`, `mock-data-store.service.ts`, `src/app/core/models/sale-target.models.ts`, deren vorhandene Tests; SQL-Funktionen `record_sale`, `record_sale_return` und Kosten-/Bestandsprüfungen in `database.sql`.

**Bestehende Schnittstellen:** `StockService.receivePurchaseLines(purchaseId, lines)` und `SalesService.recordSale(input)`/`recordReturn(input)` behalten ihre fachliche Verantwortung. Ein neuer Verkauf verwendet Produktreferenz und Menge; Altverkäufe bleiben lesbar und retournierbar.

- [ ] Fall mit zwei Zugängen schreiben: 2 × 10 EUR und 3 × 15 EUR; Erhalt ergibt Menge 5, Verkauf 3 mit bestehendem FIFO ergibt 35 EUR Wareneinsatz und Menge 2. Retoure bucht auf die ursprünglichen Zuordnungen zurück, nicht auf den aktuellen Produktpreis.
- [ ] Teilwareneingang 2 von 5, danach 3 von 5 testen; erneute gleiche Request-ID darf nicht nochmals buchen. Parallele Verkäufe des letzten Stücks: genau einer erfolgreich, niemals negativer Bestand.
- [ ] Kaufposition noch nicht erhalten → nicht verfügbar. Produktneuanlage und Entwurfsänderung → kein Bestandszuwachs. Rücknahme/Retouren prüfen einschließlich beschädigter Ware nach den vorhandenen Regeln.
- [ ] Zuordnungen für alte Einzelartikel ergänzen: vorhandene gebuchte Verkäufe nicht nochmals als Abgang erzeugen. Alte Retouren verwenden ihren historischen Kostenbezug; Produktansicht summiert Alt-/Neubestand ohne Doppelzählung.
- [ ] Diagramm-/Journalbericht, Belege, Export und Store lesen denselben verfügbaren Bestand und Wareneinsatz. Kein Demo-Sondermodell mit pauschal positiven Ergebnissen.
- [ ] Sämtliche neuen Schreibaktionen aus Inventar und Verkauf auf den Produktweg umstellen. Alte Schreib-RPCs erst nach vollständiger Aufruferprüfung sperren; historische Leseverträge bleiben zulässig.

**Prüfung:** `npx vitest run --project=node src/app/core/services/stock.service.spec.ts src/app/core/services/sales-persistence-actions.spec.ts src/app/core/services/return.service.spec.ts src/app/core/services/catalog.service.spec.ts`; zusätzlich die betroffenen DOM-/Angular-Projekte und pgTAP in CI. Neue Tests müssen die tatsächlichen Projektgrenzen des Suite-Audits einhalten.

## B4 – Produktbilder dauerhaft anbinden

**Dateien:** `src/app/core/services/media.service.ts`, `catalog.service.ts`, `mock-data-store.service.ts`, `src/app/core/models/flipbase.models.ts`, Produktpflege unter `src/app/features/catalog/`; neu `src/app/shared/components/product-thumbnail/product-thumbnail.component.ts`, `.html`, `.angular.spec.ts`. Schemaerweiterung `public.catalog_product_media` und erzeugte Migration.

**Geplanter Bildvertrag:** `ProductThumbnailComponent` hat `src = input<string | null>(null)` und `alt = input<string>('')`; optional `size = input<'sm' | 'md'>('sm')`. Kein eigener Serverzugriff. `MediaService` erhält `loadProductMedia(productId)` und `uploadProductMedia(productId, file)` mit denselben Mutation-/Fehlerkonventionen wie bestehende Item-Medien.

- [ ] Persistente Zuordnung zu Produkt und Workspace mit `storage_path`, Reihenfolge und Hauptbild ergänzen; bestehende private Storage-Struktur und Signierung wiederverwenden. Signierte temporäre URL niemals als dauerhafte Bildadresse speichern.
- [ ] Alte `item_media` über B1-Zuordnung referenzieren/überführen, ohne Dateien vorzeitig zu löschen. Upload darf keine fremden Workspace-Dateien lesbar machen. Keine automatische Wikimedia-/Internetbildsuche als Produktbildersatz.
- [ ] Tests rot: fehlendes Bild und HTTP-Fehler ergeben neutralen Platzhalter; Bildwechsel setzt Fehlerzustand zurück; altes Workspace-Bild erscheint nach Wechsel nicht weiter.
- [ ] Gemeinsamen Thumbnail-Baustein in Katalog, Bestand, Produktpicker und Einkaufszeile verwenden. Bei daneben sichtbarem identischem Namen dekoratives Bild mit leerem Alternativtext; alleinstehende Vorschau sinnvoll beschriften.
- [ ] Upload/Neuladen prüfen: Bild bleibt nach Einkauf speichern, Route verlassen und erneutem Öffnen sichtbar. Abbruch-/Uploadfehler lässt Formulareingaben stehen; verwaiste temporäre Uploads über bestehenden sicheren Aufräumvertrag behandeln, nicht mit breiter Bucket-Löschung.

## B5 – Eine kompakte Einkaufszeile

**Dateien:** `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.ts`, `.html`, `.angular.spec.ts`; `purchase-entry-form` und `purchase-product-picker` im gleichen Komponentenordner; `pages/purchase-detail`; Produkt-/Inventarpflege unter `features/catalog`/`features/inventory`; neue `e2e/purchase-product-entry.spec.ts`.

**Geplanter Positionsvertrag:** Bestehender `PurchaseLineDraft` bleibt Träger von Produkt-ID, Titel-Snapshot, Menge, Preisen und Zustandsdetails. `lineKind` entfällt im aktiven neuen UI-/Servicevertrag, sobald B2/B3 bereit sind. Unidentifizierter Inhalt ist ein eigener Inhaltszustand, keine neue Bestandsart.

- [ ] Browser-Regressionsfall vor Umbau schreiben:

```ts
await expect(page.getByText('Neues Einzelstück erfassen', { exact: true })).toHaveCount(0);
await expect(page.getByText('Neuen Mengenartikel erfassen', { exact: true })).toHaveCount(0);
await expect(page.getByRole('columnheader', { name: 'Artikel', exact: true })).toBeVisible();
await expect(page.getByRole('columnheader', { name: 'Menge', exact: true })).toBeVisible();
await expect(page.getByRole('columnheader', { name: 'Stückpreis', exact: true })).toBeVisible();
await expect(page.getByRole('columnheader', { name: 'Gesamt', exact: true })).toBeVisible();
```

`page` stammt aus dem bestehenden Playwright-Testfixture; der Test legt über den vorhandenen Demo-Einkaufsablauf ein Produkt an. Desktopprüfung bei 1440 × 1000, mobile Prüfung separat ohne erzwungene Desktop-Spaltenstruktur.

- [ ] Formular-Karten pro Position durch semantische kompakte Tabelle ersetzen: Artikel mit Thumbnail/Name, Menge, Stückpreis, Gesamt, Entfernen. IDs und FormArray-Zeilen stabil nach Draft-ID verfolgen, nicht so, dass Löschen den Fokus in die falsche Zeile verschiebt.
- [ ] Sichtbare Mengen-/Preisfelder über Shared-NumberInput; Berechnung aktualisiert sich sofort: 3 × 12 = 36, auch vor Blur. 0,12 × 3 = 0,36, kein Fließkommafehler in persistierten Kosten.
- [ ] EAN, Zustand, Mängel, Marktwert, Marke und weitere Daten über Produktname/Produktdetails erreichbar machen. Grundzeile enthält weder Spaltenmenü noch zusätzlichen Artikel-bearbeiten-Button. Keine erforderlichen Fehler unsichtbar in geschlossenen Details lassen: Fehlersummary öffnet/fokussiert das Feld.
- [ ] Gesamtpreisführung: bekannte Menge und Produkt anzeigen, nicht bekannte Stückkosten als „Offen“. Kostenverteilung bleibt im vorhandenen Kostenbereich. Entwurf ohne identifizierte Positionen bleibt erlaubt.
- [ ] Mobile nutzt dieselben Controls in gestapelter Reihenfolge mit Bild/Name oben und Menge/Kosten darunter; keine horizontale Seitenüberbreite. Löschen hat zugänglichen Namen „Artikel [Name] entfernen“ und gibt Fokus an Nachbarzeile oder Suchauslöser zurück.
- [ ] Katalog-/Inventar-Einstiege auf denselben Produktdialog und dieselbe Mengenlogik umstellen; keine an anderer Stelle verbliebene Wahl „Einzelstück/Mengenartikel“.
- [ ] Bestehende Bearbeitungs-/Speicher-/Verwerfabläufe und Chronik-Refresh regressionsprüfen. Keine erneute breite Layout-/Sidebaränderung.

## B6 – Suche, Import und Scanner unter den Positionen

**Dateien:** `purchase-line-editor`, `purchase-product-picker`; vorhandene Shared-Komponenten `button`, `custom-search-input`, `modal`, `text-field`; `e2e/purchase-product-entry.spec.ts`, `e2e/purchase-dropdown-layer.spec.ts`.

- [ ] Roten Layout-/Semantiktest ergänzen: Suchleiste befindet sich geometrisch unter der letzten Position; Import-/Scanner-Buttons enthalten keinen sichtbaren Text, besitzen aber `aria-label` und Tooltip.
- [ ] Suchauslöser als vorhandenen Shared-Button mit Suchicon/normalem Text umsetzen; falls echtes Tippen in der Leiste eingesetzt wird, `CustomSearchInputComponent` in Variante `toolbar` weiterverwenden. Keine dritte lokale Suchfeldkomponente bauen.
- [ ] Genau ein „Produkt erstellen“ im Auswahlablauf. Neue Produktanlage optional mit Bild; Menge/Preis gehören anschließend in die Einkaufsposition. Explizit gespeicherter Produktstamm darf nach Abbruch des Einkaufs bestehen bleiben, aber niemals Bestand erzeugen.
- [ ] CSV-Import zuerst validieren/vorschauen: ungültige Menge/Preise, unbekannter Barcode, Mehrdeutigkeit und gleiche Produktzeilen sichtbar auflösen; nichts heimlich überschreiben. Abbrechen übernimmt keine Position. Wiederholte Auswahl erhöht Menge nur nach eindeutiger Produktzuordnung.
- [ ] Scannericon öffnet den vorhandenen Eingabe-/Scanweg. Hardwareeingabe mit Enter funktioniert, unbekannte/mehrdeutige Codes zeigen Auswahl statt erfundenen Treffer. Kamerazugriff nur per eigener Aktion; Ablehnung lässt manuelle Eingabe nutzbar.
- [ ] Escape/Fokus-Rückgabe, Popover über Modals und kleine Fenster mit echten Klick-/Hit-Tests prüfen. Dateidialog nicht durch ein dekoratives funktionsloses Icon ersetzen.

## B7 – Textbadges und gemeinsame Designregeln

**Dateien:** `src/app/shared/components/badge/badge.component.ts`, `.html`, `.scss`, `.angular.spec.ts`; alle tatsächlich gefundenen Aufrufer; `docs/design/admin-ui-guidelines.md`, `docs/design/purchase-reference-acceptance.md`; bestehende Architekturtests und `scripts/check-admin-shared-ui.mjs` nur bei zusätzlichem notwendigen Vertrag erweitern.

- [ ] Aufruferinventar erstellen:

```powershell
rg -n 'marker=|\[marker\]|\[dot\]|\[uppercase\]' src/app -g '*.html'
```

- [ ] Test rot: Shared-Badge enthält ausschließlich Textinhalt, keine Markerfläche; Statusname bleibt für Screenreader erhalten.
- [ ] Badge-Aufrufer und API zusammen migrieren; `dot`/`marker` entfernen, falls keine legitimen Nicht-Admin-Verbraucher bestehen. Andernfalls Text-only-Adminvertrag explizit kapseln und Nicht-Admin-Verhalten unverändert testen. Keine CSS-Regel, die beliebige Kind-Spans versteckt.
- [ ] Chronikpunkte, Diagrammlegenden und Icons außerhalb von Badges unverändert lassen. Userangaben/Kürzel nicht kleinschreiben; nur dekorative Badge-Uppercase-Optionen entfernen.
- [ ] In Richtlinien die früheren Marker-Festlegungen ausdrücklich ersetzen. Architekturtest verhindert erneute lokale Status-Pills.

## B8 – Integration, Datenübergang und Abnahme

- [ ] B1-Prüfbericht gegen erzeugte Migrationen/Upgrade-Test vergleichen. Altbestands-Zuordnung in einer Transaktion beziehungsweise klar gesperrtem Umschaltfenster; keine parallel schreibenden alten Clients während inkompatibler Umschaltung.
- [ ] Alte technische Spalten/Tabellen nicht im selben Atemzug löschen. Nur aktive alte Schreibwege nach Verbraucherprüfung stilllegen; destruktive Bereinigung benötigt separaten Auftrag. Ziel erreicht heißt: neue Mengen 1 und 12 verwenden denselben Produktvertrag, nicht bloß gleich beschriftete Formulare.
- [ ] Zielgerichtete Anwendungstests, Typprüfung, Lint, Format und Build lokal. In CI frisches Schema, Upgrade, alle DB-Tests, Browser-Smoke und vollständige Pflichtprüfungen.
- [ ] Visuelle Belege bei 1440 × 1000 und 390 × 844, hell/dunkel, Tastatur, Reduced Motion. Befüllte Zeilen, lange Namen, fehlende Bilder, 12 Positionen, offene Dialoge, Preisfehler und Leerzustand prüfen. AXE ohne unterdrückte Regeln.
- [ ] Erst nach bestandenem Review Freigabe zur Veröffentlichung einholen. Sinnvolle Commitgrenzen: Datenvertrag, Buchungswege/Tests, Medien, Erfassungsmaske, Badges. Kein Commit mit kaputtem Angular-Build; gemeinsame Migrationen nicht vor kompatiblen Verbrauchern deployen.
