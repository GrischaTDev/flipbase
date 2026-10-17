import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import { KleinanzeigenPublicationPanelComponent } from '../kleinanzeigen-publication-panel/kleinanzeigen-publication-panel.component';
import { KleinanzeigenListingJobService } from '../../services/kleinanzeigen-listing-job.service';
import { provideRouter } from '@angular/router';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { KleinanzeigenListingFieldsComponent } from '../kleinanzeigen-listing-fields/kleinanzeigen-listing-fields.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, afterEach, beforeEach, beforeAll, afterAll } from 'vitest';
import { ListingTransferDialogComponent } from './listing-transfer-dialog.component';
import { ListingTransferService } from '../../services/listing-transfer.service';
import { KleinanzeigenAccountService } from '../../services/kleinanzeigen-account.service';
import { KleinanzeigenFormSchemaService } from '../../services/kleinanzeigen-form-schema.service';
import { KleinanzeigenExtensionBridge } from '../../services/kleinanzeigen-extension-bridge';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { MarketplaceSettingsService } from '../../../../core/services/marketplace-settings.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
const source = {
  platform: 'vinted' as const,
  workspaceId: '50300000-0000-4000-8000-000000000011',
  connectionId: '50300000-0000-4000-8000-000000000021',
  externalId: '123',
};
const account = {
  workspaceId: source.workspaceId,
  connectionId: '9',
  externalAccountId: '88',
  displayName: 'Privat',
  accountType: 'private',
  status: 'connected',
  localGrant: { active: true, generation: 2, canPublish: true },
};
const content = {
  title: 'x'.repeat(66),
  description: 'Voller Text',
  priceCents: 1234,
  currency: 'EUR',
  priceType: 'FIXED',
  shippingType: 'pickup',
  shippingPriceCents: null,
  postalCode: null,
  categoryId: null,
  categoryFields: {},
  schemaRevision: null,
};
const prepared = {
  source,
  target: { workspaceId: source.workspaceId, connectionId: '9' },
  sourceReference: { ...source, entryId: source.connectionId, fingerprint: 'a'.repeat(64) },
  requestId: '50300000-0000-4000-8000-000000000041',
  content,
  originalPhotoReferences: ['https://images1.vinted.net/a.jpg'],
  attributeHints: { Zustand: 'Gut' },
  warnings: [],
};
describe('Gemeinsamer Übertragungsdialog', () => {
  const auth = { currentUser: signal<{ id: string } | null>({ id: 'owner' }) };
  const workspace = { currentWorkspace: signal({ id: source.workspaceId, archived_at: null }) };
  const settings = { ready: signal(true), isKleinanzeigenEnabled: signal(true) };
  const transfers = { prepare: vi.fn(), save: vi.fn(), cancel: vi.fn() };
  const accounts = { readAccounts: vi.fn() };
  const schemas = { browse: vi.fn(), cancel: vi.fn() };
  const bridge = {
    checkInstallation: vi.fn(),
    formSchemaAvailable: signal(true),
    quotaAvailable: signal(false),
    capabilities: signal({ accounts: true, sync: true, publish: false }),
  };
  const confirm = { frage: vi.fn() };
  const jobs = {
    job: signal(null),
    busy: signal(false),
    error: signal<string | null>(null),
    latest: vi.fn().mockResolvedValue(null),
    cancel: vi.fn(),
    enqueue: vi.fn().mockResolvedValue(null),
  };
  beforeEach(() => {
    auth.currentUser.set({ id: 'owner' });
    jobs.error.set(null);
    jobs.job.set(null);
    settings.isKleinanzeigenEnabled.set(true);
    vi.clearAllMocks();
    accounts.readAccounts.mockResolvedValue({
      canManage: true,
      accounts: [account, { ...account, connectionId: '10', accountType: 'commercial' }],
    });
    transfers.prepare.mockResolvedValue(prepared);
    TestBed.configureTestingModule({
      imports: [ListingTransferDialogComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: WorkspaceService, useValue: workspace },
        { provide: MarketplaceSettingsService, useValue: settings },
        { provide: ListingTransferService, useValue: transfers },
        { provide: KleinanzeigenAccountService, useValue: accounts },
        { provide: KleinanzeigenFormSchemaService, useValue: schemas },
        { provide: KleinanzeigenExtensionBridge, useValue: bridge },
        { provide: ConfirmDialogService, useValue: confirm },
      ],
    });
    TestBed.overrideProvider(KleinanzeigenListingJobService, { useValue: jobs });
    TestBed.overrideProvider(ListingTransferService, { useValue: transfers });
    TestBed.overrideProvider(KleinanzeigenFormSchemaService, { useValue: schemas });
    TestBed.overrideProvider(KleinanzeigenExtensionBridge, { useValue: bridge });
  });
  afterEach(() => TestBed.resetTestingModule());
  async function create() {
    const fixture = TestBed.createComponent(ListingTransferDialogComponent);
    fixture.componentRef.setInput('source', source);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }
  it('zeigt nur erlaubte private Ziele und wählt kein Konto stillschweigend', async () => {
    const f = await create();
    expect(f.componentInstance.targetOptions().map((option) => option.value)).toEqual(['9']);
    expect(f.componentInstance.target.value).toBe('');
    await f.componentInstance.prepare();
    expect(transfers.prepare).not.toHaveBeenCalled();
  });
  it('öffnet nach Plattform und Konto automatisch die vorbefüllten Felder ohne Übernahmebutton', async () => {
    const f = await create();
    expect(f.nativeElement.textContent).not.toContain('Vinted-Daten übernehmen');
    expect(f.nativeElement.querySelector('[aria-label="Plattform"]')).toBeTruthy();
    f.componentInstance.platform.setValue('kleinanzeigen');
    f.componentInstance.target.setValue('9');
    await f.whenStable();
    f.detectChanges();
    expect(f.componentInstance.form.controls.description.value).toBe(content.description);
    expect(transfers.prepare).toHaveBeenCalledTimes(1);
  });
  it('bietet Inserieren direkt im Formular statt eines verpflichtenden Entwurfsschritts an', async () => {
    const f = await create();
    f.componentInstance.platform.setValue('kleinanzeigen');
    f.componentInstance.target.setValue('9');
    await f.whenStable();
    f.detectChanges();
    const buttons = [...f.nativeElement.querySelectorAll('button')].map((b) =>
      b.textContent.trim(),
    );
    expect(buttons).toContain('Inserieren');
    expect(buttons).not.toContain('Entwurf speichern');
  });
  it.each([false, true])(
    'speichert vor dem Inserieren intern; spätere Formularänderung stoppt den Auftrag (%s)',
    async (editDuringSave) => {
      const f = await create();
      const c = f.componentInstance;
      c.platform.setValue('kleinanzeigen');
      c.target.setValue('9');
      await f.whenStable();
      c.form.patchValue({ title: 'Jacke', price: 12, postalCode: '12345' });
      const schema = {
        categoryPath: '153/160/shirts',
        categoryLabel: 'Shirts',
        titleMax: 65,
        descriptionMax: 4000,
        photoCountMax: 20,
        photoBytesMax: 12582912,
        priceStepCents: 100,
        fields: [],
        shipping: { defaultGroup: null, defaultMethods: [], groups: [] },
      };
      c.schema.set(schema);
      c.schemaRevision.set('a'.repeat(64));
      schemas.browse.mockResolvedValue({
        categoryPath: schema.categoryPath,
        categoryLabel: schema.categoryLabel,
        choices: [],
        schema,
        schemaRevision: 'a'.repeat(64),
      });
      transfers.save.mockImplementation(async () => {
        const content = c.content();
        if (editDuringSave) c.form.controls.description.setValue('Spätere Änderung');
        return {
          id: 'prepared-copy',
          workspaceId: source.workspaceId,
          targetConnectionId: '9',
          revision: 2,
          status: 'prepared',
          imagesComplete: true,
          content,
        };
      });
      await c.publish();
      expect(transfers.save).toHaveBeenCalledTimes(1);
      if (editDuringSave) {
        expect(jobs.enqueue).not.toHaveBeenCalled();
        expect(c.form.controls.description.value).toBe('Spätere Änderung');
        expect(c.notice()).toContain('noch nicht gespeichert');
      } else
        expect(jobs.enqueue).toHaveBeenCalledWith(
          expect.objectContaining({ connectionId: '9' }),
          'prepared-copy',
          2,
          expect.any(String),
        );
    },
  );
  it('bereitet ein ausdrücklich vorgegebenes Zielkonto nach dem Laden automatisch vor', async () => {
    const fixture = TestBed.createComponent(ListingTransferDialogComponent);
    fixture.componentRef.setInput('source', source);
    fixture.componentRef.setInput('targetConnectionId', '9');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(transfers.prepare).toHaveBeenCalledTimes(1);
    await expect.poll(() => fixture.componentInstance.preview()).toEqual(prepared);
  });
  it('meldet dieselbe bestätigte Veröffentlichung nur einmal', async () => {
    const f = await create();
    const c = f.componentInstance;
    c.savedDraft.set({
      id: 'copy',
      workspaceId: source.workspaceId,
      targetConnectionId: '9',
    } as never);
    const published = vi.fn();
    c.published.subscribe(published);
    const job = {
      state: 'confirmed',
      draftId: 'copy',
      workspaceId: source.workspaceId,
      connectionId: '9',
    } as never;
    c.onPublished(job);
    c.onPublished(job);
    expect(published).toHaveBeenCalledTimes(1);
    expect(c.notice()).toContain('jetzt bei Kleinanzeigen online');
  });
  it('fordert vor dem Inserieren eine ausgewählte Kategorie statt erst den Baum zu laden', async () => {
    const f = await create();
    const c = f.componentInstance;
    c.platform.setValue('kleinanzeigen');
    c.target.setValue('9');
    await expect.poll(() => c.preview()).toEqual(prepared);
    schemas.browse.mockClear();
    transfers.save.mockClear();
    jobs.enqueue.mockClear();
    await c.publish();
    expect(schemas.browse).not.toHaveBeenCalled();
    expect(transfers.save).not.toHaveBeenCalled();
    expect(jobs.enqueue).not.toHaveBeenCalled();
    expect(c.error()).toContain('vollständige Kleinanzeigen-Kategorie');
  });
  it('zeigt Auftragsfehler im festen Dialogbereich genau einmal', async () => {
    const f = await create();
    const c = f.componentInstance;
    c.platform.setValue('kleinanzeigen');
    c.target.setValue('9');
    await expect.poll(() => c.preview()).toEqual(prepared);
    c.savedDraft.set({
      id: 'copy',
      revision: 1,
      status: 'prepared',
      content,
      imagesComplete: true,
    } as never);
    jobs.error.set('Die Kosten konnten nicht bestätigt werden.');
    f.detectChanges();
    await f.whenStable();
    const alerts = f.nativeElement.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent).toContain('Kosten konnten nicht bestätigt');
    expect(alerts[0].closest('app-kleinanzeigen-publication-panel')).toBeNull();
    expect(alerts[0].closest('[modal-footer]')).not.toBeNull();
  });
  it.each([
    [
      'needs_user_action',
      null,
      'fees_due',
      'Kleinanzeigen zeigt Gebühren. Die Veröffentlichung wurde gestoppt.',
    ],
    [
      'outcome_unknown',
      null,
      'publication_unconfirmed',
      'Der Ausgang ist noch unklar. Prüfe den Status, bevor Du erneut inserierst.',
    ],
    ['writing', 'processing', null, 'Wird von Kleinanzeigen geprüft'],
  ])(
    'zeigt den Auftragszustand %s im festen Dialogbereich',
    async (state, providerState, errorCode, expected) => {
      const f = await create();
      const c = f.componentInstance;
      c.platform.setValue('kleinanzeigen');
      c.target.setValue('9');
      await expect.poll(() => c.preview()).toEqual(prepared);
      c.savedDraft.set({
        id: 'copy',
        revision: 1,
        status: 'prepared',
        content,
        imagesComplete: true,
      } as never);
      jobs.job.set({ id: 'job', draftId: 'copy', state, providerState, errorCode } as never);
      f.detectChanges();
      await f.whenStable();
      expect(f.nativeElement.querySelector('[modal-footer]').textContent).toContain(expected);
      expect(f.nativeElement.querySelector('[modal-footer]').textContent).not.toContain(
        'Angaben und Bilder sind gesichert',
      );
    },
  );
  it('zeigt den gemeinsamen Kategoriebaum schon vor jedem Anbieterabruf', async () => {
    const f = await create();
    f.componentInstance.platform.setValue('kleinanzeigen');
    f.componentInstance.target.setValue('9');
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('app-category-picker')).toBeTruthy();
    expect(f.nativeElement.querySelector('[aria-label="Unterkategorie auswählen"]')).toBeNull();
    expect(schemas.browse).not.toHaveBeenCalled();
  });
  it('liest Eigenschaften erst nach ausdrücklicher Endkategoriewahl und verwirft Elternkategorien', async () => {
    const f = await create();
    const c = f.componentInstance;
    c.platform.setValue('kleinanzeigen');
    c.target.setValue('9');
    await f.whenStable();
    schemas.browse.mockClear();
    c.categorySelection.setValue('153');
    await f.whenStable();
    expect(schemas.browse).not.toHaveBeenCalled();
    expect(c.schema()).toBeNull();
    expect(c.notice()).toContain('Unterkategorie');
    schemas.browse.mockResolvedValue({
      categoryPath: '153/160/hemden',
      categoryLabel: 'Hemden',
      choices: [],
      schemaRevision: 'a'.repeat(64),
      schema: {
        categoryPath: '153/160/hemden',
        categoryLabel: 'Hemden',
        titleMax: 65,
        descriptionMax: 4000,
        photoCountMax: 20,
        photoBytesMax: 12582912,
        priceStepCents: 100,
        fields: [],
        shipping: { defaultGroup: null, defaultMethods: [], groups: [] },
      },
    });
    c.categorySelection.setValue('153/160/hemden');
    await f.whenStable();
    expect(schemas.browse).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: '9' }),
      '153/160/hemden',
      'provider',
    );
    expect(c.content().categoryId).toBe('153/160/hemden');
    expect(c.schema()?.categoryPath).toBe('153/160/hemden');
  });
  it('erhält beim bewussten Kategorienwechsel weiterhin gültige eigene Eigenschaften', async () => {
    const f = await create();
    const c = f.componentInstance;
    c.platform.setValue('kleinanzeigen');
    c.target.setValue('9');
    await f.whenStable();
    const { FormControl } = await import('@angular/forms');
    c.attributes.addControl(
      'kleidung_herren.condition',
      new FormControl('like_new', { nonNullable: true }),
    );
    c.attributes.addControl('obsolete', new FormControl('alt', { nonNullable: true }));
    schemas.browse.mockResolvedValue({
      categoryPath: '153/160/hemden',
      categoryLabel: 'Hemden',
      choices: [],
      schemaRevision: 'a'.repeat(64),
      schema: {
        categoryPath: '153/160/hemden',
        categoryLabel: 'Hemden',
        titleMax: 65,
        descriptionMax: 4000,
        photoCountMax: 20,
        photoBytesMax: 12582912,
        priceStepCents: 100,
        fields: [
          {
            key: 'kleidung_herren.condition',
            label: 'Zustand',
            kind: 'select',
            selection: 'value',
            required: false,
            choices: [
              { value: 'ok', label: 'Gut', description: '' },
              { value: 'like_new', label: 'Sehr Gut', description: '' },
            ],
          },
        ],
        shipping: { defaultGroup: null, defaultMethods: [], groups: [] },
      },
    });
    await c.selectCategory('153/160/hemden');
    expect(c.attributes.getRawValue()).toEqual({ 'kleidung_herren.condition': 'like_new' });
  });
  it('erhält lange Quelltexte und Centbeträge zur sichtbaren Korrektur', async () => {
    const f = await create();
    f.componentInstance.platform.setValue('kleinanzeigen');
    f.componentInstance.target.setValue('9');
    await f.componentInstance.prepare();
    expect(f.componentInstance.form.controls.title.value).toHaveLength(66);
    expect(f.componentInstance.form.controls.price.value).toBe(12.34);
    expect(f.componentInstance.form.valid).toBe(false);
    expect(f.componentInstance.attributeHints()).toEqual([{ label: 'Zustand', value: 'Gut' }]);
  });
  it('speichert einen gültigen Entwurf ohne Kategorie, veröffentlicht dabei nichts', async () => {
    const f = await create();
    f.componentInstance.platform.setValue('kleinanzeigen');
    f.componentInstance.target.setValue('9');
    await f.componentInstance.prepare();
    f.componentInstance.form.controls.title.setValue('Jacke');
    transfers.save.mockResolvedValue({
      id: 'draft',
      revision: 4,
      imagesComplete: true,
      content: { ...content, title: 'Jacke' },
    });
    await f.componentInstance.save();
    expect(transfers.save).toHaveBeenCalledWith(
      prepared,
      expect.objectContaining({ categoryId: null, title: 'Jacke', priceCents: 1234 }),
      null,
    );
    expect(f.componentInstance.savedDraft()?.id).toBe('draft');
  });
  it('meldet eine vorhandene andere Zielfassung nicht als gespeicherte Änderung', async () => {
    const f = await create();
    const c = f.componentInstance;
    c.platform.setValue('kleinanzeigen');
    c.target.setValue('9');
    await c.prepare();
    c.form.controls.title.setValue('Meine Änderung');
    transfers.save.mockResolvedValue({
      id: 'draft',
      revision: 4,
      imagesComplete: true,
      status: 'draft',
      content: { ...content, title: 'Vorhandene Fassung' },
    });
    await c.save();
    expect(c.form.controls.title.value).toBe('Meine Änderung');
    expect(c.notice()).toContain('noch nicht gespeichert');
    expect(c.savedDraft()?.revision).toBe(4);
    expect(c.form.pristine).toBe(false);
    await c.save();
    expect(transfers.save.mock.calls.at(-1)?.[2]).toBe(4);
  });
  it('akzeptiert acht ganze Euroziffern und weist größere Preise zurück', async () => {
    const f = await create();
    const price = f.componentInstance.form.controls.price;
    price.setValue(99999999);
    expect(price.valid).toBe(true);
    price.setValue(100000000);
    expect(price.valid).toBe(false);
    price.setValue(1.234);
    expect(price.valid).toBe(false);
  });
  it('entfernt bei Kategorieänderung nur unpassende Eigenschaften', async () => {
    const f = await create();
    f.componentInstance.platform.setValue('kleinanzeigen');
    f.componentInstance.target.setValue('9');
    await f.componentInstance.prepare();
    f.componentInstance.attributes.addControl(
      'old',
      new (await import('@angular/forms')).FormControl('alt', { nonNullable: true }),
    );
    schemas.browse.mockResolvedValue({
      categoryPath: '153/160/shirts',
      categoryLabel: 'Shirts',
      choices: [],
      schemaRevision: 'a'.repeat(64),
      schema: {
        categoryPath: '153/160/shirts',
        categoryLabel: 'Shirts',
        titleMax: 65,
        descriptionMax: 4000,
        photoCountMax: 20,
        photoBytesMax: 12582912,
        priceStepCents: 100,
        fields: [],
        shipping: { defaultGroup: null, defaultMethods: [], groups: [] },
      },
    });
    await f.componentInstance.browse('153/160/shirts');
    expect(f.componentInstance.attributes.getRawValue()).toEqual({});
    expect(f.componentInstance.form.controls.title.value).toBe(content.title);
    expect(f.componentInstance.form.controls.description.value).toBe(content.description);
    expect(f.componentInstance.form.controls.price.value).toBe(12.34);
  });
  it('fragt vor dem Verwerfen ungespeicherter Änderungen und leert Daten nach Abmeldung', async () => {
    const f = await create();
    f.componentInstance.platform.setValue('kleinanzeigen');
    f.componentInstance.target.setValue('9');
    await f.componentInstance.prepare();
    f.componentInstance.form.markAsDirty();
    confirm.frage.mockResolvedValue(false);
    const close = vi.fn();
    f.componentInstance.closed.subscribe(close);
    await f.componentInstance.close();
    expect(confirm.frage).toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    auth.currentUser.set(null);
    f.detectChanges();
    await f.whenStable();
    expect(f.componentInstance.preview()).toBeNull();
    expect(f.componentInstance.form.controls.title.value).toBe('');
  });
});

