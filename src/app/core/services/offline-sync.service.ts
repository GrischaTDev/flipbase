import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { CashWalletSession, OfflinePurchaseEntry } from '../models/offline-sourcing.models';
import { PurchaseService } from './purchase.service';
import { InventoryService } from './inventory.service';
import { WorkspaceService } from './workspace.service';
import { WebPushService } from './web-push.service';
import { WebhookService } from './webhook.service';
import { SupabaseService } from './supabase.service';
import { MockDataStoreService } from './mock-data-store.service';
import { LoggerService } from './logger.service';
import { schreibeImHintergrund } from './supabase-schreiben';
import { SyncStatusService } from './sync-status.service';

const STORAGE_KEY_OFFLINE_ENTRIES = 'flipbase_offline_purchase_entries';
const STORAGE_KEY_CASH_WALLET = 'flipbase_flea_market_cash_wallet';

@Injectable({
  providedIn: 'root',
})
export class OfflineSyncService {
  private readonly supabase = inject(SupabaseService, { optional: true });
  private readonly syncStatus = inject(SyncStatusService, { optional: true });
  // Faellt auf eine eigene Instanz zurueck, damit Dienste auch ausserhalb
  // eines Injektionskontexts nutzbar bleiben - so erzeugen die Tests sie.
  private readonly logger = inject(LoggerService, { optional: true }) ?? new LoggerService();
  private readonly mockStore = inject(MockDataStoreService, { optional: true });
  private readonly purchaseService = inject(PurchaseService, { optional: true });
  private readonly inventoryService = inject(InventoryService, { optional: true });
  private readonly workspaceService = inject(WorkspaceService, { optional: true });
  private readonly webPushService = inject(WebPushService, { optional: true });
  private readonly webhookService = inject(WebhookService, { optional: true });

  readonly isOnline = signal<boolean>(
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true,
  );
  readonly pendingEntries = signal<OfflinePurchaseEntry[]>(this.loadPersistedEntries());
  readonly cashWallet = signal<CashWalletSession>(this.loadPersistedWallet());
  readonly isSyncing = signal<boolean>(false);

  readonly pendingCount = computed(
    () => this.pendingEntries().filter((e) => e.sync_status === 'pending').length,
  );

  readonly potentialProfitEstimate = computed(() => {
    const w = this.cashWallet();
    return Math.max(0, w.estimatedTotalResale - w.totalSpent);
  });

  constructor() {
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const ws = this.workspaceService?.currentWorkspace();
        if (ws) {
          this.loadFromSupabase(ws.id);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline.set(true);
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

  async loadFromSupabase(workspaceId: string): Promise<void> {
    if (!this.supabase || this.mockStore?.isDemoMode()) return;

    try {
      const [entriesRes, walletRes] = await Promise.all([
        this.supabase.client
          .from('offline_purchase_entries')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('captured_at', { ascending: false }),
        this.supabase.client
          .from('cash_wallet_sessions')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (entriesRes.data && entriesRes.data.length > 0) {
        const mapped: OfflinePurchaseEntry[] = (entriesRes.data as unknown[]).map((e: any) => ({
          id: e.id,
          workspace_id: e.workspace_id,
          title: e.title,
          purchase_price: Number(e.purchase_price),
          estimated_resale_price: Number(e.estimated_resale_price),
          location_name: e.location_name || '',
          category: e.category || 'Flohmarktfund',
          condition: e.condition || 'Gebraucht',
          notes: e.notes || undefined,
          photo_data_url: e.photo_data_url || undefined,
          captured_at: e.captured_at,
          sync_status: e.sync_status as 'pending' | 'synced',
        }));
        this.pendingEntries.set(mapped);
        this.persistEntries();
      }

      if (walletRes.data) {
        const w = walletRes.data;
        const walletSession: CashWalletSession = {
          isActive: w.is_active,
          startCash: Number(w.start_cash),
          currentCash: Number(w.current_cash),
          totalSpent: Number(w.total_spent),
          estimatedTotalResale: Number(w.estimated_total_resale),
          itemsCount: w.items_count,
          locationName: w.location_name || '',
          startedAt: w.started_at,
        };
        this.cashWallet.set(walletSession);
        this.persistWallet();
      }
    } catch (err) {
      this.logger.error('Verbindungsfehler beim Laden der Offline-Daten:', err);
    }
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

  startCashSession(startAmount: number, locationName = 'Flohmarkt'): void {
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

    const ws = this.workspaceService?.currentWorkspace();
    if (this.supabase && ws && !this.mockStore?.isDemoMode()) {
      schreibeImHintergrund(
        this.supabase.client.from('cash_wallet_sessions').insert({
          workspace_id: ws.id,
          is_active: true,
          start_cash: session.startCash,
          current_cash: session.currentCash,
          total_spent: session.totalSpent,
          estimated_total_resale: session.estimatedTotalResale,
          items_count: session.itemsCount,
          location_name: session.locationName,
          started_at: session.startedAt,
        }),
        'Speichern der Kassensitzung',
        this.syncStatus,
      );
    }
  }

  endCashSession(): void {
    this.cashWallet.update((w) => ({ ...w, isActive: false }));
    this.persistWallet();

    const ws = this.workspaceService?.currentWorkspace();
    if (this.supabase && ws && !this.mockStore?.isDemoMode()) {
      schreibeImHintergrund(
        this.supabase.client
          .from('cash_wallet_sessions')
          .update({ is_active: false })
          .eq('workspace_id', ws.id)
          .eq('is_active', true),
        'Aktualisieren der Kassensitzung',
        this.syncStatus,
      );
    }
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
    const estResale =
      payload.estimatedResalePrice || Number((payload.purchasePrice * 2.2).toFixed(2));
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

    // 3. Persist to Supabase if connected
    if (this.supabase && ws && !this.mockStore?.isDemoMode()) {
      schreibeImHintergrund(
        this.supabase.client.from('offline_purchase_entries').insert({
          workspace_id: ws.id,
          title: entry.title,
          purchase_price: entry.purchase_price,
          estimated_resale_price: entry.estimated_resale_price,
          location_name: entry.location_name,
          category: entry.category,
          condition: entry.condition,
          notes: entry.notes || null,
          photo_data_url: entry.photo_data_url || null,
          captured_at: entry.captured_at,
          sync_status: 'pending',
        }),
        'Speichern des Offline-Eintrags',
        this.syncStatus,
      );
    }

    // 4. Web Push trigger
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

    await new Promise((res) => setTimeout(res, 600));

    let count = 0;
    for (const item of pending) {
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
      list.map((e) => (e.sync_status === 'pending' ? { ...e, sync_status: 'synced' } : e)),
    );
    this.persistEntries();
    this.isSyncing.set(false);

    const ws = this.workspaceService?.currentWorkspace();
    if (this.supabase && ws && !this.mockStore?.isDemoMode()) {
      schreibeImHintergrund(
        this.supabase.client
          .from('offline_purchase_entries')
          .update({ sync_status: 'synced' })
          .eq('workspace_id', ws.id)
          .eq('sync_status', 'pending'),
        'Aktualisieren des Offline-Eintrags',
        this.syncStatus,
      );
    }

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

    const ws = this.workspaceService?.currentWorkspace();
    if (this.supabase && ws && !this.mockStore?.isDemoMode()) {
      schreibeImHintergrund(
        this.supabase.client.from('offline_purchase_entries').delete().eq('id', id),
        'Loeschen des Offline-Eintrags',
        this.syncStatus,
      );
    }
  }
}
