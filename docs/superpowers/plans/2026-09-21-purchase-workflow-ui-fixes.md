# Purchase Workflow UI Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die freigegebenen Punkte 1 bis 24 für Einkauf, Artikel, Verkäufer, Beta-Einstieg und Kopfbereich vollständig umsetzen und Punkt 25 anschließend als eigenen Discord-Umfang bewerten.

**Architecture:** Die bestehenden Feature-Grenzen bleiben erhalten. Kaufpositionen und Kosten werden im Einkaufsformular signalbasiert abgeleitet, bestätigte Serverantworten aktualisieren den zentralen `PurchaseService`, und Belege verwenden den vorhandenen privaten Supabase-Bucket mit einer erweiterten Löschregel. Gemeinsame UI-Verträge werden in Shared/Layout geändert; Landingpage und Beta-Edge-Functions bleiben außerhalb der Angular-Komponenten, teilen aber dieselben Texte und Tests.

**Tech Stack:** Angular 22, TypeScript, Signals, Reactive Forms, Tailwind CSS, Vitest, Node-Test, Supabase/Postgres, Deno Edge Functions

**Spec:** `docs/superpowers/specs/2026-09-21-purchase-workflow-ui-fixes-design.md`

## Global Constraints

- Produktivänderungen entstehen strikt testgetrieben: Test schreiben, erwartetes Fehlschlagen prüfen, minimale Änderung umsetzen, Tests erneut ausführen.
- Angular-Komponenten bleiben standalone, verwenden `ChangeDetectionStrategy.OnPush`, Signals und Reactive Forms; keine Inline-Templates, `ngClass`, `ngStyle`, `@HostBinding` oder `@HostListener`.
- Sichtbares Styling erfolgt in Angular-Templates mit Tailwind-Klassen. Das Markengelb bleibt exakt `#fcc601`.
- Deutschsprachige Kundentexte verwenden durchgängig die Du-Ansprache und keine Zusätze wie „optional“.
- Zugänglichkeit umfasst sichtbaren Tastaturfokus, semantische Steuerelemente, eindeutige Namen und AXE/WCAG-AA-Prüfung.
- Bestehende Mystery-Datensätze bleiben lesbar; neue Einkäufe erhalten keinen sichtbaren Mystery- oder Paketpreis-Sonderweg.
- Schemaänderungen erfolgen in `supabase/schemas/`; die Migration wird mit `supabase stop` und `supabase db diff -f allow_finalized_purchase_document_removal` erzeugt und anschließend geprüft.
- Es werden keine neuen Abhängigkeiten eingeführt.
- Punkt 25 wird in diesem Plan nicht implementiert. Nach Abschluss aller Aufgaben wird anhand des realen Diffs und der Prüfkosten empfohlen, ob Discord in diesen oder einen eigenen PR gehört.

## Review Focus

- Ein alter Mystery-Einkauf mit offenen Paketpositionen bleibt darstellbar, ohne dass die neue Erfassung wieder eine Paketpreisverteilung anbietet; Task 4 deckt diesen Altbestand ab.
- Gespeicherte Artikelspalten mit der entfernten Kennung `store` werden ohne Verlust der übrigen Reihenfolge auf Kategorie und Marke normalisiert; Task 7 deckt diese Migration ab.
- Ein Einkauf wird erfolgreich gespeichert, während einer von mehreren vorgemerkten Belegen scheitert; der Einkauf bleibt erhalten und nur der fehlgeschlagene Beleg wird erneut angeboten; Task 5 deckt diesen Teilfehler ab.
- Das Entfernen eines Belegs nach Abschluss löscht Metadatensatz und Storage-Datei und hinterlässt weiterhin den fachlichen Chronikeintrag; Task 5 deckt Datenbank und Dienst ab.
- Eine vorhandene Beta-Adresse verrät öffentlich weder „offen“, „angenommen“ noch „abgelehnt“ und beendet trotzdem den Ladezustand; Task 8 deckt alle drei Zustände ab.

---

### Task 1: Gemeinsame Checkboxen und einheitlicher Kopfbereich

**Files:**

- Modify: `src/app/shared/components/custom-checkbox/custom-checkbox.component.ts`
- Modify: `src/app/shared/components/custom-checkbox/custom-checkbox.component.html`
- Modify: `src/app/shared/components/custom-checkbox/custom-checkbox.component.angular.spec.ts`
- Modify: `src/app/layout/sidebar/sidebar.component.html`
- Modify: `src/app/layout/sidebar/sidebar.component.angular.spec.ts`
- Modify: `src/app/layout/header/header.component.html`
- Modify: `src/app/layout/header/header-role-and-timer.spec.ts`

**Interfaces:**

- Consumes: vorhandene `CustomCheckboxComponent.color`-Varianten und bestehende Header-Aktionen.
- Produces: `color()` mit Vorgabe `'brand'`; Sidebar- und Inhaltsheader mit `h-14`; Kopfaktionen mit gemeinsamer Höhe `h-9`.

- [ ] **Step 1: Failing tests für Markengelb, Logo-Ziel und Geometrie schreiben**

```ts
it('verwendet Markengelb als Standardfarbe', () => {
  const fixture = createCheckbox();
  fixture.componentRef.setInput('checked', true);
  fixture.detectChanges();
  const box = fixture.nativeElement.querySelector('[aria-hidden="true"]');
  expect(box.classList).toContain('bg-[#fcc601]');
});

it('verlinkt die vollständige Marke zum Dashboard', () => {
  const link = fixture.nativeElement.querySelector('a[aria-label="Zum Dashboard"]');
  expect(link.getAttribute('href')).toBe('/dashboard');
  expect(link.textContent).toContain('Flipbase');
});
```

Der Header-Test rendert Sidebar und Header beziehungsweise prüft deren reale Hostelemente auf dieselbe feste Höhe. Glocke und Designumschalter müssen quadratisch `h-9 w-9`, Sprache und Nutzerknopf `h-9` verwenden.

- [ ] **Step 2: RED prüfen**

Run: `npx vitest run --project=angular src/app/shared/components/custom-checkbox/custom-checkbox.component.angular.spec.ts src/app/layout/sidebar/sidebar.component.angular.spec.ts src/app/layout/header/header-role-and-timer.spec.ts`

Expected: FAIL, weil die Checkbox standardmäßig smaragdgrün ist und die Kopfbereiche `h-12` beziehungsweise `min-h-14` verwenden.

