import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { VintedBrandSearchService } from '../../platform-admin/services/vinted-brand-search.service';
import { listingCurrentContentFixture } from '../../../../../services/marketplace-worker/test/fixtures/vinted-listing-current-content';
import { parseMarketplacePage } from '../models/marketplace-response';
import type { VintedListingDraft } from '../models/vinted-listing-draft';
import type { VintedListingJob } from '../models/vinted-listing-job';
import type { MarketplaceConnection } from '../models/marketplace.models';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { MarketplaceApiService } from './marketplace-api.service';
import { createMarketplaceFixtures } from '../testing/marketplace-fixtures';
import { MarketplaceBrowserTestApiService } from './marketplace-browser-test-api.service';
import { VintedActionOverviewHeaderStore } from './vinted-action-overview-header.store';
import { VintedListingDraftService } from './vinted-listing-draft.service';
import { VintedListingImageService } from './vinted-listing-image.service';
import { VintedListingJobService } from './vinted-listing-job.service';
import { VintedListingOperationStore } from './vinted-listing-operation.store';
import { VintedListingOriginalPhotoService } from './vinted-listing-original-photo.service';
import { VintedListingPhotoSourceService } from './vinted-listing-photo-source.service';
import {
  VintedRelistingSubmissionService,
  type VintedRelistingSubmission,
} from './vinted-relisting-submission.service';

