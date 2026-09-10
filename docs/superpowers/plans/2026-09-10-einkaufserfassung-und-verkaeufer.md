# Einkaufserfassung und Verkäuferverwaltung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Einkaufserfassung auf bekannte Produktpositionen und einen optional verteilten Paketpreis vereinfachen, Quellen entfernen, Verkäufer modern verwalten und Status sowie Chronik zuverlässig machen.

**Architecture:** Die Angular-Oberfläche erhält kleine featurebezogene Bausteine für Verkäufer, Paketpreis und Statusdarstellung. Kritische Einkaufsänderungen werden über atomare Supabase-Funktionen gespeichert und gemeinsam mit unveränderbaren `business_events` protokolliert. Ein ergänzendes deklaratives Schema führt die Bereinigung nach dem bestehenden Basisschema aus; eine daraus erzeugte Migration bringt bestehende Installationen auf denselben Stand.

**Tech Stack:** Angular 22, TypeScript 6, Reactive Forms, Signals, Tailwind CSS, Supabase/PostgreSQL, Vitest, Angular TestBed, Supabase SQL-Tests

**Spec:** `docs/superpowers/specs/2026-09-10-einkaufserfassung-und-verkaeufer-design.md`

## Global Constraints

- Nutzertexte sind deutsch; Codebezeichner sind englisch.
- Angular-Komponenten bleiben standalone, verwenden OnPush, Signals, Reactive Forms und separate HTML-Dateien.
- Styling erfolgt mit Tailwind-Klassen im Template; keine neue SCSS-Datei ohne zwingenden Grund.
- Neue Abhängigkeiten müssen stabil und mit Angular 22 kompatibel sein.
- Supabase-Änderungen beginnen in `supabase/schemas/`; bestehende Migrationen bleiben unverändert.
- Datenbankfunktionen verwenden vollqualifizierte Namen und `set search_path = ''`; RLS- und Rollenregeln bleiben explizit.
- Kein externer Paketdienst wird in diesem Paket angebunden.
- Jede fachliche Änderung erhält einen atomaren Chronikeintrag.
- Paketpreise werden gleichmäßig je Produktposition, nicht je Stück, verteilt.

## File Map

- `src/app/features/sellers/`: neue Verkäuferseite und ihre Präsentationslogik.
- `src/app/features/purchases/components/purchase-seller-dialog/`: gemeinsamer Verkäuferdialog für Erstellung und Bearbeitung.
- `src/app/features/purchases/components/package-price-dialog/`: Eingabe und Bestätigung eines Paketpreises.
- `src/app/features/purchases/utils/package-price-allocation.ts`: reine centgenaue Verteilung.
- `src/app/features/purchases/utils/purchase-status-presentation.ts`: gemeinsame Statusbezeichnungen und Badge-Farben.
- `src/app/features/purchases/components/purchase-entry-form/`: vereinfachte Einkaufserfassung.
- `src/app/core/services/purchase.service.ts`: typisierte Aufrufe der atomaren Einkaufsfunktionen.
- `src/app/core/services/suppliers.service.ts`: Verkäufer laden, erstellen, bearbeiten und archivieren.
- `src/app/features/audit/`: Aktualisierung der Chronik nach erfolgreichen Änderungen.
- `supabase/schemas/120_purchase_entry_redesign.sql`: deklarative Bereinigung und atomare Einkaufsereignisse.
- `supabase/tests/purchase_entry_redesign.sql`: fachliche Datenbankprüfungen.
- `supabase/migrations/20260910060200_purchase_entry_redesign.sql`: aus dem deklarativen Schema erzeugte Migration.

---

