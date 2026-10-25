import { listingTransferRendering } from '../../../../../../e2e/support/listing-transfer-rendering';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { KleinanzeigenListingJobService } from '../../services/kleinanzeigen-listing-job.service';
import { provideRouter } from '@angular/router';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, afterEach, beforeEach, beforeAll, afterAll } from 'vitest';
import { KleinanzeigenListingHandoffService } from '../../services/kleinanzeigen-listing-handoff.service';
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
  const settings = {
    ready: signal(true),
    isKleinanzeigenEnabled: signal(true),
    isMarketplaceEnabled: (id: string) =>
      id !== 'kleinanzeigen' || settings.isKleinanzeigenEnabled(),
  };
  const transfers = { prepare: vi.fn(), save: vi.fn(), cancel: vi.fn() };
  const handoff = { open: vi.fn().mockResolvedValue(undefined) };
  const accounts = { readAccounts: vi.fn() };
  const schemas = { browse: vi.fn(), cancel: vi.fn(), bindingIssue: signal<string | null>(null) };
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
    schemas.bindingIssue.set(null);
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
    TestBed.overrideProvider(KleinanzeigenListingHandoffService, { useValue: handoff });
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
  it('bietet ohne Zielkonto den direkten Einstieg zum Hinzufügen im Dialog', async () => {
    accounts.readAccounts.mockResolvedValue({ canManage: true, accounts: [] });
    const f = await create();
    f.componentInstance.platform.setValue('kleinanzeigen');
    f.detectChanges();
    const add = Array.from(
      f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.trim() === 'Konto hinzufügen');
    expect(add).toBeDefined();
    add!.click();
    expect(f.componentInstance.accountManagementOpen()).toBe(true);
    expect(f.componentInstance.target.value).toBe('');
    expect(transfers.prepare).not.toHaveBeenCalled();
    accounts.readAccounts.mockResolvedValue({ canManage: true, accounts: [account] });
    await f.componentInstance.accountChanged();
    expect(f.componentInstance.accountManagementOpen()).toBe(false);
    expect(f.componentInstance.targetOptions().map((option) => option.value)).toEqual(['9']);
    expect(f.componentInstance.target.value).toBe('');
    expect(f.componentInstance.error()).toBeNull();
    expect(transfers.prepare).not.toHaveBeenCalled();
  });
  it('öffnet nach Plattform und Konto automatisch die vorbefüllten Felder ohne Übernahmebutton', async () => {
    const f = await create();
    expect(f.nativeElement.textContent).not.toContain('Vinted-Daten übernehmen');
    expect(f.nativeElement.querySelector('app-marketplace-platform-picker')).toBeTruthy();
    f.componentInstance.platform.setValue('kleinanzeigen');
    f.componentInstance.target.setValue('9');
    await f.whenStable();
    f.detectChanges();
    expect(f.componentInstance.form.controls.description.value).toBe(content.description);
    expect(transfers.prepare).toHaveBeenCalledTimes(1);
  });
  it('bewahrt gespeicherten Beschreibungstext über API, Mapping und FormControl bis ins DOM und Speichern', async () => {
    const description = 'Erste Zeile mit Größe M\nZweite Zeile: vollständige Beschreibung.';
    const invoke = vi.fn().mockResolvedValue({
      error: null,
      data: {
        state: 'ready',
        workspaceId: source.workspaceId,
        targetConnectionId: '9',
        connectionId: source.connectionId,
        entryId: source.connectionId,
        externalId: source.externalId,
        externalAccountId: '99',
        executionMode: 'cloud',
        source: {
          externalAccountId: '99',
          externalId: source.externalId,
          title: 'Jacke',
          description,
          priceCents: 1200,
          currency: 'EUR',
          photoReferences: prepared.originalPhotoReferences,
          attributeHints: {},
        },
        observedAt: '2026-10-18T00:00:00Z',
        fingerprint: 'a'.repeat(64),
      },
    });
    TestBed.overrideProvider(SupabaseService, { useValue: { client: { functions: { invoke } } } });
    TestBed.overrideProvider(ListingTransferService, {
      useFactory: () => new ListingTransferService(),
    });
    const f = await create();
    f.componentInstance.platform.setValue('kleinanzeigen');
    f.componentInstance.target.setValue('9');
    await expect.poll(() => f.componentInstance.preview()?.content.description).toBe(description);
    f.detectChanges();
    expect(f.componentInstance.form.controls.description.value).toBe(description);
    expect(f.nativeElement.querySelector('textarea').value).toBe(description);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1].body.action).toBe('prepare_transfer');
    invoke.mockResolvedValue({ error: null, data: null });
    await f.componentInstance.save();
    expect(invoke.mock.calls.at(-1)?.[1].body.content.description).toBe(description);
    expect(invoke.mock.calls.at(-1)?.[1].body.action).toBe('save_transfer');
  });
  it('bietet bei fehlender lokaler Kontobindung eine konkrete Verbindung im Dialog an', async () => {
    const f = await create();
    f.componentInstance.platform.setValue('kleinanzeigen');
    f.componentInstance.target.setValue('9');
    await f.whenStable();
    schemas.bindingIssue.set('missing');
    f.detectChanges();
    expect(f.nativeElement.textContent).not.toContain('Eigenschaften erneut laden');
    expect(schemas.browse).not.toHaveBeenCalled();
  });
  it('kehrt nach Bestätigung mit bearbeiteten Angaben zur bewussten Kontoauswahl zurück', async () => {
    const f = await create();
    const c = f.componentInstance;
    c.platform.setValue('kleinanzeigen');
    c.target.setValue('9');
    await expect.poll(() => c.preview()).toEqual(prepared);
    c.form.controls.description.setValue('Meine Änderung');
    c.form.markAsDirty();
    confirm.frage.mockResolvedValue(false);
    await c.back();
    expect(c.preview()).toEqual(prepared);
    confirm.frage.mockResolvedValue(true);
    await c.back();
    f.detectChanges();
    expect(c.preview()).toBeNull();
    expect(c.target.value).toBe('');
    expect(c.step()).toBe('account');
    await c.back();
    expect(c.step()).toBe('platform');
  });
  it('geht ohne Rückfrage zur Kontoauswahl zurück, wenn nur unveränderte Quelldaten geöffnet sind', async () => {
    const f = await create();
    const c = f.componentInstance;
    c.platform.setValue('kleinanzeigen');
    c.target.setValue('9');
    await expect.poll(() => c.preview()).toEqual(prepared);
    await c.back();
    expect(confirm.frage).not.toHaveBeenCalled();
    expect(c.preview()).toBeNull();
    expect(c.step()).toBe('account');
  });
  it.each(['category', 'shippingGroup', 'shippingMethods'] as const)(
    'schützt ungespeicherte Änderung an %s beim Zurückgehen auch nach Speicherung',
    async (field) => {
      const f = await create();
      const c = f.componentInstance;
      c.platform.setValue('kleinanzeigen');
      c.target.setValue('9');
      await expect.poll(() => c.preview()).toEqual(prepared);
      c.form.controls.title.setValue('Jacke');
      c.form.controls.shippingType.setValue('both');
      c.shippingGroup.setValue('small');
      c.chooseMethods(['dhl']);
      transfers.save.mockResolvedValue({
        id: 'draft',
        revision: 1,
        content: c.content(),
        imagesComplete: true,
      });
      await c.save();
      expect(c.form.pristine && c.attributes.pristine).toBe(true);
      if (field === 'category') c.categoryPath.set('153/160/hemden');
      if (field === 'shippingGroup') c.shippingGroup.setValue('medium');
      if (field === 'shippingMethods') c.chooseMethods(['hermes']);
      confirm.frage.mockResolvedValue(false);
      await c.back();
      expect(confirm.frage).toHaveBeenCalledOnce();
      expect(c.preview()).toEqual(prepared);
      expect(c.target.value).toBe('9');
      confirm.frage.mockResolvedValue(true);
      await c.back();
      expect(c.preview()).toBeNull();
      expect(c.target.value).toBe('');
    },
  );
  it('erhält nach erneuter Freigabe die lokale Kategorie und den Beschreibungstext ohne Anbieterabruf', async () => {
    const f = await create();
    const c = f.componentInstance;
    c.platform.setValue('kleinanzeigen');
    c.target.setValue('9');
    await expect.poll(() => c.preview()).toEqual(prepared);
    c.form.controls.description.setValue('Mein bearbeiteter Text');
    c.categoryPath.set('153/160/hemden');
    accounts.readAccounts.mockResolvedValue({
      canManage: true,
      accounts: [{ ...account, localGrant: { ...account.localGrant, generation: 3 } }],
    });
    schemas.browse.mockResolvedValue({
      categoryPath: '153/160/hemden',
      categoryLabel: 'Hemden',
      choices: [],
      schema: null,
      schemaRevision: null,
    });
    await c.accountChanged();
    expect(schemas.browse).not.toHaveBeenCalled();
    expect(c.categoryPath()).toBe('153/160/hemden');
    expect(c.form.controls.description.value).toBe('Mein bearbeiteter Text');
    expect(transfers.prepare).toHaveBeenCalledTimes(1);
  });
  it('verwirft eine verspätete Kategorieantwort nach Wechsel zurück zur Plattformauswahl', async () => {
    const f = await create();
    const c = f.componentInstance;
    c.platform.setValue('kleinanzeigen');
    c.target.setValue('9');
    await expect.poll(() => c.preview()).toEqual(prepared);
    let complete!: (value: unknown) => void;
    schemas.browse.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const pending = c.browse('153/160/hemden');
    c.platform.setValue('');
    complete({
      categoryPath: '153/160/hemden',
      categoryLabel: 'Hemden',
      choices: [],
      schema: null,
      schemaRevision: null,
    });
    await pending;
    expect(c.step()).toBe('platform');
    expect(c.preview()).toBeNull();
    expect(c.categoryPath()).toBe('');
  });
  it('zeigt fehlende Veröffentlichungspflichtfelder nach Inserieren direkt am Feld', async () => {
    const f = await create();
    const c = f.componentInstance;
    c.platform.setValue('kleinanzeigen');
    c.target.setValue('9');
    await expect.poll(() => c.preview()).toEqual(prepared);
    c.schema.set({
      categoryPath: '153/160/hemden',
      categoryLabel: 'Hemden',
      titleMax: 65,
      descriptionMax: 4000,
      photoCountMax: 20,
      photoBytesMax: 12582912,
      priceStepCents: 100,
      fields: [],
      shipping: { defaultGroup: null, defaultMethods: [], groups: [] },
    });
    c.schemaRevision.set('a'.repeat(64));
    f.detectChanges();
    expect(f.nativeElement.textContent).not.toContain('fünfstellige Postleitzahl');
    c.form.controls.postalCode.setValue('123');
    await c.publish();
    f.detectChanges();
    expect(
      f.nativeElement.querySelector('app-text-field[formcontrolname="postalCode"]').textContent,
    ).toContain('fünfstellige Postleitzahl');
  });
  it('zeigt Bilder zuerst und nur das Zielformular nach bewusster Kontoauswahl', async () => {
    const f = await create();
    f.componentInstance.platform.setValue('kleinanzeigen');
    f.detectChanges();
    expect(transfers.prepare).not.toHaveBeenCalled();
    expect(f.nativeElement.querySelector('[aria-label="Konto"]')).toBeTruthy();
    f.componentInstance.target.setValue('9');
    await f.whenStable();
    f.detectChanges();
    const form = f.nativeElement.querySelector('form');
    expect(form.firstElementChild.getAttribute('aria-label')).toBe('Bilder');
    expect(f.nativeElement.querySelector('[aria-label="Konto"]')).toBeNull();
    expect(f.nativeElement.querySelector('[aria-label="Plattform"]')).toBeNull();
    expect(f.nativeElement.querySelector('textarea').value).toBe(content.description);
    expect(f.nativeElement.textContent).not.toContain('Angaben aus Vinted');
    expect(f.nativeElement.textContent).not.toContain('Eigenschaften laden');
  });
  it('markiert eine wirklich fehlende Beschreibung erst nach Berührung und erhält sie bearbeitbar', async () => {
    transfers.prepare.mockResolvedValue({ ...prepared, content: { ...content, description: '' } });
    const f = await create();
    f.componentInstance.platform.setValue('kleinanzeigen');
    f.componentInstance.target.setValue('9');
    await f.whenStable();
    f.detectChanges();
    const textarea = f.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
    expect(textarea.getAttribute('aria-invalid')).toBeNull();
    expect(f.nativeElement.textContent).not.toContain('Prüfe die Beschreibung');
    textarea.dispatchEvent(new Event('blur'));
    f.detectChanges();
    expect(textarea.getAttribute('aria-invalid')).toBe('true');
    textarea.value = 'Von mir ergänzt';
    textarea.dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(f.componentInstance.content().description).toBe('Von mir ergänzt');
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
        expect(handoff.open).toHaveBeenCalledWith(
          expect.objectContaining({ connectionId: '9' }),
          expect.objectContaining({ id: 'prepared-copy', revision: 2 }),
          expect.any(String),
          expect.any(Function),
          1,
        );
    },
  );
  it('fordert auch bei einem vorgegebenen Zielkonto eine bewusste Kontoauswahl', async () => {
    const fixture = TestBed.createComponent(ListingTransferDialogComponent);
    fixture.componentRef.setInput('source', source);
    fixture.componentRef.setInput('targetConnectionId', '9');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(transfers.prepare).not.toHaveBeenCalled();
    expect(fixture.componentInstance.selectedPlatform()).toBe('kleinanzeigen');
    expect(fixture.componentInstance.target.value).toBe('');
    fixture.componentInstance.target.setValue('9');
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
  it('öffnet ohne Kategorie das gesicherte vorbefüllte Formular und startet keine automatische Veröffentlichung', async () => {
    const f = await create();
    const c = f.componentInstance;
    c.platform.setValue('kleinanzeigen');
    c.target.setValue('9');
    await expect.poll(() => c.preview()).toEqual(prepared);
    c.form.patchValue({ title: 'Jacke', price: 12 });
    transfers.save.mockImplementation(async (_preview, content) => ({
      id: 'copy',
      workspaceId: source.workspaceId,
      targetConnectionId: '9',
      revision: 2,
      status: 'prepared',
      imagesComplete: true,
      content,
    }));
    await c.publish();
    expect(schemas.browse).not.toHaveBeenCalled();
    expect(transfers.save).toHaveBeenCalledTimes(1);
    expect(handoff.open).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: '9' }),
      expect.objectContaining({ content: expect.objectContaining({ categoryId: null }) }),
      expect.any(String),
      expect.any(Function),
      1,
    );
    expect(jobs.enqueue).not.toHaveBeenCalled();
    expect(c.error()).toBeNull();
    expect(c.notice()).toContain('vorbefüllte');
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
  it('übernimmt den lokalen Kategoriepfad ohne Anbieterabruf oder Pflichtprüfung', async () => {
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
    expect(c.notice()).toBeNull();
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
    expect(schemas.browse).not.toHaveBeenCalled();
    expect(c.content().categoryId).toBe('153/160/hemden');
    expect(c.schema()).toBeNull();
  });
  it('entfernt alte Eigenschaften beim Kategorienwechsel ohne neue Liveabfrage', async () => {
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
    expect(c.attributes.getRawValue()).toEqual({});
    expect(schemas.browse).not.toHaveBeenCalled();
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
  restore = await prepareMarketplaceRendering(listingTransferRendering);
});
afterAll(() => restore?.());
