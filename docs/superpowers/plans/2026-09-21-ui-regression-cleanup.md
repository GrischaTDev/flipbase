# UI Regression Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die nach der Einkaufsüberarbeitung gefundenen UI-Regressionen auf Landingpage und Einkaufsoberflächen beheben, ohne Artikel/Bestand, Adresssuche oder Dokumentvorlagen vorwegzunehmen.

**Architecture:** Bestehende fachliche Services und Datenmodelle bleiben erhalten. Die Änderungen liegen in kleinen UI-Komponenten, nutzen vorhandene Signals und Reactive Forms und machen bereits vorhandene Lade-, Steuer- und Verteilungswerte lediglich korrekt sichtbar oder bewusst unsichtbar. Neue Bezugsquellen werden über eine eigenständige, einkaufsspezifische Dialogkomponente angelegt; Druckanpassungen werden über eindeutige Shell-Hooks und einen nur auf der Einkaufsdruckseite wirksamen CSS-Kontext begrenzt.

**Tech Stack:** Angular 22, TypeScript 6, Signals, Reactive Forms, Tailwind CSS 4, Vitest, JSDOM, axe-core, statisches HTML/CSS/JavaScript der Landingpage

**Spec:** `docs/superpowers/specs/2026-09-21-ui-regression-cleanup-design.md`

## Global Constraints

- Vor jeder UI-Änderung gilt `docs/design/admin-ui-guidelines.md`; der Markenakzent bleibt exakt `#fcc601`.
- Angular-Komponenten bleiben standalone, verwenden `ChangeDetectionStrategy.OnPush`, Signals, Reactive Forms und externe HTML-Dateien.
- Tailwind-Klassen stehen direkt im Template; eigenes SCSS wird nur für den druckspezifischen Browserkontext eingesetzt, der sich nicht sinnvoll als einzelne Templateklasse ausdrücken lässt.
- Alle geänderten Dialoge müssen Tastaturfokus, zugängliche Namen und bestehende AXE-Prüfungen erhalten.
- Der Beta-Ablauf ist vollständig paarweise auf Deutsch und Englisch; öffentlich wird kein interner Bewerbungsstatus offengelegt.
- Vorhandene Steuerbehandlungen und Kostenverteilungen bleiben beim Bearbeiten unverändert. Neue Zusatzausgaben verwenden `taxTreatment: null`, bei normalen Einkäufen `allocationMethod: 'by_value'` und bei Mystery-Paketen `allocationMethod: 'by_quantity'`.
- Es gibt keine Datenbankmigration und keine Änderung abgeschlossener Einkaufssnapshots.
- Artikel/Bestand, Sidebar-Umbau, Bezugsquellen-Verwaltungsseite, Adresssuche, Dokumentvorlagen und Discord-OAuth gehören nicht in diesen Pull Request.
- Docker Desktop wird nicht durch die Umsetzung gestartet oder beendet.
- Jede Aufgabe folgt Rot–Grün–Refactor, formatiert nur ihre betroffenen Dateien und endet mit einem eigenen Conventional Commit ohne KI-Signatur.

## File Map

- `landing/index.html`: Ladezustand, Dialogaufbau und zweisprachige Beta-Texte.
- `landing/landing.js`: Zustandswechsel des Beta-Formulars und neutrale Behandlung vorhandener Bewerbungen.
- `scripts/landing-page.test.mjs`: Regressionstests für Landingpage, Ladezustand und Ergebnisdialoge.
- `src/app/shared/components/card/card.component.ts`: stabiler Kartenrahmen ohne Farbüberblendung beim ersten Rendern.
- `src/app/shared/components/card/card.component.angular.spec.ts`: Klassenvertrag für Kartenoberflächen.
- `src/app/features/purchases/components/purchase-documents-card/*`: vertikaler Belegablauf und zugängliche Icon-Aktionen.
- `src/app/features/sellers/components/purchase-seller-dialog/*`: breiter gemeinsamer Verkäuferdialog mit vereinfachter Pflichtfeldlogik.
- `src/app/features/purchases/components/purchase-source-dialog/*`: neuer kleiner Dialog zum Anlegen einer Bezugsquelle.
- `src/app/features/purchases/components/purchase-entry-form/*`: Einbindung des Bezugsquellendialogs und Auswahl des neu angelegten Eintrags.
- `src/app/shared/components/button/*`: explizite Inhaltsausrichtung für vollbreite Textaktionen.
- `src/app/features/purchases/components/purchase-line-editor/*`: garantiert linksbündige Artikelnamen.
- `src/app/features/purchases/components/purchase-cost-editor/*`: flacher Zusatzausgaben-Editor mit unsichtbar erhaltenen technischen Werten.
- `src/app/features/purchases/components/purchase-cost-overview-dialog/*`: eindeutiger Dialogtitel und unveränderter Speichern-Vertrag.
- `src/app/features/purchases/purchases.component.*`: belastbarer Lade-/Leerzustand und begrenzte Beschreibungsspalte.
- `src/app/features/purchases/utils/purchase-status-presentation.*`: zentrale Statuspriorität und unterschiedliche Badge-Töne.
- `src/app/shared/components/record-history/*`: feste rechte Zeitspalte in der Chronik.
- `src/app/layout/shell/shell.component.html`: eindeutige DOM-Hooks für den Einkaufsdruck.
- `src/app/features/purchases/pages/purchase-print/*`: Druckhinweis und druckbarer Beleginhalt.
- `src/styles.css`: ausschließlich auf `app-purchase-print` begrenzte Druckregeln.
- `docs/AI-CHANGELOG.md`: tatsächlich umgesetzte Änderungen und ausgeführte Prüfungen.

---

### Task 1: Beta-Formular und Ergebnisdialoge korrigieren

**Files:**

- Modify: `landing/index.html:547-735, 2890-2977`
- Modify: `landing/landing.js:1-151`
- Test: `scripts/landing-page.test.mjs:458-560`

**Interfaces:**

- Consumes: Edge-Function-Antwort `{ error: 'application_existing' }` mit HTTP 409 sowie `{ receiptEmailSent: boolean }` mit HTTP 2xx.
- Produces: `setSubmitLoading(button: HTMLButtonElement, loading: boolean)`, neutrale Anzeige über `showExistingDialog(email, submitButton)` und vollständig zweisprachige Dialogtexte.

- [ ] **Step 1: Regressionstests für den initialen Ladezustand und die echte Duplikatantwort schreiben**

Erweitere `scripts/landing-page.test.mjs` um konkrete Prüfungen des berechneten CSS-Zustands und des produktiven Fehlercodes:

```js
test('verbirgt den Sendezustand bis zum tatsächlichen Absenden', () => {
  const dom = new JSDOM(html, { url: 'https://flipbase.de/' });
  const loading = dom.window.document.querySelector('[data-beta-submit-loading]');
  const idle = dom.window.document.querySelector('[data-beta-submit-idle]');

  assert.equal(loading.hidden, true);
  assert.equal(dom.window.getComputedStyle(loading).display, 'none');
  assert.equal(idle.hidden, false);
  dom.window.close();
});

test('behandelt den produktiven Duplikatcode als vorhandene Bewerbung', async () => {
  const { dom } = await submitBetaApplication({ error: 'application_existing' }, 409);
  assert.equal(dom.window.document.getElementById('beta-existing-content').hidden, false);
  assert.match(dom.window.document.body.textContent, /Bewerbung bereits vorhanden/u);
  assert.match(dom.window.document.body.textContent, /Application already received/u);
  assert.doesNotMatch(dom.window.document.body.textContent, /abgelehnt|angenommen/iu);
  dom.window.close();
});

test('hält Beta-Formular und Ergebnisdialoge vollständig zweisprachig', () => {
  const document = new JSDOM(html).window.document;
  const betaSurface = document.querySelector('#zweit-bewerbung-form')?.parentElement;
  const dialog = document.getElementById('beta-success-dialog');
  const germanTexts = [...(betaSurface?.querySelectorAll('.lang-de') ?? [])];
  const dialogGermanTexts = [...(dialog?.querySelectorAll('.lang-de') ?? [])];

  assert.ok(germanTexts.length > 0);
  assert.ok(dialogGermanTexts.length > 0);
  for (const german of [...germanTexts, ...dialogGermanTexts]) {
    assert.ok(german.parentElement.querySelector('.lang-en[lang="en"]'));
  }
});
```

Ergänze im bestehenden Erfolgsdialogtest außerdem Prüfungen auf getrennte Textbereiche:

```js
assert.ok(dialog.querySelector('#beta-success-description.beta-dialog-copy'));
assert.ok(dialog.querySelector('.beta-dialog-email strong'));
assert.match(dialog.textContent, /We have received your application/u);
```

