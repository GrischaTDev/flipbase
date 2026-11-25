import { SupabaseService } from '../../../core/services/supabase.service';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { VintedCategoryService } from '../../../core/services/vinted-category.service';
import { vintedListingCategorySource } from '../models/vinted-listing-category-source';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { MarketplaceBrowserTestApiService } from './marketplace-browser-test-api.service';
import { VintedListingCategoryService } from './vinted-listing-category.service';
import { VintedCategoryFieldStore } from './vinted-category-field.store';

const connection = {
  workspaceId: 'workspace-a',
  connectionId: 'account-a',
  marketplace: 'vinted',
  executionMode: 'cloud',
  status: 'connected',
  externalAccountId: '123',
};
const fields = {
  categoryId: 1223,
  fields: [],
  unknownFields: [],
  acceptedPhotoMimeTypes: ['image/jpeg'],
  titleMaxLength: 100,
  descriptionMaxLength: 2000,
  aiPhoto: false,
  bump: false,
};
function setup() {
  const workspace = signal<{ id: string; archived_at: string | null }>({
    id: 'workspace-a',
    archived_at: null,
  });
  const user = signal({ id: 'user-a' }),
    connections = signal([connection]),
    canManage = signal(true);
  const read = vi.fn().mockResolvedValue(fields);
  const stored = {
    load: vi.fn().mockResolvedValue(null),
    fields: () => null,
    remember: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: SupabaseService, useValue: { client: {} } },
      VintedListingCategoryService,
      {
        provide: AuthService,
        useValue: { currentUser: user, session: signal({ access_token: 'token' }) },
      },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: MarketplaceAccountStore, useValue: { connections, canManage } },
      { provide: MarketplaceBrowserTestApiService, useValue: { readListingCategory: read } },
      { provide: VintedCategoryFieldStore, useValue: stored },
    ],
  });
  return {
    api: TestBed.inject(VintedListingCategoryService),
    stored,
    read,
    workspace,
    user,
    connections,
    canManage,
  };
}
afterEach(() => TestBed.resetTestingModule());
describe('Vinted category service', () => {
  it('liest für die Veröffentlichungsprüfung auch nach einem Cachetreffer frisch', async () => {
    const f = setup();
    await f.api.read('account-a', 1223);
    const changed = { ...fields, titleMaxLength: 80 };
    f.read.mockResolvedValue(changed);
    expect(await f.api.read('account-a', 1223)).toEqual(fields);
    expect(f.read).toHaveBeenCalledTimes(1);
    expect(await f.api.read('account-a', 1223, { fresh: true })).toEqual(changed);
    expect(f.read).toHaveBeenCalledTimes(2);
    await f.api.read('account-a', 1223, { fresh: true });
    expect(f.read).toHaveBeenCalledTimes(3);
  });
  it('fasst parallele Abrufe zusammen und trennt Kategorien und Kontoidentitäten im Cache', async () => {
    const f = setup();
    await Promise.all([f.api.read('account-a', 1223), f.api.read('account-a', 1223)]);
    await f.api.read('account-a', 1223);
    expect(f.read).toHaveBeenCalledTimes(1);
    await f.api.read('account-a', 2);
    expect(f.read).toHaveBeenCalledTimes(2);
    f.connections.set([{ ...connection, externalAccountId: '456' }]);
    await f.api.read('account-a', 1223);
    expect(f.read).toHaveBeenCalledTimes(3);
    f.canManage.set(false);
    await expect(f.api.read('account-a', 1223)).rejects.toThrow();
  });
  it('reads the explicitly chosen draft account without relying on another selected account', async () => {
    const f = setup();
    expect(await f.api.read('account-a', 1223)).toEqual(fields);
    expect(f.read).toHaveBeenCalledWith(
      { workspaceId: 'workspace-a', connectionId: 'account-a' },
      1223,
      'token',
    );
  });
  it('refuses a foreign workspace, local or disconnected account before calling the browser', async () => {
    const f = setup();
    for (const patch of [
      { workspaceId: 'workspace-b' },
      { marketplace: 'ebay' },
      { executionMode: 'local' },
      { status: 'paused' },
    ]) {
      f.connections.set([{ ...connection, ...patch }]);
      await expect(f.api.read('account-a', 1223)).rejects.toThrow();
    }
    expect(f.read).not.toHaveBeenCalled();
  });
  it.each(['workspace', 'user', 'account', 'permission', 'archive'])(
    'discards a late read after changing %s',
    async (change) => {
      const f = setup();
      let resolve!: (value: typeof fields) => void;
      f.read.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const pending = f.api.read('account-a', 1223);
      await vi.waitFor(() => expect(f.read).toHaveBeenCalled());
      if (change === 'workspace') f.workspace.set({ id: 'workspace-b', archived_at: null });
      if (change === 'user') f.user.set({ id: 'user-b' });
      if (change === 'account') f.connections.set([{ ...connection, externalAccountId: '124' }]);
      if (change === 'permission') f.canManage.set(false);
      if (change === 'archive')
        f.workspace.set({ id: 'workspace-a', archived_at: '2026-10-10T00:00:00Z' });
      resolve(fields);
      await expect(pending).rejects.toThrow();
    },
  );
});