### Task 1: Länder- und Telefonbasis

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/app/features/purchases/models/country-option.ts`
- Create: `src/app/features/purchases/utils/country-options.ts`
- Test: `src/app/features/purchases/utils/country-options.spec.ts`

**Interfaces:**

- Produces: `CountryOption { code: string; name: string; dialCode: string }`
- Produces: `buildGermanCountryOptions(): readonly CountryOption[]`
- Consumes: stabile, Angular-22-kompatible Version von `@intl-tel-input/angular`

- [ ] **Step 1: Stabile Paketversion und Peer-Abhängigkeiten prüfen**

Run: `npm view @intl-tel-input/angular version peerDependencies --json`

Expected: stabile Version ohne Beta-/RC-Kennung und Peer-Abhängigkeiten, die Angular 22 sowie RxJS 7 erlauben.

- [ ] **Step 2: Failing unit test für Länderoptionen schreiben**

```ts
it('liefert deutsche Ländernamen alphabetisch und eindeutige ISO-Codes', () => {
  const options = buildGermanCountryOptions();
  expect(options.find((entry) => entry.code === 'DE')).toMatchObject({
    name: 'Deutschland',
    dialCode: '+49',
  });
  expect(new Set(options.map((entry) => entry.code)).size).toBe(options.length);
  expect(options.map((entry) => entry.name)).toEqual(
    [...options.map((entry) => entry.name)].sort(new Intl.Collator('de').compare),
  );
});
```

- [ ] **Step 3: Test ausführen und erwartetes Rot bestätigen**

Run: `npx vitest run --project=node src/app/features/purchases/utils/country-options.spec.ts`

Expected: FAIL, weil Utility und Modell noch fehlen.

- [ ] **Step 4: Paket installieren und Utility minimal implementieren**

Die Utility erzeugt ISO-Codes und deutsche Namen mit `Intl.DisplayNames`, sortiert mit `Intl.Collator('de')` und übernimmt Vorwahlen aus den vom Telefonpaket bereitgestellten stabilen Länderdaten. Flaggen bleiben Darstellung des Telefonbausteins.

- [ ] **Step 5: Test und Typprüfung ausführen**

Run: `npx vitest run --project=node src/app/features/purchases/utils/country-options.spec.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/app/features/purchases/models/country-option.ts src/app/features/purchases/utils/country-options.ts src/app/features/purchases/utils/country-options.spec.ts
git commit -m "feat(purchases): add country and phone metadata"
```

### Task 2: Verkäuferdialog strukturieren

**Files:**

- Modify: `src/app/features/purchases/components/purchase-seller-dialog/purchase-seller-dialog.component.ts`
- Modify: `src/app/features/purchases/components/purchase-seller-dialog/purchase-seller-dialog.component.html`
- Test: `src/app/features/purchases/components/purchase-seller-dialog/purchase-seller-dialog.component.angular.spec.ts`
- Modify: `src/app/core/models/flipbase.models.ts`
- Modify: `src/app/core/services/suppliers.service.ts`
- Test: `src/app/core/services/stammdaten-persistence.spec.ts`

**Interfaces:**

- Consumes: `buildGermanCountryOptions()` aus Task 1.
- Produces: `SellerFormValue` mit `seller_type`, `name`, `contact_person`, `country_code`, strukturierter Anschrift, `email`, E.164-`phone`, `website` und `notes`.
- Produces: ein Dialog, der sowohl Erstellen als auch Bearbeiten unterstützt.

- [ ] **Step 1: Failing Angular-Tests schreiben**

Die Tests prüfen die Texte „Firmenname“ und „Vor- und Nachname“, das Fehlen von „Profilverweis“, die Länder-Select-Box, den Telefon-Länderschalter sowie die unveränderte Auswahl nach Abbruch.

- [ ] **Step 2: Angular-Test gezielt ausführen**

Run: `npx vitest run --project=angular src/app/features/purchases/components/purchase-seller-dialog/purchase-seller-dialog.component.angular.spec.ts`

Expected: FAIL an den neuen Feld- und Textanforderungen.

- [ ] **Step 3: Formularmodell und Template implementieren**

`name` bleibt der gespeicherte Name, trägt aber typabhängige Beschriftung. `country_code` speichert ISO-2. Das Telefon-Control verwendet den offiziellen Angular-ControlValueAccessor und liefert eine normalisierte E.164-Nummer. `profile_url` wird nicht mehr gelesen oder geschrieben.

- [ ] **Step 4: Service-Persistenz an den strukturierten Wert anpassen**

`SuppliersService.createSupplier()` und `updateSupplier()` erhalten typisierte strukturierte Eingaben statt `contact_info`. Fehler lassen Dialogwerte bestehen.

- [ ] **Step 5: Tests ausführen**

Run: `npx vitest run --project=angular src/app/features/purchases/components/purchase-seller-dialog/purchase-seller-dialog.component.angular.spec.ts`

Run: `npx vitest run --project=node src/app/core/services/stammdaten-persistence.spec.ts`

Expected: beide PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/purchases/components/purchase-seller-dialog src/app/core/models/flipbase.models.ts src/app/core/services/suppliers.service.ts src/app/core/services/stammdaten-persistence.spec.ts
git commit -m "feat(purchases): structure seller contact details"
```

