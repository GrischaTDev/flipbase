import { Injectable, computed, inject, signal } from '@angular/core';
import { CashWalletSession, OfflinePurchaseEntry } from '../models/offline-sourcing.models';
import { PurchaseService } from './purchase.service';
import { InventoryService } from './inventory.service';
import { WorkspaceService } from './workspace.service';
import { WebPushService } from './web-push.service';
import { WebhookService } from './webhook.service';

const STORAGE_KEY_OFFLINE_ENTRIES = 'reflip_offline_purchase_entries';
const STORAGE_KEY_CASH_WALLET = 'reflip_flea_market_cash_wallet';

@Injectable({
  providedIn: 'root',
})
export class OfflineSyncService {
  private readonly purchaseService: PurchaseService | null = null;
  private readonly inventoryService: InventoryService | null = null;
  private readonly workspaceService: WorkspaceService | null = null;
  private readonly webPushService: WebPushService | null = null;
  private readonly webhookService: WebhookService | null = null;

  readonly isOnline = signal<boolean>(
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true
  );
  readonly pendingEntries = signal<OfflinePurchaseEntry[]>(this.loadPersistedEntries());
  readonly cashWallet = signal<CashWalletSession>(this.loadPersistedWallet());
  readonly isSyncing = signal<boolean>(false);

  readonly pendingCount = computed(() => this.pendingEntries().filter((e) => e.sync_status === 'pending').length);

  readonly potentialProfitEstimate = computed(() => {
    const w = this.cashWallet();
    return Math.max(0, w.estimatedTotalResale - w.totalSpent);
  });