- [ ] **Step 3: Gemeinsamen Vertrag minimal umsetzen**

```ts
readonly color = input<'emerald' | 'indigo' | 'brand'>('brand');
```

Sidebar und Header erhalten eine feste `h-14`; mobile Umbrüche bleiben innerhalb dieser Höhe bedienbar. Glocke und Designumschalter teilen dieselben quadratischen Klassen. Workspace-, Sprach- und Nutzersteuerung teilen Höhe, Radius, Rand, Hover und Fokus. Der vorhandene Dashboard-Link bleibt auf der gesamten Marke.

- [ ] **Step 4: GREEN und AXE prüfen**

Run: `npx vitest run --project=angular src/app/shared/components/custom-checkbox/custom-checkbox.component.angular.spec.ts src/app/layout/sidebar/sidebar.component.angular.spec.ts src/app/layout/header/header-role-and-timer.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/components/custom-checkbox src/app/layout/sidebar src/app/layout/header
git commit -m "fix(ui): align shared controls and headers"
```

### Task 2: Einkaufserfassung, Positionen und Kostenübersicht

**Files:**

- Modify: `src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.ts`
- Modify: `src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.html`
- Modify: `src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.angular.spec.ts`
- Modify: `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.ts`
- Modify: `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.html`
- Modify: `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.angular.spec.ts`
- Modify: `src/app/features/purchases/components/purchase-product-picker/purchase-product-picker.component.html`
- Create: `src/app/features/purchases/components/purchase-product-picker/purchase-product-picker.component.angular.spec.ts`
- Modify: `src/app/features/purchases/components/purchase-cost-summary/purchase-cost-summary.component.ts`
- Modify: `src/app/features/purchases/components/purchase-cost-summary/purchase-cost-summary.component.html`
- Modify: `src/app/features/purchases/components/purchase-cost-summary/purchase-cost-summary.component.angular.spec.ts`

**Interfaces:**

- Consumes: `PurchaseLineDraft`, `PurchaseCostDraft`, `CreatePurchasePayload` und `PurchaseCostSummaryComponent`.
- Produces: `PurchaseEntryFormComponent.purchaseBasePrice()` wird bei jeder Positionsänderung aus den `lineTotal`-Werten berechnet; ein leerer sichtbarer Beschreibungstext bleibt als `title: ''` und `notes: null` leer.

- [ ] **Step 1: Failing tests für leere Preise und Live-Summen schreiben**

```ts
it('zeigt bei leerem Stückpreis eine leere Eingabe und null als Gesamt', () => {
  const row = renderedLine({ unitPurchasePrice: null, lineTotal: null });
  expect(row.querySelector<HTMLInputElement>('input[aria-label^="Stückpreis"]')?.placeholder).toBe(
    '',
  );
  expect(row.textContent).toContain('0,00 €');
  expect(row.textContent).not.toContain('Offen');
});

it('aktualisiert Warenwert und Gesamt unmittelbar aus den Positionen', () => {
  component.onPurchaseLinesChanged([
    line({ orderedQuantity: 2, unitPurchasePrice: 12.5, lineTotal: 25 }),
  ]);
  expect(component.purchaseBasePrice()).toBe(25);
  expect(component.totalCosts()).toBe(25);
});
```

Zusätzlich prüfen die Tests linksbündige Artikelnamen, den vollen `data-add-products`-Bereich und das Verschieben des Kaufdatums in „Einkaufsdetails“ oberhalb der Referenznummer.

- [ ] **Step 2: RED für Positionseditor und Formular prüfen**

Run: `npx vitest run --project=angular src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.angular.spec.ts src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.angular.spec.ts`

Expected: FAIL wegen „Offen“, der bisherigen Kaufdatum-Position und des `title`-Fallbacks „Einkauf“.

- [ ] **Step 3: Positions- und Formularverhalten minimal umsetzen**

```ts
onPurchaseLinesChanged(lines: readonly PurchaseLineDraft[]): void {
  this.purchaseLines.set(lines);
  const knownTotals = lines.map((line) => line.lineTotal).filter((value): value is number => value !== null);
  this.form.controls.purchase_price.setValue(
    knownTotals.length === lines.length ? Number(knownTotals.reduce((sum, value) => sum + value, 0).toFixed(2)) : null,
    { emitEvent: false },
  );
  this.purchaseBasePrice.set(knownTotals.length === lines.length ? Number(knownTotals.reduce((sum, value) => sum + value, 0).toFixed(2)) : null);
}
```

Das Template rendert bei `lineTotal === null` `0,00 €`, lässt den Stückpreis-Platzhalter leer und richtet Namen links aus. Kaufdatum wandert in die rechte Detailkarte. Der Payload verwendet `title: f.notes.trim()` ohne Ersatztext.

- [ ] **Step 4: Failing Test für vollständig klickbare Produktzeilen schreiben**

```ts
it('wählt einen Artikel durch Klick auf die Ergebniszeile genau einmal aus', () => {
  const row = host.querySelector<HTMLElement>('[data-product-option="product-1"]')!;
  row.click();
  fixture.detectChanges();
  expect(component.selection().has('product-1')).toBe(true);
});
```

Der Test klickt anschließend die Checkbox und beweist, dass das Ereignis nicht doppelt zur Zeile hochblubbert.

- [ ] **Step 5: RED prüfen und Produktzeile umsetzen**

Run: `npx vitest run --project=angular src/app/features/purchases/components/purchase-product-picker/purchase-product-picker.component.angular.spec.ts`

Expected: FAIL, weil nur die Checkbox umschaltet.

Die Ergebniszeile wird ein semantischer, tastaturbedienbarer Auswahlbereich mit `data-product-option`, `(click)` und Enter/Leertaste. Interaktive Kinder stoppen die Weitergabe; `aria-selected` spiegelt den Zustand.

- [ ] **Step 6: Failing Tests für die Kostenübersicht schreiben**

```ts
it('zeigt auch ohne Positionen Artikelzahl, Warenwert und Gesamt mit null', () => {
  const text = normalize(host.textContent);
  expect(text).toContain('0 Artikel');
  expect(text).toContain('0,00 €');
});

it('blendet eine leere Korrektur aus und benennt einen Rabatt konkret', () => {
  expect(normalize(render({ discountAmount: 0 }).textContent)).not.toContain('Anpassungen');
  expect(normalize(render({ discountAmount: 5 }).textContent)).toContain('Rabatt');
});
```

