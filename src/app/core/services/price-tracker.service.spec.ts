import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { PriceTrackerService } from './price-tracker.service';
import { SyncStatusService } from './sync-status.service';
import { PriceTrackedItem } from '../models/price-tracker.models';

const trackedItems: PriceTrackedItem[] = [
  {
    id: 'track-1',
    workspace_id: 'ws-1',
    title: 'Kopfhörer',
    category: 'Elektronik',
    currentOurPrice: 249,
    currentMarketAverage: 228,
    currentMarketLowest: 209,
    recommendedPrice: 219,
    priceTrend: 'falling',
    priceDifferencePercent: -16,
    alertTriggered: 'undercut',
    lastCheckedAt: '2026-09-19T10:00:00.000Z',
    isTrackingActive: true,
    priceHistory: [],
  },
  {
    id: 'track-2',
    workspace_id: 'ws-1',
    title: 'Bausatz',
    category: 'Spielwaren',
    currentOurPrice: 680,
    currentMarketAverage: 755,
    currentMarketLowest: 720,
    recommendedPrice: 739,
    priceTrend: 'rising',
    priceDifferencePercent: 8.6,
    alertTriggered: 'price_surge',
    lastCheckedAt: '2026-09-19T10:00:00.000Z',
    isTrackingActive: true,
    priceHistory: [],
  },
];