### Task 3: Verkäuferverwaltung als Tabelle

**Files:**

- Create: `src/app/features/sellers/sellers.component.ts`
- Create: `src/app/features/sellers/sellers.component.html`
- Create: `src/app/features/sellers/sellers.component.angular.spec.ts`
- Create: `src/app/features/sellers/utils/seller-presentation.ts`
- Create: `src/app/features/sellers/utils/seller-presentation.spec.ts`
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/layout/sidebar/sidebar.component.ts`
- Modify: `src/app/core/i18n/translations.ts`
- Delete: `src/app/features/sources/sources.component.ts`
- Delete: `src/app/features/sources/sources.component.html`
- Delete: zugehörige Sources-Komponententests

**Interfaces:**

- Consumes: `SuppliersService` und den Dialog aus Task 2.
- Produces: Route `/sellers`, Typfilter `all | company | private`, Tabellenzeilen und Archivaktion.

- [ ] **Step 1: Failing Präsentations- und Angular-Tests schreiben**

```ts
it('filtert Verkäufer ausschließlich nach ihrem Typ', () => {
  expect(filterSellers(sellers, 'company').map((seller) => seller.id)).toEqual(['company-1']);
  expect(filterSellers(sellers, 'private').map((seller) => seller.id)).toEqual(['private-1']);
});
```

Der Angular-Test prüft Seitentitel, Hauptaktion, die drei Filterwerte, Tabellenüberschriften, leere Ansicht und das Fehlen des Quellen-Tabs.

- [ ] **Step 2: Tests rot ausführen**

Run: `npx vitest run --project=node src/app/features/sellers/utils/seller-presentation.spec.ts`

Run: `npx vitest run --project=angular src/app/features/sellers/sellers.component.angular.spec.ts`

Expected: FAIL, weil Feature und Utility fehlen.

- [ ] **Step 3: Verkäuferseite und Utility implementieren**

Die Seite verwendet PageHeader, Button, Badge und die gemeinsame Tabellenbedienung. Ein Zeilenklick beziehungsweise die Bearbeiten-Aktion öffnet denselben Dialog. Archivierte Verkäufer sind standardmäßig ausgeblendet und über „Archivierte anzeigen“ erreichbar.

- [ ] **Step 4: Navigation und Route umstellen**

Die Sidebar zeigt „Verkäufer“ und `/sellers`. `/sources` wird nicht mehr als reguläre Route angeboten. Nutzertexte „Quellen & Lieferanten“ entfallen.

- [ ] **Step 5: Tests grün ausführen**

Run: `npx vitest run --project=node src/app/features/sellers/utils/seller-presentation.spec.ts`

Run: `npx vitest run --project=angular src/app/features/sellers/sellers.component.angular.spec.ts`

Expected: beide PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/sellers src/app/features/sources src/app/app.routes.ts src/app/layout/sidebar/sidebar.component.ts src/app/core/i18n/translations.ts
git commit -m "feat(purchases): replace sources page with sellers table"
```

### Task 4: Paketpreis centgenau je Position verteilen

**Files:**

- Create: `src/app/features/purchases/utils/package-price-allocation.ts`
- Create: `src/app/features/purchases/utils/package-price-allocation.spec.ts`
- Create: `src/app/features/purchases/components/package-price-dialog/package-price-dialog.component.ts`
- Create: `src/app/features/purchases/components/package-price-dialog/package-price-dialog.component.html`
- Create: `src/app/features/purchases/components/package-price-dialog/package-price-dialog.component.angular.spec.ts`

**Interfaces:**

- Produces: `allocatePackagePrice(total: number, lineIds: readonly string[]): ReadonlyMap<string, number>` mit Beträgen in Euro und centgenauer Gesamtsumme.
- Produces: `confirmed = output<number>()` im Paketpreisdialog.

- [ ] **Step 1: Failing Verteilungstests schreiben**