- [ ] **Step 7: RED prüfen, Summenzeilen umsetzen und alle Task-Tests GREEN fahren**

Run: `npx vitest run --project=angular src/app/features/purchases/components/purchase-cost-summary/purchase-cost-summary.component.angular.spec.ts`

Expected: FAIL wegen der immer sichtbaren Zeile „Anpassungen“.

Die Nullzeile entfällt. Rabatt erscheint nur über null; Kostenart `other` verwendet „Sonstiges“, sofern keine Beschreibung existiert. Danach alle vier Task-Testdateien gemeinsam ausführen.

- [ ] **Step 8: Commit**

```bash
git add src/app/features/purchases/components/purchase-entry-form src/app/features/purchases/components/purchase-line-editor src/app/features/purchases/components/purchase-product-picker src/app/features/purchases/components/purchase-cost-summary
git commit -m "fix(purchases): simplify entry pricing workflow"
```

### Task 3: Einkaufsübersicht, Status und Benachrichtigungen

**Files:**

- Modify: `src/app/core/config/table-defaults.config.ts`
- Modify: `src/app/core/services/table-preferences.service.angular.spec.ts`
- Modify: `src/app/features/purchases/purchases.component.ts`
- Modify: `src/app/features/purchases/purchases.component.html`
- Modify: `src/app/features/purchases/purchases.component.angular.spec.ts`
- Modify: `src/app/features/purchases/utils/purchase-presentation.ts`
- Modify: `src/app/features/purchases/utils/purchase-presentation.spec.ts`
- Modify: `src/app/features/purchases/utils/purchase-status-presentation.ts`
- Modify: `src/app/features/purchases/utils/purchase-status-presentation.spec.ts`
- Modify: `src/app/core/services/purchase.service.ts`
- Modify: `src/app/core/services/purchase.service.spec.ts`
- Modify: `src/app/core/services/webhook.service.ts`
- Modify: `src/app/core/services/webhook.service.spec.ts`

**Interfaces:**

- Consumes: `PURCHASES_TABLE_CONFIG`, `PurchaseService.purchases()`, `mapPurchaseListRow()`.
- Produces: Spaltenfolge Einkauf, Kaufdatum, Verkäufer, Status, Erhalten, Beschreibung, Gesamt; echte und gefilterte Leerzustände; Notification-Titel auf Basis der Einkaufsnummer.

- [ ] **Step 1: Failing Tests für Spalten, Leerzustände und Status schreiben**

```ts
expect(PURCHASES_TABLE_CONFIG.defaultColumns.map(({ id }) => id)).toEqual([
  'title',
  'purchase_date',
  'seller',
  'status',
  'receipt',
  'description',
  'total_cost',
]);

expect(getPurchaseStatusPresentation(draftPurchase)).toEqual({
  label: 'Entwurf',
  tone: 'neutral',
});
```

Der Angular-Test rendert einmal `purchases() === []` und erwartet „Noch keine Einkäufe“ plus Anlegen-Aktion. Mit vorhandenen Einkäufen und einem nicht treffenden Filter erwartet er „Keine passenden Einkäufe“ plus Filter-Zurücksetzen.

- [ ] **Step 2: RED prüfen**

Run: `npx vitest run --project=angular src/app/features/purchases/purchases.component.angular.spec.ts src/app/features/purchases/utils/purchase-presentation.spec.ts src/app/features/purchases/utils/purchase-status-presentation.spec.ts src/app/core/services/table-preferences.service.angular.spec.ts`

Expected: FAIL wegen bisheriger Reihenfolge, gemeinsamer Leertexte, „Bezeichnung“ und gelbem Entwurfsbadge.

- [ ] **Step 3: Übersicht und Präsentationsmodell umsetzen**

`PurchaseListRow.title` wird zur sichtbaren Beschreibung aus `purchase.notes ?? ''`; `reference` bleibt die Einkaufsnummer. Suche berücksichtigt weiterhin Nummer, Beschreibung und Verkäufer. Die Tabelle zeigt in der ersten Spalte ausschließlich `reference` und in `description` die leere oder vorhandene Beschreibung.

```ts
readonly hasPurchases = computed(() => this.purchaseService.purchases().length > 0);
readonly emptyTitle = computed(() => this.hasPurchases() ? 'Keine passenden Einkäufe' : 'Noch keine Einkäufe');
readonly emptyText = computed(() => this.hasPurchases() ? 'Ändere die Suche oder die Filter.' : 'Erstelle deinen ersten Einkauf.');
```

- [ ] **Step 4: Failing Tests für bestätigte Mutationsdaten und Nummernbenachrichtigung schreiben**

```ts
it('ersetzt einen gespeicherten Einkauf sofort in der Liste', async () => {
  const result = await service.updatePurchaseDraft('purchase-1', payload);
  expect(service.purchases().find(({ id }) => id === 'purchase-1')?.total_purchase_cost).toBe(
    result.data?.total_purchase_cost,
  );
});

it('nennt in der Einkaufsmeldung die Einkaufsnummer statt eines Ersatznamens', async () => {
  await service.sendPurchaseNotification({
    ...purchase,
    title: '',
    notes: null,
    record_number: '2026-123',
  });
  expect(service.notifications()[0].title).toBe('Neuer Einkauf #2026-123');
});
```

- [ ] **Step 5: RED prüfen und zentralen Listenabgleich umsetzen**

Run: `npx vitest run --project=node src/app/core/services/purchase.service.spec.ts src/app/core/services/webhook.service.spec.ts`

Expected: mindestens der Notification-Test FAIL; vorhandene Mutationspfade, die die bestätigte Antwort nicht in `purchasesRaw` übernehmen, schlagen ebenfalls fehl.

Eine private Methode `upsertPurchase(purchase: Purchase): void` aktualisiert Liste und ausgewählten Einkauf. Alle Preis-, Ankunfts-, Abschluss- und Korrekturmutationen verwenden sie oder laden genau einmal gezielt neu. Der Benachrichtigungstitel verwendet die normalisierte `record_number` und fällt nur bei echten Altdaten ohne Nummer auf „Neuer Einkauf“ zurück.

- [ ] **Step 6: GREEN und Commit**

Run: `npx vitest run --project=node src/app/core/services/purchase.service.spec.ts src/app/core/services/webhook.service.spec.ts && npx vitest run --project=angular src/app/features/purchases/purchases.component.angular.spec.ts src/app/features/purchases/utils/purchase-presentation.spec.ts src/app/features/purchases/utils/purchase-status-presentation.spec.ts src/app/core/services/table-preferences.service.angular.spec.ts`

