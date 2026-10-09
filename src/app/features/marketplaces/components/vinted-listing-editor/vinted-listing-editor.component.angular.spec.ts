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
          connections: signal([]),
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
    imageApi: TestBed.inject(VintedListingImageService),
  };
}
afterEach(() => {
  TestBed.resetTestingModule();
  vi.useRealTimers();
});
describe('Vinted-Inserateditor', () => {
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
