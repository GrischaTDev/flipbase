import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { VintedCategoryService } from '../../../platform-admin/services/vinted-category.service';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedListingDraftService } from '../../services/vinted-listing-draft.service';
import { VintedListingImageService } from '../../services/vinted-listing-image.service';
import { VintedListingEditorComponent } from './vinted-listing-editor.component';
import { emptyVintedListingContent } from '../../models/vinted-listing-content';
import { listingCategoryFixture } from '../../../../../../e2e/support/vinted-listing-category-fixture';
import { buildVintedListingFieldSelection } from '../../models/vinted-listing-field-selection';
import type { VintedListingJob } from '../../models/vinted-listing-job';
import type { VintedListingDraft } from '../../models/vinted-listing-draft';

const account = {
  marketplace: 'vinted',
  workspaceId: 'workspace-a',
  connectionId: 'account-a',
  externalAccountId: '123',
  displayName: 'Mein Konto',
  executionMode: 'cloud',
  status: 'connected',
};
const selection = () =>
  buildVintedListingFieldSelection(listingCategoryFixture(), {
    sizeId: 208,
    conditionId: 2,
    colorIds: [2, 1],
    materialIds: [44],
    packageSizeId: 2,
  });

const draft = {
  id: '1',
  workspaceId: 'workspace-a',
  connectionId: null,
  revision: 1,
  content: emptyVintedListingContent(),
  images: [],
  inventoryItemId: null,
  createdAt: '2026-10-09T12:00:00Z',
  updatedAt: '2026-10-09T12:00:00Z',
};
const queuedJob = (draftRevision: number): VintedListingJob => ({
  id: '10',
  workspaceId: 'workspace-a',
  draftId: '1',
  connectionId: 'account-a',
  draftRevision,
  action: 'publish',
  state: 'queued',
  executionMode: 'cloud',
  externalAccountId: '123',
  version: 1,
  scheduledAt: null,
  timeZone: null,
  latePolicy: 'pause_after_30_minutes',
  errorCode: null,
  externalId: null,
  providerState: null,
  verifiedAt: null,
  createdAt: draft.createdAt,
  updatedAt: draft.updatedAt,
  replacesJobId: null,
});
async function settle() {
  TestBed.tick();
  for (let index = 0; index < 12; index++) await Promise.resolve();
  TestBed.tick();
}
function publicationInput(f: ReturnType<typeof setup>) {
  const image = {
    id: '2',
    storagePath: 'workspace-a/1/2.jpg',
    fileName: 'jacke.jpg',
    mimeType: 'image/jpeg',
    byteSize: 123,
  };
  f.create.mockImplementation(async (_workspace, content, connectionId) => ({
    ...draft,
    content,
    connectionId,
    images: [image],
  }));
  f.component.images.set([
    {
      key: image.id,
      storagePath: image.storagePath,
      file: null,
      fileName: image.fileName,
      previewUrl: 'https://images.example.test/jacke.jpg',
    },
  ]);
  f.component.form.patchValue({
    title: 'Meine Jacke',
    description: 'Gut erhalten.',
    price: '18',
    categoryId: '1223',
    connectionId: 'account-a',
  });
}
function setup(query: Record<string, string> = {}) {
  const workspace = signal({ id: 'workspace-a', archived_at: null });
  const connections = signal([account]);
  const create = vi.fn().mockImplementation(async (_workspace, content, connectionId) => ({
    ...draft,
    content,
    connectionId,
  }));
  const save = vi.fn().mockImplementation(async (current, content, connectionId) => ({
    ...current,
    content,
    connectionId,
    revision: current.revision + 1,
  }));
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: signal({ id: 'user-a' }) } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      {
        provide: MarketplaceAccountStore,
        useValue: {
          canManage: signal(true),
          selectedConnection: signal(null),
          connections,
        },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: new BehaviorSubject(convertToParamMap({})),
          snapshot: { paramMap: convertToParamMap({}), queryParamMap: convertToParamMap(query) },
        },
      },
      { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
      { provide: ConfirmDialogService, useValue: { frage: vi.fn().mockResolvedValue(false) } },
      {
        provide: VintedCategoryService,
        useValue: { readSnapshot: vi.fn().mockResolvedValue({ categories: [], status: {} }) },
      },
      {
        provide: VintedListingDraftService,
        useValue: { create, save, load: vi.fn().mockResolvedValue(draft) },
      },
      {
        provide: VintedListingImageService,
        useValue: {
          previews: vi.fn().mockResolvedValue([]),
          setOrder: vi.fn().mockImplementation(async (current) => current),
        },
      },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new VintedListingEditorComponent());
  return {
    component,
    create,
    save,
    workspace,
    connections,
    imageApi: TestBed.inject(VintedListingImageService),
  };
}
afterEach(() => {
  TestBed.resetTestingModule();
  vi.useRealTimers();
});
describe('Vinted-Inserateditor', () => {
  it('öffnet ruhig, speichert unvollständig und zeigt fehlende Angaben erst nach angeforderter Prüfung', async () => {
    const { component } = setup();
    await settle();
    expect(component.visibleFieldErrors()).toEqual({});
    component.form.patchValue({ categoryId: '1223', connectionId: 'account-a' });
    expect(component.canStartPublication()).toBe(true);
    await component.save();
    expect(component.status()).toBe('Entwurf gespeichert');
    expect(component.visibleFieldErrors()).toEqual({});
    await component.openPublication();
    expect(component.visibleFieldErrors()['title']).toBeTruthy();
    expect(component.publication()).toBeNull();
  });
  it('speichert unvollständige Inhalte weiter, verhindert aber eine Veröffentlichung ohne Titel, Text, Preis und Foto', async () => {
    const { component } = setup();
    await settle();
    component.form.patchValue({ categoryId: '1223', connectionId: 'account-a' });
    expect(component.canSave()).toBe(true);
    expect(component.canStartPublication()).toBe(true);
    await component.save();
    expect(component.draft()?.content.title).toBe('');
    expect(component.dirty()).toBe(false);
    expect(component.canPreparePublication()).toBe(false);
    await component.openPublication();
    expect(component.publication()).toBeNull();
  });
  it('meldet einen Nullpreis schon im Editor und erhält ihn im unvollständigen Entwurf', async () => {
    const { component } = setup();
    await settle();
    component.form.controls.price.setValue('0,00');
    expect(component.priceError()).toContain('größer als 0');
    expect(component.canSave()).toBe(true);
    await component.save();
    expect(component.draft()?.content.priceCents).toBe(0);
  });
  it('übernimmt das ausdrücklich gewählte Konto aus der Übersicht', async () => {
    const { component, connections } = setup({
      connectionId: 'account-b',
      workspaceId: 'workspace-a',
    });
    connections.set([account, { ...account, connectionId: 'account-b' }]);
    await settle();
    expect(component.form.controls.connectionId.value).toBe('account-b');
  });
  it('übernimmt keine Kontovorwahl aus einem anderen Arbeitsbereich', async () => {
    const { component } = setup({ connectionId: 'account-a', workspaceId: 'workspace-b' });
    await settle();
    expect(component.form.controls.connectionId.value).toBeNull();
    expect(component.error()).toContain('nicht mehr verfügbar');
  });
  it('saves pending input first, opens only the saved revision and rejects a previous preview after an immediate edit', async () => {
    const f = setup();
    const { component, create } = f;
    await settle();
    publicationInput(f);
    expect(component.canPreparePublication()).toBe(false);
    expect(component.canStartPublication()).toBe(true);
    const opening = component.openPublication();
    expect(component.publication()).toBeNull();
    await opening;
    expect(create).toHaveBeenCalledTimes(1);
    expect(component.dirty()).toBe(false);
    expect(component.publication()?.draft).toEqual(component.draft());
    expect(component.publication()?.account.externalAccountId).toBe('123');
    const accepted = queuedJob(component.draft()!.revision);
    component.form.controls.title.setValue('Noch nicht gespeichert');
    component.publicationAccepted(accepted);
    expect(component.publicationAnnouncement()).toBe('');
    await settle();
    expect(component.publication()).toBeNull();
  });
  it('closes an accepted preview and requests a history refresh without claiming Vinted success', async () => {
    const f = setup();
    const { component, connections } = f;
    await settle();
    publicationInput(f);
    await component.save();
    component.openPublication();
    const accepted = queuedJob(component.draft()!.revision);
    component.publicationAccepted(accepted);
    expect(component.publication()).toBeNull();
    expect(component.publicationAnnouncement()).toContain('beauftragt');
    expect(component.jobRefresh()).toBe(1);
    component.openPublication();
    connections.set([{ ...account, externalAccountId: '456' }]);
    component.publicationAccepted(accepted);
    expect(component.jobRefresh()).toBe(1);
    await settle();
    expect(component.publication()).toBeNull();
  });
  it('zeigt gelesene Textgrenzen früh, erhält überlange Entwürfe und verwirft Grenzen nach Kategorieänderung', async () => {
    const { component } = setup();
    await settle();
    component.form.patchValue({
      categoryId: '1223',
      connectionId: 'account-a',
      title: 'Mein Titel',
    });
    component.openFieldSelection();
    component.categoryFieldsLoaded({ ...listingCategoryFixture(), titleMaxLength: 5 });
    expect(component.fieldErrors()['title']).toContain('5 Zeichen');
    expect(component.textLimitHelp('title')).toBe('10 von 5 Zeichen.');
    await component.save();
    expect(component.draft()?.content.title).toBe('Mein Titel');
    component.form.controls.categoryId.setValue('2738');
    expect(component.categorySchema()).toBeNull();
    expect(component.fieldErrors()['title']).toBeUndefined();
  });
  it.each(['workspace', 'connection', 'external-account', 'category'])(
    'übernimmt keine verspätete Kategorieantwort nach Änderung von %s',
    async (change) => {
      const { component, workspace, connections } = setup();
      await settle();
      component.form.patchValue({ categoryId: '1223', connectionId: 'account-a' });
      component.openFieldSelection();
      if (change === 'workspace') workspace.set({ id: 'workspace-b', archived_at: null });
      if (change === 'connection') component.form.controls.connectionId.setValue('account-b');
      if (change === 'external-account')
        connections.set([{ ...account, externalAccountId: '456' }]);
      if (change === 'category') component.form.controls.categoryId.setValue('2738');
      component.categoryFieldsLoaded(listingCategoryFixture());
      expect(component.categorySchema()).toBeNull();
    },
  );
  it('verwendet nach einem Kontowechsel und Rückwechsel keine frühere Kategorieantwort erneut', async () => {
    const { component, connections } = setup();
    await settle();
    component.form.patchValue({ categoryId: '1223', connectionId: 'account-a' });
    component.openFieldSelection();
    component.categoryFieldsLoaded(listingCategoryFixture());
    expect(component.categorySchema()).not.toBeNull();
    connections.set([{ ...account, externalAccountId: '456' }]);
    await settle();
    connections.set([account]);
    expect(component.categorySchema()).toBeNull();
  });
  it('bewahrt alle Fotos eines größeren alten Entwurfs, sperrt aber dessen Veröffentlichung', async () => {
    const f = setup();
    await settle();
    publicationInput(f);
    const image = f.component.images()[0];
    f.component.images.set(
      Array.from({ length: 21 }, (_, index) => ({ ...image, key: String(index + 1) })),
    );
    expect(f.component.images()).toHaveLength(21);
    expect(f.component.fieldErrors()['photos']).toContain('20');
    expect(f.component.canStartPublication()).toBe(true);
    await f.component.openPublication();
    expect(f.component.publication()).toBeNull();
    f.component.changeImages(f.component.images().slice(0, 20));
    expect(f.component.canStartPublication()).toBe(true);
  });
  it('saves canonical category choices without overwriting pending title, brand or price', async () => {
    const { component, create } = setup();
    await settle();
    component.form.patchValue({
      title: 'Meine Jacke',
      description: 'Tragespuren',
      price: '20,50',
      brand: 'Jako',
      categoryId: '1223',
      connectionId: 'account-a',
    });
    component.openFieldSelection();
    component.selectFields(selection());
    await component.save();
    expect(create.mock.calls[0][1]).toMatchObject({
      title: 'Meine Jacke',
      description: 'Tragespuren',
      priceCents: 2050,
      brandLabel: 'Jako',
      sizeId: 208,
      sizeLabel: 'M',
      conditionId: 2,
      colorIds: [2, 1],
      colorLabels: ['Blau', 'Schwarz'],
      materialIds: [44],
      packageSizeId: 2,
    });
    expect(component.fieldSelection()).toBeNull();
    expect(component.packageLabel()).toBe('Mittel');
  });
  it('drops only edited choice IDs and clears all category choices after changing category', async () => {
    const { component } = setup();
    await settle();
    component.form.patchValue({ categoryId: '1223', connectionId: 'account-a' });
    component.openFieldSelection();
    component.selectFields(selection());
    component.form.controls.size.setValue('XL');
    expect(component.content()).toMatchObject({
      sizeId: null,
      conditionId: 2,
      colorIds: [2, 1],
      packageSizeId: 2,
    });
    component.form.controls.size.setValue('M');
    expect(component.content().sizeId).toBeNull();
    component.form.controls.categoryId.setValue('2738');
    expect(component.content()).toMatchObject({
      conditionId: null,
      colorIds: [],
      materialIds: [],
      packageSizeId: null,
    });
    expect(component.packageLabel()).toBe('Noch nicht festgelegt');
  });
  it.each(['workspace', 'connection', 'external-account', 'category'])(
    'ignores a previous field selection immediately after changing %s',
    async (change) => {
      const { component, workspace, connections } = setup();
      await settle();
      component.form.patchValue({ categoryId: '1223', connectionId: 'account-a' });
      component.openFieldSelection();
      if (change === 'workspace') workspace.set({ id: 'workspace-b', archived_at: null });
      if (change === 'connection') component.form.controls.connectionId.setValue('account-b');
      if (change === 'external-account')
        connections.set([{ ...account, externalAccountId: '456' }]);
      if (change === 'category') component.form.controls.categoryId.setValue('2738');
      component.selectFields(selection());
      expect(component.form.controls.size.value).toBe('');
      expect(component.content().sizeId).toBeNull();
      await settle();
      if (change === 'external-account' || change === 'category')
        expect(component.fieldSelection()?.categoryId).toBe(change === 'category' ? 2738 : 1223);
      else expect(component.fieldSelection()).toBeNull();
    },
  );
  it('requires an eligible target and keeps category selection usable with an invalid price', async () => {
    const { component, connections } = setup();
    await settle();
    component.form.controls.categoryId.setValue('1223');
    component.openFieldSelection();
    expect(component.fieldSelection()).toBeNull();
    component.form.controls.connectionId.setValue('account-a');
    for (const patch of [
      { executionMode: 'local' },
      { status: 'paused' },
      { workspaceId: 'foreign' },
    ]) {
      connections.set([{ ...account, ...patch }]);
      component.openFieldSelection();
      expect(component.fieldSelection()).toBeNull();
    }
    connections.set([account]);
    component.form.controls.price.setValue('20,');
    component.openFieldSelection();
    expect(component.fieldSelection()?.categoryId).toBe(1223);
    component.selectFields(selection(), true);
    expect(component.form.controls.size.value).toBe('M');
    expect(component.content().sizeId).toBe(208);
    expect(component.content().categoryId).toBe(1223);
    expect(component.form.controls.price.value).toBe('20,');
    expect(component.error()).toBeNull();
  });
  it('keeps category fields absent from the response and rejects selections while saving', async () => {
    const { component } = setup();
    await settle();
    component.applyTemplate({
      ...emptyVintedListingContent(),
      categoryId: 1223,
      conditionId: 2,
      conditionLabel: 'Sehr gut',
      packageSizeId: 2,
    });
    component.form.controls.connectionId.setValue('account-a');
    component.openFieldSelection();
    component.saving.set(true);
    component.selectFields(selection());
    expect(component.form.controls.size.value).toBe('');
    component.saving.set(false);
    const schema = listingCategoryFixture();
    component.selectFields(
      buildVintedListingFieldSelection(
        { ...schema, fields: schema.fields.filter((field) => field.field === 'size') },
        { sizeId: 208, conditionId: null, colorIds: [], materialIds: [], packageSizeId: null },
      ),
    );
    expect(component.content()).toMatchObject({
      sizeId: 208,
      conditionId: 2,
      conditionLabel: 'Sehr gut',
      packageSizeId: 2,
    });
  });
  it('saves the selected brand without replacing other pending fields', async () => {
    const { component, create } = setup();
    await settle();
    component.form.patchValue({ title: 'Meine Jacke', description: 'Tragespuren', price: '20,50' });
    component.openBrandSelection();
    component.selectBrand({ brandId: 254956, brandLabel: 'Jako' });
    await component.save();
    expect(create.mock.calls[0][1]).toMatchObject({
      brandId: 254956,
      brandLabel: 'Jako',
      title: 'Meine Jacke',
      description: 'Tragespuren',
      priceCents: 2050,
    });
    expect(component.brandSelectionContext()).toBeNull();
  });
  it('drops a selected brand ID after changing its text or category', async () => {
    const { component } = setup();
    await settle();
    component.openBrandSelection();
    component.selectBrand({ brandId: 254956, brandLabel: 'Jako' });
    component.form.controls.brand.setValue('Jako-o');
    expect(component.content().brandId).toBeNull();
    component.form.controls.brand.setValue('Jako');
    expect(component.content().brandId).toBeNull();
    component.openBrandSelection();
    component.selectBrand({ brandId: 254956, brandLabel: 'Jako' });
    component.form.controls.categoryId.setValue('1223');
    expect(component.content().brandId).toBeNull();
  });
  it('rejects an old brand selection immediately after a workspace change', async () => {
    const { component, workspace } = setup();
    await settle();
    component.openBrandSelection();
    workspace.set({ id: 'workspace-b', archived_at: null });
    component.selectBrand({ brandId: 254956, brandLabel: 'Jako' });
    expect(component.form.controls.brand.value).toBe('');
    await settle();
    expect(component.brandSelectionContext()).toBeNull();
  });
  it('does not apply a choice while saving or without an open brand dialog', async () => {
    const { component } = setup();
    await settle();
    component.selectBrand({ brandId: 254956, brandLabel: 'Jako' });
    expect(component.form.controls.brand.value).toBe('');
    component.openBrandSelection();
    component.saving.set(true);
    component.selectBrand({ brandId: 254956, brandLabel: 'Jako' });
    expect(component.form.controls.brand.value).toBe('');
  });
  it('clears category-specific attributes when choosing another category', async () => {
    const { component, create } = setup();
    await settle();
    component.applyTemplate({
      ...emptyVintedListingContent(),
      categoryId: 1223,
      attributes: { width: '42' },
    });
    component.form.controls.categoryId.setValue('2738');
    await component.save();
    expect(create.mock.calls[0][1].attributes).toEqual({});
  });
  it('does not create an empty draft on opening', async () => {
    const { component, create } = setup();
    await settle();
    expect(component.loading()).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
  it('saves only on request, never while the image dialog is open', async () => {
    vi.useFakeTimers();
    const { component, create } = setup();
    await settle();
    component.form.controls.title.setValue('Jacke');
    await vi.advanceTimersByTimeAsync(5000);
    expect(create).not.toHaveBeenCalled();
    expect(component.dirty()).toBe(true);
    component.setImageEditing(true);
    await component.save();
    expect(create).not.toHaveBeenCalled();
    component.setImageEditing(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(create).not.toHaveBeenCalled();
    await component.save();
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('stays on the new listing page after saving and updates the same draft afterwards', async () => {
    const { component, create } = setup();
    const router = TestBed.inject(Router);
    const save = vi.spyOn(TestBed.inject(VintedListingDraftService), 'save');
    await settle();
    component.form.controls.title.setValue('Jacke');
    await component.save();
    expect(create).toHaveBeenCalledTimes(1);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.openedSavedDraft()).toBe(false);
    expect(component.dirty()).toBe(false);
    component.form.controls.title.setValue('Jacke in Blau');
    await component.save();
    expect(create).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
  it('keeps entered text after a failed save', async () => {
    const { component, create } = setup();
    await settle();
    create.mockRejectedValueOnce(new Error('Verbindung verloren'));
    component.form.controls.title.setValue('Meine Jacke');
    await component.save();
    expect(component.form.controls.title.value).toBe('Meine Jacke');
    expect(component.dirty()).toBe(true);
    expect(component.error()).toContain('Verbindung verloren');
  });
  it('replaces an existing image without temporarily removing it before upload', async () => {
    const { component, imageApi } = setup();
    await settle();
    const images = Array.from({ length: 100 }, (_, index) => ({
      id: String(index + 1),
      storagePath: `workspace-a/1/${index + 1}.jpg`,
      fileName: 'old.jpg',
      mimeType: 'image/jpeg' as const,
      byteSize: 10,
    }));
    const full = { ...draft, images };
    component.draft.set(full);
    const file = new File(['crop'], 'crop.jpg', { type: 'image/jpeg' });
    const upload = vi.fn().mockImplementation(async (current) => ({
      ...current,
      revision: current.revision + 1,
      images: [{ ...images[0], id: '101', fileName: 'crop.jpg' }, ...images.slice(1)],
    }));
    Object.assign(imageApi, { upload });
    component.changeImages(
      images.map((image, index) => ({
        key: image.id,
        storagePath: index === 0 ? null : image.storagePath,
        file: index === 0 ? file : null,
        fileName: image.fileName,
        previewUrl: '',
      })),
    );
    await component.save();
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ images }), file, '1');
    expect(component.dirty()).toBe(false);
  });
  it.each(['rename', 'crop'] as const)(
    'reserves an existing image for its own %s when a new main image comes first',
    async (operation) => {
      const { component, imageApi } = setup();
      await settle();
      const original = {
        id: '2',
        storagePath: 'workspace-a/1/2.jpg',
        fileName: 'old.jpg',
        mimeType: 'image/jpeg' as const,
        byteSize: 3,
      };
      component.draft.set({ ...draft, images: [original] });
      const newFile = new File(['new'], 'new.jpg', { type: 'image/jpeg' });
      const replacement = new File(['old'], 'renamed.jpg', { type: 'image/jpeg' });
      const renamedFile = vi.fn().mockResolvedValue(replacement);
      let nextId = 3;
      const upload = vi
        .fn()
        .mockImplementation(
          async (current: VintedListingDraft, file: File, replaceId?: string) => ({
            ...current,
            revision: current.revision + 1,
            images: [
              ...current.images.filter((image) => image.id !== replaceId),
              {
                ...original,
                id: String(nextId++),
                fileName: file.name,
              },
            ],
          }),
        );
      Object.assign(imageApi, { upload, renamedFile });
      component.changeImages([
        { key: 'new', file: newFile, storagePath: null, fileName: 'new.jpg', previewUrl: '' },
        {
          key: '2',
          file: operation === 'crop' ? replacement : null,
          storagePath: original.storagePath,
          fileName: 'renamed.jpg',
          previewUrl: '',
        },
      ]);
      await component.save();
      expect(upload).toHaveBeenCalledTimes(2);
      expect(upload.mock.calls[0][2]).toBeUndefined();
      expect(upload.mock.calls[1][2]).toBe('2');
      expect(component.draft()?.images.map((image) => image.fileName)).toEqual([
        'new.jpg',
        'renamed.jpg',
      ]);
      expect(component.error()).toBeNull();
      expect(component.dirty()).toBe(false);
    },
  );
  it('keeps typing during saving and queues the new revision', async () => {
    const { component, create } = setup();
    await settle();
    let complete!: (value: typeof draft) => void;
    create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    component.form.controls.title.setValue('Erste Fassung');
    const saving = component.save();
    component.form.controls.title.setValue('Weitergeschrieben');
    complete({ ...draft, content: { ...draft.content, title: 'Erste Fassung' } });
    await saving;
    expect(component.form.controls.title.value).toBe('Weitergeschrieben');
    expect(component.dirty()).toBe(true);
  });
  it('ignores a saved response after switching the workspace', async () => {
    const { component, create, workspace } = setup();
    await settle();
    let complete!: (value: typeof draft) => void;
    create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    component.form.controls.title.setValue('Altes Formular');
    const saving = component.save();
    workspace.set({ id: 'workspace-b', archived_at: null });
    await settle();
    complete(draft);
    await saving;
    expect(component.draft()).toBeNull();
    expect(component.form.controls.title.value).toBe('');
  });
  it('releases the old image dialog lock when loading a different workspace', async () => {
    const { component, workspace, create } = setup();
    await settle();
    component.setImageEditing(true);
    workspace.set({ id: 'workspace-b', archived_at: null });
    await settle();
    expect(component.imageEditing()).toBe(false);
    component.form.controls.title.setValue('Neuer Arbeitsbereich');
    await component.save();
    expect(create).toHaveBeenCalledWith(
      'workspace-b',
      expect.objectContaining({ title: 'Neuer Arbeitsbereich' }),
      null,
      expect.any(String),
    );
  });
});

it('befüllt den geöffneten Entwurf ohne neuen Entwurf oder unmittelbares Speichern', async () => {
  const f = setup();
  await settle();
  f.component.form.controls.connectionId.setValue('account-a');
  f.component.copying.set(true);
  const content = {
    ...emptyVintedListingContent(),
    title: 'Übernommener Titel',
    description: 'Quelle',
  };
  f.component.applyCopiedFields({ content, fields: ['title', 'description'] });
  expect(f.component.form.controls.title.value).toBe(content.title);
  expect(f.component.form.controls.connectionId.value).toBe('account-a');
  expect(f.component.dirty()).toBe(true);
  expect(f.component.copying()).toBe(false);
  expect(f.create).not.toHaveBeenCalled();
  expect(f.save).not.toHaveBeenCalled();
});

it('erhaelt einen halb eingegebenen Preis bei ausschliesslicher Titeluebernahme', async () => {
  const f = setup();
  await settle();
  f.component.form.controls.price.setValue('12,');
  f.component.applyCopiedFields({
    content: { ...f.component.content(), title: 'Neuer Titel' },
    fields: ['title'],
  });
  expect(f.component.form.controls.price.value).toBe('12,');
  expect(f.component.form.controls.title.value).toBe('Neuer Titel');
});
