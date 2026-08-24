import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { ProfitEngineService } from './profit-engine.service';
import { InventoryService } from './inventory.service';
import { MockDataStoreService } from './mock-data-store.service';
import { WebhookService } from './webhook.service';
import { SyncStatusService } from './sync-status.service';
import { Sale, InventoryItem } from '../models/flipbase.models';

export interface CreateSalePayload {
  inventory_item_id: string;
  platform: string;
  sale_price: number;
  sale_date: string;
  platform_fee?: number;
  shipping_cost?: number;
  packaging_cost?: number;
  other_costs?: number;
  external_order_id?: string | null;
  external_listing_id?: string | null;
  buyer_notes?: string | null;
}

export interface SaleMutationResult {
  readonly data: Sale | null;
  readonly error: Error | null;
  readonly status: 'success' | 'partial' | 'error';
}

@Injectable({
  providedIn: 'root',
})
export class SalesService {
  private readonly supabase = inject(SupabaseService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly profitEngine = inject(ProfitEngineService);
  private readonly inventoryService = inject(InventoryService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly webhookService = inject(WebhookService);

  readonly sales = signal<Sale[]>([]);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const ws = this.workspaceService.currentWorkspace();
        if (ws) {
          this.loadSales(ws.id);
        } else {
          this.sales.set([]);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
  }

  async loadSales(workspaceId: string): Promise<void> {
    if (this.mockStore.isDemoMode()) {
      const localSales = this.mockStore.getSales(workspaceId).map((s) => this.enrichSaleMetrics(s));
      this.sales.set(localSales);
      return;
    }

    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('sales')
        .select(
          `
          *,
          inventory_item:inventory_items(
            *,
            purchase:purchases(*, source:sources(*), supplier:suppliers(*)),
            costs:item_costs(*)
          )
        `,
        )
        .eq('workspace_id', workspaceId)
        .order('sale_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        this.syncStatus.melde('Laden der Verkäufe', error);
        this.sales.set([]);
      } else if (data) {
        const enriched = (data as unknown[]).map((s: any) => this.enrichSaleMetrics(s));
        this.sales.set(enriched);
      }
    } catch (err) {
      this.syncStatus.melde('Laden der Verkäufe', err);
      this.sales.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  public enrichSaleMetrics(raw: any): Sale {
    const item = raw.inventory_item as InventoryItem | undefined;
    const salePrice = Number(raw.sale_price || 0);

    const itemPurchaseCost = Number(item?.allocated_purchase_cost || 0);
    const itemExtraCosts = (item?.costs || []).reduce(
      (sum: number, c: any) => sum + Number(c.amount || 0),
      0,
    );
    const totalItemBasisCost = itemPurchaseCost + itemExtraCosts;

    const fee = Number(raw.platform_fee || 0);
    const shipping = Number(raw.shipping_cost || 0);
    const packaging = Number(raw.packaging_cost || 0);
    const other = Number(raw.other_costs || 0);
    const totalSaleCosts = fee + shipping + packaging + other;

    const totalAllCosts = totalItemBasisCost + totalSaleCosts;
    const netProfit = this.profitEngine.calculateProfit(salePrice, totalAllCosts);
    const roi = this.profitEngine.calculateRoi(netProfit, totalAllCosts);

    let holdingDays = 0;
    const purchaseDate = item?.purchase?.purchase_date || item?.created_at;
    if (purchaseDate && raw.sale_date) {
      holdingDays = this.profitEngine.calculateHoldingDurationDays(purchaseDate, raw.sale_date);
    }

    return {
      ...raw,
      net_profit: netProfit,
      roi: roi,
      holding_duration_days: holdingDays,
    } as Sale;
  }

  async createSale(payload: CreateSalePayload): Promise<SaleMutationResult> {
    const ws = this.workspaceService.currentWorkspace();
    if (!ws) return { data: null, error: new Error('Kein aktiver Workspace'), status: 'error' };

    const item = this.inventoryService.items().find((i) => i.id === payload.inventory_item_id);

    const rawSale = {
      id: `sale-${Date.now()}`,
      workspace_id: ws.id,
      inventory_item_id: payload.inventory_item_id,
      platform: payload.platform,
      sale_price: payload.sale_price,
      sale_date: payload.sale_date,
      platform_fee: payload.platform_fee || 0,
      shipping_cost: payload.shipping_cost || 0,
      packaging_cost: payload.packaging_cost || 0,
      other_costs: payload.other_costs || 0,
      external_order_id: payload.external_order_id?.trim() || null,
      external_listing_id: payload.external_listing_id?.trim() || null,
      buyer_notes: payload.buyer_notes?.trim() || null,
      created_at: new Date().toISOString(),
      inventory_item: item,
    };

    const enrichedSale = this.enrichSaleMetrics(rawSale);

    let gespeicherterVerkauf = enrichedSale;
    if (!this.mockStore.isDemoMode()) {
      try {
        const { data: dbSale, error: dbError } = await this.supabase.client
          .from('sales')
          .insert({
            workspace_id: ws.id,
            inventory_item_id: payload.inventory_item_id,
            platform: payload.platform,
            sale_price: payload.sale_price,
            sale_date: payload.sale_date,
            platform_fee: payload.platform_fee || 0,
            shipping_cost: payload.shipping_cost || 0,
            packaging_cost: payload.packaging_cost || 0,
            other_costs: payload.other_costs || 0,
            external_order_id: payload.external_order_id?.trim() || null,
            external_listing_id: payload.external_listing_id?.trim() || null,
            buyer_notes: payload.buyer_notes?.trim() || null,
          })
          .select()
          .single();

        if (dbError || !dbSale) {
          return {
            data: null,
            error: this.syncStatus.melde(
              'Speichern des Verkaufs',
              dbError ?? new Error('Die Datenbank hat keinen Verkauf zurückgegeben.'),
            ),
            status: 'error',
          };
        }
        gespeicherterVerkauf = this.enrichSaleMetrics({ ...enrichedSale, id: dbSale.id });
      } catch (e: unknown) {
        return {
          data: null,
          error: this.syncStatus.melde('Speichern des Verkaufs', e),
          status: 'error',
        };
      }
    }

    try {
      const { error } = await this.inventoryService.updateItemStatus(
        payload.inventory_item_id,
        'sold',
        `Verkauft für ${payload.sale_price.toFixed(2)} € auf ${payload.platform}`,
      );
      if (error) return { data: gespeicherterVerkauf, error, status: 'partial' };
    } catch (e: unknown) {
      return {
        data: gespeicherterVerkauf,
        error: this.syncStatus.melde('Aktualisieren des Artikelstatus', e),
        status: 'partial',
      };
    }

    this.mockStore.saveSale(gespeicherterVerkauf);
    this.sales.update((list) => [gespeicherterVerkauf, ...list]);
    this.webhookService.sendSaleNotification(gespeicherterVerkauf, item?.title || 'Artikel');
    return { data: gespeicherterVerkauf, error: null, status: 'success' };
  }

  /**
   * Aendert einen gebuchten Verkauf.
   *
   * Bisher liess sich ein Verkauf nur anlegen oder stornieren. Ein falsch
   * getippter Verkaufspreis oder eine nachtraeglich bekannte Plattformgebuehr
   * bedeutete: stornieren, den Artikel wieder auf verkaufsbereit setzen und
   * alles neu erfassen - inklusive verfaelschter Auswertung dazwischen.
   *
   * Der zugeordnete Artikel bleibt unberuehrt; nur die Zahlen des Verkaufs
   * aendern sich. Gewinn und ROI werden neu berechnet.
   */
  async updateSale(
    saleId: string,
    updates: Partial<CreateSalePayload>,
  ): Promise<SaleMutationResult> {
    const vorhandener = this.sales().find((s) => s.id === saleId);
    if (!vorhandener)
      return { data: null, error: new Error('Verkauf nicht gefunden'), status: 'error' };

    const geaendert = this.enrichSaleMetrics({ ...vorhandener, ...updates });

    if (!this.mockStore.isDemoMode()) {
      try {
        const { data, error } = await this.supabase.client
          .from('sales')
          .update({
            platform: updates.platform,
            sale_price: updates.sale_price,
            sale_date: updates.sale_date,
            platform_fee: updates.platform_fee,
            shipping_cost: updates.shipping_cost,
            packaging_cost: updates.packaging_cost,
            other_costs: updates.other_costs,
            external_order_id: updates.external_order_id?.trim() || null,
            buyer_notes: updates.buyer_notes?.trim() || null,
          })
          .eq('id', saleId)
          .select('id')
          .maybeSingle();

        if (error || !data) {
          return {
            data: null,
            error: this.syncStatus.melde(
              'Aendern des Verkaufs',
              error ?? new Error('Der Verkauf wurde nicht gefunden.'),
            ),
            status: 'error',
          };
        }
      } catch (e: unknown) {
        return {
          data: null,
          error: this.syncStatus.melde('Aendern des Verkaufs', e),
          status: 'error',
        };
      }
    }

    this.sales.update((liste) => liste.map((s) => (s.id === saleId ? geaendert : s)));
    this.mockStore.saveSale(geaendert);
    return { data: geaendert, error: null, status: 'success' };
  }

  /**
   * Vermerkt am Verkauf, dass er zurueckgegeben wurde.
   *
   * Ohne diesen Vermerk zaehlte ein zurueckgegebener Verkauf weiter mit vollem
   * Gewinn, waehrend der Artikel gleichzeitig wieder im Lager stand - derselbe
   * Gegenstand also doppelt. Die Erstattung minderte nichts.
   */
  async markiereAlsRetourniert(
    saleId: string,
    erstattet: number,
  ): Promise<{ error: Error | null }> {
    const zeitpunkt = new Date().toISOString();

    if (!this.mockStore.isDemoMode()) {
      try {
        const { data, error } = await this.supabase.client
          .from('sales')
          .update({ returned_at: zeitpunkt, refund_amount: erstattet })
          .eq('id', saleId)
          .select('id')
          .maybeSingle();

        if (error || !data) {
          return {
            error: this.syncStatus.melde(
              'Vermerken der Retoure',
              error ?? new Error('Der Verkauf wurde nicht gefunden.'),
            ),
          };
        }
      } catch (e: unknown) {
        return { error: this.syncStatus.melde('Vermerken der Retoure', e) };
      }
    }

    this.sales.update((liste) =>
      liste.map((s) =>
        s.id === saleId
          ? this.enrichSaleMetrics({ ...s, returned_at: zeitpunkt, refund_amount: erstattet })
          : s,
      ),
    );
    const geaendert = this.sales().find((s) => s.id === saleId);
    if (geaendert) this.mockStore.saveSale(geaendert);
    return { error: null };
  }

  async deleteSale(saleId: string, inventoryItemId: string): Promise<SaleMutationResult> {
    if (!this.mockStore.isDemoMode()) {
      try {
        const { data, error } = await this.supabase.client
          .from('sales')
          .delete()
          .eq('id', saleId)
          .select('id')
          .maybeSingle();
        if (error || !data) {
          return {
            data: null,
            error: this.syncStatus.melde(
              'Löschen des Verkaufs',
              error ?? new Error('Der Verkauf wurde nicht gefunden.'),
            ),
            status: 'error',
          };
        }
      } catch (e: unknown) {
        return {
          data: null,
          error: this.syncStatus.melde('Löschen des Verkaufs', e),
          status: 'error',
        };
      }
    }

    try {
      const { error } = await this.inventoryService.updateItemStatus(
        inventoryItemId,
        'ready',
        'Verkauf storniert/gelöscht',
      );
      if (error) return { data: null, error, status: 'partial' };
    } catch (e: unknown) {
      return {
        data: null,
        error: this.syncStatus.melde('Aktualisieren des Artikelstatus', e),
        status: 'partial',
      };
    }

    this.mockStore.deleteSale(saleId);
    this.sales.update((list) => list.filter((s) => s.id !== saleId));
    return { data: null, error: null, status: 'success' };
  }
}
