import { KleinanzeigenAccountService } from './kleinanzeigen-account.service';
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceOverviewService } from './marketplace-overview.service';
import { MarketplaceApiService } from './marketplace-api.service';
import { EbayAccountApiService } from './ebay-account-api.service';
import type { MarketplaceOverviewAccount } from '../models/marketplace-overview.models';

describe('Zentrale Marktplatzdaten', () => {
  const scope = { workspaceId: 'ws-a', connectionId: 'account-a' };
  const account: MarketplaceOverviewAccount = {
    platform: 'ebay',
    ...scope,
    displayName: 'eBay A',
    status: 'connected',
    activeCount: null,
    listingCount: null,
    observedAt: null,
    completeness: 'unknown',
    supportsSearch: false,
    supportsStatus: false,
    canEdit: true,
    error: null,
  };
  const api = {
    canManage: vi.fn(),
    listConnections: vi.fn(),
    readAccountPreview: vi.fn(),
    readOverviewPublications: vi.fn(),
  };
  const ebay = { loadStatus: vi.fn(), loadListings: vi.fn() };
  const kleinanzeigen = { readAccounts: vi.fn(), readPage: vi.fn() };
  beforeEach(() => {
    kleinanzeigen.readAccounts.mockReset().mockResolvedValue({ canManage: false, accounts: [] });
    kleinanzeigen.readPage.mockReset();
    for (const fn of Object.values(api)) fn.mockReset();
    for (const fn of Object.values(ebay)) fn.mockReset();
    api.canManage.mockResolvedValue(false);
    ebay.loadStatus.mockResolvedValue({
      configured: true,
      listingManagementAvailable: true,
      connection: {
        ...scope,
        status: 'connected',
        username: 'eBay A',
        environment: 'production',
        lastReadAt: null,
      },
    });
    ebay.loadListings.mockResolvedValue({
      ...scope,
      items: Array.from({ length: 60 }, (_, i) => ({
        id: String(i + 1),
        title: 'Jacke ' + i,
        price: 12.34,
        currency: 'EUR',
        quantity: 1,
        listingType: 'FixedPriceItem',
        url: 'https://www.ebay.de/itm/' + (i + 1),
      })),
      total: 123,
      nextPage: 2,
    });
    TestBed.configureTestingModule({
      providers: [
        MarketplaceOverviewService,
        { provide: KleinanzeigenAccountService, useValue: kleinanzeigen },
        { provide: MarketplaceApiService, useValue: api },
        { provide: EbayAccountApiService, useValue: ebay },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  it('liest ohne Vinted-Berechtigung keine geschützten Konten und erhält eBay', async () => {
    const service = TestBed.inject(MarketplaceOverviewService);
    expect(await service.loadAccounts('ws-a', 'vinted')).toEqual([]);
    expect(api.listConnections).not.toHaveBeenCalled();
    const accounts = await service.loadAccounts('ws-a', 'ebay');
    expect(accounts).toHaveLength(1);
    expect(accounts[0].displayName).toBe('eBay A');
    expect(ebay.loadListings).not.toHaveBeenCalled();
  });
  it('zeigt eine vollständige Gesamtzahl trotz nur 25 sichtbaren eBay-Inseraten', async () => {
    const service = TestBed.inject(MarketplaceOverviewService);
    const first = await service.loadListings(account, { state: 'all', search: '', limit: 25 });
    expect(first.items).toHaveLength(25);
    expect(first.total).toBe(123);
    const second = await service.loadListings(account, {
      state: 'all',
      search: '',
      limit: 25,
      cursor: first.nextCursor!,
    });
    expect(second.items[0].reference.externalId).toBe('26');
    expect(second.items).toHaveLength(25);
  });
  it('verweigert fremde Cursor und ungültige Seitenlängen vor dem Anbieterabruf', async () => {
    const service = TestBed.inject(MarketplaceOverviewService);
    const first = await service.loadListings(account, { state: 'all', search: '', limit: 25 });
    ebay.loadListings.mockClear();
    await expect(
      service.loadListings(
        { ...account, connectionId: 'other' },
        { state: 'all', search: '', limit: 25, cursor: first.nextCursor! },
      ),
    ).rejects.toThrow();
    await expect(
      service.loadListings(account, { state: 'all', search: '', limit: 101 }),
    ).rejects.toThrow();
    expect(ebay.loadListings).not.toHaveBeenCalled();
  });
  it('filtert eBay nicht unbemerkt nur innerhalb der geladenen Seite', async () => {
    const service = TestBed.inject(MarketplaceOverviewService);
    await expect(
      service.loadListings(account, { state: 'all', search: 'Schuhe', limit: 25 }),
    ).rejects.toThrow();
    expect(ebay.loadListings).not.toHaveBeenCalled();
  });
  it.each(['draft', 'hidden', 'unknown'] as const)(
    'erlaubt den Statusfilter %s nur für Vinted',
    async (state) => {
      const service = TestBed.inject(MarketplaceOverviewService);
      const vintedAccount = { ...account, platform: 'vinted' as const };
      const query = { state, search: '', limit: 25 };
      api.readOverviewPublications.mockResolvedValue({
        items: [],
        total: 0,
        nextCursor: null,
        completeness: 'partial',
      });
      await service.loadListings(vintedAccount, query);
      expect(api.readOverviewPublications).toHaveBeenCalledWith(vintedAccount, query);
      await expect(service.loadListings(account, query)).rejects.toThrow('Inseratauswahl');
      await expect(
        service.loadListings({ ...account, platform: 'kleinanzeigen' }, query),
      ).rejects.toThrow('Inseratauswahl');
      expect(ebay.loadListings).not.toHaveBeenCalled();
      expect(kleinanzeigen.readPage).not.toHaveBeenCalled();
    },
  );
  it('behält Vinted-Konten auch bei einem fehlgeschlagenen Vorschaulesen', async () => {
    api.canManage.mockResolvedValue(true);
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [
        {
          ...scope,
          marketplace: 'vinted',
          displayName: 'Vinted A',
          status: 'needs_login',
          lastSyncedAt: '2026-10-15T10:00:00Z',
        },
      ],
    });
    api.readAccountPreview.mockRejectedValue(new Error('offline'));
    const accounts = await TestBed.inject(MarketplaceOverviewService).loadAccounts(
      'ws-a',
      'vinted',
    );
    expect(accounts).toHaveLength(1);
    expect(accounts[0].listingCount).toBeNull();
    expect(accounts[0].error).toBeTruthy();
  });
  it.each(['needs_login', 'connected'] as const)(
    'zeigt eine aktive Kleinanzeigen-Verknüpfung trotz technischem Abgleichstatus %s grün',
    async (status) => {
      kleinanzeigen.readAccounts.mockResolvedValue({
        canManage: true,
        accounts: [
          {
            workspaceId: 'ws-a',
            connectionId: 'ka-a',
            displayName: 'KA A',
            status,
            lastSyncedAt: null,
            listingCount: null,
            activeCount: null,
            sync: null,
            localGrant: {
              active: true,
              canPublish: true,
              generation: 1,
              expiresAt: '2026-10-20T00:00:00Z',
            },
          },
        ],
      });
      const [account] = await TestBed.inject(MarketplaceOverviewService).loadAccounts(
        'ws-a',
        'kleinanzeigen',
      );
      expect(account.status).toBe(status);
      expect(account.connectionStatus).toEqual({ label: 'Verbunden', tone: 'success' });
    },
  );
  it('delegiert Kleinanzeigen-Konten und Inserate getrennt an deren eigenen Dienst', async () => {
    const row = {
      workspaceId: 'ws-a',
      connectionId: '9007199254740993',
      displayName: 'KA Testkonto',
      status: 'connected',
      listingCount: 17,
      activeCount: null,
      lastSyncedAt: '2026-10-16T06:00:00Z',
      sync: null,
    };
    kleinanzeigen.readAccounts.mockResolvedValue({ canManage: true, accounts: [row] });
    const service = TestBed.inject(MarketplaceOverviewService);
    const accounts = await service.loadAccounts('ws-a', 'kleinanzeigen');
    expect(accounts[0]).toMatchObject({
      platform: 'kleinanzeigen',
      connectionId: row.connectionId,
      listingCount: 17,
      activeCount: null,
      completeness: 'complete',
    });
    kleinanzeigen.readPage.mockResolvedValue({
      items: [],
      total: 17,
      nextCursor: null,
      completeness: 'complete',
    });
    await service.loadListings(accounts[0], { state: 'all', search: '', limit: 25 });
    expect(kleinanzeigen.readPage).toHaveBeenCalledWith(accounts[0], {
      state: 'all',
      search: '',
      limit: 25,
    });
    expect(api.listConnections).not.toHaveBeenCalled();
  });
});
