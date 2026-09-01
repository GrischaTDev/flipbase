import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { ProfitEngineService } from './profit-engine.service';
import { InventoryService } from './inventory.service';
import { MockDataStoreService } from './mock-data-store.service';
import { WebhookService } from './webhook.service';
import { SyncStatusService } from './sync-status.service';
import {
  Sale,
  SaleCostCategory,
  SaleCostEntry,
  SaleLine,
  SaleLineLotAllocation,
  ShippingMode,
  StockMovement,
} from '../models/flipbase.models';
import { MutationResult } from '../models/mutation-result.model';
import { StockService } from './stock.service';
import { ReturnRecord } from '../models/return.models';
import { createLocalDemoId } from '../utils/client-identity';
import { INVENTORY_RECONCILIATION_AUDIT_REASONS } from '../models/inventory-reconciliation';
import { calculateStoredSaleMetrics } from '../utils/sale-metrics';

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

export interface RecordSaleCostInput {
  readonly category: SaleCostCategory;
  readonly description?: string | null;
  readonly amount: number;
}

export interface RecordSaleInput {
  readonly platform: string;
  readonly saleDate: string;
  readonly platformFee?: number;
  readonly shippingCost?: number;
  readonly shippingRevenue?: number;
  readonly shippingMode?: ShippingMode | null;
  readonly additionalCosts?: readonly RecordSaleCostInput[];
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

interface LegacySaleRpcClient {
  rpc(
    name: 'record_legacy_inventory_sale',
    parameters: {
      p_workspace_id: string;
      p_inventory_item_id: string;
      p_sale: Record<string, unknown>;
      p_reason: string;
    },
  ): PromiseLike<{ data: Record<string, unknown> | null; error: Error | null }>;
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

  private get legacySaleClient(): LegacySaleRpcClient {
    return this.supabase.client as unknown as LegacySaleRpcClient;
  }
  private readonly stockService = inject(StockService);

  readonly sales = signal<Sale[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly loadError = signal<Error | null>(null);
  readonly loadedWorkspaceId = signal<string | null>(null);
  private loadRequestId = 0;

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
          this.loadRequestId += 1;
          this.isLoading.set(false);
          this.loadError.set(null);
          this.loadedWorkspaceId.set(null);
          this.sales.set([]);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
  }

