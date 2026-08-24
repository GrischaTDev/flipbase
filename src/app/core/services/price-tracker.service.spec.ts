import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { PriceTrackerService } from './price-tracker.service';

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

  it('should add a new tracked item', () => {
    const initialCount = service.trackedItems().length;
    const item = service.addTrackedItem({
      title: 'Apple iPad Pro 11 M2',
      price: 650.0,
      category: 'Tablets',
    });

    expect(item.id).toBeDefined();
    expect(item.currentOurPrice).toBe(650.0);
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

  it('should toggle and delete tracked item', () => {
    const first = service.trackedItems()[0];
    const initialActive = first.isTrackingActive;

    service.toggleTracking(first.id);
    expect(service.trackedItems().find((t) => t.id === first.id)?.isTrackingActive).toBe(
      !initialActive,
    );

    service.deleteTrackedItem(first.id);
    expect(service.trackedItems().some((t) => t.id === first.id)).toBe(false);
  });
});
