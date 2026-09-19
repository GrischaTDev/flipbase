import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  PriceAlert,
  PricePoint,
  PriceTrackedItem,
  PriceTrend,
} from '../models/price-tracker.models';
import { InventoryService } from './inventory.service';
import { WorkspaceService } from './workspace.service';
import { WebhookService } from './webhook.service';
import { WebPushService } from './web-push.service';
import { SupabaseService } from './supabase.service';
import { Json, Tables } from '../models/supabase.types';
import { LoggerService } from './logger.service';
import { SyncStatusService } from './sync-status.service';

const STORAGE_KEY_RADAR = 'flipbase_price_radar_items';

export interface PriceTrackerMutationResult<T> {
  readonly data: T | null;
  readonly error: Error | null;
  readonly reportedBySyncStatus: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class PriceTrackerService {
  private readonly supabase = inject(SupabaseService, { optional: true });
  private readonly syncStatus = inject(SyncStatusService, { optional: true });
  // Faellt auf eine eigene Instanz zurueck, damit Dienste auch ausserhalb
  // eines Injektionskontexts nutzbar bleiben - so erzeugen die Tests sie.
  private readonly logger = inject(LoggerService, { optional: true }) ?? new LoggerService();
  private readonly inventoryService = inject(InventoryService, { optional: true });
  private readonly workspaceService = inject(WorkspaceService, { optional: true });
  private readonly webhookService = inject(WebhookService, { optional: true });
  private readonly webPushService = inject(WebPushService, { optional: true });

  readonly trackedItems = signal<PriceTrackedItem[]>(this.loadPersistedItems());
  readonly isScanning = signal<boolean>(false);
  readonly lastScanTimestamp = signal<string>(new Date().toISOString());

  readonly activeAlertsCount = computed(
    () => this.trackedItems().filter((item) => item.alertTriggered !== 'none').length,
  );

  readonly undercutCount = computed(
    () => this.trackedItems().filter((item) => item.alertTriggered === 'undercut').length,
  );

  readonly surgeCount = computed(
    () => this.trackedItems().filter((item) => item.alertTriggered === 'price_surge').length,
  );

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
  }

