import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { ProfitEngineService } from './profit-engine.service';
import { InventoryService } from './inventory.service';
import { MockDataStoreService } from './mock-data-store.service';
import { WebhookService } from './webhook.service';
import { Sale, InventoryItem } from '../models/reflip.models';

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

@Injectable({
  providedIn: 'root',
})
export class SalesService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly profitEngine = inject(ProfitEngineService);
  private readonly inventoryService = inject(InventoryService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly webhookService = inject(WebhookService);

  readonly sales = signal<Sale[]>(
    this.mockStore.demoSales.map((s) => this.enrichSaleMetrics(s))
  );
  readonly isLoading = signal<boolean>(false);

  constructor() {
    effect(() => {
      const ws = this.workspaceService.currentWorkspace();
      if (ws) {
        this.loadSales(ws.id);
      } else {
        this.sales.set([]);
      }
    });
  }

  async loadSales(workspaceId: string): Promise<void> {
    if (this.mockStore.isDemoMode() || workspaceId.startsWith('demo-')) {
      const enriched = this.mockStore.demoSales.map((s) => this.enrichSaleMetrics(s));
      this.sales.set(enriched);
      return;
    }

    this.isLoading.set(true);
    try {
      const queryPromise = this.supabase.client
        .from('sales')
        .select(`
          *,
          inventory_item:inventory_items(
            *,
            purchase:purchases(*, source:sources(*), supplier:suppliers(*)),
            costs:item_costs(*)
          )
        `)
        .eq('workspace_id', workspaceId)
        .order('sale_date', { ascending: false })
        .order('created_at', { ascending: false });

      const res = await this.mockStore.withTimeout(queryPromise, { data: null, error: new Error('Timeout') }, 800);

      if (res && !res.error && res.data) {
        const enriched = (res.data as unknown[]).map((s: any) => this.enrichSaleMetrics(s));
        this.sales.set(enriched);
      } else {
        const enriched = this.mockStore.demoSales.map((s) => this.enrichSaleMetrics(s));
        this.sales.set(enriched);
      }
    } catch (err) {
      const enriched = this.mockStore.demoSales.map((s) => this.enrichSaleMetrics(s));
      this.sales.set(enriched);
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
      0
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

  async createSale(payload: CreateSalePayload): Promise<{ data: Sale | null; error: Error | null }> {
    const ws = this.workspaceService.currentWorkspace();
    if (!ws) return { data: null, error: new Error('Kein aktiver Workspace') };

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
    this.sales.update((list) => [enrichedSale, ...list]);

    await this.inventoryService.updateItemStatus(
      payload.inventory_item_id,
      'sold',
      `Verkauft für ${payload.sale_price.toFixed(2)} € auf ${payload.platform}`
    );

    // Trigger Discord/Telegram/In-App notification
    this.webhookService.sendSaleNotification(enrichedSale, item?.title || 'Artikel');

    if (!this.mockStore.isDemoMode()) {
      try {
        await this.supabase.client.from('sales').insert({
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
        });
      } catch (e) {
        // ignore
      }
    }

    return { data: enrichedSale, error: null };
  }

  async deleteSale(saleId: string, inventoryItemId: string): Promise<{ error: Error | null }> {
    this.sales.update((list) => list.filter((s) => s.id !== saleId));

    await this.inventoryService.updateItemStatus(
      inventoryItemId,
      'ready',
      'Verkauf storniert/gelöscht'
    );

    if (!this.mockStore.isDemoMode()) {
      try {
        await this.supabase.client.from('sales').delete().eq('id', saleId);
      } catch (e) {
        // ignore
      }
    }

    return { error: null };
  }
}
