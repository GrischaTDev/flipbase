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

const account = {
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
async function settle() {
  TestBed.tick();
  for (let index = 0; index < 12; index++) await Promise.resolve();
  TestBed.tick();
}
function setup() {
  const workspace = signal({ id: 'workspace-a', archived_at: null });
  const connections = signal([account]);
  const create = vi.fn().mockImplementation(async (_workspace, content) => ({ ...draft, content }));
  const save = vi.fn().mockImplementation(async (current, content) => ({
    ...current,
    content,
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
          snapshot: { paramMap: convertToParamMap({}) },
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
      expect(component.fieldSelection()).toBeNull();
    },
  );
  it('requires an eligible target and valid current form before opening the field chooser', async () => {
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
    expect(component.fieldSelection()).toBeNull();
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
  it('pauses autosaving while the image dialog is open and resumes after closing', async () => {
    vi.useFakeTimers();
    const { component, create } = setup();
    await settle();
    component.form.controls.title.setValue('Jacke');
    component.setImageEditing(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(create).not.toHaveBeenCalled();
    await component.save();
    expect(create).not.toHaveBeenCalled();
    component.setImageEditing(false);
    await vi.advanceTimersByTimeAsync(800);
    expect(create).toHaveBeenCalledTimes(1);
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
