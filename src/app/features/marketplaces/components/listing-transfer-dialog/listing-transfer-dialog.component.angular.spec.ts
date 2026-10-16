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
  beforeEach(() => {
    auth.currentUser.set({ id: 'owner' });
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
    TestBed.overrideProvider(KleinanzeigenListingJobService, {
      useValue: {
        job: signal(null),
        busy: signal(false),
        error: signal(null),
        latest: vi.fn().mockResolvedValue(null),
        cancel: vi.fn(),
      },
    });
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
  it('erhält lange Quelltexte und Centbeträge zur sichtbaren Korrektur', async () => {
    const f = await create();
    f.componentInstance.target.setValue('9');
    await f.componentInstance.prepare();
    expect(f.componentInstance.form.controls.title.value).toHaveLength(66);
    expect(f.componentInstance.form.controls.price.value).toBe(12.34);
    expect(f.componentInstance.form.valid).toBe(false);
    expect(f.componentInstance.attributeHints()).toEqual([{ label: 'Zustand', value: 'Gut' }]);
  });
  it('speichert einen gültigen Entwurf ohne Kategorie, veröffentlicht dabei nichts', async () => {
    const f = await create();
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