```ts
it('verteilt unabhängig von den Mengen gleichmäßig je Position', () => {
  const result = allocatePackagePrice(100, ['a', 'b', 'c', 'd']);
  expect([...result.values()]).toEqual([25, 25, 25, 25]);
});

it('vergibt Rundungsreste stabil in Positionsreihenfolge', () => {
  const result = allocatePackagePrice(10, ['a', 'b', 'c']);
  expect([...result.values()]).toEqual([3.34, 3.33, 3.33]);
});
```

- [ ] **Step 2: Utility-Test rot ausführen**

Run: `npx vitest run --project=node src/app/features/purchases/utils/package-price-allocation.spec.ts`

Expected: FAIL, weil `allocatePackagePrice` fehlt.

- [ ] **Step 3: Integer-basierte Centverteilung implementieren**

Gesamtpreis auf Cent runden, ganzzahlig durch Positionszahl teilen und Restcent auf die ersten stabil sortierten Eingabezeilen verteilen. Leere Zeilenliste, negative oder nicht endliche Werte werfen einen verständlichen Fehler.

- [ ] **Step 4: Dialog testgetrieben implementieren**

Der Angular-Test prüft positives Geldfeld, Positionszahl, Erklärung, Abbruch und `confirmed`-Ausgabe. Der Dialog verwendet ModalShell und NumberInput; Enter bestätigt nur bei gültigem Wert.

- [ ] **Step 5: Tests ausführen**

Run: `npx vitest run --project=node src/app/features/purchases/utils/package-price-allocation.spec.ts`

Run: `npx vitest run --project=angular src/app/features/purchases/components/package-price-dialog/package-price-dialog.component.angular.spec.ts`

