import { VintedCategoryFieldStore } from '../../services/vinted-category-field.store';
import { vintedListingCategorySource } from '../../models/vinted-listing-category-source';
import { VintedListingCategoryService } from '../../services/vinted-listing-category.service';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { VintedCategoryService } from '../../../platform-admin/services/vinted-category.service';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceApiService } from '../../services/marketplace-api.service';
import { VintedListingOriginalPhotoService } from '../../services/vinted-listing-original-photo.service';
import { VintedListingJobService } from '../../services/vinted-listing-job.service';
import { VintedListingDraftService } from '../../services/vinted-listing-draft.service';
import { VintedListingImageService } from '../../services/vinted-listing-image.service';
import { VintedListingEditorComponent } from './vinted-listing-editor.component';
import { emptyVintedListingContent } from '../../models/vinted-listing-content';
import { listingCategoryFixture } from '../../../../../../e2e/support/vinted-listing-category-fixture';
import { buildVintedListingFieldSelection } from '../../models/vinted-listing-field-selection';
import type { VintedListingJob } from '../../models/vinted-listing-job';
import type { VintedListingDraft } from '../../models/vinted-listing-draft';
import type { VintedListingEditorSource } from '../../models/vinted-listing-source';
import { parseMarketplacePage } from '../../models/marketplace-response';
import { VintedListingOperationStore } from '../../services/vinted-listing-operation.store';
import { listingCurrentContentFixture } from '../../../../../../services/marketplace-worker/test/fixtures/vinted-listing-current-content';
import { VintedRelistingSubmissionService } from '../../services/vinted-relisting-submission.service';
import { VintedListingPhotoSourceService } from '../../services/vinted-listing-photo-source.service';
import { VintedBrandSearchService } from '../../../platform-admin/services/vinted-brand-search.service';
import { MarketplaceBrowserTestApiService } from '../../services/marketplace-browser-test-api.service';
import { VintedActionOverviewHeaderStore } from '../../services/vinted-action-overview-header.store';
import type { MarketplaceSnapshot } from '../../models/marketplace-read.models';

