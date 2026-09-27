import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { createMarketplaceFixtures } from '../testing/marketplace-fixtures';
import { MarketplaceAccountStore } from './marketplace-account.store';
import {
  BrowserTestSessionEndedError,
  MarketplaceBrowserTestApiService,
} from './marketplace-browser-test-api.service';
import { MarketplaceBrowserTestStore } from './marketplace-browser-test.store';

const [accountA, accountB] = createMarketplaceFixtures().connections;
const id = '25600000-0000-4000-8000-000000000031';
const jpeg = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
let selectedId: ReturnType<typeof signal<string>>;
let selectionVersion: ReturnType<typeof signal<number>>;
let workspace: ReturnType<typeof signal<{ id: string } | null>>;
let session: ReturnType<typeof signal<{ access_token: string } | null>>;
let api: {
  available: ReturnType<typeof vi.fn>;
  open: ReturnType<typeof vi.fn>;
  frame: ReturnType<typeof vi.fn>;
  input: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};
let store: MarketplaceBrowserTestStore;

beforeEach(async () => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:test'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  selectedId = signal(accountA.connectionId);
  selectionVersion = signal(0);
  workspace = signal<{ id: string } | null>({ id: accountA.workspaceId });
  session = signal<{ access_token: string } | null>({ access_token: 'token-a' });
  api = {
    available: vi.fn().mockResolvedValue({ available: true, readOnly: false }),
    open: vi.fn().mockResolvedValue(id),
    frame: vi.fn().mockResolvedValue(jpeg),
    input: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      MarketplaceBrowserTestStore,
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
      {
        provide: AuthService,
        useValue: { currentUser: signal({ id: 'operator-a' }), session },
      },
      { provide: MarketplaceBrowserTestApiService, useValue: api },
    ],
  });
  store = TestBed.inject(MarketplaceBrowserTestStore);
  TestBed.tick();
  await store.checkAvailability();
});

describe('Kontogebundener Browser-Testbereich', () => {
  it('behält die Sitzung nach Token-Erneuerung und prüft mit dem neuen Token', async () => {
    await store.start();
    session.set({ access_token: 'token-a-renewed' });
    await store.refresh();
    expect(store.session()?.id).toBe(id);
    expect(api.frame).toHaveBeenLastCalledWith(
      { workspaceId: accountA.workspaceId, connectionId: accountA.connectionId },
      id,
      'token-a-renewed',
    );
  });

  it('verbirgt die alte Sitzung beim Kontowechsel und beendet sie', async () => {
    await store.start();
    selectedId.set(accountB.connectionId);
    selectionVersion.update((value) => value + 1);
    expect(store.session()).toBeNull();
    TestBed.tick();
    expect(api.close).toHaveBeenCalledWith(
      { workspaceId: accountA.workspaceId, connectionId: accountA.connectionId },
      id,
      'token-a',
    );
  });

  it('wiederholt unklare Eingaben nicht automatisch', async () => {
    await store.start();
    api.input.mockRejectedValue(new Error('private provider detail'));
    await store.input({ kind: 'press', key: 'Enter' });
    expect(api.input).toHaveBeenCalledTimes(1);
    expect(api.frame).toHaveBeenCalledTimes(1);
    expect(store.error()).toContain('nicht sicher bestätigt');
  });

  it('sperrt Eingaben im lesenden Testmodus auch bei direktem Store-Aufruf', async () => {
    api.available.mockResolvedValue({ available: true, readOnly: true });
    await store.checkAvailability();
    await store.start();
    await store.input({ kind: 'click', x: 0.5, y: 0.5 });
    expect(api.input).not.toHaveBeenCalled();
    expect(store.session()?.id).toBe(id);
  });

  it('blendet ein altes Browserbild nach fehlgeschlagener Aktualisierung aus', async () => {
    await store.start();
    expect(store.session()?.frameUrl).toBe('blob:test');
    api.frame.mockRejectedValueOnce(new Error('session expired'));
    await store.refresh();
    expect(store.session()?.frameUrl).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    expect(store.canAct()).toBe(true);
    expect(store.canStart()).toBe(false);
    expect(store.error()).toContain('nicht bestätigt');
  });

  it('gibt einen bestätigten Ablauf für einen neuen Start frei', async () => {
    await store.start();
    api.frame.mockRejectedValueOnce(new BrowserTestSessionEndedError());
    await store.refresh();
    expect(store.session()).toBeNull();
    expect(store.canStart()).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('lässt nach einem bestätigten Abbruch beim ersten Bild erneut starten', async () => {
    api.frame.mockRejectedValueOnce(new BrowserTestSessionEndedError());
    await store.start();
    expect(store.session()).toBeNull();
    expect(store.canStart()).toBe(true);
  });

  it('verbirgt die Sitzung sofort bei Workspacewechsel', async () => {
    await store.start();
    workspace.set({ id: 'other-workspace' });
    expect(store.session()).toBeNull();
  });
});