Expected: beide PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/purchases/utils/package-price-allocation.ts src/app/features/purchases/utils/package-price-allocation.spec.ts src/app/features/purchases/components/package-price-dialog
git commit -m "feat(purchases): add per-position package pricing"
```

### Task 5: Einkaufserfassung vereinfachen

**Files:**

- Create: `src/app/features/catalog/components/catalog-product-dialog/catalog-product-dialog.component.ts`
- Create: `src/app/features/catalog/components/catalog-product-dialog/catalog-product-dialog.component.html`
- Create: `src/app/features/catalog/components/catalog-product-dialog/catalog-product-dialog.component.angular.spec.ts`
- Modify: `src/app/features/catalog/catalog.component.ts`
- Modify: `src/app/features/catalog/catalog.component.html`
- Modify: `src/app/core/services/catalog.service.ts`
- Modify: `src/app/core/services/catalog.service.spec.ts`
- Modify: `src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.ts`
- Modify: `src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.html`
- Modify: `src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.angular.spec.ts`
- Modify: `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.ts`
- Modify: `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.html`
- Modify: `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.angular.spec.ts`
- Modify: `src/app/core/services/purchase.service.ts`
- Test: `src/app/core/services/purchase-create-persistence.spec.ts`
- Test: `src/app/core/services/purchase-persistence.spec.ts`

**Interfaces:**

- Consumes: Verkäuferdialog aus Task 2 und Paketpreisdialog aus Task 4.
- Produces: wiederverwendbaren `CatalogProductDialogComponent` mit `saved = output<CatalogProduct>()`, einschließlich optionaler Bilddatei.
- Produces: `pricing_mode` nur als interne Berechnungsgrundlage `individual | package`.
- Produces: Positionen mit `line_total`; im Paketmodus stammt dieser Wert aus der bestätigten Verteilung.

- [ ] **Step 1: Failing Produktdialog- und Formulartests ergänzen**

Die Tests prüfen das Fehlen von Quelle, Inhaltsstatus, Einkaufsart, Angebotslink, doppelter Notiz und sichtbarem Preis-Modusschalter. Sie prüfen Verkäufererstellung im Dropdown, abgeleiteten Warenbetrag, Beschreibung als Textarea sowie die deaktivierte Paketaktion ohne Positionen.

Der Produktdialogtest wählt eine gültige Bilddatei, speichert Titel, EAN und Nachverfolgungsart und erwartet, dass `CatalogService.createProduct()` den erzeugten Katalogartikel zurückgibt und der Dialog ihn über `saved` ausgibt. Ungültige Dateitypen und Dateien über dem bestehenden Bildlimit zeigen einen Fehler und lösen keine Speicherung aus.

- [ ] **Step 2: Tests rot ausführen**

Run: `npx vitest run --project=angular src/app/features/catalog/components/catalog-product-dialog/catalog-product-dialog.component.angular.spec.ts src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.angular.spec.ts src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.angular.spec.ts`

Expected: FAIL an den alten Feldern und fehlenden Paketaktionen.

- [ ] **Step 3: Wiederverwendbaren Produktdialog implementieren**

Die bisherige Katalog-Erstellung wird aus `CatalogComponent` in den fokussierten Dialog verschoben. `CatalogService.createProduct()` nimmt optional `imageFile` entgegen, lädt sie nach erfolgreicher Produkterstellung in den vorhandenen privaten Medien-Bucket und speichert `image_storage_path` am Katalogprodukt. Scheitert der Bildupload, wird der Fehler angezeigt und kein scheinbarer Bilderfolg gemeldet. Katalogseite und Einkauf verwenden denselben Dialog.

- [ ] **Step 4: Formular und Zeileneditor minimal umbauen**

Der Warenbetrag ist ein `computed()` aus Zeilen beziehungsweise bestätigtem Paketpreis. Mengen- oder Positionsänderungen setzen eine bestehende Paketverteilung auf „erneut verteilen“. Einzelpreise erzeugen automatisch Zeilensummen. Produktbilder stammen ausschließlich aus dem Katalogprodukt.

- [ ] **Step 5: Persistenz-Payload bereinigen**

`PurchaseFormPayload` enthält keine `source_id`, `type`, `content_status` oder `original_url`. Beschreibung wird als `notes`, Referenznummer als `supplier_reference` übertragen. Tracking gehört nicht in den Pflichtteil der Erfassung.

- [ ] **Step 6: Produkt-, Form-, Service- und Persistenztests ausführen**

Run: `npx vitest run --project=angular src/app/features/catalog/components/catalog-product-dialog/catalog-product-dialog.component.angular.spec.ts src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.angular.spec.ts src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.angular.spec.ts`

Run: `npx vitest run --project=node src/app/core/services/catalog.service.spec.ts src/app/core/services/purchase-create-persistence.spec.ts src/app/core/services/purchase-persistence.spec.ts`

Expected: alle PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/features/catalog src/app/features/purchases/components/purchase-entry-form src/app/features/purchases/components/purchase-line-editor src/app/core/services/catalog.service.ts src/app/core/services/catalog.service.spec.ts src/app/core/services/purchase.service.ts src/app/core/services/purchase-create-persistence.spec.ts src/app/core/services/purchase-persistence.spec.ts
git commit -m "feat(purchases): simplify purchase entry workflow"
```

### Task 6: Einkaufsstatus, Tracking und Badges trennen

**Files:**

- Create: `src/app/features/purchases/utils/purchase-status-presentation.ts`
- Create: `src/app/features/purchases/utils/purchase-status-presentation.spec.ts`
- Modify: `src/app/features/purchases/components/purchase-lifecycle-actions/purchase-lifecycle-actions.component.ts`
- Modify: `src/app/features/purchases/components/purchase-lifecycle-actions/purchase-lifecycle-actions.component.html`
- Modify: `src/app/features/purchases/components/purchase-lifecycle-actions/purchase-lifecycle-actions.component.angular.spec.ts`
- Modify: `src/app/features/purchases/purchases.component.ts`
- Modify: `src/app/features/purchases/purchases.component.html`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.ts`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html`
- Modify: `src/app/core/services/inbound-tracking.service.ts`
- Test: `src/app/core/services/einkauf-zusatzkosten.spec.ts`

**Interfaces:**

- Produces: `getPurchaseStatusPresentation(purchase): { label: string; tone: BadgeTone }`.
- Produces: Hauptstatus ohne `in_transit`; optionale Trackinganzeige mit neutralem `pending`-Text „Tracking hinterlegt“.

- [ ] **Step 1: Failing Status- und Komponententests schreiben**

```ts
expect(getPurchaseStatusPresentation(orderedPurchase)).toEqual({
  label: 'Bestellt',
  tone: 'info',
});
expect(getPurchaseStatusPresentation(arrivedPurchase)).toEqual({
  label: 'Angekommen',
  tone: 'success',
});
```

