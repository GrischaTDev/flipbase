import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EbayAccountApiService } from './ebay-account-api.service';
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
    };
    TestBed.configureTestingModule({
      providers: [EbayAccountStore, { provide: EbayAccountApiService, useValue: api }],
    });
    store = TestBed.inject(EbayAccountStore);
  });
  afterEach(() => TestBed.resetTestingModule());
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