Expected: PASS.

```bash
git add src/app/core/config/table-defaults.config.ts src/app/core/services/table-preferences.service.angular.spec.ts src/app/core/services/purchase.service.ts src/app/core/services/purchase.service.spec.ts src/app/core/services/webhook.service.ts src/app/core/services/webhook.service.spec.ts src/app/features/purchases/purchases.component.* src/app/features/purchases/utils/purchase-presentation.* src/app/features/purchases/utils/purchase-status-presentation.*
git commit -m "fix(purchases): refresh overview from confirmed state"
```

### Task 4: Einkaufsdetail, Lebenszyklus und stabile Artikeltabelle

**Files:**

- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.ts`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.angular.spec.ts`
- Modify: `src/app/features/purchases/components/purchase-lifecycle-actions/purchase-lifecycle-actions.component.html`
- Modify: `src/app/features/purchases/components/purchase-lifecycle-actions/purchase-lifecycle-actions.component.angular.spec.ts`
- Modify: `src/app/features/purchases/components/purchase-detail-table/purchase-detail-table.component.ts`
- Modify: `src/app/features/purchases/components/purchase-detail-table/purchase-detail-table.component.html`
- Modify: `src/app/features/purchases/components/purchase-detail-table/purchase-detail-table.component.angular.spec.ts`
- Modify: `src/app/features/purchases/models/purchase-presentation.models.ts`
- Modify: `src/app/features/purchases/utils/purchase-presentation.ts`
- Modify: `src/app/features/purchases/utils/purchase-presentation.spec.ts`

**Interfaces:**

- Consumes: `Purchase`, `PurchaseLine`, `mapPurchaseDetailRows()` und Lebenszyklusstatus.
- Produces: feste Artikeltabelle mit `Artikel`, `Bestellt`, `Erhalten`, `Stückpreis`, `Gesamt`; keine einkaufsbezogenen Prüfbeleg-Aktion; Druck erst ab „Bestellt“.

- [ ] **Step 1: Failing Tests für Kopfaktionen und Warnhinweis schreiben**

```ts
it('blendet Druck und Prüfbeleg im Entwurf aus', () => {
  renderPurchase({ entry_status: 'draft', receiving_status: 'draft' });
  expect(host.querySelector('[data-purchase-print-link]')).toBeNull();
  expect(host.querySelector('[data-purchase-audit-print-link]')).toBeNull();
});

it('zeigt offene Preise unter den Kopfaktionen statt zwischen den Buttons', () => {
  renderPurchase(openPricePurchase);
  expect(host.querySelector('[data-open-price-notice]')).not.toBeNull();
  expect(
    host.querySelector('app-purchase-lifecycle-actions [data-open-purchase-prices]'),
  ).toBeNull();
});
```

- [ ] **Step 2: RED prüfen und Kopfbereich umsetzen**

Run: `npx vitest run --project=angular src/app/features/purchases/pages/purchase-detail/purchase-detail.component.angular.spec.ts src/app/features/purchases/components/purchase-lifecycle-actions/purchase-lifecycle-actions.component.angular.spec.ts`

Expected: FAIL, weil beide Druckaktionen immer erscheinen und die Warnung im Aktionsbaustein steht.

Der Prüfbeleg-Link entfällt vollständig. Einkauf drucken erscheint nur, wenn `receiving_status !== 'draft'`. Der Warnhinweis wird als eigener zugänglicher Block zwischen Header und Inhalt gerendert; die Aktionskomponente steuert nur Buttons.

- [ ] **Step 3: Failing Tests für die feste Artikeltabelle schreiben**

```ts
expect(tableHeaders()).toEqual(['Artikel', 'Bestellt', 'Erhalten', 'Stückpreis', 'Gesamt']);
expect(host.textContent).not.toContain('Kostenanteil');
expect(host.textContent).not.toContain('Verfügbar');
expect(host.textContent).not.toContain('Verkauft');
```

Der Mapper-Test verwendet dieselben Positionen einmal für Entwurf und einmal für einen abgeschlossenen Einkauf und erwartet dieselben fünf fachlichen Werte. Ein alter Mystery-Datensatz muss weiterhin eine Zeile mit Menge und Kosten darstellen.

- [ ] **Step 4: RED prüfen und Tabellenmodell vereinfachen**

Run: `npx vitest run --project=angular src/app/features/purchases/components/purchase-detail-table/purchase-detail-table.component.angular.spec.ts && npx vitest run --project=node src/app/features/purchases/utils/purchase-presentation.spec.ts`

Expected: FAIL wegen der dynamischen Bestands-, Verkaufs- und Kostenanteilsspalten.

`PurchaseDetailRow` trägt die sichtbaren Felder `orderedQuantity`, `receivedQuantity`, `unitPurchasePrice` und `lineTotal`. Bestehende Inventarlinks und die fachlich nötige „Artikel erfassen“-Aktion dürfen innerhalb der Artikelzelle bleiben. Der Spaltenwähler und die Detail-Spaltenpräferenz entfallen aus dieser Ansicht.

- [ ] **Step 5: GREEN und Commit**

Run: `npx vitest run --project=angular src/app/features/purchases/pages/purchase-detail/purchase-detail.component.angular.spec.ts src/app/features/purchases/components/purchase-lifecycle-actions/purchase-lifecycle-actions.component.angular.spec.ts src/app/features/purchases/components/purchase-detail-table/purchase-detail-table.component.angular.spec.ts && npx vitest run --project=node src/app/features/purchases/utils/purchase-presentation.spec.ts`

Expected: PASS.

```bash
git add src/app/features/purchases/pages/purchase-detail src/app/features/purchases/components/purchase-lifecycle-actions src/app/features/purchases/components/purchase-detail-table src/app/features/purchases/models/purchase-presentation.models.ts src/app/features/purchases/utils/purchase-presentation.*
git commit -m "fix(purchases): keep detail workflow consistent"
```

### Task 5: Belege vormerken, rechts platzieren und nach Abschluss korrigieren

**Files:**

