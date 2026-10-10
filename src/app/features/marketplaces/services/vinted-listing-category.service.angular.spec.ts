import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { MarketplaceBrowserTestApiService } from './marketplace-browser-test-api.service';
import { VintedListingCategoryService } from './vinted-listing-category.service';

const connection = {
  workspaceId: 'workspace-a',
  connectionId: 'account-a',
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
  TestBed.configureTestingModule({
    providers: [
      VintedListingCategoryService,
      {
        provide: AuthService,
        useValue: { currentUser: user, session: signal({ access_token: 'token' }) },
      },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: MarketplaceAccountStore, useValue: { connections, canManage } },
      { provide: MarketplaceBrowserTestApiService, useValue: { readListingCategory: read } },
    ],
  });
  return {
    api: TestBed.inject(VintedListingCategoryService),
    read,
    workspace,
    user,
    connections,
    canManage,
  };
}
afterEach(() => TestBed.resetTestingModule());
describe('Vinted category service', () => {
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