- [ ] **Step 2: Landingpage-Test ausführen und den erwarteten Fehler bestätigen**

Run: `npm run test:landing`

Expected: FAIL, weil `.hero-beta-submit-loading` das native `hidden` mit `display: inline-flex` überschreibt und `landing.js` nur `application_exists` erkennt.

- [ ] **Step 3: Ladezustand, Dialogsatz und Duplikatcode minimal korrigieren**

Ergänze in `landing/index.html` direkt nach `.hero-beta-submit-loading`:

```css
.hero-beta-submit-loading[hidden] {
  display: none !important;
}

.beta-dialog-copy {
  max-width: 42ch;
  margin-inline: auto;
  line-height: 1.55;
}

.beta-dialog-email {
  display: block;
  max-width: 100%;
  margin-inline: auto;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
```

Setze `beta-dialog-copy` auf `#beta-success-description`, `#beta-success-receipt` und `#beta-existing-description`. Belasse die E-Mail in ihrem eigenen Absatz. Ändere in `landing/landing.js` ausschließlich die 409-Verzweigung:

```js
var existingApplication =
  payload.error === 'application_existing' || payload.error === 'application_exists';
if (existingApplication) {
  message.textContent = '';
  showExistingDialog(submittedEmail, button);
  return;
}
announce(message, 'error');
```

Der ältere Code `application_exists` bleibt als rückwärtskompatibler Wert erhalten; öffentlich erscheinen für beide Antworten dieselben neutralen Texte.

- [ ] **Step 4: Landingpage vollständig prüfen**

Run: `npm run test:landing`

Expected: PASS; der Ladebereich ist vor dem Absenden unsichtbar, während der offenen Anfrage sichtbar und nach Erfolg, 409, Fehler oder Timeout wieder verborgen.

- [ ] **Step 5: Dateien formatieren und Änderung committen**

```powershell
npx prettier --write landing/index.html landing/landing.js scripts/landing-page.test.mjs
git add landing/index.html landing/landing.js scripts/landing-page.test.mjs
git commit -m "fix(landing): correct beta submission feedback"
```

---

### Task 2: Kartenrahmen beim ersten Rendern stabilisieren

**Files:**

- Modify: `src/app/shared/components/card/card.component.ts:24-39`
- Test: `src/app/shared/components/card/card.component.angular.spec.ts`

**Interfaces:**

- Consumes: die bestehenden Varianten `surface`, `kpi` und `subtle`.
- Produces: ein synchron vollständiges Klassenpaket ohne `transition-colors`; `surface` und `kpi` beginnen mit `border-transparent`, `subtle` mit `border-fb-border-subtle`.

- [ ] **Step 1: Klassenvertrag als fehlschlagenden Test festhalten**

Ergänze den bestehenden Kartentest:

```ts
it('überblendet den Kartenrahmen beim ersten Rendern nicht', () => {
  fixture.componentRef.setInput('variant', 'surface');
  fixture.detectChanges();

  const classes = (fixture.nativeElement as HTMLElement).classList;
  expect(classes).toContain('border-transparent');
  expect(classes).not.toContain('transition-colors');
});
```

- [ ] **Step 2: Gezielt den Kartentest ausführen**

Run: `npx vitest run --project=angular src/app/shared/components/card/card.component.angular.spec.ts`

Expected: FAIL, weil der Host aktuell `transition-colors` enthält und die transparente Rahmenfarbe erst aus `.linear-surface` bezieht.

- [ ] **Step 3: Rahmenfarbe in derselben synchronen Klassenberechnung setzen**

Ändere `cardClasses()` so:

```ts
const base = 'flex flex-col overflow-hidden border';

const variantClasses: Record<CardVariant, string> = {
  surface: 'linear-surface border-transparent bg-fb-surface shadow-sm',
  kpi: 'linear-kpi border-transparent bg-fb-surface shadow-sm',
  subtle: 'border-fb-border-subtle bg-fb-subtle',
};
```

Keine globale Animation wird entfernt. Nur der Rahmen der Card-Komponente wechselt beim Initialisieren nicht mehr zwischen Browserfarbe und Themefarbe.

- [ ] **Step 4: Karten- und Einkaufserfassungstests ausführen**

Run: `npx vitest run --project=angular src/app/shared/components/card/card.component.angular.spec.ts src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.angular.spec.ts`

Expected: PASS.

- [ ] **Step 5: Änderung committen**

```powershell
npx prettier --write src/app/shared/components/card/card.component.ts src/app/shared/components/card/card.component.angular.spec.ts
git add src/app/shared/components/card/card.component.ts src/app/shared/components/card/card.component.angular.spec.ts
git commit -m "fix(ui): stabilize card borders during render"
```

---

### Task 3: Belegkarte auf Auswahlfläche und Icon-Aktionen reduzieren

**Files:**

- Modify: `src/app/features/purchases/components/purchase-documents-card/purchase-documents-card.component.ts:1-132`
- Modify: `src/app/features/purchases/components/purchase-documents-card/purchase-documents-card.component.html:1-113`
- Test: `src/app/features/purchases/components/purchase-documents-card/purchase-documents-card.component.angular.spec.ts`

**Interfaces:**

- Consumes: `PurchaseDocumentService.upload`, `PurchaseDocumentService.remove`, `PurchaseDocumentPreviewDialogComponent` und das bestehende `documentTypeControl`.
- Produces: dieselbe Upload-/Entfernen-Funktionalität über eine vollbreite Dropzone sowie `LucideEye`- und `LucideTrash2`-Aktionen mit `aria-label`.

- [ ] **Step 1: Den gewünschten DOM-Vertrag testen**

Lies das Template im bestehenden Test ein und ergänze:

```ts
import { readFileSync } from 'node:fs';
import axe from 'axe-core';

it('ordnet Belegart, Ablagefläche und Dateiliste vertikal ohne Zusatzknopf an', () => {
  const template = readFileSync(
    'src/app/features/purchases/components/purchase-documents-card/purchase-documents-card.component.html',
    'utf8',
  );

  expect(template).not.toContain('data-add-document');
  expect(template.indexOf('data-document-type')).toBeLessThan(
    template.indexOf('data-document-drop-zone'),
  );
  expect(template).toContain('Hier klicken, um eine Datei auszuwählen, oder Datei hier ablegen');
  expect(template).toContain('aria-label="Beleg ansehen"');
  expect(template).toContain('aria-label="Beleg entfernen"');
  expect(template).toContain('hover:text-fb-success');
  expect(template).toContain('hover:text-fb-critical');
});
```

Ergänze `imports: [PurchaseDocumentsCardComponent]` in der bestehenden `TestBed.configureTestingModule`-Konfiguration und füge einen AXE-Test für eine gerenderte Karte mit einem gespeicherten Beleg hinzu:

```ts
it('bleibt mit Icon-Aktionen barrierefrei', async () => {
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(PurchaseDocumentsCardComponent);
  fixture.componentRef.setInput('purchase', openPurchase);
  fixture.detectChanges();

  const results = await axe(fixture.nativeElement as HTMLElement);
  expect(results.violations).toEqual([]);
});
```

- [ ] **Step 2: Belegkartentest ausführen und den Fehler bestätigen**

Run: `npx vitest run --project=angular src/app/features/purchases/components/purchase-documents-card/purchase-documents-card.component.angular.spec.ts`

Expected: FAIL, weil Auswahl und Zusatzknopf im Kartenheader stehen und die Aktionen Textschaltflächen sind.

- [ ] **Step 3: Komponente und Template vereinfachen**

Importiere `LucideDynamicIcon`, `LucideEye` und `LucideTrash2` und stelle die Icons bereit:

```ts
readonly previewIcon = LucideEye;
readonly removeIcon = LucideTrash2;
```

Verschiebe das Dateifeld, die beschriftete Auswahl und die Dropzone in den Karteninhalt. Die Dropzone bleibt ein echtes `<button type="button">` und löst weiterhin `fileInput.click()` aus:

```html
<div data-document-type class="space-y-1.5">
  <span class="block text-[13px] font-semibold text-fb-text-primary">Belegart</span>
  <app-custom-select
    [formControl]="documentTypeControl"
    [options]="documentTypeOptions"
    ariaLabel="Belegart auswählen"
    widthClass="w-full"
  />
</div>

<button
  type="button"
  data-document-drop-zone
  class="w-full cursor-pointer rounded-lg border border-dashed border-fb-border bg-fb-subtle px-4 py-5 text-center text-[13px] text-fb-text-muted hover:border-fb-primary hover:bg-fb-surface-hover focus-visible:outline-2 focus-visible:outline-fb-primary"
  [disabled]="isUploading()"
  (click)="fileInput.click()"
  (dragover)="onDragOver($event)"
  (drop)="onDrop($event)"
>
  {{ isUploading() ? 'Beleg wird hochgeladen …' : 'Hier klicken, um eine Datei auszuwählen, oder
  Datei hier ablegen' }}
</button>
```

