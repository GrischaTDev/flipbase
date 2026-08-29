import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { ProfitEngineService } from './profit-engine.service';
import { InventoryService } from './inventory.service';
import { MockDataStoreService } from './mock-data-store.service';
import { WebhookService } from './webhook.service';
import { SyncStatusService } from './sync-status.service';
import { Sale, SaleLine, SaleLineLotAllocation, StockMovement } from '../models/flipbase.models';
import { MutationResult } from './catalog.service';
import { StockService } from './stock.service';
import { ReturnRecord } from '../models/return.models';

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

export interface RecordSaleLineInput {
  readonly catalogProductId?: string;
  readonly inventoryItemId?: string;
  readonly titleSnapshot?: string;
  readonly quantity: number;
  readonly unitSalePrice: number;
}

export interface RecordSaleInput {
  readonly platform: string;
  readonly saleDate: string;
  readonly platformFee?: number;
  readonly shippingCost?: number;
  readonly packagingCost?: number;
  readonly otherCosts?: number;
  readonly externalOrderId?: string | null;
  readonly externalListingId?: string | null;
  readonly buyerNotes?: string | null;
  readonly lines: readonly RecordSaleLineInput[];
}

export interface RecordSaleResult {
  readonly sale: Sale;
  readonly saleLines: readonly SaleLine[];
  readonly lotAllocations: readonly SaleLineLotAllocation[];
  readonly stockMovements: readonly StockMovement[];
}

export interface RecordReturnInput {
  readonly saleId: string;
  readonly refundAmount: number;
  readonly restock: boolean;
  readonly restockAction?: 'restock_ready' | 'restock_repair' | 'write_off' | 'keep_with_buyer';
  readonly reason: string;
  readonly notes?: string | null;
  readonly buyerName?: string | null;
}

export interface RecordReturnResult {
  readonly sale: Sale;
  readonly returnRecord?: ReturnRecord;
  readonly restockedQuantity: number;
  readonly saleReturnedAt: string | null;
}

