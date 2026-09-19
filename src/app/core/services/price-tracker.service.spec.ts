import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { PriceTrackerService } from './price-tracker.service';
import { SyncStatusService } from './sync-status.service';

describe('PriceTrackerService & Competitor Radar (Chapter 26)', () => {
  let service: PriceTrackerService;

  beforeEach(() => {
    const injector = Injector.create({ providers: [] });
    service = runInInjectionContext(injector, () => new PriceTrackerService());
    service.loadDemoItems();
  });

  it('should initialize with pre-configured radar items', () => {
    const list = service.trackedItems();
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.some((t) => t.alertTriggered === 'undercut')).toBe(true);
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

  it('should perform live market scan and update timestamps', async () => {
    await service.scanMarketLive();
    expect(service.lastScanTimestamp()).toBeDefined();
    expect(service.isScanning()).toBe(false);
  });

  it('should apply recommended price and reset undercut alert', async () => {
    const target = service.trackedItems().find((t) => t.alertTriggered === 'undercut');
    if (target) {
      const recPrice = target.recommendedPrice;
      const success = await service.applyRecommendedPrice(target.id);

      expect(success).toBe(true);
      const updated = service.trackedItems().find((t) => t.id === target.id);
      expect(updated?.currentOurPrice).toBe(recPrice);
      expect(updated?.alertTriggered).toBe('none');
    }
  });

  it('übernimmt den Radarpreis bei fehlgeschlagener Inventarpersistenz nicht lokal', async () => {
    const target = service.trackedItems().find((t) => t.alertTriggered === 'undercut')!;
    const vorherigerPreis = target.currentOurPrice;
    const fehler = new Error('offline');
    (service as unknown as { inventoryService: unknown }).inventoryService = {
      updateItem: vi.fn(async () => ({ error: fehler })),
    };
    service.trackedItems.set([{ ...target, inventory_item_id: 'item-1' }]);

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