describe('PriceTrackerService & Competitor Radar (Chapter 26)', () => {
  let service: PriceTrackerService;

  beforeEach(() => {
    const injector = Injector.create({ providers: [] });
    service = runInInjectionContext(injector, () => new PriceTrackerService());
    service.trackedItems.set(trackedItems);
  });

  it('wertet die im Test gesetzten Radarartikel aus', () => {
    const list = service.trackedItems();
    expect(list).toHaveLength(2);
    expect(list.some((t) => t.alertTriggered === 'undercut')).toBe(true);
  });

  it('entfernt veraltete lokale Radarartikel, wenn der Workspace keine Datensätze enthält', async () => {
    const query = {
      select: () => query,
      eq: () => query,
      order: async () => ({ data: [], error: null }),
    };
    Object.assign(service, {
      supabase: { client: { from: () => query } },
    });

    await service.loadFromSupabase('workspace-1');

    expect(service.trackedItems()).toEqual([]);
  });

  it('verwirft eine verspätete Antwort des vorherigen Workspaces', async () => {
    const pending = new Map<string, (result: { data: unknown[]; error: null }) => void>();
    let currentWorkspaceId = 'workspace-a';
    const query = {
      select: () => query,
      eq: (_column: string, workspaceId: string) => ({
        order: () =>
          new Promise<{ data: unknown[]; error: null }>((resolve) => {
            pending.set(workspaceId, resolve);
          }),
      }),
    };
    Object.assign(service, {
      supabase: { client: { from: () => query } },
      workspaceService: { currentWorkspace: () => ({ id: currentWorkspaceId }) },
    });

    const firstLoad = service.loadFromSupabase('workspace-a');
    currentWorkspaceId = 'workspace-b';
    const secondLoad = service.loadFromSupabase('workspace-b');
    pending.get('workspace-b')!({
      data: [{ ...trackedItems[0], id: 'track-b', workspace_id: 'workspace-b' }],
      error: null,
    });
    await secondLoad;
    pending.get('workspace-a')!({
      data: [{ ...trackedItems[0], id: 'track-a', workspace_id: 'workspace-a' }],
      error: null,
    });
    await firstLoad;

    expect(service.trackedItems().map((entry) => entry.id)).toEqual(['track-b']);
  });

  it('leert Preisbeobachtungen bei Abmeldung ohne Datenbankabfrage', async () => {
    const from = vi.fn();
    Object.assign(service, { supabase: { client: { from } } });

    await service.loadFromSupabase('');

    expect(service.trackedItems()).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it('should add a new tracked item', async () => {
    const initialCount = service.trackedItems().length;
    const ergebnis = await service.addTrackedItem({
      title: 'Apple iPad Pro 11 M2',
      price: 650.0,
      category: 'Tablets',
    });
    const item = ergebnis.data;

    expect(item?.id).toBeDefined();
    expect(item?.currentOurPrice).toBe(650.0);
    expect(service.trackedItems().length).toBe(initialCount + 1);
  });

  it('speichert ohne Marktdatenquelle keine erfundenen Vergleichswerte', async () => {
    const insert = vi.fn(() => ({
      select: () => ({
        single: async () => ({ data: { id: 'track-saved' }, error: null }),
      }),
    }));
    Object.assign(service, {
      supabase: { client: { from: () => ({ insert }) } },
      workspaceService: { currentWorkspace: () => ({ id: 'workspace-1' }) },
    });

    const result = await service.addTrackedItem({ title: 'Kamera', price: 100 });

    expect(result.data).toMatchObject({
      currentMarketAverage: 0,
      currentMarketLowest: 0,
      recommendedPrice: 0,
      alertTriggered: 'none',
      priceHistory: [],
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        current_market_average: 0,
        current_market_lowest: 0,
        recommended_price: 0,
        alert_triggered: 'none',
        price_history: [],
        market_data_verified: false,
      }),
    );
  });

  it('übernimmt eine verspätete Speicherung nicht in den neuen Workspace', async () => {
    let currentWorkspaceId = 'workspace-a';
    let resolveInsert!: (value: { data: { id: string }; error: null }) => void;
    const response = new Promise<{ data: { id: string }; error: null }>((resolve) => {
      resolveInsert = resolve;
    });
    const insert = vi.fn(() => ({ select: () => ({ single: () => response }) }));
    Object.assign(service, {
      supabase: { client: { from: () => ({ insert }) } },
      workspaceService: { currentWorkspace: () => ({ id: currentWorkspaceId }) },
    });

    const operation = service.addTrackedItem({ title: 'Kamera A', price: 100 });
    currentWorkspaceId = 'workspace-b';
    service.trackedItems.set([{ ...trackedItems[0], id: 'track-b', workspace_id: 'workspace-b' }]);
    resolveInsert({ data: { id: 'track-a' }, error: null });
    const result = await operation;

    expect(result.error?.message).toContain('Workspace');
    expect(service.trackedItems().map((item) => item.id)).toEqual(['track-b']);
  });

  it('should perform live market scan and update timestamps', async () => {
    await service.scanMarketLive();
    expect(service.lastScanTimestamp()).toBeDefined();
    expect(service.isScanning()).toBe(false);
  });

  it('wendet ohne Marktdatenquelle keine gespeicherte Preisempfehlung an', async () => {
    const target = service.trackedItems().find((t) => t.alertTriggered === 'undercut');
    if (target) {
      const previousPrice = target.currentOurPrice;
      const success = await service.applyRecommendedPrice(target.id);

      expect(success).toBe(false);
      const updated = service.trackedItems().find((t) => t.id === target.id);
      expect(updated?.currentOurPrice).toBe(previousPrice);
      expect(updated?.alertTriggered).toBe('undercut');
    }
  });

  it('behandelt ältere gespeicherte Vergleichswerte ohne Quelle als unbekannt', async () => {
    const databaseItem = {
      id: 'legacy-track',
      workspace_id: 'workspace-1',
      inventory_item_id: null,
      title: 'Kamera',
      category: 'Foto',
      current_our_price: 100,
      current_market_average: 95,
      current_market_lowest: 88,
      recommended_price: 91.5,
      lowest_competitor_title: 'Erfundenes Angebot',
      lowest_competitor_platform: 'kleinanzeigen',
      lowest_competitor_url: 'https://example.invalid',
      price_trend: 'falling',
      price_difference_percent: -12,
      alert_triggered: 'undercut',
      last_checked_at: '2026-09-19T10:00:00.000Z',
      is_tracking_active: true,
      price_history: [
        { timestamp: '2026-09-19', avgPrice: 95, lowestPrice: 88, listingsCount: 12 },
      ],
      created_at: '2026-09-19T10:00:00.000Z',
    };
    const query = {
      select: () => query,
      eq: () => query,
      order: async () => ({ data: [databaseItem], error: null }),
    };
    Object.assign(service, { supabase: { client: { from: () => query } } });

    await service.loadFromSupabase('workspace-1');

    expect(service.trackedItems()[0]).toMatchObject({
      currentMarketAverage: 0,
      currentMarketLowest: 0,
      recommendedPrice: 0,
      lowestCompetitorTitle: undefined,
      lowestCompetitorUrl: undefined,
      priceTrend: 'stable',
      priceDifferencePercent: 0,
      alertTriggered: 'none',
      priceHistory: [],
    });
  });

  it('behandelt unbestätigte Altwerte auch nach Anschluss einer Quelle als unbekannt', async () => {
    const databaseItem = {
      id: 'legacy-track',
      workspace_id: 'workspace-1',
      inventory_item_id: null,
      title: 'Kamera',
      category: 'Foto',
      current_our_price: 100,
      current_market_average: 95,
      current_market_lowest: 88,
      recommended_price: 91.5,
      lowest_competitor_title: 'Altes Fantasieangebot',
      lowest_competitor_platform: 'kleinanzeigen',
      lowest_competitor_url: 'https://example.invalid',
      price_trend: 'falling',
      price_difference_percent: -12,
      alert_triggered: 'undercut',
      last_checked_at: '2026-09-19T10:00:00.000Z',
      is_tracking_active: true,
      price_history: [],
      market_data_verified: false,
      created_at: '2026-09-19T10:00:00.000Z',
    };
    const query = {
      select: () => query,
      eq: () => query,
      order: async () => ({ data: [databaseItem], error: null }),
    };
    Object.assign(service, {
      marktdatenAngebunden: true,
      supabase: { client: { from: () => query } },
    });

    await service.loadFromSupabase('workspace-1');

    expect(service.trackedItems()[0]).toMatchObject({
      currentMarketAverage: 0,
      recommendedPrice: 0,
      marketDataVerified: false,
    });
  });

  it('übernimmt den Radarpreis bei fehlgeschlagener Inventarpersistenz nicht lokal', async () => {
    const target = service.trackedItems().find((t) => t.alertTriggered === 'undercut')!;
    const vorherigerPreis = target.currentOurPrice;
    const fehler = new Error('offline');
    (service as unknown as { inventoryService: unknown }).inventoryService = {
      updateItem: vi.fn(async () => ({ error: fehler })),
    };
    service.trackedItems.set([
      { ...target, inventory_item_id: 'item-1', marketDataVerified: true },
    ]);

    Object.assign(service, { marktdatenAngebunden: true });
    await expect(service.applyRecommendedPrice(target.id)).rejects.toBe(fehler);

    expect(service.trackedItems()[0].currentOurPrice).toBe(vorherigerPreis);
  });

  it('should toggle and delete tracked item', async () => {
    const first = service.trackedItems()[0];
    const initialActive = first.isTrackingActive;

    service.toggleTracking(first.id);
    expect(service.trackedItems().find((t) => t.id === first.id)?.isTrackingActive).toBe(
      !initialActive,
    );

    await service.deleteTrackedItem(first.id);
    expect(service.trackedItems().some((t) => t.id === first.id)).toBe(false);
  });

  it('legt eine Preisbeobachtung erst nach DB-Bestätigung mit der echten ID lokal an', async () => {
    const vorher = service.trackedItems();
    let bestaetigeDatenbank!: (value: { data: { id: string }; error: null }) => void;
    const datenbankAntwort = new Promise<{ data: { id: string }; error: null }>((resolve) => {
      bestaetigeDatenbank = resolve;
    });
    const single = vi.fn(() => datenbankAntwort);
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    Object.assign(service, {
      supabase: { client: { from: () => ({ insert }) } },
      workspaceService: { currentWorkspace: () => ({ id: 'workspace-1' }) },
    });

    const vorgang = service.addTrackedItem({ title: 'Kamera', price: 200 });

    expect(service.trackedItems()).toEqual(vorher);
    bestaetigeDatenbank({ data: { id: '9f7439ce-3ea5-4dce-9ccd-fbad4838a4ef' }, error: null });
    const ergebnis = await vorgang;

    expect(ergebnis.data?.id).toBe('9f7439ce-3ea5-4dce-9ccd-fbad4838a4ef');
    expect(service.trackedItems()[0].id).toBe('9f7439ce-3ea5-4dce-9ccd-fbad4838a4ef');
  });

  it('meldet einen Lösch-Nulltreffer zentral und behält die Preisbeobachtung lokal', async () => {
    const erster = service.trackedItems()[0];
    const syncStatus = new SyncStatusService();
    const remove = vi.fn(() => ({
      eq: () => ({
        eq: async () => ({ error: null, count: 0 }),
      }),
    }));
    Object.assign(service, {
      supabase: { client: { from: () => ({ delete: remove }) } },
      workspaceService: { currentWorkspace: () => ({ id: erster.workspace_id }) },
      syncStatus,
    });

    const ergebnis = await service.deleteTrackedItem(erster.id);

    expect(ergebnis).toMatchObject({ data: null, reportedBySyncStatus: true });
    expect(service.trackedItems()).toContainEqual(erster);
    expect(syncStatus.fehler()[0].vorgang).toBe('Löschen der Preisbeobachtung');
  });
});