Ersetze die gespeicherten Textaktionen durch native Icon-Schaltflächen:

```html
<button
  type="button"
  aria-label="Beleg ansehen"
  class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fb-text-muted hover:bg-fb-success-surface hover:text-fb-success focus-visible:outline-2 focus-visible:outline-fb-primary"
  (click)="previewDocument.set(row.document)"
>
  <svg [lucideIcon]="previewIcon" class="h-4 w-4" aria-hidden="true"></svg>
</button>
<button
  type="button"
  aria-label="Beleg entfernen"
  class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fb-text-muted hover:bg-fb-critical-surface hover:text-fb-critical focus-visible:outline-2 focus-visible:outline-fb-critical"
  (click)="removeDocument(row.document)"
>
  <svg [lucideIcon]="removeIcon" class="h-4 w-4" aria-hidden="true"></svg>
</button>
```

Nutze dieselbe rote Papierkorbaktion für vorgemerkte Dateien; „Erneut versuchen“ bleibt bei Uploadfehlern als Textaktion sichtbar.

- [ ] **Step 4: Belegkarte einschließlich AXE erneut prüfen**

Run: `npx vitest run --project=angular src/app/features/purchases/components/purchase-documents-card/purchase-documents-card.component.angular.spec.ts`

Expected: PASS.

- [ ] **Step 5: Änderung committen**

```powershell
npx prettier --write src/app/features/purchases/components/purchase-documents-card
git add src/app/features/purchases/components/purchase-documents-card
git commit -m "fix(purchases): simplify purchase document controls"
```

---

### Task 4: Verkäuferdialog verbreitern und Pflichtfeldlogik vereinfachen

**Files:**

- Modify: `src/app/features/sellers/components/purchase-seller-dialog/purchase-seller-dialog.component.ts:1-180`
- Modify: `src/app/features/sellers/components/purchase-seller-dialog/purchase-seller-dialog.component.html:1-153`
- Test: `src/app/features/sellers/components/purchase-seller-dialog/purchase-seller-dialog.component.angular.spec.ts`

**Interfaces:**

- Consumes: `SuppliersService.createSupplier`, `SuppliersService.updateSupplier`, `ModalShellComponent`, `TextFieldComponent`, `CustomSelectComponent` und `IntlTelInput`.
- Produces: unveränderte Outputs `created`, `saved`, `closed`; Speichern ist nur bei `form.valid`, einem nichtleeren getrimmten Namen und `saving() === false` möglich.

- [ ] **Step 1: Dialogstruktur und Schaltzustand testen**

Ergänze die Verkäufertests:

```ts
it('nutzt den breiten gemeinsamen Dialog ohne redundante Hinweistexte', () => {
  const { fixture } = render();
  const host = fixture.nativeElement as HTMLElement;

  expect(host.querySelector('app-modal-shell')).not.toBeNull();
  expect(host.textContent).not.toContain('Weitere Angaben können leer bleiben');
  expect(host.textContent).not.toContain('Bitte einen Namen angeben');
  expect(host.textContent).toContain('Land/Region');
  expect(host.querySelector('[data-seller-street]')?.classList).toContain('sm:col-span-2');
  expect(host.querySelector('[data-seller-address-extra]')?.classList).toContain('sm:col-span-2');
});

it('aktiviert Speichern erst bei einem gültigen Namen und gültigen optionalen Feldern', () => {
  const { fixture } = render();
  const component = fixture.componentInstance;
  const save = fixture.nativeElement.querySelector('[data-save-seller] button');

  expect(save.disabled).toBe(true);
  component.form.controls.name.setValue('Ada Beispiel');
  fixture.detectChanges();
  expect(save.disabled).toBe(false);
  component.form.controls.email.setValue('ungueltig');
  fixture.detectChanges();
  expect(save.disabled).toBe(true);
});
```

- [ ] **Step 2: Verkäuferdialogtest ausführen**

Run: `npx vitest run --project=angular src/app/features/sellers/components/purchase-seller-dialog/purchase-seller-dialog.component.angular.spec.ts`

Expected: FAIL, weil der Dialog noch eine eigene `max-w-xl`-Hülle, die beiden Hinweistexte und ein trotz leerem Namen aktiv wirkendes Speichern verwendet.

- [ ] **Step 3: Gemeinsamen Dialog und eindeutiges Formular umsetzen**

Ersetze `ModalDialogDirective` durch `ModalShellComponent`, `ButtonComponent` und `TextFieldComponent`. Schärfe den Namenvalidator:

```ts
name: new FormControl('', {
  nonNullable: true,
  validators: [Validators.required, Validators.pattern(/\S/u)],
}),

saveDisabled(): boolean {
  return this.saving() || this.form.invalid || this.form.controls.name.value.trim().length === 0;
}
```

Baue das Template mit `size="xl"` und Footer-Aktionen auf:

```html
<app-modal-shell [title]="dialogTitle()" size="xl" (closed)="closed.emit()">
  <form id="seller-form" class="space-y-4" [formGroup]="form" (ngSubmit)="save()">
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <span class="mb-1.5 block text-[13px] font-semibold">Art</span>
        <app-custom-select
          triggerId="seller-type"
          ariaLabel="Verkäuferart"
          formControlName="seller_type"
          [options]="sellerTypeOptions"
        />
      </div>
      <app-text-field
        id="seller-name"
        [label]="form.controls.seller_type.value === 'business' ? 'Firmenname' : 'Vor- und Nachname'"
        formControlName="name"
        [required]="true"
      />
      @if (form.controls.seller_type.value === 'business') {
      <app-text-field label="Kontaktperson" formControlName="contact_person" />
      }
      <div data-seller-street class="sm:col-span-2">
        <app-text-field label="Straße und Hausnummer" formControlName="street" />
      </div>
      <div data-seller-address-extra class="sm:col-span-2">
        <app-text-field label="Adresszusatz" formControlName="address_extra" />
      </div>
      <app-text-field label="Postleitzahl" formControlName="postal_code" />
      <app-text-field label="Ort" formControlName="city" />
      <div>
        <span class="mb-1.5 block text-[13px] font-semibold">Land/Region</span>
        <app-custom-select
          triggerId="seller-country"
          ariaLabel="Land/Region"
          formControlName="country_code"
          [options]="countryOptions"
        />
      </div>
      <app-text-field
        label="E-Mail"
        type="email"
        formControlName="email"
        [error]="form.controls.email.invalid && form.controls.email.touched ? 'Bitte eine gültige E-Mail-Adresse angeben.' : null"
      />
      <div class="sm:col-span-2">
        <label for="seller-phone" class="mb-1.5 block text-[13px] font-semibold">Telefon</label>
        <intl-tel-input
          data-phone-input
          formControlName="phone"
          class="block w-full"
          containerClass="w-full"
          countryNameLocale="de"
          initialCountry="de"
          [dropdownParent]="phoneDropdownParent"
          [inputAttributes]="phoneInputAttributes()"
          [separateDialCode]="true"
          [showFlags]="true"
          [strictMode]="true"
          [uiTranslations]="phoneTranslations"
        />
      </div>
      @if (form.controls.seller_type.value === 'business') {
      <app-text-field label="Website" type="url" formControlName="website" />
      }
      <div class="sm:col-span-2">
        <app-text-field label="Notiz" formControlName="notes" [multiline]="3" />
      </div>
    </div>
    @if (error()) {
    <p role="alert" class="text-sm text-fb-critical">{{ error() }}</p>
    }
  </form>
  <app-button modal-footer variant="secondary" [disabled]="saving()" (clicked)="closed.emit()">
    Abbrechen
  </app-button>
  <app-button
    modal-footer
    data-save-seller
    variant="primary"
    [loading]="saving()"
    [disabled]="saveDisabled()"
    (clicked)="save()"
  >
    Speichern
  </app-button>
</app-modal-shell>
```

Das Länderauswahlfeld erhält sichtbar und als `ariaLabel` den Text `Land/Region`. Die konkrete E-Mail-Meldung bleibt ausschließlich sichtbar, wenn eine ausgefüllte E-Mail ungültig und berührt ist. Entferne die zweite manuelle Leernamenprüfung aus `save()`, da Validator und getrimmter Schaltzustand denselben Vertrag abdecken; `save()` prüft weiterhin defensiv `form.invalid`.