function setup() {
  const fixture = listingCurrentContentFixture();
  const account: MarketplaceConnection = {
    ...createMarketplaceFixtures().connections[0],
    workspaceId: 'workspace-a',
    connectionId: 'account-a',
    externalAccountId: '123',
    marketplace: 'vinted',
    status: 'connected',
    executionMode: 'cloud',
  };
  const workspace = signal({ id: account.workspaceId, archived_at: null } as {
    id: string;
    archived_at: null;
  });
  const user = signal<{ id: string } | null>({ id: 'user-a' });
  const connections = signal([account]);
  const entry = {
    ...parseMarketplacePage(
      {
        items: [
          {
            ...account,
            id: 'entry-a',
            externalId: '98765',
            title: 'Meine Jacke',
            text: 'Lokaler Text',
            price: 39.9,
            currency: 'EUR',
            imageUrl: fixture.photoUrls[0],
            imageUrls: fixture.photoUrls,
          },
        ],
        total: 1,
        nextCursor: null,
      },
      account,
    ).items[0],
    listingContent: { ...fixture.content, aiPhoto: false },
  };
  const input: VintedRelistingSubmission = {
    entry,
    account,
    title: 'Geänderter Titel',
    description: 'Geänderter Text',
    descriptionKnown: true,
    photoOptions: { resize: 1200, crops: {}, filter: 'soft', border: 'small' },
    schedule: null,
    delaySeconds: 300,
    requestId: crypto.randomUUID(),
  };
  const draft: VintedListingDraft = {
    id: '1',
    workspaceId: account.workspaceId,
    connectionId: account.connectionId,
    relistExternalId: '98765',
    content: entry.listingContent,
    images: [],
    revision: 1,
    inventoryItemId: null,
    createdAt: '2026-11-03T00:00:00Z',
    updatedAt: '2026-11-03T00:00:00Z',
  };
  const read = vi.fn().mockResolvedValue({ ...fixture, aiPhoto: false });
  const create = vi.fn().mockImplementation(async (_workspace, content) => ({ ...draft, content }));
  const photo = new Blob(['original'], { type: 'image/jpeg' });
  const photos = { read: vi.fn().mockResolvedValue(photo) };
  const upload = vi
    .fn()
    .mockImplementation(async (current: VintedListingDraft, file: File, replaceId?: string) => ({
      ...current,
      images: [
        ...current.images.filter((image) => image.id !== replaceId),
        {
          id: String(current.images.length + 2),
          storagePath: 'workspace-a/1/original.jpg',
          fileName: file.name,
          mimeType: file.type,
          byteSize: file.size,
        },
      ],
    }));
  const saveOptions = vi.fn().mockImplementation(async (current, photoOptions) => ({
    ...current,
    photoOptions,
    revision: current.revision + 1,
  }));
  const save = vi.fn().mockImplementation(async (current, content) => ({
    ...current,
    content,
    revision: current.revision + 1,
  }));
  const setOrder = vi.fn().mockImplementation(async (current, ids: string[]) => ({
    ...current,
    images: current.images.filter((image: { id: string }) => ids.includes(image.id)),
    revision: current.revision + 1,
  }));
  const acceptedJob = (current: VintedListingDraft): VintedListingJob => ({
    id: '30',
    workspaceId: current.workspaceId,
    connectionId: account.connectionId,
    draftId: current.id,
    draftRevision: current.revision,
    externalAccountId: account.externalAccountId!,
    executionMode: 'cloud',
    action: 'publish',
    state: 'queued',
    version: 1,
    scheduledAt: null,
    timeZone: null,
    latePolicy: 'pause_after_30_minutes',
    errorCode: null,
    externalId: null,
    providerState: null,
    verifiedAt: null,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
    replacesJobId: null,
    relistExternalId: current.relistExternalId,
    relistDelaySeconds: 300,
  });
  const jobs = {
    readPermission: vi
      .fn()
      .mockResolvedValue({ allowed: true, executionMode: 'cloud', authorizationVersion: 1 }),
    approve: vi
      .fn()
      .mockResolvedValue({ allowed: true, executionMode: 'cloud', authorizationVersion: 1 }),
    list: vi.fn().mockResolvedValue([]),
    enqueue: vi
      .fn()
      .mockImplementation(async (current: VintedListingDraft) => acceptedJob(current)),
  };
  const runtime = {
    readListingContent: read,
    available: vi
      .fn()
      .mockResolvedValue({ available: true, readOnly: false, listingPublishingEnabled: true }),
  };
  const refresh = vi.fn().mockResolvedValue(undefined);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthService,
        useValue: { currentUser: user, session: signal({ access_token: 'fixture-token' }) },
      },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      {
        provide: MarketplaceApiService,
        useValue: {
          listConnections: vi
            .fn()
            .mockImplementation(async () => ({ connections: connections(), canManage: true })),
        },
      },
      { provide: VintedListingDraftService, useValue: { createRelisting: create, save } },
      {
        provide: VintedListingImageService,
        useValue: { upload, savePhotoOptions: saveOptions, setOrder },
      },
      {
        provide: VintedListingOriginalPhotoService,
        useValue: {
          read: vi
            .fn()
            .mockResolvedValue([
              { previewUrl: 'https://storage.example.test/original.jpg', fileName: 'original.jpg' },
            ]),
        },
      },
      { provide: VintedListingPhotoSourceService, useValue: photos },
      { provide: VintedListingJobService, useValue: jobs },
      {
        provide: VintedBrandSearchService,
        useValue: { search: vi.fn().mockResolvedValue([{ id: 254956, name: 'Jako' }]) },
      },
      { provide: MarketplaceBrowserTestApiService, useValue: runtime },
      { provide: VintedActionOverviewHeaderStore, useValue: { refresh } },
    ],
  });
  return {
    service: TestBed.inject(VintedRelistingSubmissionService),
    acceptedJob,
    operations: TestBed.inject(VintedListingOperationStore),
    input,
    user,
    workspace,
    connections,
    read,
    create,
    draft,
    save,
    setOrder,
    photos,
    photo,
    upload,
    saveOptions,
    jobs,
    runtime,
    refresh,
  };
}
afterEach(() => TestBed.resetTestingModule());