- Modify: `src/app/core/models/purchase-document.models.ts`
- Modify: `src/app/core/services/purchase-document.service.ts`
- Modify: `src/app/core/services/purchase-document.service.dom.spec.ts`
- Modify: `src/app/features/purchases/components/purchase-documents-card/purchase-documents-card.component.ts`
- Modify: `src/app/features/purchases/components/purchase-documents-card/purchase-documents-card.component.html`
- Modify: `src/app/features/purchases/components/purchase-documents-card/purchase-documents-card.component.angular.spec.ts`
- Modify: `src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.ts`
- Modify: `src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.html`
- Modify: `src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.angular.spec.ts`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.angular.spec.ts`
- Modify: `supabase/schemas/170_purchase_documents.sql`
- Modify: `supabase/tests/purchase_documents.test.sql`
- Create through `supabase db diff`: migration with suffix `allow_finalized_purchase_document_removal.sql` in `supabase/migrations/`
- Regenerate: `src/app/core/models/supabase.types.ts`

**Interfaces:**

- Consumes: `PurchaseDocumentService.upload/remove`, privaten Bucket `purchase-documents` und Audit-Trigger `log_purchase_document_event`.
- Produces: `PendingPurchaseDocument` mit `id`, `file`, `documentType`, `status` und `error`; Dokumentkachel unterstützt gespeicherten Einkauf oder lokale Vormerkung.

- [ ] **Step 1: Failing Komponenten-Tests für lokale Vormerkung und Drag-and-drop schreiben**

```ts
it('merkt eine Datei ohne Einkaufs-ID lokal vor', () => {
  dropFile(new File(['pdf'], 'rechnung.pdf', { type: 'application/pdf' }));
  expect(component.pendingDocuments()).toEqual([
    expect.objectContaining({ file: expect.any(File), documentType: 'invoice', status: 'pending' }),
  ]);
  expect(documentService.upload).not.toHaveBeenCalled();
});

it('bietet Entfernen auch bei einem abgeschlossenen Einkauf nach Bestätigung an', async () => {
  render({ entry_status: 'finalized' });
  click('[data-remove-document]');
  dialog.confirm();
  await fixture.whenStable();
  expect(documentService.remove).toHaveBeenCalledWith(storedDocument);
});
```

- [ ] **Step 2: RED prüfen und Dokumentkachel erweitern**

Run: `npx vitest run --project=angular src/app/features/purchases/components/purchase-documents-card/purchase-documents-card.component.angular.spec.ts`

Expected: FAIL, weil `purchase` erforderlich ist, Drag-and-drop fehlt und abgeschlossene Belege nicht entfernbar sind.

Die Kachel nimmt `purchase: Purchase | null`, verwaltet lokale `PendingPurchaseDocument` über ein `model()` und zeigt Datei-, Upload- und Wiederholungsstatus. Löschen verwendet den vorhandenen Bestätigungsdialog. In Detail und Bearbeitung steht die Kachel in der rechten Spalte direkt unter der Sendungsverfolgung.

- [ ] **Step 3: Failing Formulartests für Upload nach Erstellung und Teilfehler schreiben**

```ts
it('lädt vorgemerkte Belege erst nach erfolgreicher Einkaufserstellung hoch', async () => {
  component.pendingDocuments.set([pending('rechnung.pdf')]);
  await component.onSubmit();
  expect(purchaseService.createPurchase).toHaveBeenCalledBefore(documentService.upload);
  expect(documentService.upload).toHaveBeenCalledWith('purchase-new', expect.any(File), 'invoice');
});

it('behält nur fehlgeschlagene Belege für einen erneuten Versuch', async () => {
  documentService.upload
    .mockResolvedValueOnce({ error: null })
    .mockResolvedValueOnce({ error: new Error('Upload fehlgeschlagen') });
  await component.onSubmit();
  expect(component.pendingDocuments()).toEqual([
    expect.objectContaining({
      file: expect.objectContaining({ name: 'quittung.pdf' }),
      status: 'error',
    }),
  ]);
  expect(component.persistedDraft()?.id).toBe('purchase-new');
});
```

- [ ] **Step 4: RED prüfen und verzögerten Upload umsetzen**

Run: `npx vitest run --project=angular src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.angular.spec.ts src/app/features/purchases/pages/purchase-detail/purchase-detail.component.angular.spec.ts`

Expected: FAIL, weil neue Einkäufe keine Belegvormerkung besitzen und die Kachel links steht.

Das Formular injiziert `PurchaseDocumentService`, speichert zuerst den Einkauf und lädt danach vorgemerkte Dateien sequenziell hoch. Erfolgreiche Einträge verschwinden, fehlerhafte bleiben mit Fehlermeldung. Bei Teilfehler bleibt der gespeicherte Entwurf im Formular und es erfolgt keine falsche komplette Erfolgsmeldung.

- [ ] **Step 5: Failing Datenbanktest für Löschen nach Abschluss schreiben**

Der bestehende Test löscht als Workspace-Mitglied den Beleg des Datensatzes `finalized`, erwartet null aktive Belege und einen `purchase_document_removed`-Eintrag mit Belegart und Dateiname. Ein Fremd-Workspace bleibt weiterhin abgewiesen.

- [ ] **Step 6: RED der Datenbank prüfen**

Run: `npx supabase test db supabase/tests/purchase_documents.test.sql`

Expected: FAIL an der Policy `Belege offener Einkaeufe loeschen`.

- [ ] **Step 7: Schema, Migration und Typen aktualisieren**

Die Delete-Policies für `public.purchase_documents` und `storage.objects` prüfen nur noch Workspace-Mitgliedschaft, Pfad und Einkaufszuordnung; der Statusfilter entfällt. Policy-Namen werden passend in „Belege entfernen“ geändert. Der bestehende After-Delete-Trigger bleibt unverändert.

Run: `npx supabase stop`

Expected: lokale Supabase-Instanz ist gestoppt oder bereits nicht aktiv.

Run: `npx supabase db diff -f allow_finalized_purchase_document_removal`

Expected: eine neue Migration ändert ausschließlich die beiden Delete-Policies.

Run: `npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts`

Expected: Typen werden erfolgreich erzeugt.

- [ ] **Step 8: Service-, Komponenten- und Datenbanktests GREEN prüfen**

Run: `npx vitest run --project=dom src/app/core/services/purchase-document.service.dom.spec.ts && npx vitest run --project=angular src/app/features/purchases/components/purchase-documents-card/purchase-documents-card.component.angular.spec.ts src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.angular.spec.ts src/app/features/purchases/pages/purchase-detail/purchase-detail.component.angular.spec.ts && npx supabase test db supabase/tests/purchase_documents.test.sql`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/core/models src/app/core/services/purchase-document.service* src/app/features/purchases/components/purchase-documents-card src/app/features/purchases/components/purchase-entry-form src/app/features/purchases/pages/purchase-detail supabase/schemas/170_purchase_documents.sql supabase/tests/purchase_documents.test.sql supabase/migrations
git commit -m "fix(purchases): allow correcting purchase documents"
```