- [ ] **Step 4: Verkäuferdialog einschließlich AXE prüfen**

Run: `npx vitest run --project=angular src/app/features/sellers/components/purchase-seller-dialog/purchase-seller-dialog.component.angular.spec.ts`

Expected: PASS; bestehende Anlage- und Bearbeitungstests bleiben grün.

- [ ] **Step 5: Änderung committen**

```powershell
npx prettier --write src/app/features/sellers/components/purchase-seller-dialog
git add src/app/features/sellers/components/purchase-seller-dialog
git commit -m "fix(purchases): streamline seller dialog"
```

---

### Task 5: Bezugsquelle in einem eigenen Dialog anlegen

**Files:**

- Create: `src/app/features/purchases/components/purchase-source-dialog/purchase-source-dialog.component.ts`
- Create: `src/app/features/purchases/components/purchase-source-dialog/purchase-source-dialog.component.html`
- Create: `src/app/features/purchases/components/purchase-source-dialog/purchase-source-dialog.component.angular.spec.ts`
- Modify: `src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.ts:1-305, 420-438`
- Modify: `src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.html:8-62, 121-126`
- Modify: `src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.angular.spec.ts:300-340, 1268-1284, 1353-1447`

**Interfaces:**

- Consumes: `SourcesService.createSource(name: string): Promise<{ data: Source | null; error: Error | null }>`.
- Produces: `PurchaseSourceDialogComponent.created: OutputEmitterRef<Source>`, `closed: OutputEmitterRef<void>`, `form: FormGroup<{ name: FormControl<string> }>` und `hasUnsavedChanges(): boolean`.
- Produces in parent: `onSourceCreated(source: Source): void`, das `source_id` setzt, das Einkaufsformular dirty markiert und den Dialog schließt.

- [ ] **Step 1: Neue Dialogtests und Elternintegration zuerst schreiben**

Erstelle die Komponententests mit folgenden Kernfällen:

```ts
const createdSource: Source = {
  id: 'source-1',
  workspace_id: 'workspace-1',
  name: 'Flohmarkt Berlin',
};
const createSource = vi.fn(async () => ({ data: createdSource, error: null }));

function renderSourceDialog() {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({
    imports: [PurchaseSourceDialogComponent],
    providers: [{ provide: SourcesService, useValue: { createSource } }],
  }).createComponent(PurchaseSourceDialogComponent);
  const created = vi.spyOn(fixture.componentInstance.created, 'emit');
  const closed = vi.spyOn(fixture.componentInstance.closed, 'emit');
  fixture.detectChanges();
  return { fixture, created, closed };
}

it('deaktiviert Speichern bis zu einem nichtleeren Namen', () => {
  const { fixture } = renderSourceDialog();
  const save = fixture.nativeElement.querySelector<HTMLButtonElement>('[data-save-source] button');
  expect(save?.disabled).toBe(true);

  fixture.componentInstance.form.controls.name.setValue('Flohmarkt Berlin');
  fixture.detectChanges();
  expect(save?.disabled).toBe(false);
});

it('behält Eingabe und Dialog bei einem Speicherfehler', async () => {
  createSource.mockResolvedValue({ data: null, error: new Error('Offline') });
  const { fixture, closed } = renderSourceDialog();
  fixture.componentInstance.form.controls.name.setValue('Flohmarkt Berlin');

  await fixture.componentInstance.save();

  expect(fixture.componentInstance.error()).toBe('Offline');
  expect(fixture.componentInstance.form.controls.name.value).toBe('Flohmarkt Berlin');
  expect(closed).not.toHaveBeenCalled();
});

it('gibt die gespeicherte Bezugsquelle an das Elternformular aus', async () => {
  const { fixture, created } = renderSourceDialog();
  fixture.componentInstance.form.controls.name.setValue('Flohmarkt Berlin');
  await fixture.componentInstance.save();
  expect(created).toHaveBeenCalledWith(expect.objectContaining({ id: 'source-1' }));
});
```

Ändere den Einkaufserfassungstest so, dass das Template `actionLabel="Bezugsquelle erstellen"` und `<app-purchase-source-dialog>` erwartet und keinen eingebetteten `new-purchase-source`-Block mehr enthält. Teste `onSourceCreated` direkt:

```ts
komponente.onSourceCreated({ id: 'source-1', workspace_id: 'workspace-1', name: 'Flohmarkt' });
expect(komponente.form.controls.source_id.value).toBe('source-1');
expect(komponente.sourceDialogOpen()).toBe(false);
expect(komponente.form.dirty).toBe(true);
```

- [ ] **Step 2: Neue und betroffene Tests ausführen**

Run: `npx vitest run --project=angular src/app/features/purchases/components/purchase-source-dialog/purchase-source-dialog.component.angular.spec.ts src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.angular.spec.ts`

Expected: FAIL, weil die Dialogkomponente fehlt und die Schnellerfassung noch eingebettet ist.

- [ ] **Step 3: Bezugsquellendialog implementieren**

Die neue Komponente verwendet diesen Vertrag:

```ts
@Component({
  selector: 'app-purchase-source-dialog',
  imports: [ReactiveFormsModule, ModalShellComponent, TextFieldComponent, ButtonComponent],
  templateUrl: './purchase-source-dialog.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseSourceDialogComponent {
  private readonly sources = inject(SourcesService);

  readonly created = output<Source>();
  readonly closed = output<void>();
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/u)],
    }),
  });

  hasUnsavedChanges(): boolean {
    return this.form.dirty && this.form.controls.name.value.trim().length > 0;
  }

  async save(): Promise<void> {
    if (this.saving() || this.form.invalid) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const result = await this.sources.createSource(this.form.controls.name.value.trim());
      if (result.error || !result.data) {
        this.error.set(result.error?.message ?? 'Bezugsquelle konnte nicht gespeichert werden.');
        return;
      }
      this.created.emit(result.data);
    } catch (cause: unknown) {
      this.error.set(
        cause instanceof Error ? cause.message : 'Bezugsquelle konnte nicht gespeichert werden.',
      );
    } finally {
      this.saving.set(false);
    }
  }
}
```

Das Template besteht aus `ModalShellComponent` mit Titel `Bezugsquelle erstellen`, genau einem Pflichtfeld `Name`, einem Alert innerhalb des Dialogs sowie Abbrechen und `Bezugsquelle speichern`. Die Speichern-Aktion ist an `saving() || form.invalid` gebunden.

- [ ] **Step 4: Eingebetteten Block durch Dialogintegration ersetzen**

Im Parent:

```ts
readonly sourceDialogOpen = signal(false);
readonly sourceDialog = viewChild(PurchaseSourceDialogComponent);

onSourceCreated(source: Source): void {
  this.form.controls.source_id.setValue(source.id);
  this.form.markAsDirty();
  this.sourceDialogOpen.set(false);
}
```

Entferne `isAddingSource`, `newSourceName`, `newSourceControl`, `onNewSourceInput`, `cancelNewSource` und `saveNewSource`. Ersetze den Auswahltext durch `Bezugsquelle` und `Bezugsquelle erstellen`. Ergänze am Templateende:

```html
@if (sourceDialogOpen()) {
<app-purchase-source-dialog
  (closed)="sourceDialogOpen.set(false)"
  (created)="onSourceCreated($event)"
/>
}
```

`hasUnsavedChanges()` berücksichtigt `this.sourceDialog()?.hasUnsavedChanges() ?? false` statt `newSourceName()`.

- [ ] **Step 5: Dialog, Integration und AXE prüfen**

Run: `npx vitest run --project=angular src/app/features/purchases/components/purchase-source-dialog/purchase-source-dialog.component.angular.spec.ts src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.angular.spec.ts`

Expected: PASS; die neue Bezugsquelle ist unmittelbar ausgewählt, Fehler schließen den Dialog nicht.

- [ ] **Step 6: Änderung committen**

```powershell
npx prettier --write src/app/features/purchases/components/purchase-source-dialog src/app/features/purchases/components/purchase-entry-form
git add src/app/features/purchases/components/purchase-source-dialog src/app/features/purchases/components/purchase-entry-form
git commit -m "fix(purchases): move source creation into dialog"
```

---

### Task 6: Artikelnamen in Einkaufspositionen tatsächlich linksbündig machen

**Files:**

- Modify: `src/app/shared/components/button/button.component.ts:1-76`
- Test: `src/app/shared/components/button/button.component.angular.spec.ts`
- Modify: `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.html:50-60`
- Test: `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.angular.spec.ts`

**Interfaces:**

- Produces: neuer Button-Input `contentAlign: InputSignal<'center' | 'start'>`, Standardwert `center`.
- Consumes: Der Artikelnamen-Button setzt `[contentAlign]="'start'"`; alle anderen Buttons behalten ohne Änderung die zentrierte Ausrichtung.