  private loadPersistedItems(): PriceTrackedItem[] {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(STORAGE_KEY_RADAR);
        if (stored) return JSON.parse(stored);
      }
    } catch {}

    return [];
  }

  async loadFromSupabase(workspaceId: string): Promise<void> {
    if (!this.supabase) return;

    try {
      const { data, error } = await this.supabase.client
        .from('price_tracked_items')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (!error) {
        const mapped: PriceTrackedItem[] = ((data ?? []) as Tables<'price_tracked_items'>[]).map(
          (t) => ({
            id: t.id,
            workspace_id: t.workspace_id,
            inventory_item_id: t.inventory_item_id || undefined,
            title: t.title,
            category: t.category || 'Allgemein',
            currentOurPrice: Number(t.current_our_price || 0),
            currentMarketAverage: Number(t.current_market_average || 0),
            currentMarketLowest: Number(t.current_market_lowest || 0),
            recommendedPrice: Number(t.recommended_price || 0),
            lowestCompetitorTitle: t.lowest_competitor_title || undefined,
            lowestCompetitorPlatform: (t.lowest_competitor_platform || 'kleinanzeigen') as
              'ebay' | 'kleinanzeigen' | 'vinted',
            lowestCompetitorUrl: t.lowest_competitor_url || undefined,
            priceTrend: t.price_trend as PriceTrend,
            priceDifferencePercent: Number(t.price_difference_percent || 0),
            alertTriggered: t.alert_triggered as PriceAlert,
            lastCheckedAt: t.last_checked_at || new Date().toISOString(),
            isTrackingActive: t.is_tracking_active,
            priceHistory: (t.price_history as unknown as PricePoint[]) || [],
          }),
        );
        this.trackedItems.set(mapped);
        this.persistItems();
      }
    } catch (err) {
      this.logger.error('Verbindungsfehler beim Laden des Preisradars:', err);
    }
  }

  private persistItems(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY_RADAR, JSON.stringify(this.trackedItems()));
      }
    } catch {}
  }

  /**
   * Adds an inventory item or custom query to the Price Radar.
   */
  async addTrackedItem(item: {
    title: string;
    price: number;
    category?: string;
    inventory_item_id?: string;
  }): Promise<PriceTrackerMutationResult<PriceTrackedItem>> {
    const ws = this.workspaceService?.currentWorkspace();
    const marketAvg = Number((item.price * 0.95).toFixed(2));
    const marketLowest = Number((item.price * 0.88).toFixed(2));
    const today = new Date().toISOString().split('T')[0];

    let newItem: PriceTrackedItem = {
      id: `track-${Date.now()}`,
      workspace_id: ws?.id || 'ws-1',
      inventory_item_id: item.inventory_item_id,
      title: item.title,
      category: item.category || 'Allgemein',
      currentOurPrice: item.price,
      currentMarketAverage: marketAvg,
      currentMarketLowest: marketLowest,
      recommendedPrice: Number(((marketAvg + marketLowest) / 2).toFixed(2)),
      lowestCompetitorTitle: `${item.title} (Aktuelles Konkurrenzangebot)`,
      lowestCompetitorPlatform: 'kleinanzeigen',
      lowestCompetitorUrl: `https://www.kleinanzeigen.de/s-${encodeURIComponent(item.title)}/k0`,
      priceTrend: 'falling',
      priceDifferencePercent: Number((((marketLowest - item.price) / item.price) * 100).toFixed(1)),
      alertTriggered: marketLowest < item.price ? 'undercut' : 'none',
      lastCheckedAt: new Date().toISOString(),
      isTrackingActive: true,
      priceHistory: [
        { timestamp: today, avgPrice: marketAvg, lowestPrice: marketLowest, listingsCount: 12 },
      ],
    };

    if (this.istPersistenterModus()) {
      if (!ws) {
        return this.mutationsfehler(
          'Speichern der Preisbeobachtung',
          new Error('Es ist kein Workspace ausgewählt.'),
        );
      }
      try {
        const { data, error } = await this.supabase!.client.from('price_tracked_items')
          .insert({
            workspace_id: ws.id,
            inventory_item_id: item.inventory_item_id || null,
            title: newItem.title,
            category: newItem.category,
            current_our_price: newItem.currentOurPrice,
            current_market_average: newItem.currentMarketAverage,
            current_market_lowest: newItem.currentMarketLowest,
            recommended_price: newItem.recommendedPrice,
            lowest_competitor_title: newItem.lowestCompetitorTitle,
            lowest_competitor_platform: newItem.lowestCompetitorPlatform,
            lowest_competitor_url: newItem.lowestCompetitorUrl,
            price_trend: newItem.priceTrend,
            price_difference_percent: newItem.priceDifferencePercent,
            alert_triggered: newItem.alertTriggered,
            is_tracking_active: newItem.isTrackingActive,
            price_history: newItem.priceHistory as unknown as Json,
          })
          .select('id')
          .single();
        if (error) return this.mutationsfehler('Speichern der Preisbeobachtung', error);
        if (!data?.id) {
          return this.mutationsfehler(
            'Speichern der Preisbeobachtung',
            new Error('Die Datenbank hat keine Preisbeobachtung zurückgegeben.'),
          );
        }
        newItem = { ...newItem, id: data.id };
      } catch (error: unknown) {
        return this.mutationsfehler('Speichern der Preisbeobachtung', error);
      }
    }

    this.trackedItems.update((list) => [newItem, ...list]);
    this.persistItems();
    return { data: newItem, error: null, reportedBySyncStatus: false };
  }

  /**
   * Ob eine echte Marktdatenquelle angebunden ist.
   *
   * Solange nicht, aktualisiert der Radar nichts. Vorher hat er die Preise je
   * Abruf um einen Zufallsfaktor von bis zu vier Prozent verschoben und die
   * Zahl der Angebote gewuerfelt - und daraus Warnungen wie "unterboten"
   * abgeleitet. Wer danach seinen Verkaufspreis senkt, reagiert auf Rauschen.
   */
  readonly marktdatenAngebunden = false;

  /**
   * Holt die aktuellen Marktpreise der beobachteten Artikel.
   *
   * Tut derzeit nichts: Es gibt keine angebundene Quelle. Die beobachteten
   * Artikel und ihre eigenen Preise bleiben erhalten - erfunden war nur der
   * Marktvergleich.
   */
  async scanMarketLive(_targetId?: string): Promise<void> {
    return;
  }

  /**
   * Applies the AI/Radar recommended price directly to the Inventory Item!
   */
  async applyRecommendedPrice(trackedItemId: string): Promise<boolean> {
    const tracked = this.trackedItems().find((t) => t.id === trackedItemId);
    if (!tracked) return false;

    const newPrice = tracked.recommendedPrice;

    if (this.inventoryService && tracked.inventory_item_id) {
      const { error } = await this.inventoryService.updateItem(tracked.inventory_item_id, {
        expected_value: newPrice,
      });
      if (error) throw error;
    }

    this.trackedItems.update((list) =>
      list.map((t) =>
        t.id === trackedItemId
          ? {
              ...t,
              currentOurPrice: newPrice,
              alertTriggered: 'none',
              priceDifferencePercent: Number(
                (((t.currentMarketLowest - newPrice) / newPrice) * 100).toFixed(1),
              ),
            }
          : t,
      ),
    );
    this.persistItems();

    return true;
  }

  toggleTracking(itemId: string): void {
    this.trackedItems.update((list) =>
      list.map((t) => (t.id === itemId ? { ...t, isTrackingActive: !t.isTrackingActive } : t)),
    );
    this.persistItems();
  }

  async deleteTrackedItem(itemId: string): Promise<PriceTrackerMutationResult<boolean>> {
    const vorhandener = this.trackedItems().find((item) => item.id === itemId);
    if (!vorhandener) {
      return this.mutationsfehler(
        'Löschen der Preisbeobachtung',
        new Error('Die Preisbeobachtung wurde nicht gefunden.'),
      );
    }
    const ws = this.workspaceService?.currentWorkspace();
    if (this.istPersistenterModus()) {
      if (!ws || vorhandener.workspace_id !== ws.id) {
        return this.mutationsfehler(
          'Löschen der Preisbeobachtung',
          new Error('Die Preisbeobachtung gehört nicht zum ausgewählten Workspace.'),
        );
      }
      try {
        const { error, count } = await this.supabase!.client.from('price_tracked_items')
          .delete({ count: 'exact' })
          .eq('id', itemId)
          .eq('workspace_id', ws.id);
        if (error) return this.mutationsfehler('Löschen der Preisbeobachtung', error);
        if (count === 0) {
          return this.mutationsfehler('Löschen der Preisbeobachtung', {
            code: 'PGRST116',
            message: 'Die Preisbeobachtung wurde nicht gefunden.',
          });
        }
      } catch (error: unknown) {
        return this.mutationsfehler('Löschen der Preisbeobachtung', error);
      }
    }

    this.trackedItems.update((list) => list.filter((item) => item.id !== itemId));
    this.persistItems();
    return { data: true, error: null, reportedBySyncStatus: false };
  }

  private istPersistenterModus(): boolean {
    return this.supabase !== null && this.supabase !== undefined;
  }

  private mutationsfehler<T>(vorgang: string, ursache: unknown): PriceTrackerMutationResult<T> {
    const error = this.syncStatus
      ? this.syncStatus.melde(vorgang, ursache)
      : ursache instanceof Error
        ? ursache
        : new Error(String(ursache));
    return {
      data: null,
      error,
      reportedBySyncStatus: this.syncStatus?.istZentralGemeldet(error) ?? false,
    };
  }
}
