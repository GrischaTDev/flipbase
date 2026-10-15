import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { MarketplaceOverviewService } from './marketplace-overview.service';
import { MarketplaceOverviewStore } from './marketplace-overview.store';
import { overviewAccountKey } from '../models/marketplace-overview-normalization';
import type {
  MarketplaceOverviewAccount,
  MarketplaceOverviewPage,
} from '../models/marketplace-overview.models';
const account: MarketplaceOverviewAccount = {
  platform: 'vinted',
  workspaceId: 'ws-a',
  connectionId: 'account-a',
  displayName: 'Vinted A',
  status: 'connected',
  activeCount: null,
  listingCount: 2,
  observedAt: null,
  completeness: 'partial',
  supportsSearch: true,
  supportsStatus: true,
  canEdit: false,
  error: null,
};
const page: MarketplaceOverviewPage = {
  items: [
    {
      reference: {
        platform: 'vinted',
        workspaceId: 'ws-a',
        connectionId: 'account-a',
        externalId: '7',
      },
      title: 'Jacke',
      priceCents: 1200,
      currency: 'EUR',
      imageUrl: null,
      publishedAt: null,
      state: 'unknown',
      actions: ['view'],
      detailLink: ['/marketplaces/vinted/listings', 'account-a', 'entry-a'],
      externalUrl: null,
      editLink: null,
    },
  ],
  total: 2,
  nextCursor: 'next',
  completeness: 'partial',
};
describe('Kontextgetrennte Marktplatzübersicht', () => {
  const currentUser = signal<{ id: string } | null>({ id: 'user-a' });
  const currentWorkspace = signal<{ id: string } | null>({ id: 'ws-a' });
  const api = { loadAccounts: vi.fn(), loadListings: vi.fn() };
  beforeEach(() => {
    currentUser.set({ id: 'user-a' });
    currentWorkspace.set({ id: 'ws-a' });
    api.loadAccounts
      .mockReset()
      .mockImplementation(async (_ws: string, platform: string) =>
        platform === 'vinted'
          ? [account]
          : platform === 'ebay'
            ? [{ ...account, platform: 'ebay', connectionId: 'ebay-a' }]
            : [],
      );
    api.loadListings.mockReset().mockResolvedValue(page);
    TestBed.configureTestingModule({
      providers: [
        MarketplaceOverviewStore,
        { provide: MarketplaceOverviewService, useValue: api },
        { provide: AuthService, useValue: { currentUser } },
        { provide: WorkspaceService, useValue: { currentWorkspace } },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  it('aktiviert den Kontext auch nach einem ersten leeren Rendering', async () => {
    const store = TestBed.inject(MarketplaceOverviewStore);
    expect(store.platforms()).toEqual([]);
    await store.load('ws-a');
    expect(store.platforms()).toHaveLength(3);
  });
  it('lädt Accounts sofort, Inseratseiten jedoch erst beim Öffnen', async () => {
    const store = TestBed.inject(MarketplaceOverviewStore);
    await store.load('ws-a');
    expect(api.loadListings).not.toHaveBeenCalled();
    await store.expand(account);
    expect(api.loadListings).toHaveBeenCalledTimes(1);
    expect(store.section(account)?.page?.total).toBe(2);
  });
  it('erhält eBay, wenn der Vinted-Abschnitt fehlschlägt', async () => {
    api.loadAccounts.mockImplementation(async (_ws: string, platform: string) => {
      if (platform === 'vinted') throw new Error('offline');
      return platform === 'ebay' ? [{ ...account, platform: 'ebay' }] : [];
    });
    const store = TestBed.inject(MarketplaceOverviewStore);
    await store.load('ws-a');
    expect(store.platforms().find((item) => item.platform === 'vinted')?.error).toBeTruthy();
    expect(store.platforms().find((item) => item.platform === 'ebay')?.accounts).toHaveLength(1);
  });
  it('wiederholt nur die fehlgeschlagene Plattform und erhält die andere Auswahl', async () => {
    const ebayAccount = { ...account, platform: 'ebay' as const, connectionId: 'ebay-a' };
    const ebayPage = {
      ...page,
      items: page.items.map((item) => ({
        ...item,
        reference: { ...item.reference, platform: 'ebay' as const, connectionId: 'ebay-a' },
      })),
    };
    api.loadAccounts.mockImplementation(async (_ws: string, platform: string) => {
      if (platform === 'vinted') throw new Error('offline');
      return platform === 'ebay' ? [ebayAccount] : [];
    });
    api.loadListings.mockResolvedValue(ebayPage);
    const store = TestBed.inject(MarketplaceOverviewStore);
    await store.load('ws-a');
    await store.expand(ebayAccount);
    store.toggleSelection(ebayPage.items[0].reference, true);
    expect(store.section(ebayAccount)?.selection).toHaveLength(1);
    api.loadAccounts.mockClear();
    await store.retryPlatform('vinted');
    expect(api.loadAccounts.mock.calls).toEqual([['ws-a', 'vinted']]);
    expect(store.section(ebayAccount)?.expanded).toBe(true);
    expect(store.section(ebayAccount)?.selection).toHaveLength(1);
    expect(store.section(ebayAccount)?.page).toEqual(ebayPage);
  });
  it('leert die Auswahl bei Filter- und Seitenwechsel', async () => {
    const store = TestBed.inject(MarketplaceOverviewStore);
    await store.load('ws-a');
    await store.expand(account);
    store.toggleSelection(page.items[0].reference, true);
    expect(store.section(account)?.selection).toHaveLength(1);
    await store.setQuery(overviewAccountKey(account), { state: 'all', search: 'Jacke', limit: 25 });
    expect(store.section(account)?.selection).toEqual([]);
    store.toggleSelection(page.items[0].reference, true);
    await store.next(account);
    expect(store.section(account)?.selection).toEqual([]);
  });
  it('blendet Daten beim Nutzerwechsel sofort aus und verwirft alte Antworten', async () => {
    let resolve!: (value: readonly MarketplaceOverviewAccount[]) => void;
    api.loadAccounts.mockReturnValue(
      new Promise<readonly MarketplaceOverviewAccount[]>((done) => (resolve = done)),
    );
    const store = TestBed.inject(MarketplaceOverviewStore);
    const pending = store.load('ws-a', ['vinted']);
    currentUser.set({ id: 'user-b' });
    expect(store.platforms()).toEqual([]);
    resolve([account]);
    await pending;
    expect(store.platforms()).toEqual([]);
  });
  it('behält bei einem Listenfehler eine leere Auswahl und zeigt Wiederholen', async () => {
    const store = TestBed.inject(MarketplaceOverviewStore);
    await store.load('ws-a');
    await store.expand(account);
    store.toggleSelection(page.items[0].reference, true);
    api.loadListings.mockRejectedValue(new Error('offline'));
    await store.setQuery(overviewAccountKey(account), { state: 'active', search: '', limit: 25 });
    expect(store.section(account)?.selection).toEqual([]);
    expect(store.section(account)?.error).toBeTruthy();
  });
});