- [ ] **Step 1: Shared-Button und Positionszeile testen**

Ergänze im Button-Test:

```ts
it('richtet vollbreiten Text bei contentAlign start links aus', () => {
  fixture.componentRef.setInput('fullWidth', true);
  fixture.componentRef.setInput('contentAlign', 'start');
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector('button');
  expect(button.classList).toContain('justify-start');
  expect(button.classList).toContain('text-left');
  expect(button.classList).not.toContain('justify-center');
});
```

Verschärfe im Line-Editor-Test die Prüfung auf das tatsächlich gerenderte innere `<button>`:

```ts
const productButton = host.querySelector<HTMLButtonElement>('[data-purchase-line-title] button');
expect(productButton?.classList).toContain('justify-start');
expect(productButton?.classList).toContain('text-left');
```

Ergänze `contentAlign` außerdem in den Test-Metadatenlisten beider Dateien direkt neben `fullWidth`, damit der Angular-Fallback-Compiler den neuen Signal-Input genauso behandelt wie die vorhandenen Button-Inputs.

- [ ] **Step 2: Beide Tests ausführen**

Run: `npx vitest run --project=angular src/app/shared/components/button/button.component.angular.spec.ts src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.angular.spec.ts`

Expected: FAIL, weil die interne Buttonfläche weiterhin `justify-center` verwendet.

- [ ] **Step 3: Ausrichtungsinput implementieren und nutzen**

Ergänze in `ButtonComponent`:

```ts
readonly contentAlign = input<'center' | 'start'>('center');
```

Entferne `justify-center` aus `base` und füge in `buttonClasses()` hinzu:

```ts
const alignment = this.contentAlign() === 'start' ? 'justify-start text-left' : 'justify-center';

return [base, alignment, width, variantStyles[this.variant()], sizeStyles[this.size()]]
  .filter(Boolean)
  .join(' ');
```

Setze im Line-Editor:

```html
<app-button
  data-purchase-line-title
  variant="plain"
  [fullWidth]="true"
  contentAlign="start"
  [title]="row.controls.titleSnapshot.value"
  [ariaLabel]="row.controls.titleSnapshot.value + ' – Details'"
  (clicked)="openDetails(id)"
>
  <span class="w-full break-words text-left">
    {{ row.controls.titleSnapshot.value || 'Produkt zuordnen' }}
  </span>
</app-button>
```

- [ ] **Step 4: Shared- und Featuretests erneut ausführen**

Run: `npx vitest run --project=angular src/app/shared/components/button/button.component.angular.spec.ts src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.angular.spec.ts`

Expected: PASS.

- [ ] **Step 5: Änderung committen**

```powershell
npx prettier --write src/app/shared/components/button src/app/features/purchases/components/purchase-line-editor
git add src/app/shared/components/button src/app/features/purchases/components/purchase-line-editor
git commit -m "fix(purchases): left-align purchase line titles"
```

---

### Task 7: Kosteneditor auf Zusatzausgabe und Betrag reduzieren

**Files:**

- Modify: `src/app/features/purchases/components/purchase-cost-editor/purchase-cost-editor.component.ts:1-263`
- Modify: `src/app/features/purchases/components/purchase-cost-editor/purchase-cost-editor.component.html:1-146`
- Modify: `src/app/features/purchases/components/purchase-cost-editor/purchase-cost-editor.component.angular.spec.ts:120-230`
- Modify: `src/app/features/purchases/components/purchase-cost-overview-dialog/purchase-cost-overview-dialog.component.html:1`
- Test: `src/app/features/purchases/components/purchase-cost-overview-dialog/purchase-cost-overview-dialog.component.angular.spec.ts`

**Interfaces:**

- Consumes: `PurchaseCostAdjustmentRow` mit weiterhin vorhandenen Feldern `taxTreatment`, `allocationMethod`, `targetPurchaseLineId` und `sourceCost`.
- Produces: sichtbare Felder nur für `adjustment` und `amount`; Serialisierung bewahrt unsichtbare Werte bestehender Zeilen und verwendet die bereits definierten Standardwerte neuer Zeilen.

- [ ] **Step 1: Reduzierten sichtbaren Vertrag und Werterhalt testen**

Ersetze die bisherigen Sichtbarkeitstests durch:

```ts
it('zeigt nur Zusatzausgabe, Betrag und Entfernen', async () => {
  const fixture = await createEditor();
  const host = fixture.nativeElement as HTMLElement;

  expect(host.textContent).toContain('Zusatzausgabe');
  expect(host.textContent).toContain('Betrag');
  expect(host.textContent).not.toContain('Wer hat diese Kosten berechnet?');
  expect(host.textContent).not.toContain('Verteilung ändern');
  expect(host.textContent).not.toContain('Zielposition');
  expect(host.querySelector('[aria-label="Zusatzausgabe 1"]')).not.toBeNull();
  expect(findButton(host, 'Zusatzausgabe hinzufügen').disabled).toBe(true);
});

it('bewahrt unsichtbare Steuer- und Zuordnungswerte vorhandener Kosten', async () => {
  const fixture = await createEditor('lot', [{ value: 'line-1', label: 'Kamera' }]);
  fixture.componentRef.setInput('initialCosts', [
    {
      type: 'shipping',
      amount: 8,
      description: 'Versandkosten',
      taxTreatment: 'expense',
      allocationMethod: 'direct',
      targetPurchaseLineId: 'line-1',
    },
  ]);
  const changed = vi.fn();
  fixture.componentInstance.costsChanged.subscribe(changed);
  fixture.detectChanges();

  fixture.componentInstance.costRows.at(0).controls.amount.setValue(9);

  expect(changed).toHaveBeenLastCalledWith([
    expect.objectContaining({
      amount: 9,
      taxTreatment: 'expense',
      allocationMethod: 'direct',
      targetPurchaseLineId: 'line-1',
    }),
  ]);
});
```

Prüfe zusätzlich für eine neue normale Zeile `taxTreatment: null`, `allocationMethod: 'by_value'` und für Mystery `allocationMethod: 'by_quantity'`.

- [ ] **Step 2: Kosteneditortests ausführen**

Run: `npx vitest run --project=angular src/app/features/purchases/components/purchase-cost-editor/purchase-cost-editor.component.angular.spec.ts src/app/features/purchases/components/purchase-cost-overview-dialog/purchase-cost-overview-dialog.component.angular.spec.ts`

Expected: FAIL, weil Steuerherkunft und Verteilung sichtbar sind und die Oberfläche noch „Anpassung“ nennt.

- [ ] **Step 3: Sichtbare Felder entfernen, interne Formwerte erhalten**

Entferne aus dem Template den gesamten Block unterhalb der Zeile, der `taxTreatment`, `allocationMethod` und `targetPurchaseLineId` darstellt. Benenne ausschließlich sichtbare Texte und Aria-Namen um:

```html
<div
  class="grid grid-cols-[minmax(0,1fr)_2.25rem] gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,1fr)_2.25rem] sm:items-center"
>
  <div class="min-w-0">
    <span class="mb-1 block text-[12px] font-semibold text-fb-text-secondary sm:hidden">
      Zusatzausgabe
    </span>
    <app-custom-select
      [ariaLabel]="'Zusatzausgabe ' + (index + 1)"
      [options]="adjustmentOptions"
      formControlName="adjustment"
      placeholder="Auswählen"
      size="sm"
    />
  </div>
  <div class="min-w-0 max-sm:col-start-1">
    <span class="mb-1 block text-[12px] font-semibold text-fb-text-secondary sm:hidden">
      Betrag
    </span>
    <app-number-input
      formControlName="amount"
      placeholder="0,00"
      [ariaLabel]="'Betrag ' + (index + 1)"
      [step]="0.01"
      [min]="0"
      unit="€"
      [asCurrency]="true"
      [showStepper]="false"
    />
  </div>
  <button
    type="button"
    [attr.aria-label]="'Zusatzausgabe ' + (index + 1) + ' entfernen'"
    class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fb-text-muted hover:bg-fb-critical-surface hover:text-fb-critical focus-visible:outline-2 focus-visible:outline-fb-critical"
    (click)="removeCostRow(index)"
  >
    <svg [lucideIcon]="removeIcon" class="h-4 w-4" aria-hidden="true"></svg>
  </button>
</div>
```