const modern = [
  { id: 5496, parentId: null, title: 'Modeaccessoires', path: 'Modeaccessoires', isLeaf: false },
  { id: 5555, parentId: 5496, title: 'Schals', path: 'Modeaccessoires > Schals', isLeaf: true },
];
const legacy = [
  { id: 1, parentId: null, title: 'Damen', path: 'Damen', isLeaf: false },
  { id: 89, parentId: 1, title: 'Schals', path: 'Damen > Schals', isLeaf: true },
];
function setupSellingTree() {
  let identity = '123';
  let freshLegacyTree = false;
  const read = vi.fn(async (filters: Record<string, string>) => ({
    data: {
      external_account_id: filters['external_account_id'],
      categories: filters['connection_id'] === 'modern' || freshLegacyTree ? modern : legacy,
      observed_at: freshLegacyTree ? '2026-11-05T12:00:00Z' : '2026-11-04T12:00:00Z',
    },
    error: null,
  }));
  const from = vi.fn(() => {
    const filters: Record<string, string> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: string) => {
        filters[key] = value;
        return query;
      },
      maybeSingle: () => read(filters),
    };
    return query;
  });
  const provider = vi.fn();
  const sync = vi.fn(async () => {
    freshLegacyTree = true;
  });
  TestBed.configureTestingModule({
    providers: [
      VintedListingCategoryService,
      {
        provide: VintedCategoryFieldStore,
        useValue: {
          fields: () => null,
          extraFields: () => [],
          load: async () => null,
          remember: () => undefined,
        },
      },
      { provide: SupabaseService, useValue: { client: { from } } },
      {
        provide: AuthService,
        useValue: {
          currentUser: () => ({ id: 'user' }),
          session: () => ({ access_token: 'fixture' }),
        },
      },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: () => ({ id: 'workspace', archived_at: null }) },
      },
      {
        provide: MarketplaceAccountStore,
        useValue: {
          canManage: () => true,
          connections: () =>
            ['modern', 'legacy'].map((connectionId) => ({
              connectionId,
              workspaceId: 'workspace',
              marketplace: 'vinted',
              externalAccountId: connectionId === 'modern' ? identity : '456',
              status: 'connected',
              executionMode: 'cloud',
            })),
        },
      },
      {
        provide: MarketplaceBrowserTestApiService,
        useValue: { readListingCategory: provider, syncConnection: sync },
      },
    ],
  });
  return {
    service: TestBed.inject(VintedListingCategoryService),
    read,
    from,
    provider,
    sync,
    rebind: () => {
      identity = '789';
    },
  };
}
it('navigates and searches each account tree from the database without a browser request', async () => {
  const f = setupSellingTree();
  const source = f.service.source('modern', () => undefined);
  expect((await source.loadChildren(null)).map((node) => node.id)).toEqual(['5496']);
  expect((await source.loadChildren('5496')).map((node) => node.id)).toEqual(['5555']);
  expect((await source.search('Schals')).categories.map((node) => node.id)).toEqual(['5555']);
  expect(await source.getById('89')).toBeNull();
  expect(f.read).toHaveBeenCalledTimes(1);
  const other = f.service.source('legacy', () => undefined);
  expect((await other.search('Schals')).categories.map((node) => node.id)).toEqual(['89']);
  expect(await other.getById('5555')).toBeNull();
  expect(f.provider).not.toHaveBeenCalled();
  expect(f.read).toHaveBeenCalledWith({
    workspace_id: 'workspace',
    connection_id: 'modern',
    external_account_id: '123',
  });
});
it('rejects a cached source after its Vinted identity changes', async () => {
  const f = setupSellingTree();
  const source = f.service.source('modern', () => undefined);
  await source.loadChildren(null);
  f.rebind();
  await expect(source.search('Schals')).rejects.toThrow('Kontoverbindung');
  expect(f.read).toHaveBeenCalledTimes(1);
});
it('accepts only categories that are selectable for the target account and present in the central catalog', async () => {
  const f = setupSellingTree();
  vi.spyOn(TestBed.inject(VintedCategoryService), 'readSnapshot').mockResolvedValue({
    categories: modern,
    status: { refreshedAt: '2026-11-04T12:00:00Z', categoryCount: modern.length },
  });
  const current = await f.service.readPublicationSnapshot('modern');
  const previous = await f.service.readPublicationSnapshot('legacy');
  const currentPicker = vintedListingCategorySource(
    current.categories,
    current.publishableCategoryIds,
  );
  const previousPicker = vintedListingCategorySource(
    previous.categories,
    previous.publishableCategoryIds,
  );
  expect((await currentPicker.search('Schals')).categories.map((category) => category.id)).toEqual([
    '5555',
  ]);
  expect((await previousPicker.search('Schals')).categories).toEqual([]);
  expect(await previousPicker.getById('89')).toMatchObject({ isSelectable: false });
  expect(f.provider).not.toHaveBeenCalled();
  expect(f.sync).not.toHaveBeenCalled();
});
it('updates the exact target account only on explicit refresh and checks that the snapshot changed', async () => {
  const f = setupSellingTree();
  vi.spyOn(TestBed.inject(VintedCategoryService), 'readSnapshot').mockResolvedValue({
    categories: modern,
    status: { refreshedAt: '2026-11-04T12:00:00Z', categoryCount: modern.length },
  });
  expect((await f.service.readPublicationSnapshot('legacy')).publishableCategoryIds.size).toBe(0);
  expect(f.sync).not.toHaveBeenCalled();
  const updated = await f.service.refreshPublicationSnapshot('legacy');
  expect(updated.publishableCategoryIds).toEqual(new Set([5555]));
  expect(f.sync).toHaveBeenCalledWith(
    { workspaceId: 'workspace', connectionId: 'legacy' },
    'fixture',
  );
  await expect(f.service.refreshPublicationSnapshot('legacy')).rejects.toThrow(
    'Verkaufsbaum wurde bei Vinted nicht aktualisiert',
  );
});
it('rejects a partial tree instead of showing an incomplete category picker', async () => {
  const f = setupSellingTree();
  f.read.mockResolvedValueOnce({
    data: {
      external_account_id: '123',
      categories: modern.slice(1),
      observed_at: '2026-11-04T12:00:00Z',
    },
    error: null,
  });
  await expect(f.service.readSnapshot('modern')).rejects.toThrow('unvollständig');
});

it('verwendet gespeicherte echte Auswahlwerte ohne Abruf bei Vinted', async () => {
  const f = setup();
  const saved = { ...fields, titleMaxLength: 90 };
  f.stored.load.mockResolvedValueOnce(saved);
  expect(await f.api.read('account-a', 1223)).toEqual(saved);
  expect(f.read).not.toHaveBeenCalled();
  expect(await f.api.read('account-a', 1224)).toEqual(fields);
  expect(f.read).toHaveBeenCalledTimes(1);
  expect(f.stored.remember).toHaveBeenCalledWith('account-a', fields);
});
