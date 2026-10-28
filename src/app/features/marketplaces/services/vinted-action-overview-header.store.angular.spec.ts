import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AppDisplayPreferencesService } from '../../../core/services/app-display-preferences.service';
import { createMarketplaceFixtures } from '../testing/marketplace-fixtures';
import type { VintedAction } from '../models/vinted-action-overview';
import { MarketplaceApiError, MarketplaceApiService } from './marketplace-api.service';
import { VintedActionOverviewApiService } from './vinted-action-overview-api.service';
import { VintedActionOverviewHeaderStore } from './vinted-action-overview-header.store';
import { VintedListingJobService } from './vinted-listing-job.service';
import type { VintedListingJob } from '../models/vinted-listing-job';

const accounts = createMarketplaceFixtures().connections;
const action: VintedAction = {
  id: 'negotiation:job',
  sourceId: 'job',
  source: 'negotiation',
  isAutomated: false,
  kind: 'accept',
  state: 'running',
  conversationId: null,
  messageId: null,
  offerId: null,
  partnerName: 'Anna',
  itemTitle: null,
  priceCents: 2000,
  currency: 'EUR',
  textPreview: null,
  createdAt: '2026-10-27T10:00:00Z',
  updatedAt: '2026-10-27T10:00:00Z',
  errorCode: null,
};
let enabled = signal(false);
let user = signal<{ id: string } | null>({ id: 'user-a' });
let workspace = signal({ id: accounts[0].workspaceId, archived_at: null as string | null });
let list: ReturnType<typeof vi.fn>;
let read: ReturnType<typeof vi.fn>;
let readListingJobs: ReturnType<typeof vi.fn>;
let listen: ReturnType<typeof vi.fn>;
async function settle() {
  TestBed.tick();
  for (let index = 0; index < 20; index++) await Promise.resolve();
  TestBed.tick();
}
beforeEach(() => {
  enabled = signal(false);
  user = signal({ id: 'user-a' });
  workspace = signal({ id: accounts[0].workspaceId, archived_at: null });
  list = vi.fn().mockResolvedValue({ canManage: true, connections: accounts.slice(0, 2) });
  readListingJobs = vi.fn().mockResolvedValue([]);
  listen = vi.fn(() => () => undefined);
  read = vi.fn().mockResolvedValue({
    actions: [
      action,
      { ...action, id: 'queued', state: 'queued' },
      { ...action, id: 'done', state: 'succeeded' },
    ],
  });
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: user, session: signal(null) } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: AppDisplayPreferencesService, useValue: { actionOverviewEnabled: enabled } },
      { provide: MarketplaceApiService, useValue: { listConnections: list } },
      { provide: VintedActionOverviewApiService, useValue: { read } },
      {
        provide: VintedListingJobService,
        useValue: {
          list: readListingJobs,
          listen,
          authenticate: vi.fn(),
        },
      },
    ],
  });
});
afterEach(() => TestBed.resetTestingModule());
describe('Appweite laufende Vinted-Aktionen', () => {
  it('zeigt den beobachteten Abschluss automatisch und zählt ihn nicht weiter als laufend', async () => {
    vi.useFakeTimers();
    try {
      enabled.set(true);
      const store = TestBed.inject(VintedActionOverviewHeaderStore);
      await settle();
      read.mockResolvedValue({ actions: [{ ...action, state: 'succeeded' }] });
      await vi.advanceTimersByTimeAsync(5_000);
      await settle();
      expect(store.count()).toBe(0);
      expect(
        store
          .groups()
          .flatMap((group) => group.actions)
          .map((entry) => entry.state),
      ).toEqual(['succeeded', 'succeeded']);
      await vi.advanceTimersByTimeAsync(65_000);
      await settle();
      expect(store.groups()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
  it('liest nach Rückkehr ins Fenster den aktuellen Stand ohne manuellen Button', async () => {
    enabled.set(true);
    const store = TestBed.inject(VintedActionOverviewHeaderStore);
    await settle();
    read.mockResolvedValue({ actions: [] });
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(store.count()).toBe(0);
  });
  it('liest nur nach Aktivierung und zeigt aus allen Konten ausschließlich laufende Vorgänge', async () => {
    const store = TestBed.inject(VintedActionOverviewHeaderStore);
    await settle();
    expect(list).not.toHaveBeenCalled();
    enabled.set(true);
    await settle();
    expect(read).toHaveBeenCalledTimes(2);
    expect(store.count()).toBe(2);
    expect(store.groups().map((group) => group.accountName)).toEqual(
      accounts.slice(0, 2).map((account) => account.displayName),
    );
    expect(store.groups().flatMap((group) => group.actions)).toEqual([action, action]);
  });
  it('zeigt wartende Inserataufträge zentral an und zählt sie als laufende Aktion', async () => {
    enabled.set(true);
    const pending: VintedListingJob = {
      id: 'aaaa1111-1111-4111-8111-111111111111',
      workspaceId: accounts[0].workspaceId,
      connectionId: accounts[0].connectionId,
      draftId: 'bbbb2222-2222-4222-8222-222222222222',
      draftRevision: 1,
      executionMode: 'cloud',
      externalAccountId: '123',
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
      createdAt: '2026-10-27T10:00:00Z',
      updatedAt: '2026-10-27T10:00:00Z',
      replacesJobId: null,
    };
    readListingJobs.mockResolvedValueOnce([pending]);
    const store = TestBed.inject(VintedActionOverviewHeaderStore);
    await settle();
    expect(store.listings().map(({ job }) => job.id)).toEqual([pending.id]);
    expect(store.count()).toBe(3);
    expect(store.hasRunning()).toBe(true);
    const onChange = listen.mock.calls[0]?.[2] as (() => void) | undefined;
    expect(onChange).toBeTypeOf('function');
    readListingJobs.mockResolvedValue([
      { ...pending, state: 'confirmed', providerState: 'active', version: 2 },
    ]);
    onChange?.();
    await settle();
    expect(store.listings()[0].job.state).toBe('confirmed');
    expect(store.count()).toBe(2);
    read.mockResolvedValue({ actions: [] });
    readListingJobs.mockResolvedValue([
      { ...pending, state: 'queued', scheduledAt: '2026-11-01T10:00:00Z' },
    ]);
    await store.refresh();
    expect(store.hasRunning()).toBe(false);
    readListingJobs.mockResolvedValue([{ ...pending, state: 'claimed' }]);
    await store.refresh();
    expect(store.hasRunning()).toBe(true);
    readListingJobs.mockResolvedValue([
      { ...pending, state: 'confirmed', providerState: 'active' },
    ]);
    await store.refresh();
    expect(store.hasRunning()).toBe(false);
    readListingJobs.mockResolvedValue([
      { ...pending, state: 'confirmed', providerState: 'processing' },
    ]);
    await store.refresh();
    expect(store.hasRunning()).toBe(false);
    enabled.set(false);
    expect(store.listings()).toEqual([]);
  });
  it('behält Inserate bei einem vorübergehenden Auftragslesefehler im selben Workspace', async () => {
    enabled.set(true);
    const store = TestBed.inject(VintedActionOverviewHeaderStore);
    await settle();
    readListingJobs.mockRejectedValueOnce(new Error('offline'));
    await store.refresh();
    expect(store.listings()).toEqual([]);
    expect(store.error()).toContain('nicht aktualisiert');
  });
  it('blendet fremde Daten sofort bei Workspace-, Nutzer- und Einstellungswechsel aus', async () => {
    enabled.set(true);
    const store = TestBed.inject(VintedActionOverviewHeaderStore);
    await settle();
    expect(store.count()).toBe(2);
    workspace.set({ id: 'other-workspace', archived_at: null });
    expect(store.groups()).toEqual([]);
    await settle();
    user.set(null);
    expect(store.groups()).toEqual([]);
    enabled.set(false);
    expect(store.groups()).toEqual([]);
  });
  it('ignoriert verspätete Antworten nach Abmelden und neuem Nutzer', async () => {
    enabled.set(true);
    let finish: ((result: { actions: VintedAction[] }) => void) | undefined;
    read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const store = TestBed.inject(VintedActionOverviewHeaderStore);
    await settle();
    user.set({ id: 'user-b' });
    read.mockResolvedValue({ actions: [] });
    await settle();
    finish?.({ actions: [action] });
    await settle();
    expect(store.groups()).toEqual([]);
  });
  it('zeigt bei Teilfehlern den letzten Stand und entfernt entzogene Konten', async () => {
    enabled.set(true);
    const store = TestBed.inject(VintedActionOverviewHeaderStore);
    await settle();
    read
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new MarketplaceApiError('forbidden'));
    await store.refresh();
    expect(store.count()).toBe(1);
    expect(store.groups()[0].actions[0].state).toBe('running');
    expect(store.error()).toContain('nicht aktualisiert');
  });
  it('zeigt den Abschluss noch kurz an und entfernt ausgebaute Konten vollständig', async () => {
    enabled.set(true);
    const store = TestBed.inject(VintedActionOverviewHeaderStore);
    await settle();
    list.mockResolvedValueOnce({ canManage: true, connections: accounts.slice(0, 1) });
    read.mockResolvedValueOnce({ actions: [{ ...action, state: 'succeeded' }] });
    await store.refresh();
    expect(store.count()).toBe(0);
    expect(store.groups().map((group) => group.scope.connectionId)).toEqual([
      accounts[0].connectionId,
    ]);
    expect(store.groups()[0].actions[0].state).toBe('succeeded');
  });
  it('liest ohne Verwaltungsrecht keine Kontodetails', async () => {
    enabled.set(true);
    list.mockResolvedValue({ canManage: false, connections: accounts });
    const store = TestBed.inject(VintedActionOverviewHeaderStore);
    await settle();
    expect(read).not.toHaveBeenCalled();
    expect(store.groups()).toEqual([]);
  });
  it('holt eine angeforderte Aktualisierung nach einem laufenden Abruf nach', async () => {
    enabled.set(true);
    let finish:
      ((result: { canManage: boolean; connections: typeof accounts }) => void) | undefined;
    list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const store = TestBed.inject(VintedActionOverviewHeaderStore);
    await settle();
    void store.refresh();
    finish?.({ canManage: true, connections: accounts });
    await settle();
    expect(list).toHaveBeenCalledTimes(2);
    expect(store.loading()).toBe(false);
  });
});