let restoreBindings: (() => void) | undefined;
beforeAll(async () => {
  restoreBindings = await prepareMarketplaceRendering([
    {
      type: VintedListingEditorComponent,
      path: 'src/app/features/marketplaces/components/vinted-listing-editor/vinted-listing-editor.component.ts',
    },
  ]);
});
afterAll(() => restoreBindings?.());

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
async function publicationInput(f: ReturnType<typeof setup>) {
  const image = {
    id: '2',
    storagePath: 'workspace-a/1/2.jpg',
    fileName: 'jacke.jpg',
    mimeType: 'image/jpeg' as const,
    byteSize: 123,
  };
  f.create.mockImplementation(async (_workspace, content, connectionId) => ({
    ...draft,
    content,
    connectionId,
    images: [],
  }));
  vi.mocked(f.imageApi.upload).mockImplementation(async (current) => ({
    ...current,
    images: [image],
  }));
  f.component.images.set([
    {
      key: image.id,
      storagePath: image.storagePath,
      file: new File([new Uint8Array(123)], 'jacke.jpg', { type: 'image/jpeg' }),
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
    brand: 'Keine Marke',
    size: 'M',
    condition: 'Sehr gut',
  });
  await settle();
  f.component.openFieldSelection();
  f.component.selectFields(selection(), true);
}
function setup(
  query: Record<string, string> = {},
  source?: VintedListingEditorSource,
  realRelisting = false,
) {
  const startRelisting = vi.fn().mockResolvedValue(undefined);
  const snapshot = signal<MarketplaceSnapshot | null>(null);
  const workspace = signal({ id: 'workspace-a', archived_at: null });
  const connections = signal([account]);
  const readListingContent = vi.fn().mockRejectedValue(new Error('Anbieter nicht erreichbar'));
  const readRelistingContent = vi.fn().mockResolvedValue({
    ...listingCurrentContentFixture(),
    aiPhoto: false,
    photoUrls: listingCurrentContentFixture().photoUrls.slice(0, 1),
  });
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
      {
        provide: VintedCategoryFieldStore,
        useValue: {
          fields: () => null,
          extraFields: () => [],
          load: async () => null,
          remember: () => undefined,
        },
      },
      {
        provide: VintedListingCategoryService,
        useValue: {
          read: vi.fn(),
          readSnapshot: vi.fn(() => TestBed.inject(VintedCategoryService).readSnapshot()),
          source: vi.fn(() =>
            vintedListingCategorySource([
              { id: 1223, parentId: null, title: 'Jacken' },
              { id: 2738, parentId: null, title: 'Schuhe' },
            ]),
          ),
        },
      },
      {
        provide: MarketplaceApiService,
        useValue: {
          listConnections: vi
            .fn()
            .mockImplementation(async () => ({ connections: connections(), canManage: true })),
        },
      },
      ...(realRelisting
        ? []
        : [{ provide: VintedRelistingSubmissionService, useValue: { start: startRelisting } }]),
      {
        provide: VintedListingPhotoSourceService,
        useValue: {
          read: vi.fn().mockResolvedValue(new Blob(['original'], { type: 'image/jpeg' })),
        },
      },
      {
        provide: VintedBrandSearchService,
        useValue: { search: vi.fn().mockResolvedValue([{ id: 254956, name: 'Jako' }]) },
      },
      {
        provide: MarketplaceBrowserTestApiService,
        useValue: {
          readListingContent: readRelistingContent,
          available: vi.fn().mockResolvedValue({
            available: true,
            readOnly: false,
            listingPublishingEnabled: true,
          }),
        },
      },
      {
        provide: VintedActionOverviewHeaderStore,
        useValue: { refresh: vi.fn().mockResolvedValue(undefined) },
      },
      {
        provide: VintedListingOriginalPhotoService,
        useValue: { read: vi.fn().mockResolvedValue(null) },
      },
      {
        provide: VintedListingJobService,
        useValue: {
          editPlan: vi.fn(),
          readPermission: vi.fn().mockResolvedValue({ allowed: true, executionMode: 'cloud' }),
          list: vi.fn().mockResolvedValue([]),
          enqueue: vi
            .fn()
            .mockImplementation(async (current: VintedListingDraft): Promise<VintedListingJob> => ({
              ...queuedJob(current.revision),
              workspaceId: current.workspaceId,
              connectionId: current.connectionId,
              draftId: current.id,
              relistExternalId: current.relistExternalId,
            })),
        },
      },
      {
        provide: AuthService,
        useValue: {
          currentUser: signal({ id: 'user-a' }),
          session: signal({ access_token: 'fixture-token' }),
        },
      },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      {
        provide: MarketplaceAccountStore,
        useValue: {
          canManage: signal(true),
          selectedConnection: signal(null),
          connections,
          snapshot,
          readListingContent,
          cachedListingDescription: vi.fn().mockReturnValue(null),
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
        useValue: {
          readSnapshot: vi.fn().mockResolvedValue({
            categories: [
              { id: 1223, parentId: null, title: 'Jacken', path: 'Damen > Kleidung > Jacken' },
              { id: 2738, parentId: null, title: 'Schuhe', path: 'Damen > Schuhe' },
            ],
            status: {},
          }),
        },
      },
      {
        provide: VintedListingDraftService,
        useValue: {
          create,
          createRelisting: vi.fn(
            async (_workspace, content, connectionId, _request, externalId) => ({
              ...draft,
              content,
              connectionId,
              relistExternalId: externalId,
            }),
          ),
          save,
          load: vi.fn().mockResolvedValue(draft),
        },
      },
      {
        provide: VintedListingImageService,
        useValue: {
          upload: vi.fn(),
          savePhotoOptions: vi.fn().mockImplementation(async (draft, photoOptions) => ({
            ...draft,
            photoOptions,
            revision: draft.revision + 1,
          })),
          previews: vi.fn().mockResolvedValue([]),
          setOrder: vi.fn().mockImplementation(async (current) => current),
        },
      },
    ],
  });
  const fixture = source ? TestBed.createComponent(VintedListingEditorComponent) : null;
  if (fixture && source) {
    fixture.componentRef.setInput('source', source);
    fixture.detectChanges();
  }
  const component =
    fixture?.componentInstance ??
    TestBed.runInInjectionContext(() => new VintedListingEditorComponent());
  return {
    component,
    fixture,
    startRelisting,
    snapshot,
    photoSources: TestBed.inject(VintedListingPhotoSourceService),
    readListingContent,
    readRelistingContent,
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
  vi.unstubAllGlobals();
});

