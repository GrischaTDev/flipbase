import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type { MarketplaceConnection } from '../models/marketplace.models';
import { createMarketplaceFixtures } from '../testing/marketplace-fixtures';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { MarketplaceTestSessionApiService } from './marketplace-test-session-api.service';
import { MarketplaceTestSessionStore } from './marketplace-test-session.store';

const [accountA, accountB] = createMarketplaceFixtures().connections;
const session = (account: MarketplaceConnection) => ({
  workspaceId: account.workspaceId,
  connectionId: account.connectionId,
  id: '25500000-0000-4000-8000-000000000031',
  state: 'active' as const,
  expiresAt: '2099-09-27T10:00:00Z',
  interactionCount: 0,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
let selectedId: ReturnType<typeof signal<string>>;
let selectionVersion: ReturnType<typeof signal<number>>;
let workspace: ReturnType<typeof signal<{ id: string; archived_at?: string } | null>>;
let user: ReturnType<typeof signal<{ id: string } | null>>;
let api: {
  start: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  action: ReturnType<typeof vi.fn>;
};
let store: MarketplaceTestSessionStore;

beforeEach(() => {
  selectedId = signal(accountA.connectionId);
  selectionVersion = signal(0);
  workspace = signal<{ id: string; archived_at?: string } | null>({ id: accountA.workspaceId });
  user = signal<{ id: string } | null>({ id: 'operator-a' });
  api = {
    start: vi.fn().mockResolvedValue(session(accountA)),
    status: vi.fn().mockResolvedValue(session(accountA)),
    action: vi.fn().mockResolvedValue({ ...session(accountA), accepted: true }),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      MarketplaceTestSessionStore,
      {
        provide: MarketplaceAccountStore,
        useValue: {
          selectedConnection: computed(
            () =>
              [accountA, accountB].find((account) => account.connectionId === selectedId()) ?? null,
          ),
          selectionVersion,
          canManage: signal(true),
        },
      },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: MarketplaceTestSessionApiService, useValue: api },
    ],
  });
  store = TestBed.inject(MarketplaceTestSessionStore);
  TestBed.tick();
});

describe('Kontogebundener Sitzungstest', () => {
  it('beginnt eine eigene Testsitzung und hält ihren Kontobezug', async () => {
    await store.start();
    expect(api.start).toHaveBeenCalledWith({
      workspaceId: accountA.workspaceId,
      connectionId: accountA.connectionId,
    });
    expect(store.session()?.connectionId).toBe(accountA.connectionId);
  });

  it('verbirgt eine verspätete Antwort nach A → B → A', async () => {
    const pending = deferred<ReturnType<typeof session>>();
    api.start.mockReturnValue(pending.promise);
    const old = store.start();
    selectedId.set(accountB.connectionId);
    selectionVersion.update((value) => value + 1);
    selectedId.set(accountA.connectionId);
    selectionVersion.update((value) => value + 1);
    pending.resolve(session(accountA));
    await old;
    expect(store.session()).toBeNull();
  });

  it('verbirgt den Test sofort bei Workspacewechsel und Abmeldung', async () => {
    await store.start();
    workspace.set({ id: 'other-workspace' });
    expect(store.session()).toBeNull();
    workspace.set({ id: accountA.workspaceId });
    user.set(null);
    expect(store.session()).toBeNull();
  });

  it('beendet Aktionen nach simuliertem Browserabbruch', async () => {
    await store.start();
    api.action.mockResolvedValue({ ...session(accountA), state: 'interrupted', accepted: true });
    await store.action('interrupt');
    expect(store.session()?.state).toBe('interrupted');
    await store.action('ping');
    expect(api.action).toHaveBeenCalledTimes(1);
  });

  it('übernimmt den abgelaufenen Zustand und wiederholt keine Aktion', async () => {
    await store.start();
    api.status.mockResolvedValue({ ...session(accountA), state: 'expired' });
    await store.refresh();
    expect(store.session()?.state).toBe('expired');
    await store.action('ping');
    expect(api.action).not.toHaveBeenCalled();
  });
});
