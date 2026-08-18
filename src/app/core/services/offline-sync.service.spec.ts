import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { OfflineSyncService } from './offline-sync.service';

describe('OfflineSyncService & Flea Market Rapid Sourcing (Chapter 28)', () => {
  let service: OfflineSyncService;

  beforeEach(() => {
    service = new OfflineSyncService();
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
    expect(service.isSyncing()).toBe(false);
  });
});