function localRelisting(
  description: string | null = 'Lokal gespeicherter Text',
): VintedListingEditorSource {
  const entry = parseMarketplacePage(
    {
      items: [
        {
          workspaceId: 'workspace-a',
          connectionId: 'account-a',
          id: 'local-item',
          externalId: '98765',
          title: 'Lokal gespeicherter Titel',
          text: description,
          textState: description === null ? 'not_loaded' : 'loaded',
          price: 39.9,
          currency: 'EUR',
          imageUrl: 'https://images.example.test/original.jpg',
          imageUrls: ['https://images.example.test/original.jpg'],
        },
      ],
      total: 1,
      nextCursor: null,
    },
    { workspaceId: 'workspace-a', connectionId: 'account-a' },
  ).items[0];
  return { entry, mode: 'relist' };
}

describe('Relisten aus der lokalen Lesekopie', () => {
  it.each(['unberührt', 'geleert', 'bearbeitet'])(
    'übernimmt nachträglich gespeicherten Text ausschließlich in eine unberührte unbekannte Beschreibung: %s',
    async (state) => {
      const source = localRelisting(null);
      const f = setup({}, source);
      await settle();
      f.component.form.controls.title.setValue('Mein Titel bleibt');
      if (state === 'geleert') f.component.form.controls.description.markAsDirty();
      if (state === 'bearbeitet')
        f.component.form.controls.description.setValue('Mein Text bleibt');
      const emptyPage = { items: [], total: 0, nextCursor: null };
      f.snapshot.set({
        workspaceId: source.entry.workspaceId,
        connectionId: source.entry.connectionId,
        profile: null,
        publications: {
          items: [
            { ...source.entry, text: 'Text aus dem Hintergrundabgleich', textState: 'loaded' },
          ],
          total: 1,
          nextCursor: null,
        },
        conversations: emptyPage,
        sales: emptyPage,
        activity: emptyPage,
      });
      await settle();
      expect(f.component.form.controls.description.value).toBe(
        state === 'unberührt'
          ? 'Text aus dem Hintergrundabgleich'
          : state === 'geleert'
            ? ''
            : 'Mein Text bleibt',
      );
      expect(f.component.form.controls.title.value).toBe('Mein Titel bleibt');
      expect(f.readListingContent).not.toHaveBeenCalled();
      if (state === 'unberührt') {
        await f.component.submitRelisting();
        expect(f.startRelisting).toHaveBeenCalledWith(
          expect.objectContaining({
            descriptionKnown: true,
            description: 'Text aus dem Hintergrundabgleich',
          }),
        );
      }
    },
  );
  it('öffnet auch bei nicht erreichbarem Anbieter sofort mit lokalen Texten und Fotos, ohne Abruf oder Prüfung', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const f = setup({}, localRelisting());
    await settle();
    f.fixture!.detectChanges();
    expect(f.component.loading()).toBe(false);
    expect(f.component.loadError()).toBeNull();
    expect(f.component.form.controls.title.value).toBe('Lokal gespeicherter Titel');
    expect(f.component.form.controls.description.value).toBe('Lokal gespeicherter Text');
    expect(f.component.images()[0]).toMatchObject({
      file: null,
      previewUrl: 'https://images.example.test/original.jpg',
    });
    expect(f.readListingContent).not.toHaveBeenCalled();
    expect(TestBed.inject(VintedListingOriginalPhotoService).read).not.toHaveBeenCalled();
    expect(TestBed.inject(VintedCategoryService).readSnapshot).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
    expect(f.save).not.toHaveBeenCalled();
  });

  it('schließt nach dem bestätigten Klick sofort und übergibt unveränderliche Formularwerte', async () => {
    const f = setup({}, localRelisting());
    await settle();
    let finish!: () => void;
    f.startRelisting.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const closed = vi.fn();
    f.component.closed.subscribe(closed);
    f.component.form.controls.title.setValue('Mein neuer Titel');
    const task = f.component.submitRelisting();
    expect(closed).toHaveBeenCalledOnce();
    expect(f.startRelisting).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Mein neuer Titel',
        description: 'Lokal gespeicherter Text',
        descriptionKnown: true,
      }),
    );
    f.fixture!.destroy();
    finish();
    await task;
    expect(f.readListingContent).not.toHaveBeenCalled();
  });
  it('führt den echten Hintergrundauftrag nach Destroy bis zur Auftragsannahme fort', async () => {
    const source = localRelisting();
    const f = setup(
      {},
      {
        ...source,
        entry: { ...source.entry, listingContent: listingCurrentContentFixture().content },
      },
      true,
    );
    await settle();
    let finish!: (value: Blob) => void;
    vi.mocked(f.photoSources.read).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    vi.mocked(f.imageApi.upload).mockImplementation(async (current) => ({
      ...current,
      images: [
        {
          id: '2',
          storagePath: 'workspace-a/1/2.jpg',
          fileName: 'original.jpg',
          mimeType: 'image/jpeg',
          byteSize: 8,
        },
      ],
    }));
    const closed = vi.fn(() => f.fixture!.destroy());
    f.component.closed.subscribe(closed);
    const task = f.component.submitRelisting();
    expect(closed).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(f.photoSources.read).toHaveBeenCalledOnce());
    finish(new Blob(['original'], { type: 'image/jpeg' }));
    await task;
    expect(f.readListingContent).not.toHaveBeenCalled();
    expect(f.readRelistingContent).toHaveBeenCalledOnce();
    expect(TestBed.inject(VintedListingDraftService).createRelisting).toHaveBeenCalledOnce();
    expect(TestBed.inject(VintedListingJobService).enqueue).toHaveBeenCalledOnce();
    const operations = TestBed.inject(VintedListingOperationStore);
    expect(operations.entries()).toEqual([]);
    const accepted = operations.acceptedRelistings();
    expect(accepted).toHaveLength(1);
    expect(accepted[0].userId).toBe('user-a');
    expect(accepted[0].record.job).toMatchObject({
      workspaceId: source.entry.workspaceId,
      connectionId: source.entry.connectionId,
      relistExternalId: source.entry.externalId,
      draftId: accepted[0].record.draft.id,
      draftRevision: accepted[0].record.draft.revision,
      state: 'queued',
    });
    expect(accepted[0].record.draft.images).toHaveLength(1);
  });
  it.each([false, true])(
    'unterscheidet unbekannte und bewusst geleerte Beschreibung (bearbeitet: %s)',
    async (edited) => {
      const f = setup({}, localRelisting(null));
      await settle();
      if (edited) f.component.form.controls.description.markAsDirty();
      await f.component.submitRelisting();
      if (edited) expect(f.startRelisting).not.toHaveBeenCalled();
      else
        expect(f.startRelisting).toHaveBeenCalledWith(
          expect.objectContaining({ description: '', descriptionKnown: false }),
        );
    },
  );
  it('behält Fehler des echten Auftrags nach Destroy in den laufenden Aktionen', async () => {
    const source = localRelisting();
    const f = setup(
      {},
      {
        ...source,
        entry: { ...source.entry, listingContent: listingCurrentContentFixture().content },
      },
      true,
    );
    await settle();
    vi.mocked(f.photoSources.read).mockRejectedValueOnce(new Error('Foto nicht erreichbar'));
    f.component.closed.subscribe(() => f.fixture!.destroy());
    await f.component.submitRelisting();
    expect(f.component.error()).toBeNull();
    expect(TestBed.inject(VintedListingOperationStore).entries()[0]).toMatchObject({
      kind: 'relist',
      state: 'error',
      message: 'Foto nicht erreichbar',
    });
  });
});
describe('Vinted-Inserateditor', () => {
  it('übernimmt keine verspäteten Kategoriekennungen eines zuvor ausgewählten Kontos', async () => {
    const { component, connections } = setup();
    await settle();
    connections.set([account, { ...account, connectionId: 'account-b' }]);
    component.form.controls.connectionId.setValue('account-a');
    component.categorySource();
    const rememberPrevious = vi
      .mocked(TestBed.inject(VintedListingCategoryService).source)
      .mock.calls.at(-1)?.[1];
    component.form.controls.connectionId.setValue('account-b');
    component.categorySource();
    await settle();
    rememberPrevious?.({
      id: 5555,
      parentId: null,
      title: 'Alter Schalzweig',
      path: 'Alter Schalzweig',
      isLeaf: true,
    });
    component.form.controls.categoryId.setValue('5555');
    expect(component.content().categoryLabel).toBe('');
  });
  it('übernimmt nach einem Kontowechsel keinen verspäteten Kategoriefehler des alten Kontos', async () => {
    const { component, connections } = setup();
    await settle();
    connections.set([account, { ...account, connectionId: 'account-b' }]);
    component.form.controls.connectionId.setValue('account-a');
    let rejectPrevious: (error: Error) => void = () => undefined;
    vi.mocked(TestBed.inject(VintedListingCategoryService).readSnapshot).mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectPrevious = reject;
        }),
    );
    const previous = component.reloadCategories();
    component.form.controls.connectionId.setValue('account-b');
    await component.reloadCategories();
    rejectPrevious(new Error('Altes Konto nicht mehr erreichbar'));
    await previous;
    expect(component.categoryError()).toBeNull();
    expect(component.categories()).not.toHaveLength(0);
    expect(component.categoryLoading()).toBe(false);
  });
  it('sperrt die Prüfungsschaltfläche während eines langsamen Kategorienabrufs', async () => {
    const f = setup();
    await settle();
    await publicationInput(f);
    expect(f.component.canStartPublication()).toBe(true);
    f.component.categoryLoading.set(true);
    expect(f.component.canStartPublication()).toBe(false);
    f.component.categoryLoading.set(false);
    expect(f.component.canStartPublication()).toBe(true);
  });
  it.each(['loading', 'failed'])(
    'beauftragt ohne bestätigte Kategorie auch bei %s keinen vollständigen Entwurf',
    async (state) => {
      const f = setup();
      await settle();
      await publicationInput(f);
      await f.component.save();
      expect(f.component.canPreparePublication()).toBe(true);
      f.component.categories.set([]);
      if (state === 'failed') f.component.categoryError.set('Kategorien nicht erreichbar');
      expect(f.component.fieldErrors()['category']).toBeTruthy();
      expect(f.component.canPreparePublication()).toBe(false);
      await f.component.openPublication();
      expect(f.component.publication()).toBeNull();
      f.component.form.controls.title.setValue('Eingabe bleibt speicherbar');
      await f.component.save();
      expect(f.component.draft()?.content.title).toBe('Eingabe bleibt speicherbar');
    },
  );
  it('zeigt bei einer gespeicherten Oberkategorie die erforderliche Unterkategorie bereits im Editor an', async () => {
    const f = setup();
    await settle();
    f.component.form.controls.connectionId.setValue('account-a');
    await settle();
    f.component.categories.set([
      { id: 5, parentId: null, title: 'Damen', path: 'Damen' },
      { id: 16, parentId: 5, title: 'Schuhe', path: 'Damen > Schuhe' },
      { id: 17, parentId: 16, title: 'Sneaker', path: 'Damen > Schuhe > Sneaker' },
    ]);
    f.component.form.patchValue({ categoryId: '16', connectionId: 'account-a' });
    expect(f.component.fieldErrors()['category']).toContain('Unterkategorie');
    expect(f.component.canSelectFields()).toBe(true);
    f.component.form.controls.categoryId.setValue('17');
    expect(f.component.fieldErrors()['category']).toBeUndefined();
  });
  it('sichert auch einen unveränderten alten Entwurf vor der Prüfung mit eigenen Auswahlkennungen', async () => {
    const f = setup();
    await settle();
    await publicationInput(f);
    await f.component.save();
    f.component.draft.update((current) =>
      current
        ? {
            ...current,
            content: { ...current.content, sizeId: 208, conditionId: 2, attributes: {} },
          }
        : null,
    );
    expect(f.component.dirty()).toBe(false);
    await f.component.openPublication();
    expect(f.save).toHaveBeenCalledTimes(1);
    expect(f.component.publication()?.draft.content).toMatchObject({
      sizeId: 5,
      conditionId: 3,
      attributes: { flipbaseListingForm: '1' },
    });
  });
  it('öffnet ruhig, speichert unvollständig und zeigt fehlende Angaben erst nach angeforderter Prüfung', async () => {
    const { component } = setup();
    await settle();
    expect(component.visibleFieldErrors()).toEqual({});
    component.form.patchValue({ categoryId: '1223', connectionId: 'account-a' });
    await settle();
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
    await settle();
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
    await publicationInput(f);
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
    await publicationInput(f);
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
  it('verwendet eigene Textgrenzen, erhält überlange Entwürfe und bleibt bei Kontowechseln unabhängig', async () => {
    const { component, connections } = setup();
    await settle();
    component.form.patchValue({
      categoryId: '1223',
      connectionId: 'account-a',
      title: 'a'.repeat(101),
    });
    await settle();
    expect(component.fieldErrors()['title']).toContain('100 Zeichen');
    expect(component.textLimitHelp('title')).toBe('101 von 100 Zeichen.');
    await component.save();
    expect(component.draft()?.content.title).toHaveLength(101);
    connections.set([{ ...account, status: 'paused' }]);
    expect(component.categorySchema()?.titleMaxLength).toBe(100);
    component.form.controls.categoryId.setValue('2738');
    expect(component.categorySchema()?.categoryId).toBe(2738);
    expect(
      component
        .categorySchema()
        ?.fields.find((field) => field.field === 'size')
        ?.choices.some((choice) => choice.label === '38'),
    ).toBe(true);
  });
  it('bewahrt alle Fotos eines größeren alten Entwurfs, sperrt aber dessen Veröffentlichung', async () => {
    const f = setup();
    await settle();
    await publicationInput(f);
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
    await settle();
    component.openFieldSelection();
    component.selectFields(selection());
    await component.save();
    expect(create.mock.calls[0][1]).toMatchObject({
      title: 'Meine Jacke',
      description: 'Tragespuren',
      priceCents: 2050,
      brandLabel: 'Jako',
      sizeId: 5,
      sizeLabel: 'M',
      conditionId: 3,
      colorIds: [9, 1],
      colorLabels: ['Blau', 'Schwarz'],
      materialIds: [1],
      packageSizeId: 2,
    });
    expect(component.fieldSelection()).toBeNull();
    expect(component.packageLabel()).toBe('Mittel');
  });
  it('drops only edited choice IDs and clears all category choices after changing category', async () => {
    const { component } = setup();
    await settle();
    component.form.patchValue({ categoryId: '1223', connectionId: 'account-a' });
    await settle();
    component.openFieldSelection();
    component.selectFields(selection());
    component.form.controls.size.setValue('XL');
    expect(component.content()).toMatchObject({
      sizeId: 7,
      conditionId: 3,
      colorIds: [9, 1],
      packageSizeId: 2,
    });
    component.form.controls.size.setValue('M');
    expect(component.content().sizeId).toBe(5);
    component.form.controls.categoryId.setValue('2738');
    expect(component.content()).toMatchObject({
      conditionId: 3,
      colorIds: [9, 1],
      materialIds: [1],
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
      await settle();
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
      if (change !== 'workspace')
        expect(component.fieldSelection()?.categoryId).toBe(change === 'category' ? 2738 : 1223);
      else expect(component.fieldSelection()).toBeNull();
    },
  );
  it('bietet die eigenen Angaben auch ohne verbundenes Zielkonto und bei ungültiger Preiseingabe an', async () => {
    const { component, connections } = setup();
    await settle();
    component.form.controls.categoryId.setValue('1223');
    component.openFieldSelection();
    expect(component.fieldSelection()?.categoryId).toBe(1223);
    component.form.controls.connectionId.setValue('account-a');
    await settle();
    for (const patch of [
      { executionMode: 'local' },
      { status: 'paused' },
      { workspaceId: 'foreign' },
    ]) {
      connections.set([{ ...account, ...patch }]);
      component.openFieldSelection();
      expect(component.fieldSelection()?.categoryId).toBe(1223);
      expect(component.canPreparePublication()).toBe(false);
    }
    connections.set([account]);
    component.form.controls.price.setValue('20,');
    component.openFieldSelection();
    expect(component.fieldSelection()?.categoryId).toBe(1223);
    component.selectFields(selection(), true);
    expect(component.form.controls.size.value).toBe('M');
    expect(component.content().sizeId).toBe(5);
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
    await settle();
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
      sizeId: 5,
      conditionId: 3,
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
    expect(create.mock.calls[0][1].attributes).toEqual({ flipbaseListingForm: '1' });
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

it('erhält alle übrigen Artikeldaten bei Text- und Bildoptionen ohne vorzeitiges Speichern', async () => {
  const f = setup();
  await settle();
  await publicationInput(f);
  const before = f.component.form.getRawValue();
  f.component.form.controls.title.setValue('Neuer Titel');
  f.component.form.controls.description.setValue('Neue Beschreibung');
  f.component.photoFilter.set('lighter');
  expect(f.component.form.getRawValue()).toEqual({
    ...before,
    title: 'Neuer Titel',
    description: 'Neue Beschreibung',
  });
  expect(f.component.photoSize()).toBeNull();
  expect(f.create).not.toHaveBeenCalled();
  expect(f.save).not.toHaveBeenCalled();
});
it('übergibt verzögertes Relisten ohne vorab berechneten Veröffentlichungstermin', async () => {
  const f = setup();
  await settle();
  const open = vi.spyOn(f.component, 'openPublication').mockResolvedValue();
  f.component.relistTiming.set('delay');
  f.component.relistMinutes.set(3);
  await f.component.submitRelisting();
  expect(open).toHaveBeenCalledOnce();
  expect(f.component.publicationSchedule()).toBeNull();
});
it('hält eine vergangene feste Uhrzeit vor der Speicherung zurück', async () => {
  const f = setup();
  await settle();
  const open = vi.spyOn(f.component, 'openPublication').mockResolvedValue();
  f.component.relistTiming.set('scheduled');
  f.component.relistScheduleForm.setValue({ date: '2000-01-01', time: '18:00' });
  await f.component.submitRelisting();
  expect(open).not.toHaveBeenCalled();
  expect(f.component.error()).toContain('Zukunft');
});

it('hält bei gewählter Ausgabegröße die Originaldateien im Editor unverändert', async () => {
  const f = setup();
  await settle();
  await publicationInput(f);
  const originals = f.component.images();
  const files = originals.map((image) => image.file);
  vi.spyOn(f.component, 'openPublication').mockResolvedValue();
  f.component.photoSize.set(1600);
  await f.component.submitRelisting();
  expect(f.component.images()).toBe(originals);
  expect(f.component.images().map((image) => image.file)).toEqual(files);
  expect(f.component.photoSize()).toBe(1600);
});

it('speichert beim Zuschneiden und Vergrößern die Originaldatei und nur Ausgabeparameter', async () => {
  const f = setup();
  await settle();
  await publicationInput(f);
  const original = new File(['camera-original-Exif'], 'original.jpg', { type: 'image/jpeg' });
  const cropped = new File(['cropped-output'], 'crop.jpg', { type: 'image/jpeg' });
  const crop = { x: 0.25, y: 0, width: 0.5, height: 1, rotation: 0 as const };
  f.component.images.update((images) =>
    images.map((image) => ({ ...image, originalFile: original, file: cropped, crop })),
  );
  f.component.photoSize.set(1600);
  f.component.photoFilter.set('lighter');
  f.component.photoBorder.set('medium');
  await f.component.openPublication();
  expect(f.imageApi.upload).toHaveBeenCalledWith(expect.anything(), original, undefined);
  expect(f.imageApi.upload).not.toHaveBeenCalledWith(expect.anything(), cropped, expect.anything());
  expect(f.imageApi.savePhotoOptions).toHaveBeenCalledWith(expect.anything(), {
    resize: 1600,
    filter: 'lighter',
    border: 'medium',
    crops: { '2': crop },
  });
  expect(await original.text()).toBe('camera-original-Exif');
});

it('sperrt Formularelemente ohne Wertverlust oder zusätzliche Inhaltsänderung', async () => {
  const f = setup();
  await settle();
  await publicationInput(f);
  const values = f.component.form.getRawValue();
  const changed = vi.fn();
  const subscription = f.component.form.valueChanges.subscribe(changed);
  f.component.draft.set({ ...draft, connectionId: 'account-a', relistExternalId: '98765' });
  f.component.setImageEditing(true);
  await settle();
  expect(f.component.form.controls.connectionId.disabled).toBe(true);
  expect(f.component.form.controls.aiPhoto.disabled).toBe(true);
  expect(f.component.form.getRawValue()).toEqual(values);
  f.component.setImageEditing(false);
  f.component.draft.set(null);
  await settle();
  expect(f.component.form.controls.aiPhoto.enabled).toBe(true);
  expect(f.component.form.controls.connectionId.enabled).toBe(true);
  expect(f.component.form.getRawValue()).toEqual(values);
  expect(changed).not.toHaveBeenCalled();
  subscription.unsubscribe();
});