Die Hinzufügen-Aktion lautet `Zusatzausgabe hinzufügen`. Entferne aus der TypeScript-Klasse nur nun unbenutzte UI-Zustände und Optionen (`expandedAllocations`, `taxTreatmentOptions`, `allocationOptions`, `toggleAllocationDetails`, `isAllocationExpanded`, `onAllocationMethodChanged`). Behalte die FormControls, `clearMissingDirectTargets`, `configureTargetRequirement`, `normalizeRow` und die Serialisierung unverändert, damit vorhandene technische Werte nicht verloren gehen.

Da der Papierkorb nun direkt ein Lucide-SVG rendert, nimm `LucideDynamicIcon` in die Angular-Imports der Komponente auf; `LucideTrash2` ersetzt das bisherige `LucideX` als `removeIcon`.

Ändere den Dialogtitel in `purchase-cost-overview-dialog.component.html` zu `Zusatzausgaben verwalten`.

- [ ] **Step 4: Kostenlogik und Dialog erneut prüfen**

Run: `npx vitest run --project=angular src/app/features/purchases/components/purchase-cost-editor/purchase-cost-adjustments.spec.ts src/app/features/purchases/components/purchase-cost-editor/purchase-cost-editor.component.angular.spec.ts src/app/features/purchases/components/purchase-cost-overview-dialog/purchase-cost-overview-dialog.component.angular.spec.ts src/app/features/purchases/components/purchase-cost-summary/purchase-cost-summary.component.angular.spec.ts`

Expected: PASS; Rabatt bleibt getrennt, vorhandene Direktzuordnungen bleiben erhalten und die Kostenübersicht zeigt keine Nullrubrik.

- [ ] **Step 5: Änderung committen**

```powershell
npx prettier --write src/app/features/purchases/components/purchase-cost-editor src/app/features/purchases/components/purchase-cost-overview-dialog
git add src/app/features/purchases/components/purchase-cost-editor src/app/features/purchases/components/purchase-cost-overview-dialog
git commit -m "fix(purchases): simplify additional expense editor"
```

---

### Task 8: Einkaufsliste zwischen Laden, Leerstand und Filtertreffer unterscheiden

**Files:**

- Modify: `src/app/features/purchases/purchases.component.ts:87-132`
- Modify: `src/app/features/purchases/purchases.component.html:30-175`
- Modify: `src/app/features/purchases/purchases.component.angular.spec.ts:120-390`

**Interfaces:**

- Consumes: `PurchaseService.isLoading: Signal<boolean>`, `PurchaseService.loadedWorkspaceId: Signal<string | null>`, `WorkspaceService.currentWorkspace`.
- Produces: `isPurchaseListLoading: Signal<boolean>`; der Leerzustand ist erst nach einem bestätigten Laden des aktiven Workspace sichtbar.

- [ ] **Step 1: Ladewechsel und lange Beschreibung als Regressionstests ergänzen**

Erweitere den Service-Stub um steuerbare Signale und teste beide Zustände:

```ts
const purchaseLoading = signal(false);
const loadedPurchaseWorkspaceId = signal<string | null>(workspaceId);
const currentWorkspace = signal({ id: workspaceId });

// PurchaseService stub
useValue: {
  purchases: purchaseState,
  isLoading: purchaseLoading,
  loadedWorkspaceId: loadedPurchaseWorkspaceId,
},
```

```ts
it('zeigt beim ersten Laden und Workspacewechsel nur den Ladezustand', () => {
  purchaseState.set([]);
  purchaseLoading.set(true);
  loadedPurchaseWorkspaceId.set(null);
  const fixture = TestBed.createComponent(PurchasesComponent);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;

  expect(host.querySelector('[data-data-table-loading]')).not.toBeNull();
  expect(host.textContent).not.toContain('Keine Einkäufe vorhanden');
  expect(host.textContent).not.toContain('Keine passenden Einkäufe');
});

it('begrenzt lange Beschreibungen auf eine Zeile und hält den Volltext bereit', () => {
  const longText = 'Sehr lange Beschreibung '.repeat(20).trim();
  purchaseState.set([{ ...purchases[0], notes: longText, title: longText }]);
  const fixture = TestBed.createComponent(PurchasesComponent);
  fixture.detectChanges();
  const description = fixture.nativeElement.querySelector('[data-purchase-description] span');

  expect(description.classList).toContain('truncate');
  expect(description.getAttribute('title')).toBe(longText);
  expect(description.textContent.trim()).toBe(longText);
});
```

- [ ] **Step 2: Einkaufslistentest ausführen**

Run: `npx vitest run --project=angular src/app/features/purchases/purchases.component.angular.spec.ts`

Expected: FAIL, weil `app-data-table` kein `loading` erhält und die Beschreibung direkt im unbeschränkten Tabellenfeld steht.

- [ ] **Step 3: Ladevertrag und Beschreibungsspalte anbinden**

Ergänze in `PurchasesComponent`:

```ts
readonly isPurchaseListLoading = computed(() => {
  const workspaceId = this.workspaceService.currentWorkspace()?.id ?? null;
  if (workspaceId === null) return false;
  return (
    this.purchaseService.isLoading() ||
    this.purchaseService.loadedWorkspaceId() !== workspaceId
  );
});

readonly emptyTitle = computed(() =>
  this.hasPurchases() ? 'Keine passenden Einkäufe' : 'Keine Einkäufe vorhanden',
);
```

Binde am bestehenden `<app-data-table>` die beiden Ladeattribute ein und begrenze den Beschreibungstext:

```html
[loading]="isPurchaseListLoading()" loadingText="Einkäufe werden geladen …"
```

```html
<td data-purchase-description class="max-w-72">
  <span class="block max-w-72 truncate" [title]="row.title">{{ row.title || '—' }}</span>
</td>
```

Der DOM enthält weiterhin den vollständigen Text für Screenreader; `title` stellt ihn zusätzlich per Maus-Hinweis bereit. Aktionen für ersten Einkauf, Filterrücksetzung und Archiv werden während `isPurchaseListLoading()` nicht eingeblendet.

- [ ] **Step 4: Einkaufslistentest einschließlich AXE erneut ausführen**

Run: `npx vitest run --project=angular src/app/features/purchases/purchases.component.angular.spec.ts`

Expected: PASS; weder alter Workspaceinhalt noch ein falscher Leerzustand erscheinen im Ladefenster.

- [ ] **Step 5: Änderung committen**

```powershell
npx prettier --write src/app/features/purchases/purchases.component.ts src/app/features/purchases/purchases.component.html src/app/features/purchases/purchases.component.angular.spec.ts
git add src/app/features/purchases/purchases.component.ts src/app/features/purchases/purchases.component.html src/app/features/purchases/purchases.component.angular.spec.ts
git commit -m "fix(purchases): distinguish loading and empty states"
```

---

### Task 9: Einkaufsstatus nach fachlichem Fortschritt priorisieren

**Files:**

- Modify: `src/app/features/purchases/utils/purchase-status-presentation.ts:1-34`
- Modify: `src/app/features/purchases/utils/purchase-status-presentation.spec.ts:1-43`
- Modify: `src/app/features/purchases/utils/purchase-presentation.spec.ts:80-110, 150-190`

**Interfaces:**

- Consumes: `Purchase.entry_status`, `receiving_status` und `shipment_status`.
- Produces: `PurchaseStatusPresentation` mit den Tönen `caution`, `info`, `success`, `brand`, `neutral`, `critical`; archiviert/storniert überschreiben alles, finalisiert überschreibt Lieferzustände.

- [ ] **Step 1: Vollständige Prioritätsmatrix testen**

Ersetze die aktuelle Matrix durch:

```ts
it.each([
  [{ receiving_status: 'draft' }, { label: 'Entwurf', tone: 'caution' }],
  [{ receiving_status: 'ordered' }, { label: 'Bestellt', tone: 'info' }],
  [{ receiving_status: 'partially_received' }, { label: 'Teillieferung', tone: 'caution' }],
  [{ receiving_status: 'received' }, { label: 'Angekommen', tone: 'success' }],
  [
    { entry_status: 'finalized', receiving_status: 'received', shipment_status: 'arrived' },
    { label: 'Abgeschlossen', tone: 'brand' },
  ],
  [
    { entry_status: 'finalized', receiving_status: 'archived' },
    { label: 'Archiviert', tone: 'neutral' },
  ],
  [{ receiving_status: 'cancelled' }, { label: 'Storniert', tone: 'critical' }],
] as const)('ordnet Statuspriorität und Farbe zu', (fields, expected) => {
  expect(getPurchaseStatusPresentation({ ...purchase, ...fields })).toEqual(expected);
});
```

Ändere in `purchase-presentation.spec.ts` die Erwartung des finalisierten, empfangenen Einkaufs von `Angekommen` auf `Abgeschlossen`.

- [ ] **Step 2: Status- und Präsentationstests ausführen**