Die Lifecycle-Tests prüfen, dass nach „Bestellt“ direkt „Angekommen“ angeboten wird und kein „Unterwegs“-Button existiert.

- [ ] **Step 2: Tests rot ausführen**

Run: `npx vitest run --project=node src/app/features/purchases/utils/purchase-status-presentation.spec.ts`

Run: `npx vitest run --project=angular src/app/features/purchases/components/purchase-lifecycle-actions/purchase-lifecycle-actions.component.angular.spec.ts`

Expected: FAIL wegen alter Unterwegs-Logik und fehlender gemeinsamer Präsentation.

- [ ] **Step 3: Statusdarstellung und Aktionen implementieren**

Liste und Detailkopf verwenden `BadgeComponent` mit derselben Utility. Filter enthalten kein `in_transit`. Lifecycle-Ausgabe `transitRequested` und der Pflichtdialog werden entfernt.

- [ ] **Step 4: Tracking unabhängig machen**

Das Speichern einer Nummer setzt `tracking_status` ohne echte Anbieterantwort auf `pending`. `TRACKING_STATUS_CONFIG.pending.label` lautet „Tracking hinterlegt“. Portal-Link und Anbietererkennung bleiben; Tracking ändert weder Ankunft noch Bestand.

- [ ] **Step 5: Tests ausführen**

Run: `npx vitest run --project=node src/app/features/purchases/utils/purchase-status-presentation.spec.ts src/app/core/services/einkauf-zusatzkosten.spec.ts`

Run: `npx vitest run --project=angular src/app/features/purchases/components/purchase-lifecycle-actions/purchase-lifecycle-actions.component.angular.spec.ts src/app/features/purchases/purchases.component.angular.spec.ts src/app/features/purchases/pages/purchase-detail/purchase-detail.component.angular.spec.ts`