### Task 6: Verständliche, feldgenaue Chronik

**Files:**

- Modify: `src/app/shared/utils/record-changes.ts`
- Modify: `src/app/shared/utils/record-changes.spec.ts`
- Modify: `src/app/features/audit/models/timeline-sentence.ts`
- Modify: `src/app/features/audit/models/timeline-sentence.spec.ts`
- Modify: `src/app/features/audit/components/record-timeline/record-timeline.component.html`
- Modify: `src/app/features/audit/components/record-timeline/record-timeline.component.angular.spec.ts`

**Interfaces:**

- Consumes: gespeicherte `BusinessEvent.changes`-Nutzlasten.
- Produces: `timelineChanges(event)` mit ausschließlich verständlichen Einzeländerungen; UUIDs und ganze DTOs werden nicht angezeigt.

- [ ] **Step 1: Failing Tests mit realistischen Einkaufsereignissen schreiben**

```ts
it('formatiert nur die tatsächlich geänderte Positionsmenge', () => {
  expect(timelineChanges(event({ lines: { before: [line(2)], after: [line(3)] } }))).toEqual([
    { label: 'Position 1 · Menge', from: '2', to: '3' },
  ]);
});

it('übersetzt Status, Geld und Belegereignisse fachlich', () => {
  expect(mapRecordChanges({ receiving_status: { before: 'ordered', after: 'received' } })).toEqual([
    { label: 'Wareneingang', from: 'Bestellt', to: 'Angekommen' },
  ]);
  expect(timelineChanges(documentRemovedEvent)).toEqual([
    { label: 'Beleg entfernt', from: null, to: 'rechnung.pdf · Rechnung' },
  ]);
});
```

Weitere Fälle: unbekannte UUID-Referenz komplett ausblenden, Centbeträge als Euro formatieren, unveränderte Felder weglassen, hinzugefügte/entfernte Position nur einmal nennen.

- [ ] **Step 2: RED prüfen**

Run: `npx vitest run --project=node src/app/shared/utils/record-changes.spec.ts src/app/features/audit/models/timeline-sentence.spec.ts`

Expected: FAIL bei Statusübersetzung, Geldformat und kompaktem Belegtext.

- [ ] **Step 3: Formatierer und ereignisspezifische Sätze umsetzen**

`formatRecordValue` erhält schlüsselbezogene Formatter für Geld, Status, Zustand, Kostenverteilung und Versanddienstleister. `timelineChanges` behandelt Beleg hinzugefügt/entfernt als genau eine Zeile. Unbekannte Objektcontainer erzeugen keine Zeile „Mehrere Werte“, sondern werden rekursiv auf tatsächlich geänderte, zulässige Blätter reduziert.

- [ ] **Step 4: GREEN, gerenderte Chronik und AXE prüfen**

Run: `npx vitest run --project=node src/app/shared/utils/record-changes.spec.ts src/app/features/audit/models/timeline-sentence.spec.ts && npx vitest run --project=angular src/app/features/audit/components/record-timeline/record-timeline.component.angular.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/utils/record-changes.* src/app/features/audit/models/timeline-sentence.* src/app/features/audit/components/record-timeline
git commit -m "fix(purchases): simplify purchase timeline changes"
```

### Task 7: Artikelübersicht, Produktnotiz und Verkäuferzeilen

**Files:**

- Modify: `src/app/core/config/table-defaults.config.ts`
- Modify: `src/app/core/services/table-preferences.service.ts`
- Modify: `src/app/core/services/table-preferences.service.angular.spec.ts`
- Modify: `src/app/features/catalog/catalog.component.html`
- Create: `src/app/features/catalog/catalog.component.angular.spec.ts`
- Modify: `src/app/features/catalog/components/product-dialog/product-dialog.component.html`
- Modify: `src/app/features/catalog/components/product-dialog/product-dialog.component.angular.spec.ts`
- Modify: `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.html`
- Modify: `src/app/features/sellers/sellers.component.ts`
- Modify: `src/app/features/sellers/sellers.component.html`
- Modify: `src/app/features/sellers/sellers.component.angular.spec.ts`

**Interfaces:**

- Consumes: `CATALOG_TABLE_CONFIG`, gespeicherte `TableState<'catalog'>`, `CatalogProduct.brand/category` und `Supplier`.
- Produces: Katalogspalten `title`, `category`, `brand`, `ean`, `available`; zugängliche, vollständig klickbare Verkäuferzeile.

- [ ] **Step 1: Failing Tests für Katalogspalten und Präferenzmigration schreiben**

```ts
expect(CATALOG_TABLE_CONFIG.defaultColumns.map(({ id }) => id)).toEqual([
  'title',
  'category',
  'brand',
  'ean',
  'available',
]);

expect(migrated.columns.map(({ id }) => id)).toEqual([
  'title',
  'category',
  'brand',
  'ean',
  'available',
]);
expect(migrated.columns.some(({ id }) => id === 'store')).toBe(false);
```

Der gerenderte Katalogtest erwartet Kategorie und Marke als eigene Zellen, „Unbekannt“ bei leerer Marke und keine Texte „Öffentlich“, „Intern“ oder „Webshop“.

- [ ] **Step 2: RED prüfen und Katalog umsetzen**

Run: `npx vitest run --project=angular src/app/core/services/table-preferences.service.angular.spec.ts src/app/features/catalog/catalog.component.angular.spec.ts`

Expected: FAIL wegen der bisherigen `store`-Spalte und Kategorie unter dem Artikelnamen.

Die generische Präferenznormalisierung entfernt unbekannte IDs, fügt neue Standardspalten ein und behält Reihenfolge/Sichtbarkeit bekannter IDs. Kategorie und Marke werden in Desktop und mobiler Priorisierung angezeigt.

- [ ] **Step 3: Failing Test für „Notiz“ schreiben und Text ändern**

```ts
expect(labelText('conditionNotes')).toBe('Notiz');
expect(host.textContent).not.toContain('Mängelnotiz');
```