Run: `npx vitest run --project=node src/app/features/purchases/utils/purchase-status-presentation.spec.ts src/app/features/purchases/utils/purchase-presentation.spec.ts`

Expected: FAIL für Entwurf und finalisierte, bereits angekommene Einkäufe.

- [ ] **Step 3: Priorität zentral korrigieren**

Implementiere die Abfolge ausdrücklich:

```ts
export function getPurchaseStatusPresentation(purchase: Purchase): PurchaseStatusPresentation {
  const receivingStatus = purchase.receiving_status as string | undefined;
  if (receivingStatus === 'archived') return { label: 'Archiviert', tone: 'neutral' };
  if (receivingStatus === 'cancelled' || receivingStatus === 'canceled') {
    return { label: 'Storniert', tone: 'critical' };
  }
  if (purchase.entry_status === 'finalized') {
    return { label: 'Abgeschlossen', tone: 'brand' };
  }
  if (receivingStatus === 'partially_received') {
    return { label: 'Teillieferung', tone: 'caution' };
  }
  if (receivingStatus === 'received' || purchase.shipment_status === 'arrived') {
    return { label: 'Angekommen', tone: 'success' };
  }
  if (receivingStatus === 'ordered') return { label: 'Bestellt', tone: 'info' };
  return { label: 'Entwurf', tone: 'caution' };
}
```

- [ ] **Step 4: Statusdarstellung erneut prüfen**

Run: `npx vitest run --project=node src/app/features/purchases/utils/purchase-status-presentation.spec.ts src/app/features/purchases/utils/purchase-presentation.spec.ts`

Expected: PASS.

- [ ] **Step 5: Änderung committen**

```powershell
npx prettier --write src/app/features/purchases/utils/purchase-status-presentation.ts src/app/features/purchases/utils/purchase-status-presentation.spec.ts src/app/features/purchases/utils/purchase-presentation.spec.ts
git add src/app/features/purchases/utils/purchase-status-presentation.ts src/app/features/purchases/utils/purchase-status-presentation.spec.ts src/app/features/purchases/utils/purchase-presentation.spec.ts
git commit -m "fix(purchases): prioritize completed purchase status"
```

---

### Task 10: Chronikzeit unabhängig vom Detailschalter rechts ausrichten

**Files:**

- Modify: `src/app/shared/components/record-history/record-history.component.html:31-78`
- Modify: `src/app/shared/components/record-history/record-history.component.angular.spec.ts:135-182`

**Interfaces:**

- Consumes: unveränderte `BusinessEvent`-Daten und `formatDate`.
- Produces: `data-record-history-time` in einer festen zweiten Gridspalte; der Detailschalter liegt in der Inhaltsseite und verschiebt die Zeit nicht.

- [ ] **Step 1: Gleiche Zeitspalte mit und ohne Details testen**

Ergänze zwei Ereignisse, eines ohne und eines mit Details, und prüfe den DOM-Vertrag:

```ts
it('hält Zeitangaben mit und ohne Details in derselben rechten Spalte', () => {
  const plainEvent = { ...event, id: 'plain', changes: null };
  const fixture = createHistory({ events: [event, plainEvent] });
  const rows = [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-record-history-row]'),
  ];

  expect(rows).toHaveLength(2);
  for (const row of rows) {
    expect(row.classList).toContain('grid');
    expect(row.querySelector('[data-record-history-time]')?.classList).toContain('text-right');
  }
});
```

- [ ] **Step 2: Chroniktest ausführen**

Run: `npx vitest run --project=angular src/app/shared/components/record-history/record-history.component.angular.spec.ts`

Expected: FAIL, weil Datum und Uhrzeit aktuell zusammen mit der Person links stehen.

- [ ] **Step 3: Kopfzeile als festes Zweispalten-Grid umsetzen**

Ersetze die Ereigniskopfzeile durch:

```html
<div
  data-record-history-row
  class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2"
>
  <div class="min-w-0">
    <p class="text-xs font-semibold text-fb-text-primary">{{ event.eventLabel }}</p>
    <p class="mt-0.5 text-[11px] text-fb-text-muted">{{ actorLabel(event) }}</p>
    @if (event.reason) {
    <p class="mt-1 text-[11px] text-fb-text-secondary">{{ event.reason }}</p>
    } @if (detailsFor(event).length > 0) {
    <button
      type="button"
      class="linear-btn-secondary mt-2 rounded-md px-2.5 py-1 text-xs font-semibold"
      (click)="toggleDetails(event.id)"
      [attr.aria-expanded]="expanded"
      [attr.aria-controls]="'record-history-details-' + event.id"
    >
      {{ expanded ? 'Details ausblenden' : 'Details ansehen' }}
    </button>
    }
  </div>
  <time
    data-record-history-time
    class="whitespace-nowrap text-right text-[11px] text-fb-text-muted"
    [attr.datetime]="event.createdAt"
  >
    {{ formatDate(event.createdAt) }}
  </time>
</div>
```

- [ ] **Step 4: Chronik einschließlich bestehender Detailtests prüfen**

Run: `npx vitest run --project=angular src/app/shared/components/record-history/record-history.component.angular.spec.ts`

Expected: PASS.

- [ ] **Step 5: Änderung committen**

```powershell
npx prettier --write src/app/shared/components/record-history
git add src/app/shared/components/record-history
git commit -m "fix(ui): align record history timestamps"
```

---

### Task 11: Einkaufsdruck vom Admin-Rahmen trennen

**Files:**

- Modify: `src/app/layout/shell/shell.component.html:1-39`
- Modify: `src/app/features/purchases/pages/purchase-print/purchase-print.component.html:1-145`
- Modify: `src/app/features/purchases/pages/purchase-print/purchase-print.component.angular.spec.ts:70-129`
- Modify: `src/styles.css`

**Interfaces:**

- Consumes: vorhandene Route mit `<app-purchase-print>` innerhalb von `<app-shell>`.
- Produces: DOM-Hooks `data-shell-sidebar`, `data-shell-content`, `data-shell-header`, `data-shell-main`, `data-shell-bottom-nav`; benannte Druckseite `purchase-receipt` wird nur von `app-purchase-print` verwendet.

- [ ] **Step 1: Druckkontext und Browserhinweis als Tests festhalten**

Erweitere den statischen Drucktest:

```ts
const shellTemplate = readFileSync('src/app/layout/shell/shell.component.html', 'utf8');
const globalStyles = readFileSync('src/styles.css', 'utf8');

it('entfernt auf der Einkaufsdruckseite den Admin-Rahmen', () => {
  for (const hook of [
    'data-shell-sidebar',
    'data-shell-content',
    'data-shell-header',
    'data-shell-main',
    'data-shell-bottom-nav',
  ]) {
    expect(shellTemplate).toContain(hook);
  }
  expect(globalStyles).toContain('body:has(app-purchase-print)');
  expect(globalStyles).toContain('@page purchase-receipt');
  expect(printTemplate).toContain('deaktiviere im Druckdialog Kopf- und Fußzeilen');
});
```

- [ ] **Step 2: Drucktest ausführen**

Run: `npx vitest run --project=angular src/app/features/purchases/pages/purchase-print/purchase-print.component.angular.spec.ts`

Expected: FAIL, weil Shell-Hooks, route-spezifische Druckregeln und der Browserhinweis fehlen.

- [ ] **Step 3: Shell eindeutig markieren und Hinweis ergänzen**

Füge ausschließlich Datenattribute hinzu:

```html
<app-sidebar
  data-shell-sidebar
  id="app-sidebar"
  [isOpen]="isSidebarOpen()"
  (closed)="closeSidebar()"
/>
<div data-shell-content class="flex min-w-0 flex-1 flex-col bg-fb-bg pb-16 md:ml-56 md:pb-0">
  <app-header
    data-shell-header
    [isSidebarOpen]="isSidebarOpen()"
    [workspaceActionsBlocked]="workspaceActionsBlocked()"
    (toggleSidebar)="toggleSidebar()"
    (openCreateWorkspace)="openCreateWorkspace()"
  />
  <main
    data-shell-main
    id="hauptinhalt"
    tabindex="-1"
    class="mx-auto w-full min-w-0 flex-1 p-4 animate-fade-in md:p-5"
  >
    <router-outlet />
  </main>
</div>
<app-bottom-nav
  data-shell-bottom-nav
  [isMenuOpen]="isSidebarOpen()"
  (toggleMenu)="toggleSidebar()"
/>
```

Ergänze in der Bildschirm-Aktionsleiste der Druckseite:

```html
<p class="text-xs text-slate-600 sm:max-w-md">
  Falls dein Browser URL und Datum ergänzt, deaktiviere im Druckdialog Kopf- und Fußzeilen.
</p>
```