Expected: alle PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/purchases src/app/core/services/inbound-tracking.service.ts src/app/core/services/einkauf-zusatzkosten.spec.ts
git commit -m "feat(purchases): simplify purchase status and tracking"
```

### Task 7: Datenmodell bereinigen und Paketpreis serverseitig absichern

**Files:**

- Create: `supabase/schemas/120_purchase_entry_redesign.sql`
- Modify: `supabase/config.toml`
- Create: `supabase/tests/purchase_entry_redesign.sql`
- Modify: `supabase/schemas/60_audit_snapshot.sql`
- Modify: `src/app/core/services/audit-export.service.ts`
- Modify: `src/app/core/services/audit-export.service.spec.ts`
- Modify: `src/app/core/models/supabase.types.ts`
- Create: `supabase/migrations/20260910060200_purchase_entry_redesign.sql`

**Interfaces:**

- Produces: `country_code`, `arrived_at` und atomare RPCs `update_purchase_workflow` sowie `update_purchase_tracking`.
- Produces: `catalog_products.image_storage_path` für das optionale Produktbild.
- Removes: `sources`, `purchases.source_id`, `purchases.original_url`, `purchases.type`, `purchases.content_status`, `purchases.shipment_status`, `suppliers.profile_url`.
- Preserves: `tracking_status` als eigener optionaler Sendungszustand und die interne Preisberechnungsgrundlage.

- [ ] **Step 1: Failing SQL-Tests schreiben**

Die SQL-Prüfung erstellt Unternehmen und Privatperson, speichert ISO-Land und E.164-Telefon, verteilt 10,00 € auf drei Positionen als 3,34/3,33/3,33 €, bestellt ohne Tracking, bestätigt die Ankunft, speichert optionales Tracking als `pending` und prüft je Aktion genau ein `business_event`.

- [ ] **Step 2: Datenbanktest rot ausführen**

Run: `npx supabase test db supabase/tests/purchase_entry_redesign.sql --local`

Expected: FAIL wegen fehlender Spalten/RPCs und noch vorhandener Altstruktur.

- [ ] **Step 3: Deklaratives Schema implementieren**

`120_purchase_entry_redesign.sql` wird in `schema_paths` nach `110_numbering.sql` eingetragen. Die Datei entfernt obsolete Beziehungen und ersetzt betroffene Einkaufsfunktionen. Rundung arbeitet ganzzahlig in Cent. RPCs prüfen Authentifizierung und Workspace-Mitgliedschaft, sperren den Einkauf, ändern ihn und schreiben das Ereignis in derselben Transaktion.

- [ ] **Step 4: SQL-Test grün ausführen**

Run: `npx supabase test db supabase/tests/purchase_entry_redesign.sql --local`

Expected: PASS.

- [ ] **Step 5: Migration erzeugen und prüfen**

Run: `npm run supabase:stop`

Run: `npx supabase db diff -f purchase_entry_redesign`

Die erzeugte Migration erhält den vorgeschriebenen Kopfkommentar. Prüfen, dass sie keine Transaktionssteuerung, psql-Befehle oder unbeabsichtigte Tabellenlöschungen enthält.

- [ ] **Step 6: Typen neu erzeugen und Export anpassen**

Run: `npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts`

Auditexport und Prüfsnapshot enthalten keine Sources-Datei und keine entfernten Felder mehr.

- [ ] **Step 7: Relevante Datenbank- und Exporttests ausführen**

Run: `npm run test:db`

Run: `npx vitest run --project=node src/app/core/services/audit-export.service.spec.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/config.toml supabase/schemas/120_purchase_entry_redesign.sql supabase/schemas/60_audit_snapshot.sql supabase/tests/purchase_entry_redesign.sql supabase/migrations src/app/core/models/supabase.types.ts src/app/core/services/audit-export.service.ts src/app/core/services/audit-export.service.spec.ts
git commit -m "feat(purchases): simplify purchase persistence model"
```

### Task 8: Chronik atomar und sofort aktualisieren

**Files:**

- Modify: `src/app/core/services/purchase.service.ts`
- Modify: `src/app/core/services/purchase.service.spec.ts`
- Modify: `src/app/core/services/business-event.service.ts`
- Modify: `src/app/features/audit/components/record-timeline/record-timeline.component.ts`
- Modify: `src/app/features/audit/components/record-timeline/record-timeline.component.angular.spec.ts`
- Modify: `src/app/features/audit/components/record-history/record-history.container.ts`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.ts`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html`

**Interfaces:**

- Consumes: RPC-Ereignisse aus Task 7.
- Produces: `refreshKey = input(0)` an Timeline/Container und einen erhöhten Schlüssel nach jeder erfolgreichen Einkaufsänderung.
- Produces: deutsche Bezeichnungen für `purchase_updated`, `purchase_ordered`, `purchase_arrived`, `purchase_tracking_added`, `purchase_tracking_updated`, `purchase_tracking_removed`.

- [ ] **Step 1: Failing Service- und Timeline-Tests schreiben**

Der Servicetest erwartet RPC statt direktem Tabellenupdate und prüft das zurückgegebene Ereignis. Der Angular-Test ändert `refreshKey` und erwartet genau einen neuen Aufruf von `list_record_timeline`.

- [ ] **Step 2: Tests rot ausführen**

Run: `npx vitest run --project=node src/app/core/services/purchase.service.spec.ts`

Run: `npx vitest run --project=angular src/app/features/audit/components/record-timeline/record-timeline.component.angular.spec.ts`

Expected: FAIL wegen direkter Updates und fehlendem Aktualisierungseingang.

- [ ] **Step 3: Service auf atomare RPCs umstellen**

Status, Tracking und Entwurfsänderungen verwenden ausschließlich die serverseitigen Funktionen. Lokale Signals werden erst aus der bestätigten Serverantwort aktualisiert. Demo-Modus erzeugt äquivalente lokale Timeline-Ereignisse.

- [ ] **Step 4: Timeline-Aktualisierung implementieren**

`refreshKey` wird im bestehenden `effect()` gelesen. Die Detailseite erhöht ihn nur nach erfolgreichem Speichern, Statuswechsel oder Trackingwechsel. Kommentare bleiben erhalten und werden durch den Neuladevorgang serverseitig wieder einsortiert.

- [ ] **Step 5: Tests grün ausführen**

Run: `npx vitest run --project=node src/app/core/services/purchase.service.spec.ts`

Run: `npx vitest run --project=angular src/app/features/audit/components/record-timeline/record-timeline.component.angular.spec.ts src/app/features/purchases/pages/purchase-detail/purchase-detail.component.angular.spec.ts`

Expected: alle PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/services/purchase.service.ts src/app/core/services/purchase.service.spec.ts src/app/core/services/business-event.service.ts src/app/features/audit src/app/features/purchases/pages/purchase-detail
git commit -m "fix(purchases): record and refresh purchase history"
```