let restore: () => void;
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    {
      type: CategoryPickerComponent,
      path: 'src/app/shared/components/category-picker/category-picker.component.ts',
    },
    {
      type: KleinanzeigenPublicationPanelComponent,
      path: 'src/app/features/marketplaces/components/kleinanzeigen-publication-panel/kleinanzeigen-publication-panel.component.ts',
    },
    {
      type: ListingTransferDialogComponent,
      path: 'src/app/features/marketplaces/components/listing-transfer-dialog/listing-transfer-dialog.component.ts',
    },
    {
      type: KleinanzeigenListingFieldsComponent,
      path: 'src/app/features/marketplaces/components/kleinanzeigen-listing-fields/kleinanzeigen-listing-fields.component.ts',
    },
    { type: ModalDialogDirective, path: 'src/app/shared/directives/modal-dialog.directive.ts' },
    {
      type: ModalShellComponent,
      path: 'src/app/shared/components/modal-shell/modal-shell.component.ts',
    },
    { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
    {
      type: NoticeBannerComponent,
      path: 'src/app/shared/components/notice-banner/notice-banner.component.ts',
    },
    {
      type: TextFieldComponent,
      path: 'src/app/shared/components/text-field/text-field.component.ts',
    },
    {
      type: NumberInputComponent,
      path: 'src/app/shared/components/number-input/number-input.component.ts',
    },
    {
      type: CustomSelectComponent,
      path: 'src/app/shared/components/custom-select/custom-select.component.ts',
    },
    {
      type: ProductThumbnailComponent,
      path: 'src/app/shared/components/product-thumbnail/product-thumbnail.component.ts',
    },
    {
      type: CustomCheckboxComponent,
      path: 'src/app/shared/components/custom-checkbox/custom-checkbox.component.ts',
    },
  ]);
});
afterAll(() => restore?.());