Der Hinweis bleibt innerhalb des bereits vorhandenen `print:hidden`-Bereichs.

- [ ] **Step 4: Route-spezifische Druckregeln ergänzen**

Ergänze am Ende von `src/styles.css`:

```css
@media print {
  body:has(app-purchase-print) [data-shell-sidebar],
  body:has(app-purchase-print) [data-shell-header],
  body:has(app-purchase-print) [data-shell-bottom-nav],
  body:has(app-purchase-print) app-confirm-dialog,
  body:has(app-purchase-print) .fb-skip-link {
    display: none !important;
  }

  body:has(app-purchase-print) [data-shell-content] {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }

  body:has(app-purchase-print) [data-shell-main] {
    width: 100% !important;
    max-width: none !important;
    padding: 0 !important;
    animation: none !important;
  }

  body:has(app-purchase-print) app-purchase-print {
    display: block;
    page: purchase-receipt;
  }

  body:has(app-purchase-print) app-purchase-print article > header,
  body:has(app-purchase-print)
    app-purchase-print
    section:not([aria-labelledby='purchase-print-lines']),
  body:has(app-purchase-print) app-purchase-print tr {
    break-inside: avoid;
  }
}

@page purchase-receipt {
  size: A4;
  margin: 12mm;
}
```

Die `:has(app-purchase-print)`-Bedingung verhindert, dass Rechnungs-, Etiketten- oder DATEV-Druckansichten verändert werden. Die benannte Seite greift nur für das Element mit `page: purchase-receipt`.

- [ ] **Step 5: Druck- und Shelltests ausführen**

Run: `npx vitest run --project=angular src/app/features/purchases/pages/purchase-print/purchase-print.component.angular.spec.ts src/app/layout/shell/shell.component.angular.spec.ts`

Expected: PASS.

- [ ] **Step 6: Änderung committen**

```powershell
npx prettier --write src/app/layout/shell/shell.component.html src/app/features/purchases/pages/purchase-print src/styles.css
git add src/app/layout/shell/shell.component.html src/app/features/purchases/pages/purchase-print src/styles.css
git commit -m "fix(purchases): isolate purchase print layout"
```

---

### Task 12: Gesamtprüfung, manuelle Abnahme und Änderungsprotokoll

**Prüfstand vom 21.09.2026:** Formatierung, Lint, Typprüfung und Produktionsbau
erfolgreich. Die Typkorrekturen der neuen Tests sind in `29631d43` enthalten.
Der erste `npm run verify` endete mit Exitcode 1, weil der
native Entfernen-Button im Kosteneditor den Shared-UI-Vertrag verletzte.
Korrektur mit rotem/grünem Bedienungstest: `9d4d5262`. Danach bestanden alle
Prüfstufen einzeln: Workflow (81 bestanden, fünf übersprungen), Edge (16),
Suite-Audit, Anwendungstests (2.704), Landingpage (22), Lint, Typprüfung und Bau.
Nach ausdrücklicher Anforderung wurde `npm run verify` auf dem reparierten
Endstand `5dff9b79` erneut ausgeführt und bestand vollständig mit **Exitcode 0**.
Dieser zweite Lauf ist der finale automatisierte Abschlussnachweis.

**Manuelle Abnahme weiterhin offen:** Die vorhandene lokale Umgebung auf Port 80
liefert einen älteren ReFlip-Build mit Loginseite, auch unter `/landing/` und
`flipbase.localhost`. Keiner der zehn unten genannten Fälle wurde am aktuellen
Branch visuell abgenommen. Keine Neustarts oder zusätzlichen Server; keine
Testdaten geschrieben. Zwei bekannte NG8113-Hinweise in unverändertem Dashboard
und unveränderter Verkäuferliste verbleiben. Schritt 6 liegt beim Controller.

**Files:**

- Modify: `docs/AI-CHANGELOG.md`
- Verify: alle in Tasks 1–11 geänderten Dateien

**Interfaces:**

- Consumes: die elf abgeschlossenen, einzeln getesteten Änderungen.
- Produces: ein sauberer Branch mit dokumentiertem Prüfnachweis, der für einen einzigen Pull Request bereit ist.

- [ ] **Step 1: Alle geänderten Dateien formatieren und statisch prüfen**

```powershell
npx prettier --write landing/index.html landing/landing.js scripts/landing-page.test.mjs src/app/shared/components/card src/app/features/purchases/components/purchase-documents-card src/app/features/sellers/components/purchase-seller-dialog src/app/features/purchases/components/purchase-source-dialog src/app/features/purchases/components/purchase-entry-form src/app/shared/components/button src/app/features/purchases/components/purchase-line-editor src/app/features/purchases/components/purchase-cost-editor src/app/features/purchases/components/purchase-cost-overview-dialog src/app/features/purchases/purchases.component.ts src/app/features/purchases/purchases.component.html src/app/features/purchases/purchases.component.angular.spec.ts src/app/features/purchases/utils/purchase-status-presentation.ts src/app/features/purchases/utils/purchase-status-presentation.spec.ts src/app/features/purchases/utils/purchase-presentation.spec.ts src/app/shared/components/record-history src/app/layout/shell/shell.component.html src/app/features/purchases/pages/purchase-print src/styles.css docs/AI-CHANGELOG.md
npm run lint
npm run typecheck
npm run build
```

Expected: alle drei Befehle enden mit Exitcode 0; der Angular-Bau prüft auch die neuen Templatebindungen.

- [ ] **Step 2: Vollständige verbindliche Projektprüfung ausführen**

Run: `npm run verify`

Expected: Exitcode 0 für Format, Lint, Typen, Workflowtests, Edge-Tests, Suite-Audit, Anwendungstests, Landingpage und Produktionsbau. Den Exitcode nicht über eine Pipe auswerten.

- [ ] **Step 3: Manuelle Browserabnahme durchführen**

Prüfe in der bereits vom Nutzer gestarteten lokalen Umgebung diese feste Reihenfolge:

1. Landingpage DE und EN: normaler Button sichtbar; Ladebalken nur während Versand; Erfolg und vorhandene Bewerbung sauber umbrochen.
2. Einkauf erstellen in hellem und dunklem Theme: keine weiße Kartenumrandung beim Öffnen.
3. Verkäufer erstellen: breiter Dialog, Straßenfelder vollbreit, `Land/Region`, Speichern erst bei gültigem Formular.
4. Bezugsquelle erstellen: eigener Dialog, neue Quelle nach Erfolg ausgewählt, Fehler verbleibt im Dialog.
5. Einkaufsposition mit kurzem Namen: innere Buttonfläche linksbündig.
6. Zusatzausgaben: nur Art, Betrag und rote Entfernen-Aktion; vorhandene gespeicherte Werte bleiben nach Betragsänderung erhalten.
7. Einkaufsliste neu laden und Workspace wechseln: Ladezustand statt kurzzeitigem Leerzustand; lange Beschreibung einzeilig mit vollständigem Hovertext.
8. Statusfolge Entwurf, Bestellt, Teillieferung, Angekommen und Abgeschlossen: unterschiedliche, lesbare Badge-Töne.
9. Chronik mit und ohne Detailänderung: Uhrzeit jeweils am rechten Rand.
10. Druckvorschau: kein Header, keine Sidebar, keine mobile Navigation; Beleg nutzt die Seite. Browser-Kopf-/Fußzeilen einmal aktiviert und einmal deaktiviert prüfen.

- [ ] **Step 4: AI-Änderungsprotokoll mit realen Ergebnissen ergänzen**

Füge oben in `docs/AI-CHANGELOG.md` einen Eintrag mit Datum, `Juna`, dem umgesetzten Umfang und exakt den tatsächlich erfolgreichen Befehlen hinzu. Formuliere keine Prüfung als erfolgreich, die nicht ausgeführt wurde.

- [ ] **Step 5: Dokumentation prüfen und committen**

```powershell
npx prettier --write docs/AI-CHANGELOG.md docs/superpowers/plans/2026-09-21-ui-regression-cleanup.md
git diff --check
git add docs/AI-CHANGELOG.md docs/superpowers/plans/2026-09-21-ui-regression-cleanup.md
git commit -m "docs(ui): record regression cleanup verification"
git status --short
```

Expected: `git diff --check` meldet nichts und `git status --short` ist leer.

- [ ] **Step 6: Vor Veröffentlichung die verbindliche Nutzerfreigabe einholen**

Frage im Chat exakt:

```text
Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?
```

Erst ein „Ja“ autorisiert Push, PR-Erstellung, Abwarten der Pflichtprüfungen, Merge-Commit und anschließendes Löschen des Remote- und lokalen Feature-Zweigs.
