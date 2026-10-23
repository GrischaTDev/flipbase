import { signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EbayAccountApiService, EbayAccountRequestError } from './ebay-account-api.service';
import { EbayAccountStore } from './ebay-account.store';
import type {
  EbayConnection,
  EbayConnectionStatus,
  EbayListing,
  EbayPage,
} from '../../../../../supabase/functions/_shared/ebay-contracts';

function deferred<T>() {
  let resolvePromise: (result: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}
const connection: EbayConnection = {
  workspaceId: 'workspace-a',
  connectionId: 'connection-a',
  environment: 'production',
  status: 'connected',
  username: 'seller-a',
  lastReadAt: null,
  authorizationVersion: 1,
};
const listing: EbayListing = {
  id: '123',
  title: 'Artikel',
  price: 0,
  currency: 'EUR',
  quantity: 1,
  listingType: 'Chinese',
  url: 'https://www.ebay.de/itm/123',
};
describe('Persönlicher eBay-Zustand', () => {
  let store: EbayAccountStore;
  let api: {
    loadStatus: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    loadListings: ReturnType<typeof vi.fn>;
    loadOrders: ReturnType<typeof vi.fn>;
    loadOrderStatus: ReturnType<typeof vi.fn>;
    loadTraffic: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    api = {
      loadStatus: vi.fn(async () => ({ configured: true, connection })),
      connect: vi.fn(async () => 'https://auth.ebay.com/oauth2/authorize'),
      disconnect: vi.fn(async () => undefined),
      loadListings: vi.fn(async () => ({
        ...connection,
        items: [listing],
        total: 1,
        nextPage: null,
      })),
      loadOrders: vi.fn(async () => ({ ...connection, items: [], total: 0, nextPage: null })),
      loadOrderStatus: vi.fn(async () => ({ status: 'unrecorded', saleId: null })),
      loadTraffic: vi.fn(async () => ({
        ...connection,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        lastUpdatedDate: null,
        items: [{ listingId: '123', views: 0, transactions: 0, conversionRate: 0 }],
      })),
    };
    TestBed.configureTestingModule({
      providers: [
        EbayAccountStore,
        { provide: EbayAccountApiService, useValue: api },
        { provide: AuthService, useValue: { currentUser: signal({ id: 'user-a' }) } },
        {
          provide: WorkspaceService,
          useValue: { currentWorkspace: signal({ id: 'workspace-a' }) },
        },
      ],
    });
    store = TestBed.inject(EbayAccountStore);
  });
  afterEach(() => TestBed.resetTestingModule());
  it.each(
    (['listings', 'orders'] as const).flatMap((section) =>
      ['unauthorized', 'forbidden', 'needs_login', 'connection_changed'].flatMap((code) =>
        (['list', 'status'] as const).map((stage) => ({ section, code, stage })),
      ),
    ),
  )(
    'verwirft private Daten bei $code aus $stage für $section auch vor erneutem Statusabruf',
    async ({ section, code, stage }) => {
      api.loadOrders.mockResolvedValue({
        ...connection,
        items: [{ id: 'order-a' }],
        total: 1,
        nextPage: null,
      });
      await store.initialize('workspace-a', true);
      await store.selectSection('orders');
      if (section === 'listings') await store.selectSection('listings');
      expect(store.listings()).toHaveLength(1);
      expect(store.orders()).toHaveLength(1);
      store.traffic.set({
        '123': { listingId: '123', views: 1, transactions: 0, conversionRate: 0 },
      });
      store.orderBookings.set({ 'order-a': { status: 'unrecorded', saleId: null } });
      const original =
        stage === 'list'
          ? new EbayAccountRequestError(code, 'Ursprünglicher Zugriff verweigert')
          : new Error('Ursprünglicher Transportfehler');
      const read = section === 'listings' ? api.loadListings : api.loadOrders;
      read.mockRejectedValueOnce(original);
      api.loadStatus.mockRejectedValueOnce(
        new EbayAccountRequestError(code, 'Statuszugriff verweigert'),
      );
      await store.read(false);
      expect(api.loadStatus).toHaveBeenCalledTimes(stage === 'list' ? 1 : 2);
      expect(store.connection()).toBeNull();
      expect(store.listings()).toEqual([]);
      expect(store.orders()).toEqual([]);
      expect(store.traffic()).toEqual({});
      expect(store.orderBookings()).toEqual({});
      expect(store.dataError()).toBe(original.message);
      expect(store.isReading()).toBe(false);
      const pending = deferred<EbayConnectionStatus>();
      api.loadStatus.mockReset().mockReturnValueOnce(pending.promise);
      const retry = store.initialize('workspace-a', false);
      expect(store.connection()).toBeNull();
      expect(store.listings()).toEqual([]);
      expect(store.orders()).toEqual([]);
      pending.resolve({ configured: true, connection });
      await retry;
      expect(store.listings()).toEqual([]);
      expect(store.orders()).toEqual([]);
    },
  );
  it('erhält Zeilen bei Rückkehr, Aktualisierung und Fehlern im selben bestätigten Kontext', async () => {
    await store.initialize('workspace-a', true);
    const pending = deferred<EbayConnectionStatus>();
    api.loadStatus.mockReturnValueOnce(pending.promise);
    const returning = store.initialize('workspace-a', true);
    expect(store.listings()).toEqual([listing]);
    pending.resolve({ configured: true, connection });
    api.loadListings.mockRejectedValueOnce(new Error('Abgleich fehlgeschlagen'));
    await returning;
    expect(store.listings()).toEqual([listing]);
    expect(store.dataError()).toBe('Abgleich fehlgeschlagen');
  });
  it('verwirft alte Zeilen bei neuer oder unbekannter Autorisierungsfassung', async () => {
    await store.initialize('workspace-a', true);
    api.loadStatus.mockResolvedValueOnce({
      configured: true,
      connection: { ...connection, authorizationVersion: 2 },
    });
    await store.initialize('workspace-a', false);
    expect(store.listings()).toEqual([]);
    await store.read(false);
    api.loadStatus.mockResolvedValueOnce({
      configured: true,
      connection: { ...connection, authorizationVersion: undefined },
    });
    await store.initialize('workspace-a', false);
    expect(store.listings()).toEqual([]);
  });
  it('entfernt private Zeilen bei nachweislich entzogener Kontofreigabe', async () => {
    await store.initialize('workspace-a', true);
    api.loadStatus.mockRejectedValueOnce(new EbayAccountRequestError('forbidden', 'Kein Zugriff'));
    await store.initialize('workspace-a', true);
    expect(store.listings()).toEqual([]);
    expect(store.connection()).toBeNull();
  });
  it('lädt Statistiken nur nach bestätigter Serverfähigkeit und erhält echte Nullwerte', async () => {
    await store.initialize('workspace-a', true);
    await store.readTraffic();
    expect(api.loadTraffic).not.toHaveBeenCalled();
    api.loadStatus.mockResolvedValueOnce({
      configured: true,
      listingManagementAvailable: true,
      connection,
    });
    await store.initialize('workspace-a', true);
    expect(api.loadTraffic).toHaveBeenCalledTimes(1);
    expect(store.traffic()['123'].views).toBe(0);
    expect(store.traffic()['123'].conversionRate).toBe(0);
  });
  it('verwirft verspätete Statistiken beim Workspacewechsel', async () => {
    api.loadStatus.mockResolvedValueOnce({
      configured: true,
      listingManagementAvailable: true,
      connection,
    });
    await store.initialize('workspace-a', true);
    const pending = deferred<{
      startDate: string;
      endDate: string;
      lastUpdatedDate: null;
      items: [];
    }>();
    api.loadTraffic.mockReturnValueOnce(pending.promise);
    const reading = store.readTraffic();
    store.reset('workspace-b');
    pending.resolve({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      lastUpdatedDate: null,
      items: [],
    });
    await reading;
    expect(store.traffic()).toEqual({});
    expect(store.trafficPeriod()).toBeNull();
    expect(store.trafficLoading()).toBe(false);
  });
  it('lässt Inserate bei fehlender Statistikfreigabe lesbar und zeigt den Fehler', async () => {
    api.loadStatus.mockResolvedValueOnce({
      configured: true,
      listingManagementAvailable: true,
      connection,
    });
    await store.initialize('workspace-a', true);
    api.loadTraffic.mockRejectedValueOnce(new Error('Erneut verbinden.'));
    await store.readTraffic();
    expect(store.listings()).toEqual([listing]);
    expect(store.trafficError()).toBe('Erneut verbinden.');
    expect(store.trafficPeriod()).toBeNull();
  });
  it('liest Buchungsbelege und verwirft verspätete Antworten nach Workspacewechsel', async () => {
    api.loadStatus.mockResolvedValueOnce({ configured: true, importAvailable: true, connection });
    await store.initialize('workspace-a', false);
    const pending = deferred<{ status: string; saleId: string }>();
    api.loadOrders.mockResolvedValue({
      ...connection,
      items: [{ id: 'order-1' }],
      total: 1,
      nextPage: null,
    });
    api.loadOrderStatus.mockReturnValueOnce(pending.promise);
    await store.selectSection('orders');
    expect(api.loadOrderStatus).toHaveBeenCalledWith(connection, 'order-1');
    store.reset('workspace-b');
    pending.resolve({ status: 'imported', saleId: 'sale-a' });
    await Promise.resolve();
    await Promise.resolve();
    expect(store.orderBookings()).toEqual({});
    expect(store.bookingStatusesLoading()).toBe(false);
  });
  it('zeigt einen bestätigten Importbeleg und lässt bei Statusfehlern die Bestellungen lesbar', async () => {
    api.loadStatus.mockResolvedValueOnce({ configured: true, importAvailable: true, connection });
    await store.initialize('workspace-a', false);
    api.loadOrders.mockResolvedValue({
      ...connection,
      items: [{ id: 'order-1' }, { id: 'order-2' }],
      total: 2,
      nextPage: null,
    });
    api.loadOrderStatus
      .mockResolvedValueOnce({ status: 'imported', saleId: 'sale-a', alreadyRecorded: true })
      .mockRejectedValueOnce(new Error('offline'));
    await store.selectSection('orders');
    await vi.waitFor(() => expect(store.bookingStatusesLoading()).toBe(false));
    expect(store.orderBookings()['order-1']).toMatchObject({
      status: 'imported',
      saleId: 'sale-a',
    });
    expect(store.orderBookings()['order-2']).toBeUndefined();
    expect(store.orders()).toHaveLength(2);
    expect(store.bookingError()).not.toBeNull();
  });
  it('verwirft einen verspäteten Status nach Workspacewechsel', async () => {
    const pending = deferred<EbayConnectionStatus>();
    api.loadStatus.mockImplementationOnce(() => pending.promise);
    const pendingStatusRequest = store.initialize('workspace-a', false);
    api.loadStatus.mockResolvedValueOnce({ configured: true, connection: null });
    await store.initialize('workspace-b', false);
    pending.resolve({ configured: true, connection });
    await pendingStatusRequest;
    expect(store.connection()).toBeNull();
  });
  it('löscht Kontodaten sofort bei Workspacewechsel und Abmeldung', async () => {
    await store.initialize('workspace-a', true);
    expect(store.listings()).toHaveLength(1);
    store.reset(null);
    expect(store.listings()).toEqual([]);
    expect(store.connection()).toBeNull();
  });
  it('verwirft ein verspätetes Inserat nach Trennen der Verbindung', async () => {
    await store.initialize('workspace-a', false);
    const pending = deferred<EbayPage<EbayListing>>();
    api.loadListings.mockReturnValueOnce(pending.promise);
    const pendingListingsRequest = store.read(false);
    await store.disconnect();
    pending.resolve({ ...connection, items: [listing], total: 1, nextPage: null });
    await pendingListingsRequest;
    expect(store.connection()?.status).toBe('disconnected');
    expect(store.listings()).toEqual([]);
  });
  it('unterbindet doppelte Abrufe und liest weitere Seiten ohne Dubletten', async () => {
    await store.initialize('workspace-a', false);
    const pending = deferred<EbayPage<EbayListing>>();
    api.loadListings.mockReturnValueOnce(pending.promise);
    const pendingListingsRequest = store.read(false);
    await store.read(false);
    expect(api.loadListings).toHaveBeenCalledTimes(1);
    pending.resolve({ ...connection, items: [listing], total: 2, nextPage: 2 });
    await pendingListingsRequest;
    await store.read(true);
    expect(api.loadListings).toHaveBeenLastCalledWith(connection, 2);
    expect(store.listings()).toHaveLength(1);
  });
  it('zeigt Abruffehler und kann den Status erneut prüfen', async () => {
    await store.initialize('workspace-a', false);
    api.loadListings.mockRejectedValueOnce(new Error('eBay gerade nicht erreichbar'));
    await store.read(false);
    expect(store.dataError()).toBe('eBay gerade nicht erreichbar');
    expect(store.isReading()).toBe(false);
  });
  it('startet ohne eingerichteten Server keinen Login oder Abruf', async () => {
    api.loadStatus.mockResolvedValueOnce({ configured: false, connection: null });
    await store.initialize('workspace-a', true);
    expect(await store.connect()).toBeNull();
    expect(api.connect).not.toHaveBeenCalled();
    expect(api.loadListings).not.toHaveBeenCalled();
  });
});
