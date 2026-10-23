import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EbaySaleActivityStore } from './ebay-sale-activity.store';
import { EbayOrderImportApiService } from '../../marketplaces/services/ebay-order-import-api.service';
import { EbayAccountApiService } from '../../marketplaces/services/ebay-account-api.service';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { InventoryService } from '../../../core/services/inventory.service';
import { StockService } from '../../../core/services/stock.service';
import { EbaySaleDraftsComponent } from '../components/ebay-sale-drafts/ebay-sale-drafts.component';
const scope = { workspaceId: 'workspace-a', connectionId: 'connection-a' };
const connection = {
  ...scope,
  status: 'connected',
  authorizationVersion: 1,
  environment: 'production',
  username: 'seller',
  lastReadAt: null,
};
describe('Persönliche eBay-Aktivität', () => {
  let store: EbaySaleActivityStore;
  const workspace = signal({ id: scope.workspaceId });
  const user = signal({ id: 'user-a' });
  let api: {
    loadDrafts: ReturnType<typeof vi.fn>;
    loadNotifications: ReturnType<typeof vi.fn>;
    loadReservations: ReturnType<typeof vi.fn>;
    updateNotification: ReturnType<typeof vi.fn>;
    resolveReservation: ReturnType<typeof vi.fn>;
  };
  let status: ReturnType<typeof vi.fn>;
  let stockReload: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    workspace.set({ id: scope.workspaceId });
    user.set({ id: 'user-a' });
    status = vi.fn(async () => ({ configured: true, importAvailable: true, connection }));
    stockReload = vi.fn(async () => undefined);
    api = {
      loadDrafts: vi.fn(async () => []),
      loadNotifications: vi.fn(async () => [
        {
          ...scope,
          eventId: 1,
          eventKey: 'ebay-sale:1',
          orderId: 'order-1',
          draftId: null,
          state: 'needs_mapping',
          createdAt: '2026-10-23T12:00:00Z',
          readAt: null,
        },
      ]),
      loadReservations: vi.fn(async () => []),
      updateNotification: vi.fn(async () => undefined),
      resolveReservation: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        EbaySaleActivityStore,
        { provide: EbayOrderImportApiService, useValue: api },
        { provide: EbayAccountApiService, useValue: { loadStatus: status } },
        { provide: AuthService, useValue: { currentUser: user } },
        { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
        {
          provide: StockService,
          useValue: { loadedWorkspaceId: signal(scope.workspaceId), loadPositions: stockReload },
        },
        {
          provide: InventoryService,
          useValue: { loadedWorkspaceId: signal(scope.workspaceId), loadInventory: vi.fn() },
        },
      ],
    });
    store = TestBed.inject(EbaySaleActivityStore);
    TestBed.tick();
    await store.reload();
    vi.clearAllMocks();
  });
  afterEach(() => TestBed.resetTestingModule());
  const held = ['first', 'second'].map((draftId, index) => ({
    id: index + 1,
    draftId,
    inventoryItemId: 'item',
    stockLotId: null,
    quantity: 1,
    createdAt: '2026-10-23T12:00:00Z',
  }));
  it('schließt interne Freigaben trotz dauerhaft verweigertem Privatstatus ab und erlaubt die nächste Klärung', async () => {
    status.mockRejectedValue(new Error('Privater Zugriff verweigert'));
    api.loadReservations.mockResolvedValue(held);
    await store.reload();
    api.loadReservations.mockResolvedValue([held[1]]);
    const component = TestBed.runInInjectionContext(() => new EbaySaleDraftsComponent());
    component.openResolution('first');
    component.resolution.setValue({ reason: 'Bestand geprüft', confirmed: true });
    await component.resolve();
    expect(component.selectedReservation()).toBeNull();
    expect(store.resolving()).toBe(false);
    expect(store.reservations().map((row) => row.draftId)).toEqual(['second']);
    expect(store.error()).toContain('Interne Reservierungen bleiben klärbar');
    api.loadReservations.mockResolvedValue([]);
    expect(await store.resolveReservation('second', 'Zweiten Bestand geprüft')).toBe(true);
    expect(store.resolving()).toBe(false);
    expect(store.reservations()).toEqual([]);
  });
  it('beendet die interne Freigabe nach einem konkurrierenden Poll mit geänderter Kontofassung', async () => {
    api.loadReservations.mockResolvedValue(held);
    await store.reload();
    let finish!: () => void;
    api.resolveReservation.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const resolution = store.resolveReservation('first', 'Bestand geprüft');
    expect(store.resolving()).toBe(true);
    status.mockResolvedValue({
      configured: true,
      importAvailable: true,
      connection: { ...connection, connectionId: 'connection-b', authorizationVersion: 2 },
    });
    await store.reload();
    api.loadReservations.mockResolvedValue([held[1]]);
    finish();
    expect(await resolution).toBe(true);
    expect(store.resolving()).toBe(false);
    expect(await store.resolveReservation('second', 'Zweiten Bestand geprüft')).toBe(true);
    expect(store.resolving()).toBe(false);
  });
  it('meldet die bestätigte Freigabe auch bei fehlgeschlagenem anschließendem Bestandsabruf als gespeichert', async () => {
    api.loadReservations.mockResolvedValue(held);
    await store.reload();
    stockReload.mockRejectedValueOnce(new Error('Bestandsabruf fehlgeschlagen'));
    expect(await store.resolveReservation('first', 'Bestand geprüft')).toBe(true);
    expect(store.resolving()).toBe(false);
    expect(store.error()).toBe('Bestandsabruf fehlgeschlagen');
    expect(store.reservations().map((row) => row.draftId)).toEqual(['second']);
  });
  it.each(['workspace', 'user'] as const)(
    'lässt beim %s-Wechsel nur die neue interne Freigabe ihre Ladeflagge beenden',
    async (changed) => {
      api.loadReservations.mockResolvedValue(held);
      await store.reload();
      let finishOld!: () => void;
      let finishNew!: () => void;
      api.resolveReservation
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              finishOld = resolve;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              finishNew = resolve;
            }),
        );
      const old = store.resolveReservation('first', 'Alter Kontext');
      if (changed === 'workspace') workspace.set({ id: 'workspace-b' });
      else user.set({ id: 'user-b' });
      TestBed.tick();
      await store.reload();
      const next = store.resolveReservation('second', 'Neuer Kontext');
      finishOld();
      expect(await old).toBe(false);
      expect(store.resolving()).toBe(true);
      api.loadReservations.mockResolvedValue([]);
      finishNew();
      expect(await next).toBe(true);
      expect(store.resolving()).toBe(false);
    },
  );
  it('zeigt persönliche stabile Meldungen mit richtigem Prüfziel und aktualisiert geänderte Reservierungen', async () => {
    api.loadReservations.mockResolvedValue([
      {
        id: 1,
        draftId: 'draft',
        stockLotId: 'lot',
        inventoryItemId: null,
        quantity: 1,
        createdAt: '2026-10-23T12:00:00Z',
      },
    ]);
    await store.reload();
    expect(store.notifications()[0]).toMatchObject({
      id: 'ebay-sale:1',
      read: false,
      link: '/sales/ebay/connection-a/order-1',
    });
    expect(stockReload).toHaveBeenCalledWith(scope.workspaceId);
  });
  it('sendet nach einem Workspacewechsel während der Statusprüfung keine Lesemutation', async () => {
    await store.reload();
    let finish!: (value: unknown) => void;
    status.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const mutation = store.markAsRead('ebay-sale:1');
    workspace.set({ id: 'workspace-b' });
    finish({ configured: true, importAvailable: true, connection });
    await mutation;
    expect(api.updateNotification).not.toHaveBeenCalled();
    expect(store.notifications()).toEqual([]);
  });
  it('erhält interne Reservierungen auch ohne persönliche Kontofreigabe', async () => {
    status.mockRejectedValueOnce(new Error('Privater Zugriff verweigert'));
    api.loadReservations.mockResolvedValueOnce([
      {
        id: 2,
        draftId: 'internal',
        inventoryItemId: 'item',
        stockLotId: null,
        quantity: 1,
        createdAt: '2026-10-23T12:00:00Z',
      },
    ]);
    await store.reload();
    expect(store.reservations()).toHaveLength(1);
    expect(store.notifications()).toEqual([]);
    expect(api.loadDrafts).not.toHaveBeenCalled();
  });
  it('bestätigt Lesen, Ungelesen, Alle lesen und Löschen nur im persönlichen Strom', async () => {
    await store.reload();
    await store.markAsRead('ebay-sale:1');
    expect(store.notifications()[0].read).toBe(true);
    await store.markAsUnread('ebay-sale:1');
    expect(store.notifications()[0].read).toBe(false);
    await store.markAllAsRead();
    expect(store.unreadCount()).toBe(0);
    await store.clearNotifications();
    expect(store.notifications()).toEqual([]);
    expect(api.updateNotification.mock.calls.map((call) => call[2])).toEqual([
      'read',
      'unread',
      'read',
      'dismiss',
    ]);
  });
  it('überschreibt einen bestätigten Lesestatus nicht durch einen älteren laufenden Abruf', async () => {
    await store.reload();
    let finish!: (value: unknown[]) => void;
    api.loadNotifications.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const refreshing = store.reload();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await store.markAsRead('ebay-sale:1');
    finish([
      {
        ...scope,
        eventId: 1,
        eventKey: 'ebay-sale:1',
        orderId: 'order-1',
        draftId: null,
        state: 'needs_mapping',
        createdAt: '2026-10-23T12:00:00Z',
        readAt: null,
      },
    ]);
    await refreshing;
    expect(store.notifications()[0].read).toBe(true);
  });
  it('bestätigt eine alte Autorisierungsfassung nicht für Lesemutationen', async () => {
    await store.reload();
    status.mockResolvedValueOnce({
      configured: true,
      importAvailable: true,
      connection: { ...connection, authorizationVersion: 2 },
    });
    await store.markAsRead('ebay-sale:1');
    expect(api.updateNotification).not.toHaveBeenCalled();
    expect(store.notifications()).toEqual([]);
  });
});
