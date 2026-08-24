import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { OfflineSyncService } from './offline-sync.service';

describe('OfflineSyncService & Flea Market Rapid Sourcing (Chapter 28)', () => {
  let service: OfflineSyncService;

  beforeEach(() => {
    const injector = Injector.create({ providers: [] });
    service = runInInjectionContext(injector, () => new OfflineSyncService());
    service.loadDemoEntries();
    service.startCashSession(250.0, 'Flohmarkt Mauerpark Berlin');
  });

  it('should initialize with online status and persisted wallet', () => {
    expect(service.isOnline()).toBeDefined();
    expect(service.cashWallet().startCash).toBeGreaterThan(0);
    expect(service.pendingEntries().length).toBeGreaterThanOrEqual(1);
  });

  it('should start a new cash wallet session', () => {
    service.startCashSession(300.0, 'Flohmarkt Messe Leipzig');
    const w = service.cashWallet();

    expect(w.isActive).toBe(true);
    expect(w.startCash).toBe(300.0);
    expect(w.currentCash).toBe(300.0);
    expect(w.totalSpent).toBe(0);
    expect(w.locationName).toBe('Flohmarkt Messe Leipzig');
  });

  it('should record rapid offline purchase and deduct from cash wallet', () => {
    service.startCashSession(200.0, 'Flohmarkt Berlin');
    const initialPending = service.pendingEntries().length;

    const entry = service.recordRapidPurchase({
      title: 'Nintendo DS Lite Weiß',
      purchasePrice: 25.0,
      estimatedResalePrice: 60.0,
      category: 'Gaming',
    });

    expect(entry.id).toBeDefined();
    expect(entry.purchase_price).toBe(25.0);
    expect(entry.sync_status).toBe('pending');
    expect(service.pendingEntries().length).toBe(initialPending + 1);

    // Verify Cash Wallet deduction
    const w = service.cashWallet();
    expect(w.currentCash).toBe(175.0);
    expect(w.totalSpent).toBe(25.0);
    expect(w.estimatedTotalResale).toBe(60.0);
  });

  it('should synchronize pending entries to cloud', async () => {
    const res = await service.syncToCloud();
    expect(res).toBeDefined();
    expect(res.error).toBeNull();
    expect(res.problems).toEqual([]);
    expect(service.isSyncing()).toBe(false);
  });

  it('lässt fehlgeschlagene Einkäufe für einen erneuten Sync vorgemerkt', async () => {
    const fehler = new Error('Speichern des Einkaufs fehlgeschlagen');
    const createPurchase = vi.fn(async () => ({
      status: 'failed' as const,
      data: null,
      error: fehler,
      reportedBySyncStatus: true,
      problems: [],
    }));
    Object.assign(service, { purchaseService: { createPurchase } });
    const vorher = service.pendingEntries().filter((entry) => entry.sync_status === 'pending');

    const ergebnis = await service.syncToCloud();

    expect(ergebnis).toEqual({
      syncedCount: 0,
      error: fehler,
      reportedBySyncStatus: true,
      problems: [],
    });
    expect(createPurchase).toHaveBeenCalledTimes(vorher.length);
    expect(service.pendingEntries().filter((entry) => entry.sync_status === 'pending')).toEqual(
      vorher,
    );
    expect(service.isSyncing()).toBe(false);
  });

  it('markiert einen persistierten Teileinkauf als verarbeitet und legt ihn beim Folgesync nicht doppelt an', async () => {
    const problem = {
      kind: 'activity_log' as const,
      error: new Error('Aktivitätsprotokoll unvollständig'),
      reportedBySyncStatus: true,
    };
    const createPurchase = vi.fn(async () => ({
      status: 'partial' as const,
      data: { id: 'purchase-1' },
      error: null,
      reportedBySyncStatus: true,
      problems: [problem],
    }));
    Object.assign(service, { purchaseService: { createPurchase } });
    const eintrag = service.pendingEntries().find((entry) => entry.sync_status === 'pending')!;
    service.pendingEntries.set([eintrag]);

    const ersterSync = await service.syncToCloud();
    const zweiterSync = await service.syncToCloud();

    expect(ersterSync).toMatchObject({
      syncedCount: 1,
      error: null,
      problems: [problem],
    });
    expect(zweiterSync).toMatchObject({ syncedCount: 0, error: null, problems: [] });
    expect(service.pendingEntries()[0].sync_status).toBe('synced');
    expect(createPurchase).toHaveBeenCalledOnce();
  });
});