describe('Appweiter Relist-Auftrag', () => {
  it('ergänzt neue Anbietermerkmale auch bei einem bereits gespeicherten alten Artikelstand', async () => {
    const f = setup();
    const source = listingCurrentContentFixture();
    f.read.mockResolvedValue({
      ...source,
      content: {
        ...source.content,
        categoryId: 5555,
        categoryLabel: 'Tücher & Schals',
        sizeId: null,
        sizeLabel: '',
        attributes: { accessory_department: '575', accessory_department_label: 'Herren' },
      },
    });
    await f.service.start(f.input);
    expect(f.create).toHaveBeenCalledWith(
      'workspace-a',
      expect.objectContaining({
        categoryId: 5555,
        attributes: {
          accessory_department: '575',
          accessory_department_label: 'Herren',
          flipbaseListingForm: '1',
        },
      }),
      'account-a',
      f.input.requestId,
      '98765',
    );
    expect(f.jobs.enqueue).toHaveBeenCalledOnce();
  });
  it('setzt einen bereits vorhandenen privaten Teilstand ohne doppelte oder veraltete Fotos fort', async () => {
    const f = setup();
    const image = {
      id: '2',
      storagePath: 'workspace-a/1/old.jpg',
      fileName: 'old.jpg',
      mimeType: 'image/jpeg' as const,
      byteSize: 8,
    };
    f.create.mockResolvedValueOnce({
      ...f.draft,
      content: { ...f.draft.content, title: 'Alter Teilstand' },
      images: [image, { ...image, id: '3' }],
    });
    await f.service.start(f.input);
    expect(f.save).toHaveBeenCalledOnce();
    expect(f.upload).toHaveBeenCalledWith(expect.anything(), expect.any(File), '2');
    expect(f.setOrder).toHaveBeenCalledOnce();
    expect(f.jobs.enqueue.mock.calls[0][0].images).toHaveLength(1);
    expect(f.jobs.enqueue.mock.calls[0][0].content.title).toBe(f.input.title);
  });
  it('lädt keine Bilder in einen falsch zugeordneten privaten Entwurf', async () => {
    const f = setup();
    f.create.mockResolvedValueOnce({ ...f.draft, connectionId: 'account-b' });
    await expect(f.service.start(f.input)).rejects.toThrow('gewählten Inserat');
    expect(f.upload).not.toHaveBeenCalled();
    expect(f.jobs.enqueue).not.toHaveBeenCalled();
  });
  it('übernimmt einen unveränderlichen Auftrag, behält Originaldateien und beauftragt nach privatem Upload verzögertes Relisten', async () => {
    const f = setup();
    expect(() => TestBed.inject(MarketplaceAccountStore)).toThrow();
    let finish!: (value: Blob) => void;
    f.photos.read.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const task = f.service.start(f.input);
    await vi.waitFor(() => expect(f.photos.read).toHaveBeenCalledOnce());
    expect(f.operations.runningCount()).toBe(1);
    const changedInput = f.input as { title: string };
    changedInput.title = 'Spätere Änderung';
    finish(f.photo);
    await task;
    expect(f.read).toHaveBeenCalledOnce();
    expect(f.create).toHaveBeenCalledWith(
      'workspace-a',
      expect.objectContaining({
        title: 'Geänderter Titel',
        description: 'Geänderter Text',
        priceCents: 2050,
      }),
      'account-a',
      f.input.requestId,
      '98765',
    );
    expect(f.upload).toHaveBeenCalledOnce();
    expect(f.upload.mock.calls[0][1].size).toBe(f.photo.size);
    expect(f.saveOptions).toHaveBeenCalledWith(expect.anything(), f.input.photoOptions);
    expect(f.jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ relistExternalId: '98765' }),
      expect.objectContaining({
        action: 'publish',
        relistDelaySeconds: 300,
        requestId: f.input.requestId,
      }),
    );
    expect(f.refresh).toHaveBeenCalledOnce();
    expect(f.operations.entries()).toEqual([]);
    expect(f.operations.acceptedRelistings()[0]?.record.job.id).toBe('30');
  });
  it('behält Fotoabruf-Fehler ausschließlich in der appweiten Aktionsliste und schreibt keinen Auftrag', async () => {
    const f = setup();
    f.photos.read.mockRejectedValueOnce(new Error('Foto nicht erreichbar'));
    await expect(f.service.start(f.input)).rejects.toThrow('Foto nicht erreichbar');
    expect(f.operations.entries()[0]).toMatchObject({
      kind: 'relist',
      state: 'error',
      message: 'Foto nicht erreichbar',
    });
    expect(f.create).not.toHaveBeenCalled();
    expect(f.jobs.enqueue).not.toHaveBeenCalled();
  });
  it('behält einen bereits angenommenen Relist auch bei einem anschließenden Übersichtsfehler gesperrt', async () => {
    const f = setup();
    f.refresh.mockRejectedValue(new Error('Übersicht offline'));
    await expect(f.service.start(f.input)).rejects.toThrow('Übersicht offline');
    expect(f.jobs.enqueue).toHaveBeenCalledOnce();
    expect(f.operations.acceptedRelistings()[0]?.record.job.id).toBe('30');
  });
  it.each(['workspace', 'logout'] as const)(
    'beendet einen während der Annahme bestätigten Auftrag trotz Kontextwechsel ohne falschen Fehler: %s',
    async (change) => {
      const f = setup();
      let accept!: () => void;
      f.jobs.enqueue.mockImplementationOnce(
        (current: VintedListingDraft) =>
          new Promise((resolve) => {
            accept = () => resolve(f.acceptedJob(current));
          }),
      );
      const task = f.service.start(f.input);
      await vi.waitFor(() => expect(f.jobs.enqueue).toHaveBeenCalledOnce());
      expect(f.operations.runningCount()).toBe(1);
      expect(f.refresh).not.toHaveBeenCalled();
      if (change === 'workspace') f.workspace.set({ id: 'workspace-b', archived_at: null });
      else f.user.set(null);
      accept();
      await expect(task).resolves.toBeUndefined();
      expect(f.refresh).toHaveBeenCalledOnce();
      f.workspace.set({ id: 'workspace-a', archived_at: null });
      f.user.set({ id: 'user-a' });
      expect(f.operations.entries()).toEqual([]);
      expect(f.operations.runningCount()).toBe(0);
    },
  );
  it('stoppt nach einem Arbeitsbereichswechsel vor jedem weiteren Schreibzugriff', async () => {
    const f = setup();
    let finish!: (value: Blob) => void;
    f.photos.read.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const task = f.service.start(f.input);
    await vi.waitFor(() => expect(f.photos.read).toHaveBeenCalledOnce());
    f.workspace.set({ id: 'workspace-b', archived_at: null });
    finish(f.photo);
    await expect(task).rejects.toThrow('Kontofreigabe');
    expect(f.create).not.toHaveBeenCalled();
    expect(f.jobs.enqueue).not.toHaveBeenCalled();
    f.workspace.set({ id: 'workspace-a', archived_at: null });
    expect(f.operations.entries()[0].state).toBe('error');
  });
  it('nimmt denselben Artikel während der Vorbereitung nicht doppelt an', async () => {
    const f = setup();
    let finish!: (value: Blob) => void;
    f.photos.read.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = f.service.start(f.input);
    await vi.waitFor(() => expect(f.photos.read).toHaveBeenCalledOnce());
    await expect(f.service.start(f.input)).rejects.toThrow('nicht verfügbar');
    finish(f.photo);
    await first;
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.jobs.enqueue).toHaveBeenCalledOnce();
  });
  it.each([false, true])(
    'erhält fehlende Beschreibung und bewusst geleerte Beschreibung getrennt (bekannt: %s)',
    async (known) => {
      const f = setup();
      const task = f.service.start({
        ...f.input,
        entry: { ...f.input.entry, listingContent: undefined, text: null },
        description: '',
        descriptionKnown: known,
      });
      if (known) {
        await expect(task).rejects.toThrow('Beschreibung');
        expect(f.jobs.enqueue).not.toHaveBeenCalled();
      } else {
        await task;
        expect(f.create.mock.calls[0][1].description).toBe('Sehr gut erhalten.');
      }
      expect(f.read).toHaveBeenCalledOnce();
    },
  );
  it.each(['runtime', 'permission', 'existing'])(
    'umgeht keine bestehende Veröffentlichungsgrenze: %s',
    async (blocker) => {
      const f = setup();
      if (blocker === 'runtime')
        f.runtime.available.mockResolvedValueOnce({
          available: true,
          readOnly: true,
          listingPublishingEnabled: true,
        });
      if (blocker === 'permission') {
        f.jobs.readPermission.mockResolvedValueOnce({ allowed: false, executionMode: 'cloud' });
        f.jobs.approve.mockResolvedValueOnce({ allowed: false, executionMode: 'cloud' });
      }
      if (blocker === 'existing') f.jobs.list.mockResolvedValueOnce([{ state: 'writing' }]);
      await expect(f.service.start(f.input)).rejects.toThrow();
      expect(f.jobs.enqueue).not.toHaveBeenCalled();
      expect(f.operations.entries()[0].state).toBe('error');
    },
  );
});