export interface SaleMutationResult {
  readonly data: Sale | null;
  readonly error: Error | null;
  readonly status: 'success' | 'partial' | 'error';
  readonly problems: readonly [];
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
  private readonly stockService = inject(StockService);

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
          ),
          sale_lines:sale_lines!sale_lines_sale_id_fkey(
            *,
            lot_allocations:sale_line_lot_allocations!sale_line_lot_allocations_sale_line_id_fkey(*),
            stock_movements:stock_movements!stock_movements_sale_line_id_fkey(*)
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
        const enriched = (data as unknown[]).map((sale) => this.mapLoadedSale(sale));
        this.sales.set(enriched);
      }
    } catch (err) {
      this.syncStatus.melde('Laden der Verkäufe', err);
      this.sales.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  public enrichSaleMetrics(raw: Sale): Sale {
    const item = raw.inventory_item;
    const persistedLines = raw.has_persisted_lines === false ? [] : (raw.lines ?? []);
    const persistedLineTotal = persistedLines.reduce(
      (sum: number, line: SaleLine) => sum + Number(line.line_total || 0),
      0,
    );
    const salePrice =
      persistedLines.length > 0
        ? persistedLineTotal
        : Number(raw.sale_price_total ?? raw.sale_price ?? 0);
    const totalItemBasisCost =
      persistedLines.length > 0
        ? persistedLines.reduce(
            (sum: number, line: SaleLine) => sum + Number(line.cost_of_goods_sold || 0),
            0,
          )
        : Number(item?.allocated_purchase_cost || 0) +
          (item?.costs || []).reduce((sum, cost) => sum + Number(cost.amount || 0), 0);

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
      sale_price: salePrice,
      sale_price_total: salePrice,
      net_profit: netProfit,
      roi: roi,
      holding_duration_days: holdingDays,
    } as Sale;
  }

  private mapLoadedSale(raw: unknown): Sale {
    const sale = raw as Sale & { sale_lines?: SaleLine[] };
    const persistedLines = sale.sale_lines ?? [];
    const lines =
      persistedLines.length > 0
        ? persistedLines
        : sale.inventory_item_id
          ? [
              {
                id: `legacy-${sale.id}`,
                sale_id: sale.id,
                inventory_item_id: sale.inventory_item_id,
                title_snapshot: sale.inventory_item?.title ?? 'Artikel',
                quantity: 1,
                unit_sale_price: sale.sale_price,
                line_total: sale.sale_price,
                cost_of_goods_sold: sale.inventory_item?.allocated_purchase_cost ?? 0,
                tax_mode: 'diff_25a' as const,
              },
            ]
          : [];
    const allocations = lines.flatMap(
      (line) =>
        (
          line as SaleLine & {
            lot_allocations?: SaleLineLotAllocation[];
          }
        ).lot_allocations ?? [],
    );
    const movements = lines.flatMap(
      (line) =>
        (
          line as SaleLine & {
            stock_movements?: StockMovement[];
          }
        ).stock_movements ?? [],
    );
    return this.enrichSaleMetrics({
      ...sale,
      lines,
      has_persisted_lines: persistedLines.length > 0,
      lot_allocations: allocations,
      stock_movements: movements,
    });
  }

  /**
   * Bucht einen Mengen- oder Einzelartikelverkauf vollständig in einer
   * Datenbanktransaktion. Erst die RPC-Antwort darf den lokalen Zustand ändern.
   */
  async recordSale(input: RecordSaleInput): Promise<MutationResult<RecordSaleResult>> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId)
      return this.mutationFailure('Verkauf buchen', new Error('Kein aktiver Workspace'));

    if (this.mockStore.isDemoMode()) {
      let result: RecordSaleResult;
      try {
        result = this.recordDemoSale(workspaceId, input);
      } catch (error: unknown) {
        return this.mutationFailure('Verkauf buchen', error);
      }
      this.sales.update((sales) => [
        result.sale,
        ...sales.filter((sale) => sale.id !== result.sale.id),
      ]);
      this.mockStore.saveSale(result.sale);
      await this.refreshAffectedState(workspaceId);
      return { data: result, error: null, reportedBySyncStatus: false };
    }

    try {
      const { data, error } = await this.supabase.client.rpc('record_sale', {
        p_workspace_id: workspaceId,
        p_sale: {
          platform: input.platform,
          sale_date: input.saleDate,
          platform_fee: input.platformFee ?? 0,
          shipping_cost: input.shippingCost ?? 0,
          packaging_cost: input.packagingCost ?? 0,
          other_costs: input.otherCosts ?? 0,
          external_order_id: input.externalOrderId ?? null,
          external_listing_id: input.externalListingId ?? null,
          buyer_notes: input.buyerNotes ?? null,
        },
        p_lines: input.lines.map((line) => ({
          catalog_product_id: line.catalogProductId ?? null,
          inventory_item_id: line.inventoryItemId ?? null,
          title_snapshot: line.titleSnapshot ?? null,
          quantity: line.quantity,
          unit_sale_price: line.unitSalePrice,
        })),
      });
      if (error || !data || typeof data !== 'object') {
        return this.mutationFailure(
          'Verkauf buchen',
          error ?? new Error('Der Verkauf wurde nicht zurückgegeben.'),
        );
      }
      const result = this.mapRecordSaleResult(data as Record<string, unknown>);
      this.sales.update((sales) => [
        result.sale,
        ...sales.filter((sale) => sale.id !== result.sale.id),
      ]);
      await this.refreshAffectedState(workspaceId);
      return { data: result, error: null, reportedBySyncStatus: false };
    } catch (error: unknown) {
      return this.mutationFailure('Verkauf buchen', error);
    }
  }

  /** Bucht eine Retoure mit optionaler Wiedereinlagerung atomar. */
  async recordReturn(input: RecordReturnInput): Promise<MutationResult<RecordReturnResult>> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId)
      return this.mutationFailure('Retoure buchen', new Error('Kein aktiver Workspace'));

    if (this.mockStore.isDemoMode()) {
      const existing = this.sales().find((sale) => sale.id === input.saleId);
      if (!existing)
        return this.mutationFailure(
          'Retoure buchen',
          new Error('Der Verkauf wurde nicht gefunden.'),
        );
      if (existing.returned_at) {
        return this.mutationFailure(
          'Retoure buchen',
          new Error('Der Verkauf wurde bereits retourniert.'),
        );
      }
      const saleTotal = Number(existing.sale_price_total ?? existing.sale_price ?? 0);
      const totalRefund = Math.min(
        saleTotal,
        Number(existing.refund_amount ?? 0) + input.refundAmount,
      );
      const isFullRefund = totalRefund >= saleTotal;
      const returnResult = isFullRefund
        ? this.mockStore.returnQuantitySale(workspaceId, existing, input.restock)
        : { movements: [] as StockMovement[], error: null };
      if (returnResult.error) return this.mutationFailure('Retoure buchen', returnResult.error);
      const saleReturnedAt = isFullRefund ? new Date().toISOString() : null;
      const sale = this.enrichSaleMetrics({
        ...existing,
        returned_at: saleReturnedAt,
        refund_amount: totalRefund,
        stock_movements: returnResult.movements,
      });
      this.sales.update((sales) => sales.map((entry) => (entry.id === sale.id ? sale : entry)));
      this.mockStore.saveSale(sale);
      await this.refreshAffectedState(workspaceId);
      return {
        data: {
          sale,
          returnRecord: undefined,
          restockedQuantity:
            isFullRefund && input.restock
              ? returnResult.movements
                  .filter((movement) => movement.direction === 'in' && movement.reason === 'return')
                  .reduce((sum, movement) => sum + movement.quantity, 0)
              : 0,
          saleReturnedAt,
        },
        error: null,
        reportedBySyncStatus: false,
      };
    }

    try {
      const { data, error } = await this.supabase.client.rpc('record_sale_return', {
        p_workspace_id: workspaceId,
        p_sale_id: input.saleId,
        p_refund_amount: input.refundAmount,
        p_restock: input.restock,
        p_reason: input.reason,
        p_notes: input.notes ?? '',
        p_restock_action:
          input.restockAction ?? (input.restock ? 'restock_ready' : 'keep_with_buyer'),
        p_buyer_name: input.buyerName ?? '',
      });
      if (error || !data || typeof data !== 'object') {
        return this.mutationFailure(
          'Retoure buchen',
          error ?? new Error('Die Retoure wurde nicht zurückgegeben.'),
        );
      }
      const response = data as Record<string, unknown>;
      const sale = this.enrichSaleMetrics({
        ...(response['sale'] as Sale),
        lines: this.arrayValue<SaleLine>(response['sale_lines']),
        has_persisted_lines: true,
        lot_allocations: this.arrayValue<SaleLineLotAllocation>(response['lot_allocations']),
        stock_movements: this.arrayValue<StockMovement>(response['stock_movements']),
      });
      this.sales.update((sales) => sales.map((entry) => (entry.id === sale.id ? sale : entry)));
      await this.refreshAffectedState(workspaceId);
      return {
        data: {
          sale,
          returnRecord: this.returnRecordValue(response['return']),
          restockedQuantity: Number(response['restocked_quantity'] ?? 0),
          saleReturnedAt: sale.returned_at ?? null,
        },
        error: null,
        reportedBySyncStatus: false,
      };
    } catch (error: unknown) {
      return this.mutationFailure('Retoure buchen', error);
    }
  }

  private mapRecordSaleResult(value: Record<string, unknown>): RecordSaleResult {
    const lines = this.arrayValue<SaleLine>(value['sale_lines']);
    const allocations = this.arrayValue<SaleLineLotAllocation>(value['lot_allocations']);
    const movements = this.arrayValue<StockMovement>(value['stock_movements']);
    const sale = this.enrichSaleMetrics({
      ...(value['sale'] as Sale),
      lines,
      has_persisted_lines: true,
      lot_allocations: allocations,
      stock_movements: movements,
    });
    return { sale, saleLines: lines, lotAllocations: allocations, stockMovements: movements };
  }

  private recordDemoSale(workspaceId: string, input: RecordSaleInput): RecordSaleResult {
    const saleId = `sale-${Date.now()}`;
    const lines: SaleLine[] = input.lines.map((line, index) => ({
      id: `sale-line-${Date.now()}-${index}`,
      sale_id: saleId,
      catalog_product_id: line.catalogProductId ?? null,
      inventory_item_id: line.inventoryItemId ?? null,
      title_snapshot: line.titleSnapshot ?? 'Artikel',
      quantity: line.quantity,
      unit_sale_price: line.unitSalePrice,
      line_total: line.quantity * line.unitSalePrice,
      cost_of_goods_sold: 0,
      tax_mode: 'diff_25a',
    }));
    const booking = this.mockStore.bookQuantitySale(workspaceId, lines);
    if (booking.error) throw booking.error;
    const total = booking.saleLines.reduce((sum, line) => sum + line.line_total, 0);
    const sale = this.enrichSaleMetrics({
      id: saleId,
      workspace_id: workspaceId,
      platform: input.platform,
      sale_price: total,
      sale_price_total: total,
      sale_date: input.saleDate,
      platform_fee: input.platformFee ?? 0,
      shipping_cost: input.shippingCost ?? 0,
      packaging_cost: input.packagingCost ?? 0,
      other_costs: input.otherCosts ?? 0,
      external_order_id: input.externalOrderId ?? null,
      external_listing_id: input.externalListingId ?? null,
      buyer_notes: input.buyerNotes ?? null,
      lines: booking.saleLines,
      has_persisted_lines: true,
      lot_allocations: booking.allocations,
      stock_movements: booking.movements,
    });
    return {
      sale,
      saleLines: booking.saleLines,
      lotAllocations: booking.allocations,
      stockMovements: booking.movements,
    };
  }

  private arrayValue<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
  }

  private returnRecordValue(value: unknown): ReturnRecord | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const record = value as Record<string, unknown>;
    if (typeof record['id'] !== 'string' || typeof record['credit_note_number'] !== 'string') {
      return undefined;
    }
    return {
      id: record['id'],
      workspace_id: String(record['workspace_id'] ?? ''),
      sale_id: String(record['sale_id'] ?? ''),
      inventory_item_id:
        typeof record['inventory_item_id'] === 'string' ? record['inventory_item_id'] : null,
      credit_note_number: record['credit_note_number'],
      return_date: String(record['return_date'] ?? ''),
      reason: String(record['reason'] ?? 'other') as ReturnRecord['reason'],
      refund_amount: Number(record['refund_amount'] ?? 0),
      is_full_refund: Boolean(record['is_full_refund']),
      restock_action: String(
        record['restock_action'] ?? 'keep_with_buyer',
      ) as ReturnRecord['restock_action'],
      buyer_name: typeof record['buyer_name'] === 'string' ? record['buyer_name'] : undefined,
      notes: typeof record['notes'] === 'string' ? record['notes'] : undefined,
      created_at: String(record['created_at'] ?? ''),
    };
  }

  /** Aktualisiert erst nach erfolgreicher RPC-Antwort die betroffenen Ansichten. */
  private async refreshAffectedState(workspaceId: string): Promise<void> {
    await this.stockService.loadPositions(workspaceId);
    await this.inventoryService?.loadInventory(workspaceId);
  }

  private mutationFailure<T>(operation: string, cause: unknown): MutationResult<T> {
    const error = this.syncStatus.melde(operation, cause);
    return { data: null, error, reportedBySyncStatus: this.syncStatus.istZentralGemeldet(error) };
  }

  async createSale(payload: CreateSalePayload): Promise<SaleMutationResult> {
    // Kompatibilitätsadapter für den bestehenden Einzelartikel-Dialog. Die
    // Statusänderung erfolgt nun innerhalb von record_sale, nicht als
    // nachgelagerte lokale Warteschlange.
    const result = await this.recordSale({
      platform: payload.platform,
      saleDate: payload.sale_date,
      platformFee: payload.platform_fee,
      shippingCost: payload.shipping_cost,
      packagingCost: payload.packaging_cost,
      otherCosts: payload.other_costs,
      externalOrderId: payload.external_order_id,
      externalListingId: payload.external_listing_id,
      buyerNotes: payload.buyer_notes,
      lines: [
        {
          inventoryItemId: payload.inventory_item_id,
          quantity: 1,
          unitSalePrice: payload.sale_price,
        },
      ],
    });
    return {
      data: result.data?.sale ?? null,
      error: result.error,
      status: result.error ? 'error' : 'success',
      problems: [],
    };
  }

  /** Gebuchte Verkäufe bleiben bis zu einem dokumentierten Korrekturvorgang unverändert. */
  async updateSale(
    saleId: string,
    updates: Partial<CreateSalePayload>,
  ): Promise<SaleMutationResult> {
    void updates;
    if (!this.sales().some((sale) => sale.id === saleId)) {
      return {
        data: null,
        error: new Error('Verkauf nicht gefunden'),
        status: 'error',
        problems: [],
      };
    }

    return {
      data: null,
      error: new Error(
        'Gebuchte Verkäufe können nicht frei geändert werden. Erfassungsfehler benötigen einen dokumentierten Korrekturvorgang.',
      ),
      status: 'error',
      problems: [],
    };
  }

  /** @deprecated Retouren werden ausschließlich mit recordReturn atomar gebucht. */
  async markiereAlsRetourniert(
    saleId: string,
    erstattet: number,
  ): Promise<{ error: Error | null }> {
    void saleId;
    void erstattet;
    return {
      error: new Error(
        'Direkte Retourenvermerke sind gesperrt. Verwende den atomaren Retourenpfad „Retoure erfassen“.',
      ),
    };
  }
}