Run: `npx vitest run --project=angular src/app/features/catalog/components/product-dialog/product-dialog.component.angular.spec.ts`

Expected: FAIL wegen „Mängelnotiz“.

Produktdialog und Artikel-Detailanzeige im Einkauf verwenden „Notiz“.

- [ ] **Step 4: Failing Verkäufer-Interaktionstests schreiben**

```ts
it('öffnet den Verkäufer per Zeilenklick und Tastatur', () => {
  row.click();
  expect(component.editingSeller()?.id).toBe(seller.id);
  row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(openEditDialog).toHaveBeenCalled();
});

it('löst beim Aktionsknopf nicht zusätzlich den Zeilenklick aus', () => {
  clickEditAction();
  expect(openEditDialog).toHaveBeenCalledOnce();
});
```

Der Test prüft zusätzlich grüne Bearbeiten-/Wiederherstellen-, orange Archivieren- und rote Löschzustände, soweit eine echte Löschaktion vorhanden ist.

- [ ] **Step 5: RED prüfen, Zeilenvertrag umsetzen und GREEN fahren**

Run: `npx vitest run --project=angular src/app/features/sellers/sellers.component.angular.spec.ts`

Expected: FAIL, weil aktuell nur Name und Stift öffnen.

Die Zeile erhält `tabindex="0"`, sichtbaren Fokus, Click/Enter/Leertaste und ignoriert Ereignisse aus `button`, `a`, `input`, `select`, `textarea` sowie Textauswahl. Aktionsknöpfe stoppen die Zeilenaktion und erhalten die vereinbarten Hover-/Fokusfarben.

- [ ] **Step 6: Task-Suite und Commit**

Run: `npx vitest run --project=angular src/app/core/services/table-preferences.service.angular.spec.ts src/app/features/catalog/catalog.component.angular.spec.ts src/app/features/catalog/components/product-dialog/product-dialog.component.angular.spec.ts src/app/features/sellers/sellers.component.angular.spec.ts`

Expected: PASS.

```bash
git add src/app/core/config/table-defaults.config.ts src/app/core/services/table-preferences.service* src/app/features/catalog src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.html src/app/features/sellers
git commit -m "fix(inventory): clarify catalog and seller tables"
```

### Task 8: Sicherer Beta-Status, Ladeanzeige, E-Mail und Passwortseite

**Files:**

- Modify: `supabase/functions/beta-application/duplicate-application.ts`
- Modify: `supabase/functions/beta-application/duplicate-application.test.ts`
- Modify: `supabase/functions/beta-application/index.ts`
- Modify: `supabase/functions/beta-application/index.test.ts`
- Modify: `landing/index.html`
- Modify: `landing/landing.js`
- Modify: `scripts/landing-page.test.mjs`
- Modify: `supabase/functions/_shared/beta-email-template.ts`
- Modify: `supabase/functions/_shared/beta-email-template.test.ts`
- Modify: `supabase/functions/_shared/beta-email-delivery.ts`
- Modify: `supabase/functions/_shared/beta-email-delivery.test.ts`
- Modify: `landing/templates/email-invitation.html`
- Modify: `public/templates/email-invitation.html`
- Modify: `src/app/features/auth/set-password/set-password.component.html`
- Modify: `src/app/features/auth/set-password/set-password.component.angular.spec.ts`

**Interfaces:**

- Consumes: Beta-Application-Edge-Function, statische Landingpage, Nodemailer und bestehende `AUTH.*`-Übersetzungsschlüssel.
- Produces: neutrale Antwort für jede vorhandene E-Mail, unbestimmter Ladebalken, Annahme-Betreff und korrekte Passworttexte.

- [ ] **Step 1: Failing Edge- und Landingtests für neutrale Duplikate schreiben**

```ts
Deno.test('verrät bei vorhandenen Bewerbungen keinen Status', () => {
  for (const status of ['open', 'accepted', 'rejected']) {
    assertEquals(classifyDuplicateApplication({ status, receiptEmailStatus: 'sent' }), 'existing');
  }
});
```

Der Landingtest sendet `409 { error: 'application_exists' }`, erwartet ein oranges Warndreieck und ausschließlich „Für diese E-Mail liegt bereits eine Bewerbung vor.“. Die Wörter „abgelehnt“ und „angenommen“ dürfen im öffentlichen Dialog nicht vorkommen.

- [ ] **Step 2: RED prüfen und Statusleck schließen**

Run: `deno test --allow-env supabase/functions/beta-application/*.test.ts && npm run test:landing`

Expected: FAIL, weil abgelehnte Adressen aktuell `application_rejected` und einen eigenen Ablehnungsdialog erhalten.

Alle vorhandenen Einträge antworten mit demselben öffentlichen Fehlercode und Text. Interne E-Mail- und Adminzustände bleiben unberührt.

- [ ] **Step 3: Failing Tests für den unbestimmten Ladebalken schreiben**

Der Test löst Submit aus, hält `fetch` offen und erwartet statt des normalen Buttoninhalts einen sichtbaren Bereich mit `role="status"`, Text „Bewerbung wird gesendet …“ und einer rein visuellen unbestimmten Balkenanimation. Nach Erfolg, Fehler und Timeout muss der normale Button wieder erscheinen; ein Prozentwert darf nicht vorkommen.

- [ ] **Step 4: RED prüfen und Ladezustand umsetzen**

Run: `npm run test:landing`

Expected: FAIL, weil bisher nur `disabled` gesetzt wird.

Die Landingpage enthält beide Buttonzustände im selben Button. `landing.js` setzt während der Anfrage `aria-busy="true"` und schaltet Inhalte; `finally` setzt den Ausgangszustand zurück. Reduced Motion deaktiviert die Bewegung, nicht die Statusmeldung.

- [ ] **Step 5: Failing E-Mail-Tests schreiben**

```ts
assertEquals(message.subject, 'Deine Bewerbung zur Flipbase Beta wurde angenommen');
assert(message.html.includes('Deine Bewerbung wurde angenommen'));
assertEquals(envelope.from, { name: 'Flipbase „Beta“', address: 'account@flipbase.de' });
```

Die Tests prüfen HTML und Text sowie einen Absendernamen mit Anführungszeichen, ohne sichtbare Backslashes.

- [ ] **Step 6: RED prüfen und beide Einladungswege angleichen**

Run: `deno test --allow-env supabase/functions/_shared/beta-email-template.test.ts supabase/functions/_shared/beta-email-delivery.test.ts`

