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

  readonly trackedItems = signal<PriceTrackedItem[]>([]);
  readonly isScanning = signal<boolean>(false);
  readonly lastScanTimestamp = signal<string>(new Date().toISOString());
  private loadVersion = 0;

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
        void this.loadFromSupabase(ws?.id ?? '');
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
  }

  async loadFromSupabase(workspaceId: string): Promise<void> {
    const requestedWorkspaceId = workspaceId.trim();
    const loadVersion = (this.loadVersion ?? 0) + 1;
    this.loadVersion = loadVersion;
    this.trackedItems.set([]);
    if (!requestedWorkspaceId) return;
    if (!this.isCurrentWorkspace(requestedWorkspaceId) || !this.supabase) return;

    try {
      const { data, error } = await this.supabase.client
        .from('price_tracked_items')
        .select('*')
        .eq('workspace_id', requestedWorkspaceId)
        .order('created_at', { ascending: false });

      if (!this.isCurrentLoad(requestedWorkspaceId, loadVersion)) return;
      if (!error) {
        const mapped: PriceTrackedItem[] = ((data ?? []) as Tables<'price_tracked_items'>[]).map(
          (t) => {
            const hasVerifiedMarketData =
              this.marktdatenAngebunden && t.market_data_verified === true;
            return {
              id: t.id,
              workspace_id: t.workspace_id,
              inventory_item_id: t.inventory_item_id || undefined,
              title: t.title,
              category: t.category || 'Allgemein',
              currentOurPrice: Number(t.current_our_price || 0),
              currentMarketAverage: hasVerifiedMarketData
                ? Number(t.current_market_average || 0)
                : 0,
              currentMarketLowest: hasVerifiedMarketData ? Number(t.current_market_lowest || 0) : 0,
              recommendedPrice: hasVerifiedMarketData ? Number(t.recommended_price || 0) : 0,
              lowestCompetitorTitle: hasVerifiedMarketData
                ? t.lowest_competitor_title || undefined
                : undefined,
              lowestCompetitorPlatform: hasVerifiedMarketData
                ? ((t.lowest_competitor_platform || 'kleinanzeigen') as
                    'ebay' | 'kleinanzeigen' | 'vinted')
                : undefined,
              lowestCompetitorUrl: hasVerifiedMarketData
                ? t.lowest_competitor_url || undefined
                : undefined,
              priceTrend: hasVerifiedMarketData ? (t.price_trend as PriceTrend) : 'stable',
              priceDifferencePercent: hasVerifiedMarketData
                ? Number(t.price_difference_percent || 0)
                : 0,
              alertTriggered: hasVerifiedMarketData ? (t.alert_triggered as PriceAlert) : 'none',
              lastCheckedAt: t.last_checked_at || new Date().toISOString(),
              isTrackingActive: t.is_tracking_active,
              priceHistory: hasVerifiedMarketData
                ? (t.price_history as unknown as PricePoint[]) || []
                : [],
              marketDataVerified: hasVerifiedMarketData,
            };
          },
        );
        this.trackedItems.set(mapped);
      }
    } catch (err) {
      if (this.isCurrentLoad(requestedWorkspaceId, loadVersion)) {
        this.logger.error('Verbindungsfehler beim Laden des Preisradars:', err);
      }
    }
  }

  private isCurrentWorkspace(workspaceId: string): boolean {
    return !this.workspaceService || this.workspaceService.currentWorkspace()?.id === workspaceId;
  }

  private isCurrentLoad(workspaceId: string, loadVersion: number): boolean {
    return this.loadVersion === loadVersion && this.isCurrentWorkspace(workspaceId);
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
    let newItem: PriceTrackedItem = {
      id: `track-${Date.now()}`,
      workspace_id: ws?.id || 'ws-1',
      inventory_item_id: item.inventory_item_id,
      title: item.title,
      category: item.category || 'Allgemein',
      currentOurPrice: item.price,
      currentMarketAverage: 0,
      currentMarketLowest: 0,
      recommendedPrice: 0,
      priceTrend: 'stable',
      priceDifferencePercent: 0,
      alertTriggered: 'none',
      lastCheckedAt: new Date().toISOString(),
      isTrackingActive: true,
      priceHistory: [],
      marketDataVerified: false,
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
            market_data_verified: false,
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
        if (!this.isCurrentWorkspace(ws.id)) {
          return this.mutationsfehler(
            'Speichern der Preisbeobachtung',
            new Error('Der Workspace wurde während des Speicherns gewechselt.'),
          );
        }
        newItem = { ...newItem, id: data.id };
      } catch (error: unknown) {
        return this.mutationsfehler('Speichern der Preisbeobachtung', error);
      }
    }

    this.trackedItems.update((list) => [newItem, ...list]);
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
    if (!this.marktdatenAngebunden) return false;
    const tracked = this.trackedItems().find((t) => t.id === trackedItemId);
    if (!tracked || tracked.marketDataVerified !== true) return false;

    const newPrice = tracked.recommendedPrice;

    if (this.inventoryService && tracked.inventory_item_id) {
      const { error } = await this.inventoryService.updateItem(tracked.inventory_item_id, {
        expected_value: newPrice,
      });
      if (error) throw error;
      if (!this.isCurrentWorkspace(tracked.workspace_id)) return false;
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
    return true;
  }

  toggleTracking(itemId: string): void {
    this.trackedItems.update((list) =>
      list.map((t) => (t.id === itemId ? { ...t, isTrackingActive: !t.isTrackingActive } : t)),
    );
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
        if (!this.isCurrentWorkspace(ws.id)) {
          return this.mutationsfehler(
            'Löschen der Preisbeobachtung',
            new Error('Der Workspace wurde während des Löschens gewechselt.'),
          );
        }
      } catch (error: unknown) {
        return this.mutationsfehler('Löschen der Preisbeobachtung', error);
      }
    }

    this.trackedItems.update((list) => list.filter((item) => item.id !== itemId));
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