### Task 9: Quellenreste entfernen und Integration stabilisieren

**Files:**

- Delete: `src/app/core/services/sources.service.ts`
- Delete: zugehörige Sources-Service-Tests
- Modify: `src/app/core/services/analytics.service.ts`
- Modify: `src/app/core/services/analytics.service.spec.ts`
- Modify: `src/app/core/services/inventory.service.ts`
- Modify: `src/app/core/services/sales.service.ts`
- Modify: `src/app/core/services/mock-data-store.service.ts`
- Modify: betroffene Purchase-, Inventory-, Sale- und Demo-Tests
- Modify: `docs/AI-CHANGELOG.md`

**Interfaces:**

- Consumes: bereinigte Supabase-Typen aus Task 7.
- Produces: Codebasis ohne `Source`, `SourcesService`, `source_id`, Quellenroute oder Quellenanalyse.

- [ ] **Step 1: Quellenreferenzen als Failing Contract festhalten**

Run: `rg -n "SourcesService|source_id|source:sources|Einkaufsquelle|Quellen & Lieferanten" src/app`

Expected vor Bereinigung: Treffer. Expected nach Bereinigung: keine fachlichen Treffer; nur ausdrücklich historische Dokumentation darf den Begriff enthalten.

- [ ] **Step 2: Services und Abfragen bereinigen**

Purchase-, Inventory- und Sale-Abfragen laden nur Verkäufer. Mockdaten und Analytics enthalten keine Quellenperformance mehr. Entfernte Exportbestandteile aus Task 7 bleiben konsistent.

- [ ] **Step 3: Typprüfung und betroffene Tests ausführen**

Run: `npm run typecheck`

Run: `npx vitest run --project=node src/app/core/services/analytics.service.spec.ts src/app/core/services/purchase.service.spec.ts src/app/core/services/inventory-persistence.spec.ts`

Expected: PASS.

- [ ] **Step 4: Angular-Bau ausführen**

Run: `npm run build`

Expected: PASS ohne Template- oder Lazy-Route-Fehler.

- [ ] **Step 5: Changelog vervollständigen und Commit erstellen**

```bash
git add src/app docs/AI-CHANGELOG.md
git commit -m "refactor(purchases): remove purchase source model"
```

### Task 10: Gesamtprüfung und Browserabnahme

**Files:**

- Modify: nur Dateien, deren Prüfung einen nachgewiesenen Fehler findet
- Modify: `docs/AI-CHANGELOG.md`

**Interfaces:**

- Consumes: alle vorherigen Tasks.
- Produces: geprüfter Pull-Request-Stand.

- [ ] **Step 1: Formatierung und statische Prüfungen ausführen**

Run: `npm run format:check`

Run: `npm run lint`

Run: `npm run typecheck`

Expected: alle PASS.

- [ ] **Step 2: Vollständige lokale Prüfung ausführen**

Run: `npm run verify`

Expected: Exitcode 0; der Exitcode wird direkt und nicht über eine Pipe ausgewertet.

- [ ] **Step 3: Datenbank vollständig zurücksetzen und prüfen**

Run: `npm run supabase:reset`

Run: `npm run test:db`

Expected: Schemaaufbau und alle SQL-Prüfungen PASS.

- [ ] **Step 4: Browserabläufe prüfen**

Prüfen: Verkäuferseite und Typfilter, Unternehmen/Privatperson, Länder- und Telefonwahl, Verkäufererstellung aus dem Einkauf, Einzelpreise, Paketpreis mit Rundung, Bestellt → Angekommen ohne Tracking, freiwilliges Tracking, Statusbadges und sofortige Chronik. Desktop, schmale Ansicht, Tastatur und AXE müssen fehlerfrei sein.

- [ ] **Step 5: Abschluss dokumentieren und Commit erstellen**

```bash
git add docs/AI-CHANGELOG.md
git commit -m "docs(purchases): record purchase redesign verification"
```