Expected: FAIL wegen altem Betreff und manuell maskiertem String-Absender.

`BetaMailEnvelope.from` wird ein typisiertes `{ name, address }`-Objekt. Shared Template und beide statischen Auth-E-Mail-Kopien verwenden Betreff/Überschrift „Deine Bewerbung … wurde angenommen“ ohne Escape-Zeichen.

- [ ] **Step 7: Failing Passwortseiten-Test schreiben**

```ts
expect(normalize(host.textContent)).toContain('Passwort wiederholen');
expect(normalize(host.textContent)).toContain('Sicherheitsstufe:');
expect(normalize(host.textContent)).not.toContain('AUTH.');
expect(termsCheckbox.color()).toBe('brand');
```

- [ ] **Step 8: RED prüfen, Schlüssel korrigieren und gesamte Beta-Suite GREEN fahren**

Run: `npx vitest run --project=angular src/app/features/auth/set-password/set-password.component.angular.spec.ts`

Expected: FAIL wegen `CONFIRM_PASSWORD`, `PASSWORD_STRENGTH`, `PASSWORD_MIN_LENGTH`, `PASSWORD_MISMATCH` und `PASSWORDS_MATCH`.

Das Template verwendet `PASSWORD_CONFIRM`, `PASSWORD_STRENGTH_LABEL`, `PASSWORD_LENGTH_ERROR`, `PASSWORD_MATCH_ERROR` und `PASSWORD_MATCH_OK`. Die AGB-Checkbox nutzt den globalen Markenstandard.

Run: `npm run test:landing && npm run test:edge && npx vitest run --project=angular src/app/features/auth/set-password/set-password.component.angular.spec.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add landing public/templates scripts/landing-page.test.mjs supabase/functions/beta-application supabase/functions/_shared/beta-email-* src/app/features/auth/set-password
git commit -m "fix(auth): clarify beta application feedback"
```

### Task 9: Integration, visuelle Kernwege und Discord-Umfangsentscheidung

**Files:**

- Modify: `docs/AI-CHANGELOG.md`
- Modify if findings require it: files from Tasks 1–8, always with a new failing regression test first.

**Interfaces:**

- Consumes: alle Ergebnisse der Tasks 1–8 und Punkt 25 der Designspezifikation.
- Produces: vollständig geprüfter Branch; begründete Empfehlung „Discord noch in diesem PR“ oder „eigener Folge-PR“, ohne Discord-Code vor dieser Entscheidung.

- [ ] **Step 1: Geänderte Dateien formatieren und Diff prüfen**

Run: `npx prettier --write <alle geänderten nicht generierten Dateien>`

Expected: Prettier beendet sich mit Code 0.

Run: `git diff --check`

Expected: keine Ausgabe, Exitcode 0.

Run: `rg -n '\(optional\)|>\s*optional\s*<' src/app landing -g '*.html'`

Expected: keine sichtbaren „optional“-Zusätze in Oberflächentemplates.

- [ ] **Step 2: Zielgerichtete Prüfungen aus allen Tasks erneut ausführen**

Run: `npm run test:node && npm run test:dom && npm run test:angular && npm run test:landing && npm run test:edge`

Expected: alle Suites PASS.

Run: `npm run test:db`

Expected: alle Datenbanktests PASS.

- [ ] **Step 3: Angular-Vorlagen und Produktion prüfen**

Run: `npm run lint && npm run typecheck && npm run build`

Expected: alle drei Befehle Exitcode 0; der Build prüft die Angular-Templates.

- [ ] **Step 4: Kernwege im Browser prüfen**

Manuell beziehungsweise per vorhandener Browserautomatisierung prüfen:

1. Einkauf mit Verkäufer, Quelle, zwei Artikeln und Live-Preisen anlegen.
2. Artikel durch Zeilenklick auswählen und Kostenübersicht ohne Neuladen beobachten.
3. Beleg vor dem Speichern vormerken, nach Erstellung ansehen und entfernen.
4. Einkauf bestellen, ankommen lassen, abschließen und dieselbe Artikeltabelle prüfen.
5. Listen-Leerzustände, Verkäuferzeile, Artikelspalten und Kopfbereich in Desktop/Mobil sowie Hell/Dunkel prüfen.
6. Beta-Bewerbung einschließlich Ladezustand, neutralem Duplikathinweis und Passwortseite prüfen.

Expected: Verhalten entspricht der Designspezifikation; gefundene Abweichungen erhalten zuerst einen fehlschlagenden Regressionstest.

- [ ] **Step 5: Vollständige Verifikation ausführen**

Run: `npm run verify > .superpowers-verify.log 2>&1; $LASTEXITCODE`

Expected: Ausgabe `0`; das Log bestätigt Format, Lint, Typen, Workflows, Edge-, Audit-, Anwendungs-, Landingtests und Produktionsbau.

- [ ] **Step 6: Punkt 25 anhand des realen Umfangs bewerten**

Die Bewertung nennt getrennt: Discord-App/Bot-Einrichtung, OAuth-Callback, serverseitige Secrets, Datenmodell/RLS, Rollenvergabe/-entzug, UI, E-Mail-Link und Tests. Weil diese Grenzen keine Schnittstelle aus Tasks 1–8 wiederverwenden außer dem abgeschlossenen Beta-Status, lautet die Standardempfehlung ein eigener Folge-PR. Nur wenn alle externen Discord-Kennungen und Secrets bereits vorliegen und die vollständige Integration inklusive Sicherheitsprüfung ohne Risiko für den aktuellen PR abgeschlossen werden kann, wird dem Nutzer vor zusätzlichem Code ausdrücklich die Aufnahme in denselben PR empfohlen.

- [ ] **Step 7: Changelog abschließen und Commit**

`docs/AI-CHANGELOG.md` nennt alle umgesetzten Punkte, tatsächlich ausgeführte Prüfungen, bekannte Abweichungen und die Empfehlung zu Punkt 25.

```bash
git add docs/AI-CHANGELOG.md
git commit -m "docs(purchases): record workflow verification"
```

- [ ] **Step 8: Gesamtbranch prüfen lassen**

Mit `superpowers:requesting-code-review` wird ein frischer Gesamtbranch-Review gegen Spezifikation, Plan, Ledger und Merge-Basis erstellt. Kritische oder wichtige Befunde erhalten genau einen testgetriebenen Korrekturdurchlauf; kleinere Hinweise werden vollständig dokumentiert.