  async loadSales(workspaceId: string): Promise<void> {
    const requestId = ++this.loadRequestId;
    this.isLoading.set(true);
    this.loadError.set(null);
    this.loadedWorkspaceId.set(null);
    this.sales.set([]);
    try {
      if (this.mockStore.isDemoMode()) {
        const localSales = this.mockStore
          .getSales(workspaceId)
          .map((s) => this.enrichSaleMetrics(s));
        if (!this.isCurrentLoad(requestId, workspaceId)) return;
        this.sales.set(localSales);
        this.loadedWorkspaceId.set(workspaceId);
        return;
      }

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
          ),
          cost_entries:sale_cost_entries!sale_cost_entries_sale_id_fkey(*)
        `,
        )
        .eq('workspace_id', workspaceId)
        .order('sale_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (!this.isCurrentLoad(requestId, workspaceId)) return;

      if (error) {
        this.loadError.set(this.syncStatus.melde('Laden der Verkäufe', error));
      } else if (data) {
        const enriched = (data as unknown[]).map((sale) => this.mapLoadedSale(sale));
        this.sales.set(enriched);
        this.loadedWorkspaceId.set(workspaceId);
      }
    } catch (err: unknown) {
      if (!this.isCurrentLoad(requestId, workspaceId)) return;
      this.loadError.set(this.syncStatus.melde('Laden der Verkäufe', err));
    } finally {
      if (requestId === this.loadRequestId) this.isLoading.set(false);
    }
  }

  private isCurrentLoad(requestId: number, workspaceId: string): boolean {
    return (
      requestId === this.loadRequestId &&
      this.workspaceService.currentWorkspace()?.id === workspaceId
    );
  }

  public enrichSaleMetrics(raw: Sale): Sale {
    const item = raw.inventory_item;
    const metrics = calculateStoredSaleMetrics(raw);
    const grossRevenue = Number((metrics.revenue + Number(raw.refund_amount ?? 0)).toFixed(2));

    let holdingDays = 0;
    const purchaseDate = item?.purchase?.purchase_date || item?.created_at;
    if (purchaseDate && raw.sale_date) {
      holdingDays = this.profitEngine.calculateHoldingDurationDays(purchaseDate, raw.sale_date);
    }

    return {
      ...raw,
      sale_price: grossRevenue,
      sale_price_total: grossRevenue,
      net_profit: metrics.resultAfterDirectCosts,
      selling_costs: metrics.sellingCosts,
      margin_percent: metrics.marginPercent,
      roi: metrics.roiPercent,
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
          shipping_revenue: input.shippingRevenue ?? 0,
          shipping_mode: input.shippingMode ?? null,
          cost_entries: this.saleCostInputs(input).map((cost) => ({
            category: cost.category,
            description: cost.description ?? null,
            amount: cost.amount,
          })),
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

  async recordLegacySale(
    inventoryItemId: string,
    input: RecordSaleInput,
  ): Promise<MutationResult<RecordSaleResult>> {
    const operation = 'Historischen Verkauf nachtragen';
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    const line = input.lines[0];
    if (
      !workspaceId ||
      input.lines.length !== 1 ||
      line?.inventoryItemId !== inventoryItemId ||
      line.quantity !== 1
    ) {
      return this.mutationFailure(
        operation,
        new Error('Der historische Verkaufsnachtrag ist ungültig.'),
      );
    }

    try {
      const { data, error } = await this.legacySaleClient.rpc('record_legacy_inventory_sale', {
        p_workspace_id: workspaceId,
        p_inventory_item_id: inventoryItemId,
        p_sale: {
          platform: input.platform,
          sale_date: input.saleDate,
          unit_sale_price: line.unitSalePrice,
          platform_fee: input.platformFee ?? 0,
          shipping_cost: input.shippingCost ?? 0,
          shipping_revenue: input.shippingRevenue ?? 0,
          shipping_mode: input.shippingMode ?? null,
          cost_entries: this.saleCostInputs(input).map((cost) => ({
            category: cost.category,
            description: cost.description ?? null,
            amount: cost.amount,
          })),
          external_order_id: input.externalOrderId ?? null,
          external_listing_id: input.externalListingId ?? null,
          buyer_notes: input.buyerNotes ?? null,
          title_snapshot: line.titleSnapshot ?? null,
        },
        p_reason: INVENTORY_RECONCILIATION_AUDIT_REASONS.recordSale,
      });
      if (error || !data) {
        const visibleError = error?.message.includes('Legacy')
          ? new Error('Der historische Verkauf konnte nicht nachgetragen werden.', { cause: error })
          : (error ?? new Error('Der Verkauf wurde nicht zurückgegeben.'));
        return this.mutationFailure(operation, visibleError);
      }
      const result = this.mapRecordSaleResult(data);
      this.sales.update((sales) => [
        result.sale,
        ...sales.filter((sale) => sale.id !== result.sale.id),
      ]);
      await this.refreshAffectedState(workspaceId);
      return { data: result, error: null, reportedBySyncStatus: false };
    } catch (error: unknown) {
      return this.mutationFailure(operation, error);
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
      const saleTotal = this.grossSaleRevenue(existing);
      const totalRefund = Math.min(
        saleTotal,
        Number(existing.refund_amount ?? 0) + input.refundAmount,
      );
      const isFullRefund = totalRefund >= saleTotal;
      const saleReturnedAt = isFullRefund ? new Date().toISOString() : null;
      const saleDraft: Sale = {
        ...existing,
        returned_at: saleReturnedAt,
        refund_amount: totalRefund,
      };
      const returnResult = isFullRefund
        ? this.mockStore.returnSaleAtomically(workspaceId, saleDraft, input.restock)
        : { sale: saleDraft, movements: [] as StockMovement[], restockedQuantity: 0, error: null };
      if (returnResult.error || !returnResult.sale) {
        return this.mutationFailure(
          'Retoure buchen',
          returnResult.error ?? new Error('Die Demo-Retoure wurde nicht gespeichert.'),
        );
      }
      const sale = this.enrichSaleMetrics({
        ...returnResult.sale,
        stock_movements: returnResult.movements,
      });
      if (!isFullRefund) this.mockStore.saveSale(sale);
      this.sales.update((sales) => sales.map((entry) => (entry.id === sale.id ? sale : entry)));
      await this.refreshAffectedState(workspaceId);
      return {
        data: {
          sale,
          returnRecord: undefined,
          restockedQuantity: returnResult.restockedQuantity,
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
      cost_entries: this.arrayValue<SaleCostEntry>(value['cost_entries']),
      lines,
      has_persisted_lines: true,
      lot_allocations: allocations,
      stock_movements: movements,
    });
    return { sale, saleLines: lines, lotAllocations: allocations, stockMovements: movements };
  }

  private grossSaleRevenue(sale: Sale): number {
    const lines = sale.has_persisted_lines === false ? [] : (sale.lines ?? []);
    if (lines.length > 0) {
      const positionTotal = lines.reduce((sum, line) => sum + Number(line.line_total || 0), 0);
      return Math.round((positionTotal + Number(sale.shipping_revenue ?? 0)) * 100) / 100;
    }
    return Number(sale.sale_price_total ?? sale.sale_price ?? 0);
  }

  private recordDemoSale(workspaceId: string, input: RecordSaleInput): RecordSaleResult {
    const saleId = createLocalDemoId('sale');
    const lines: SaleLine[] = input.lines.map((line) => ({
      id: createLocalDemoId('sale-line'),
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
    const lineTotal = lines.reduce((sum, line) => sum + line.line_total, 0);
    const costEntries: SaleCostEntry[] = this.saleCostInputs(input).map((entry) => ({
      id: createLocalDemoId('sale-cost'),
      workspace_id: workspaceId,
      sale_id: saleId,
      category: entry.category,
      description: entry.description ?? null,
      amount: entry.amount,
    }));
    const packagingCost = costEntries
      .filter((entry) => entry.category === 'packaging')
      .reduce((sum, entry) => sum + entry.amount, 0);
    const otherCosts = costEntries
      .filter((entry) => entry.category !== 'packaging')
      .reduce((sum, entry) => sum + entry.amount, 0);
    const shippingRevenue = input.shippingRevenue ?? 0;
    const grossRevenue = lineTotal + shippingRevenue;
    const saleDraft: Sale = {
      id: saleId,
      workspace_id: workspaceId,
      platform: input.platform,
      sale_price: grossRevenue,
      sale_price_total: grossRevenue,
      sale_date: input.saleDate,
      platform_fee: input.platformFee ?? 0,
      shipping_cost: input.shippingCost ?? 0,
      packaging_cost: packagingCost,
      other_costs: otherCosts,
      shipping_revenue: shippingRevenue,
      shipping_mode: input.shippingMode ?? null,
      external_order_id: input.externalOrderId ?? null,
      external_listing_id: input.externalListingId ?? null,
      buyer_notes: input.buyerNotes ?? null,
      lines,
      cost_entries: costEntries,
    };
    const booking = this.mockStore.bookSaleAtomically(workspaceId, saleDraft, lines);
    if (booking.error) throw booking.error;
    if (!booking.sale) throw new Error('Der Demo-Verkauf wurde nicht gespeichert.');
    const sale = this.enrichSaleMetrics(booking.sale);
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

  private saleCostInputs(input: RecordSaleInput): readonly RecordSaleCostInput[] {
    if (input.additionalCosts) return input.additionalCosts;

    const costs: RecordSaleCostInput[] = [];
    if ((input.packagingCost ?? 0) > 0) {
      costs.push({ category: 'packaging', amount: input.packagingCost! });
    }
    if ((input.otherCosts ?? 0) > 0) {
      costs.push({ category: 'other', amount: input.otherCosts! });
    }
    return costs;
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
      shippingRevenue: 0,
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