  constructor() {
    try {
      this.purchaseService = inject(PurchaseService, { optional: true });
      this.inventoryService = inject(InventoryService, { optional: true });
      this.workspaceService = inject(WorkspaceService, { optional: true });
      this.webPushService = inject(WebPushService, { optional: true });
      this.webhookService = inject(WebhookService, { optional: true });
    } catch {
      this.purchaseService = null;
      this.inventoryService = null;
      this.workspaceService = null;
      this.webPushService = null;
      this.webhookService = null;
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline.set(true);
        // Auto-sync when network returns!
        if (this.pendingCount() > 0) {
          this.syncToCloud();
        }
      });
      window.addEventListener('offline', () => {
        this.isOnline.set(false);
      });
    }
  }

  private loadPersistedEntries(): OfflinePurchaseEntry[] {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(STORAGE_KEY_OFFLINE_ENTRIES);
        if (stored) return JSON.parse(stored);
      }
    } catch {}

    return [];
  }

  loadDemoEntries(): void {
    const demo: OfflinePurchaseEntry[] = [
      {
        id: 'off-1',
        workspace_id: 'ws-1',
        title: 'Vintage Game Boy Color (Lila)',
        purchase_price: 35.0,
        estimated_resale_price: 85.0,
        location_name: 'Flohmarkt Mauerpark Berlin',
        category: 'Gaming & Retro',
        condition: 'Gebraucht',
        notes: 'Funktioniert einwandfrei, Batteriedeckel vorhanden.',
        captured_at: new Date().toISOString(),
        sync_status: 'pending',
      },
    ];
    this.pendingEntries.set(demo);
    this.persistEntries();
  }

  private persistEntries(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY_OFFLINE_ENTRIES, JSON.stringify(this.pendingEntries()));
      }
    } catch {}
  }

  private loadPersistedWallet(): CashWalletSession {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(STORAGE_KEY_CASH_WALLET);
        if (stored) return JSON.parse(stored);
      }
    } catch {}

    return {
      isActive: false,
      startCash: 0,
      currentCash: 0,
      totalSpent: 0,
      estimatedTotalResale: 0,
      itemsCount: 0,
      locationName: '',
      startedAt: '',
    };
  }

  private persistWallet(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY_CASH_WALLET, JSON.stringify(this.cashWallet()));
      }
    } catch {}
  }

  startCashSession(startAmount: number, locationName: string = 'Flohmarkt'): void {
    const session: CashWalletSession = {
      isActive: true,
      startCash: startAmount,
      currentCash: startAmount,
      totalSpent: 0,
      estimatedTotalResale: 0,
      itemsCount: 0,
      locationName,
      startedAt: new Date().toISOString(),
    };
    this.cashWallet.set(session);
    this.persistWallet();
  }

  endCashSession(): void {
    this.cashWallet.update((w) => ({ ...w, isActive: false }));
    this.persistWallet();
  }

  /**
   * Blitzschnelle Erfassung eines Flohmarktfundes (auch offline!).
   */
  recordRapidPurchase(payload: {
    title: string;
    purchasePrice: number;
    estimatedResalePrice?: number;
    locationName?: string;
    category?: string;
    condition?: string;
    notes?: string;
    photoDataUrl?: string;
  }): OfflinePurchaseEntry {
    const ws = this.workspaceService?.currentWorkspace();
    const estResale = payload.estimatedResalePrice || Number((payload.purchasePrice * 2.2).toFixed(2));
    const loc = payload.locationName || this.cashWallet().locationName || 'Flohmarkt';

    const entry: OfflinePurchaseEntry = {
      id: `off-${Date.now()}`,
      workspace_id: ws?.id || 'ws-1',
      title: payload.title,
      purchase_price: Number(payload.purchasePrice.toFixed(2)),
      estimated_resale_price: estResale,
      location_name: loc,
      category: payload.category || 'Flohmarktfund',
      condition: payload.condition || 'Gebraucht',
      notes: payload.notes,
      photo_data_url: payload.photoDataUrl,
      captured_at: new Date().toISOString(),
      sync_status: 'pending',
    };

    // 1. Add to Offline Queue
    this.pendingEntries.update((list) => [entry, ...list]);
    this.persistEntries();

    // 2. Update Cash Wallet
    if (this.cashWallet().isActive) {
      this.cashWallet.update((w) => ({
        ...w,
        currentCash: Number(Math.max(0, w.currentCash - payload.purchasePrice).toFixed(2)),
        totalSpent: Number((w.totalSpent + payload.purchasePrice).toFixed(2)),
        estimatedTotalResale: Number((w.estimatedTotalResale + estResale).toFixed(2)),
        itemsCount: w.itemsCount + 1,
      }));
      this.persistWallet();
    }

    // 3. Web Push trigger
    if (this.webPushService) {
      this.webPushService.sendNotification(`Flohmarktfund gespeichert`, {
        body: `${payload.title} für ${payload.purchasePrice.toFixed(2)} € erfasst (Rest-Bargeld: ${this.cashWallet().currentCash.toFixed(2)} €).`,
        tag: `offline-entry-${entry.id}`,
      });
    }

    // If online, immediately try to sync
    if (this.isOnline()) {
      this.syncToCloud();
    }

    return entry;
  }

  /**
   * Synchronizes all pending offline entries to the Supabase Cloud Inventory and Purchases.
   */
  async syncToCloud(): Promise<{ syncedCount: number }> {
    if (this.isSyncing()) return { syncedCount: 0 };
    this.isSyncing.set(true);

    const pending = this.pendingEntries().filter((e) => e.sync_status === 'pending');
    if (pending.length === 0) {
      this.isSyncing.set(false);
      return { syncedCount: 0 };
    }

    // Simulate network roundtrip
    await new Promise((res) => setTimeout(res, 600));

    let count = 0;
    for (const item of pending) {
      // 1. Create real purchase via PurchaseService if available
      if (this.purchaseService) {
        await this.purchaseService.createPurchase({
          type: 'single',
          title: item.title,
          purchase_date: item.captured_at.split('T')[0],
          purchase_price: item.purchase_price,
          single_item_title: item.title,
          single_item_category: item.category,
          single_item_condition: item.condition,
          single_item_expected_value: item.estimated_resale_price,
          notes: `Offline-Erfassung (${item.location_name}): ${item.notes || ''}`,
        });
      }
      count++;
    }

    // Mark all as synced
    this.pendingEntries.update((list) =>
      list.map((e) => (e.sync_status === 'pending' ? { ...e, sync_status: 'synced' } : e))
    );
    this.persistEntries();
    this.isSyncing.set(false);

    if (this.webhookService) {
      this.webhookService.addNotification({
        title: 'Offline-Sync abgeschlossen',
        message: `${count} Flohmarkt-Einkäufe erfolgreich in den Cloud-Workspace übertragen.`,
        type: 'system',
      });
    }

    return { syncedCount: count };
  }

  deletePendingEntry(id: string): void {
    this.pendingEntries.update((list) => list.filter((e) => e.id !== id));
    this.persistEntries();
  }
}
